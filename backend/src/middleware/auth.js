import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';
import parseUserAgent from '../utils/userAgentParser.js';

const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
};

/**
 * Xác minh tính hợp lệ toàn diện của bản ghi metadata phiên (UserSession registry).
 * Áp dụng thống nhất cho cả bản ghi tìm thấy ban đầu và bản ghi trả về từ thao tác phục hồi (upsert).
 *
 * @param {object} record Bản ghi UserSession từ MongoDB
 * @param {object} user Document người dùng từ User model
 * @param {number} userAuthVersion Phiên bản xác thực chuẩn hóa của người dùng (>= 0)
 * @param {Date} [now] Mốc thời gian kiểm tra nhất quán (mặc định: new Date())
 * @returns {{ isValid: boolean, message?: string }}
 */
export function verifySessionRegistry(record, user, userAuthVersion, now = new Date()) {
  if (!record) {
    return {
      isValid: false,
      message: 'Không tìm thấy thông tin phiên làm việc.'
    };
  }

  // 1. Kiểm tra quyền sở hữu (Ownership check)
  if (!record.userId || record.userId.toString() !== user._id.toString()) {
    return {
      isValid: false,
      message: 'Phiên làm việc không thuộc về người dùng hiện tại.'
    };
  }

  // 2. Kiểm tra trạng thái thu hồi (Revocation check)
  if (record.isRevoked) {
    return {
      isValid: false,
      message: 'Phiên làm việc đã bị đăng xuất hoặc thu hồi. Vui lòng đăng nhập lại.'
    };
  }

  // 3. Kiểm tra hạn dùng (Expiration check):
  // Metadata chỉ hợp lệ khi expiresAt tồn tại, chuyển thành thời điểm hợp lệ và nằm trong tương lai.
  if (!record.expiresAt) {
    return {
      isValid: false,
      message: 'Phiên làm việc không có hạn sử dụng hoặc đã hết hạn. Vui lòng đăng nhập lại.'
    };
  }

  const expiresDate = new Date(record.expiresAt);
  if (isNaN(expiresDate.getTime())) {
    return {
      isValid: false,
      message: 'Hạn sử dụng của phiên làm việc không hợp lệ. Vui lòng đăng nhập lại.'
    };
  }

  if (expiresDate <= now) {
    return {
      isValid: false,
      message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.'
    };
  }

  // 4. Kiểm tra phiên bản xác thực (authVersion check - chuẩn hóa legacy null/undefined/0 nhất quán)
  const recordAuthVersion = (typeof record.authVersion === 'number' && record.authVersion > 0)
    ? record.authVersion
    : 0;

  if (recordAuthVersion !== userAuthVersion) {
    return {
      isValid: false,
      message: 'Phiên làm việc đã hết hạn hoặc mật khẩu tài khoản đã được thay đổi. Vui lòng đăng nhập lại.'
    };
  }

  return { isValid: true };
}

/**
 * Middleware yêu cầu đăng nhập (Authentication Guard).
 * Kiểm tra session hợp lệ, xác thực người dùng từ cơ sở dữ liệu, kiểm tra phiên bản xác thực (authVersion)
 * và kiểm tra tính toàn vẹn/trạng thái thu hồi của phiên làm việc trong UserSession.
 */
