import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';
import parseUserAgent from '../utils/userAgentParser.js';
import { recordActivity } from '../services/activityLog.js';
import RegisteredDevice from '../models/RegisteredDevice.js';
import { emailVerificationEnabled, issueVerificationCode, matchesVerificationCode, VERIFICATION_RESEND_MS } from '../services/emailVerificationService.js';
import { isEmailConfigured } from '../services/emailService.js';

// Hash mẫu định dạng bcrypt hợp lệ dùng để ngăn chặn tấn công Timing Attack khi không tìm thấy user
const DUMMY_HASH = '$2b$10$mZx5eYBEFGMl8F8kHFsCE.fRS0THTVp5US0ZRgsrN1yDhwEKfTEj6';

// Regex kiểm tra định dạng email cơ bản nhưng chặt chẽ
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Xử lý đăng ký tài khoản mới (POST /api/auth/register)
 * - Chỉ nhận allowlist: fullName, email, password
 * - Không cho phép client gửi role hay owned để nâng quyền
 * - Kiểm tra độ dài mật khẩu UTF-8 tối đa 72 byte và tối thiểu 8 ký tự
 * - Không tự động đăng nhập sau khi đăng ký
 */
export async function register(req, res, next) {
  try {
    const { fullName, email, password } = req.body || {};

    const errors = {};

    // 1. Kiểm tra họ và tên
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      errors.fullName = 'Họ và tên phải có tối thiểu 2 ký tự.';
    } else if (fullName.trim().length > 100) {
      errors.fullName = 'Họ và tên không được vượt quá 100 ký tự.';
    }

    // 2. Kiểm tra email
    if (!email || typeof email !== 'string') {
      errors.email = 'Địa chỉ email là bắt buộc.';
    } else {
      const trimmedEmail = email.trim().toLowerCase();
      if (!EMAIL_REGEX.test(trimmedEmail) || trimmedEmail.length > 255) {
        errors.email = 'Địa chỉ email không đúng định dạng.';
      }
    }

    // 3. Kiểm tra mật khẩu (KHÔNG TRIM mật khẩu)
    if (!password || typeof password !== 'string') {
      errors.password = 'Mật khẩu là bắt buộc.';
    } else {
      const byteLength = Buffer.byteLength(password, 'utf8');
      if (password.length < 8) {
        errors.password = 'Mật khẩu phải có tối thiểu 8 ký tự.';
      } else if (byteLength > 72) {
        errors.password = 'Mật khẩu không được vượt quá 72 byte UTF-8.';
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Thông tin đăng ký không hợp lệ.',
        errors
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const sanitizedName = fullName.trim();
    const verificationRequired = emailVerificationEnabled();
    if (verificationRequired && !isEmailConfigured()) {
      return res.status(503).json({ success: false, code: 'EMAIL_NOT_CONFIGURED', message: 'Máy chủ chưa cấu hình gửi email xác minh.' });
    }

    // Kiểm tra trùng lặp email trước khi băm để trả lời nhanh
    let existing = await User.findOne({ email: normalizedEmail }).select('+emailVerificationExpiresAt');
    if (existing?.emailVerificationRequired && !existing.emailVerifiedAt &&
      existing.emailVerificationExpiresAt &&
      existing.emailVerificationExpiresAt <= new Date()) {
      await User.deleteOne({ _id: existing._id, emailVerifiedAt: null,
        emailVerificationExpiresAt: { $lte: new Date() }, owned: { $size: 0 } });
      existing = await User.findOne({ email: normalizedEmail });
    }
    if (existing) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_KEY',
        message: 'Địa chỉ email này đã được sử dụng.',
        errors: {
          email: 'Đã tồn tại trong hệ thống.'
        }
      });
    }

    // Băm mật khẩu bất đồng bộ bằng bcryptjs
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Lưu vào database với quyền cố định: viewer, owned: []
    const cancellationToken = verificationRequired ? crypto.randomBytes(32).toString('hex') : null;
    const newUser = await User.create({
      name: sanitizedName,
      email: normalizedEmail,
      passwordHash,
      role: 'viewer',
      owned: [],
      emailVerificationRequired: verificationRequired,
      emailVerifiedAt: verificationRequired ? null : new Date(),
      registrationCancelHash: cancellationToken ? crypto.createHash('sha256').update(cancellationToken).digest('hex') : null
    });

    if (verificationRequired) {
      try {
        await issueVerificationCode(newUser);
      } catch (mailError) {
        console.error('[Email] Không gửi được mã xác minh:', mailError?.code || mailError?.message);
        await User.deleteOne({ _id: newUser._id, emailVerifiedAt: null, registrationCancelHash: newUser.registrationCancelHash });
        return res.status(503).json({ success: false, code: 'EMAIL_DELIVERY_FAILED', message: 'Chưa gửi được mã xác minh. Vui lòng thử đăng ký lại.' });
      }
    }

    await recordActivity({ action: 'REGISTER', actorId: newUser._id, ownerId: newUser._id });

    // Trả về 201 Created (không kèm passwordHash, không tạo session)
    return res.status(201).json({
      success: true,
      message: verificationRequired ? 'Đã gửi mã xác minh đến email của bạn.' : 'Đăng ký tài khoản thành công.',
      data: {
        verificationRequired,
        cancellationToken,
        user: {
          id: newUser._id.toString(),
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          owned: newUser.owned,
          createdAt: newUser.createdAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyRegistrationEmail(req, res, next) {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const code = req.body?.code;
    if (!EMAIL_REGEX.test(email) || email.length > 255 || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Email hoặc mã xác minh không hợp lệ.' });
    }
    const user = await User.findOne({ email }).select('+emailVerificationHash +emailVerificationExpiresAt +emailVerificationSentAt +emailVerificationAttempts');
    if (!user || !user.emailVerificationRequired || user.emailVerifiedAt) {
      return res.status(400).json({ success: false, code: 'INVALID_VERIFICATION_CODE', message: 'Mã không hợp lệ hoặc đã hết hạn.' });
    }
    const now = new Date();
    if (!matchesVerificationCode(user, code, now)) {
      await User.updateOne({ _id: user._id, emailVerifiedAt: null, emailVerificationAttempts: { $lt: 5 } }, { $inc: { emailVerificationAttempts: 1 } });
      return res.status(400).json({ success: false, code: 'INVALID_VERIFICATION_CODE', message: 'Mã không hợp lệ hoặc đã hết hạn.' });
    }
    const updated = await User.findOneAndUpdate({ _id: user._id, emailVerifiedAt: null,
      emailVerificationHash: user.emailVerificationHash,
      emailVerificationExpiresAt: { $gt: now }, emailVerificationAttempts: { $lt: 5 } },
    { $set: { emailVerifiedAt: now }, $unset: { emailVerificationHash: '', emailVerificationExpiresAt: '', emailVerificationSentAt: '', registrationCancelHash: '' } }, { returnDocument: 'after' });
    if (!updated) return res.status(400).json({ success: false, code: 'INVALID_VERIFICATION_CODE', message: 'Mã không hợp lệ hoặc đã hết hạn.' });
    return res.json({ success: true, message: 'Email đã được xác minh. Bạn có thể đăng nhập.' });
  } catch (error) { next(error); }
}

export async function cancelRegistration(req, res, next) {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const token = req.body?.cancellationToken;
    if (!EMAIL_REGEX.test(email) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Yêu cầu hủy không hợp lệ.' });
    }
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await User.deleteOne({ email, registrationCancelHash: hash, emailVerificationRequired: true,
      emailVerifiedAt: null, owned: { $size: 0 } });
    if (result.deletedCount !== 1) return res.status(404).json({ success: false, code: 'REGISTRATION_NOT_FOUND', message: 'Lượt đăng ký không còn hiệu lực.' });
    return res.json({ success: true, message: 'Đã hủy lượt đăng ký.' });
  } catch (error) { next(error); }
}

export async function resendRegistrationCode(req, res, next) {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!EMAIL_REGEX.test(email) || email.length > 255) return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Email không hợp lệ.' });
    if (!isEmailConfigured()) return res.status(503).json({ success: false, code: 'EMAIL_NOT_CONFIGURED', message: 'Máy chủ chưa cấu hình gửi email.' });
    const user = await User.findOne({ email }).select('+emailVerificationHash +emailVerificationExpiresAt +emailVerificationSentAt +emailVerificationAttempts');
    if (user?.emailVerificationRequired && !user.emailVerifiedAt) {
      const now = new Date();
      if (!user.emailVerificationSentAt || now - user.emailVerificationSentAt >= VERIFICATION_RESEND_MS) {
        try { await issueVerificationCode(user, now); }
        catch (mailError) { console.error('[Email] Gửi lại mã thất bại:', mailError?.code || mailError?.message); }
      }
    }
    return res.json({ success: true, message: 'Nếu tài khoản đang chờ xác minh, mã mới sẽ được gửi đến email.' });
  } catch (error) { next(error); }
}