export async function requireAuth(req, res, next) {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn.'
      });
    }

    // Chỉ hoạt động do người dùng tạo mới gia hạn phiên; polling nền không gia hạn.
    const nowMs = Date.now();
    const lastUserActivity = Number(req.session.lastUserActivityAt || 0);
    if (lastUserActivity && nowMs - lastUserActivity > 15 * 60 * 1000) {
      if (req.session.managedSessionId) await UserSession.updateOne({ sessionId: req.session.managedSessionId }, { $set: { isRevoked: true, revokedAt: new Date() } });
      req.session.destroy(() => {});
      res.clearCookie('shp_sid', COOKIE_OPTIONS);
      return res.status(401).json({ success: false, code: 'SESSION_IDLE_TIMEOUT', message: 'Phiên đã hết hạn do không hoạt động trong 15 phút.' });
    }
    if (req.path === '/activity' && req.baseUrl === '/api/auth') req.session.lastUserActivityAt = nowMs;

    // Khi cơ sở dữ liệu MongoDB ngoại tuyến (offline memory mode)
    if (mongoose.connection.readyState !== 1) {
      if (process.env.NODE_ENV === 'production') return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
      if (req.session.mockUser) {
        req.user = req.session.mockUser;
        return next();
      }
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn.'
      });
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      // Hủy session và xóa cookie nếu người dùng không còn trong database
      if (req.session) {
        req.session.destroy(() => {});
      }
      res.clearCookie('shp_sid', COOKIE_OPTIONS);
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Người dùng không tồn tại hoặc tài khoản đã bị xóa.'
      });
    }

    // 1. Kiểm tra tính nhất quán của phiên bản xác thực (authVersion: chuẩn hóa null/undefined/0)
    const sessionAuthVersion = typeof req.session.authVersion === 'number' ? req.session.authVersion : 0;
    const userAuthVersion = (typeof user.authVersion === 'number' && user.authVersion > 0)
      ? user.authVersion
      : 0;

    if (sessionAuthVersion !== userAuthVersion) {
      // Phiên đã bị vô hiệu hóa do mật khẩu tài khoản đã thay đổi ở phiên khác hoặc đã đăng xuất mọi nơi
      if (req.session) {
        req.session.destroy(() => {});
      }
      res.clearCookie('shp_sid', COOKIE_OPTIONS);
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Phiên làm việc đã hết hạn hoặc mật khẩu tài khoản đã được thay đổi. Vui lòng đăng nhập lại.'
      });
    }

    // 2. Kiểm tra metadata của phiên làm việc trong UserSession (Session Registry check)
    // Tra cứu theo định danh phiên thực trong session store (sessionStoreId)
    const now = new Date();
    const sessionRecord = await UserSession.findOne({
      sessionStoreId: req.sessionID
    });

    if (sessionRecord) {
      // 2.1 Bản ghi tìm thấy ban đầu: kiểm tra toàn diện
      const check = verifySessionRegistry(sessionRecord, user, userAuthVersion, now);
      if (!check.isValid) {
        if (req.session) {
          req.session.destroy(() => {});
        }
        res.clearCookie('shp_sid', COOKIE_OPTIONS);
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: check.message
        });
      }

      // 2.2 Đồng bộ managedSessionId nếu session store chưa có hoặc bị lệch
      if (!req.session.managedSessionId || req.session.managedSessionId !== sessionRecord.sessionId) {
        req.session.managedSessionId = sessionRecord.sessionId;
      }

      // Chỉ ghi hoạt động người dùng, không ghi từ polling nền.
      if (req.path === '/activity' && req.baseUrl === '/api/auth' && sessionRecord.lastActiveAt && (now.getTime() - sessionRecord.lastActiveAt.getTime() > 30000)) {
        UserSession.updateOne(
          { _id: sessionRecord._id },
          { $set: { lastActiveAt: now } }
        ).exec().catch(() => {});
      }
    } else {
      // 2.4 Tự phục hồi / khởi tạo nguyên tử metadata nếu bị thiếu (hoặc phiên legacy)
      const expiresAt = req.session?.cookie?.expires
        ? new Date(req.session.cookie.expires)
        : new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Nếu phiên đã hết hạn theo cookie: từ chối ngay
      if (expiresAt <= now) {
        if (req.session) {
          req.session.destroy(() => {});
        }
        res.clearCookie('shp_sid', COOKIE_OPTIONS);
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.'
        });
      }

      const publicId = req.session.managedSessionId || crypto.randomUUID();
      const { deviceLabel, browserLabel } = parseUserAgent(req.headers['user-agent']);

      // Sử dụng findOneAndUpdate với $setOnInsert để bảo đảm tính nguyên tử:
      // Nếu đã có bản ghi tồn tại từ trước (request đồng thời hoặc legacy), $setOnInsert KHÔNG ghi đè.
      const healedRecord = await UserSession.findOneAndUpdate(
        { sessionStoreId: req.sessionID },
        {
          $setOnInsert: {
            sessionId: publicId,
            userId: user._id,
            sessionStoreId: req.sessionID,
            authVersion: userAuthVersion,
            deviceLabel,
            browserLabel,
            createdAt: null, // Ghi nhận trung thực: không có lịch sử thời điểm tạo ban đầu
            lastActiveAt: now,
            expiresAt,
            isRevoked: false
          }
        },
        { upsert: true, returnDocument: 'after' }
      );

      // Áp dụng cùng một cơ chế xác minh toàn diện cho bản ghi trả về từ thao tác upsert
      const healedCheck = verifySessionRegistry(healedRecord, user, userAuthVersion, now);
      if (!healedCheck.isValid) {
        if (req.session) {
          req.session.destroy(() => {});
        }
        res.clearCookie('shp_sid', COOKIE_OPTIONS);
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: healedCheck.message
        });
      }

      req.session.managedSessionId = healedRecord.sessionId;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export default requireAuth;