/**
 * Xử lý đăng nhập tài khoản (POST /api/auth/login)
 * - Chống Timing Attack bằng dummy hash nếu email không tồn tại
 * - Sai email hoặc mật khẩu đều trả về cùng một thông báo chung
 * - Regenerate session để chống Session Fixation
 * - Lưu session trong MongoDB trước khi phản hồi 200
 */
export async function login(req, res, next) {
  try {
    const { email, password, remember } = req.body || {};

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Email và mật khẩu là bắt buộc.'
      });
    }

    // 1. Kiểm tra kiểu của remember: mặc định false nếu thiếu; nếu có bắt buộc là boolean
    let isRemember = false;
    if (remember !== undefined) {
      if (typeof remember !== 'boolean') {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Trường remember phải là giá trị boolean (true hoặc false).',
          errors: {
            remember: 'Giá trị remember không đúng định dạng boolean.'
          }
        });
      }
      isRemember = remember;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Nếu mật khẩu vượt quá 72 byte, chắc chắn không thể khớp (bcrypt chỉ băm tối đa 72 byte)
    // Nhưng vẫn chạy dummy compare để giữ timing nhất quán
    const byteLength = Buffer.byteLength(password, 'utf8');
    if (byteLength > 72) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không chính xác.'
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Dummy compare để chống timing attack dò tìm email
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không chính xác.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      const client = parseUserAgent(req.headers['user-agent']);
      await recordActivity({ action: 'LOGIN_FAILED', actorId: user._id, ownerId: user._id,
        deviceLabel: client.deviceLabel, browserLabel: client.browserLabel });
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không chính xác.'
      });
    }

    if (user.emailVerificationRequired === true && !user.emailVerifiedAt) {
      return res.status(403).json({ success: false, code: 'EMAIL_NOT_VERIFIED', message: 'Vui lòng xác minh email trước khi đăng nhập.' });
    }

    if (user.isLocked === true) {
      return res.status(403).json({ success: false, code: 'ACCOUNT_LOCKED', message: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.' });
    }

    // Tái tạo session ID mới (Regenerate session) để ngăn chặn Session Fixation
    req.session.regenerate(async (err) => {
      if (err) {
        return next(err);
      }

      req.session.userId = user._id.toString();
      req.session.authVersion = typeof user.authVersion === 'number' ? user.authVersion : 0;

      // Cấu hình thời hạn phiên: 14 ngày nếu ghi nhớ, mặc định 1 ngày
      const maxAge = isRemember ? 14 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      req.session.cookie.maxAge = maxAge;

      // Sinh mã quản lý phiên công khai (Public Session ID)
      const publicSessionId = crypto.randomUUID();
      req.session.managedSessionId = publicSessionId;

      // Trích xuất thông tin thiết bị và trình duyệt từ User-Agent
      const { deviceLabel, browserLabel } = parseUserAgent(req.headers['user-agent']);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + maxAge);

      // Lưu bản ghi metadata phiên vào UserSession (Session Registry)
      try {
        await UserSession.create({
          sessionId: publicSessionId,
          userId: user._id,
          sessionStoreId: req.sessionID,
          authVersion: req.session.authVersion,
          deviceLabel,
          browserLabel,
          createdAt: now,
          lastActiveAt: now,
          expiresAt,
          isRevoked: false
        });
      } catch (metaErr) {
        console.error('[Session Error] Lỗi lưu metadata phiên mới khi đăng nhập:', metaErr.message);
        if (req.session) {
          try {
            req.session.destroy(() => {});
          } catch {
            // ignore
          }
        }
        res.clearCookie('shp_sid', {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production'
        });
        return next(metaErr);
      }

      // Lưu phiên vào MongoDB store trước khi gửi phản hồi cho client
      req.session.save(async (saveErr) => {
        if (saveErr) {
          // Nếu lưu store thất bại, dọn dẹp bản ghi metadata vừa tạo để không tồn tại phiên ma
          try {
            await UserSession.deleteOne({ sessionId: publicSessionId });
          } catch {
            // ignore
          }
          return next(saveErr);
        }

        await recordActivity({ action: 'LOGIN_SUCCESS', actorId: user._id, ownerId: user._id, deviceLabel, browserLabel });
        try {
          const sharedDevices = await RegisteredDevice.find({ viewerUserIds: user._id, ownerUserId: { $ne: null } })
            .select('deviceId ownerUserId ownershipEpoch').lean();
          for (const device of sharedDevices) {
            await recordActivity({ action: 'SHARED_VIEWER_LOGIN', actorId: user._id, ownerId: device.ownerUserId,
              deviceId: device.deviceId, ownershipEpoch: device.ownershipEpoch, deviceLabel, browserLabel });
          }
        } catch (error) {
          console.error('[ActivityLog] Không thể ghi đăng nhập của người được chia sẻ:', error.message);
        }
        return res.status(200).json({
          success: true,
          message: 'Đăng nhập thành công.',
          data: {
            user: {
              id: user._id.toString(),
              name: user.name,
              email: user.email,
              role: user.role,
              owned: user.owned
            }
          }
        });
      });
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Lấy thông tin tài khoản hiện tại từ phiên đăng nhập (GET /api/auth/me)
 * Được bảo vệ bởi requireAuth middleware
 */
export async function me(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      user: {
        id: req.user._id.toString(),
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        owned: req.user.owned,
        createdAt: req.user.createdAt
      }
    }
  });
}

/**
 * Đăng xuất và hủy phiên làm việc (POST /api/auth/logout)
 * - Chờ hủy phiên trên MongoDB store thành công
 * - Xóa cookie shp_sid với đúng các thuộc tính bảo mật
 */
export async function logout(req, res) {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  };

  if (!req.session) {
    res.clearCookie('shp_sid', cookieOptions);
    return res.status(200).json({
      success: true,
      message: 'Đã đăng xuất thành công.'
    });
  }

  // Đánh dấu thu hồi phiên trong UserSession (nếu có bản ghi)
  if (req.session.managedSessionId) {
    try {
      await UserSession.updateOne(
        { sessionId: req.session.managedSessionId },
        { $set: { isRevoked: true, revokedAt: new Date() } }
      );
    } catch (err) {
      console.error('[Session Error] Lỗi đánh dấu thu hồi khi logout:', err.message);
    }
  } else if (req.sessionID) {
    // Trường hợp phiên legacy
    try {
      await UserSession.updateMany(
        { sessionStoreId: req.sessionID },
        { $set: { isRevoked: true, revokedAt: new Date() } }
      );
    } catch (err) {
      console.error('[Session Error] Lỗi đánh dấu thu hồi session legacy khi logout:', err.message);
    }
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('[Session Error] Không thể hủy phiên làm việc trên store:', err.message);
      return res.status(500).json({
        success: false,
        code: 'LOGOUT_FAILED',
        message: 'Không thể đăng xuất phiên làm việc phía máy chủ.'
      });
    }

    res.clearCookie('shp_sid', cookieOptions);
    return res.status(200).json({
      success: true,
      message: 'Đã đăng xuất thành công.'
    });
  });
}
