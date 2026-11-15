import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';
import parseUserAgent from '../utils/userAgentParser.js';
import { dispatchSessionRevokedNotification } from '../services/notificationService.js';
import {
  validateProfileUpdate,
  validateChangePassword,
  validateSessionId,
  validateLogoutAll
} from '../validators/accountValidator.js';

const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
};

/**
 * Cập nhật thông tin hồ sơ người dùng (PATCH /api/account/profile).
 * Yêu cầu: requireAuth, verifyOrigin, requireJsonContentType.
 *
 * Đặc điểm:
 * - Validate allowlist nghiêm ngặt: chỉ cho phép trường "name".
 * - Cập nhật nguyên tử qua $set: { name: trimmedName }.
 * - Không đọc toàn bộ document rồi save ghi đè (không ảnh hưởng settings, role, owned, passwordHash).
 * - Không dùng upsert tạo tài khoản.
 * - Trả về dữ liệu user chuẩn theo hợp đồng công khai (không lộ thông tin nội bộ hay passwordHash).
 */
export async function updateProfile(req, res, next) {
  try {
    const userId = req.session?.userId;

    // 1. Kiểm tra và xác thực dữ liệu đầu vào
    const validation = validateProfileUpdate(req.body);
    if (!validation.isValid) {
      const responsePayload = {
        success: false,
        code: validation.code,
        message: validation.message
      };
      if (validation.errors) {
        responsePayload.errors = validation.errors;
      }
      return res.status(validation.status || 400).json(responsePayload);
    }

    // 2. Cập nhật nguyên tử trường name trên MongoDB
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { name: validation.trimmedName } },
      { returnDocument: 'after', runValidators: true }
    );

    if (!updatedUser) {
      if (req.session) {
        req.session.destroy(() => {});
      }
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Người dùng không tồn tại hoặc tài khoản đã bị xóa.'
      });
    }

    // 3. Trả về thông tin người dùng công khai đã xác nhận
    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: updatedUser._id.toString(),
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          owned: Array.isArray(updatedUser.owned) ? updatedUser.owned : [],
          createdAt: updatedUser.createdAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Đổi mật khẩu tài khoản người dùng (POST /api/account/change-password).
 * Yêu cầu: requireAuth, verifyOrigin, requireJsonContentType, changePasswordRateLimiter.
 *
 * Đặc điểm:
 * 1. Validate nghiêm ngặt allowlist: currentPassword, newPassword.
 * 2. Xác thực mật khẩu cũ bằng bcrypt.compare. Không hash mật khẩu mới nếu mật khẩu cũ sai.
 * 3. Cập nhật nguyên tử passwordHash và tăng authVersion cùng lúc trên MongoDB, bảo vệ chống race condition.
 * 4. Regenerate session ID cho phiên hiện tại, gán authVersion mới và lưu store trước khi phản hồi 200.
 * 5. Các phiên khác của tài khoản lập tức bị vô hiệu hóa khi gọi API kế tiếp (do sai authVersion).
 * 6. Nếu DB đã cập nhật nhưng session regenerate/save lỗi: trả 200 kèm passwordChanged: true, requiresLogin: true.
 * 7. Tuyệt đối không log body chứa mật khẩu, không để lộ hash hay mật khẩu ra response.
 */
export async function changePassword(req, res, next) {
  try {
    const userId = req.session?.userId;

    // 1. Kiểm tra và xác thực dữ liệu đầu vào
    const validation = validateChangePassword(req.body);
    if (!validation.isValid) {
      const responsePayload = {
        success: false,
        code: validation.code,
        message: validation.message
      };
      if (validation.errors) {
        responsePayload.errors = validation.errors;
      }
      return res.status(validation.status || 400).json(responsePayload);
    }

    // 2. Tìm người dùng trong cơ sở dữ liệu
    const user = await User.findById(userId);
    if (!user) {
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

    // 3. Kiểm tra mật khẩu hiện tại bằng bcrypt.compare
    const isMatch = await bcrypt.compare(validation.currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        code: 'INCORRECT_CURRENT_PASSWORD',
        message: 'Mật khẩu hiện tại không chính xác.',
        errors: {
          currentPassword: 'Mật khẩu hiện tại không chính xác.'
        }
      });
    }

    // 4. Bảo đảm mật khẩu mới không khớp thông tin xác thực đang lưu (so sánh trực tiếp với hash trong DB)
    const isSameAsCurrent = await bcrypt.compare(validation.newPassword, user.passwordHash);
    if (isSameAsCurrent) {
      return res.status(400).json({
        success: false,
        code: 'PASSWORD_SAME_AS_CURRENT',
        message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.',
        errors: {
          newPassword: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.'
        }
      });
    }

    // 5. Băm mật khẩu mới bằng bcryptjs (chỉ thực hiện sau khi đã xác thực mật khẩu cũ và kiểm tra không trùng lặp)
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(validation.newPassword, salt);

    // 6. Cập nhật nguyên tử passwordHash và authVersion trên MongoDB với điều kiện bảo vệ
    const currentVersion = (typeof user.authVersion === 'number' && user.authVersion > 0)
      ? user.authVersion
      : 0;
    const currentHash = user.passwordHash;

    const filter = {
      _id: user._id,
      passwordHash: currentHash
    };
    if (currentVersion > 0) {
      filter.authVersion = currentVersion;
    } else {
      filter.$or = [{ authVersion: { $exists: false } }, { authVersion: null }, { authVersion: 0 }];
    }

    const updatedUser = await User.findOneAndUpdate(
      filter,
      {
        $set: {
          passwordHash: newPasswordHash,
          authVersion: currentVersion + 1
        }
      },
      { returnDocument: 'after', runValidators: true }
    );

    if (!updatedUser) {
      // Yêu cầu đồng thời khác đã thay đổi mật khẩu hoặc authVersion trước đó
      return res.status(409).json({
        success: false,
        code: 'AUTH_CONFLICT',
        message: 'Thông tin xác thực đã bị thay đổi bởi một yêu cầu khác. Vui lòng thử lại.'
      });
    }

    // 6. Tái tạo session ID mới cho phiên hiện tại và cập nhật authVersion mới
    const newAuthVersion = typeof updatedUser.authVersion === 'number' ? updatedUser.authVersion : (currentVersion + 1);
    const currentCookieMaxAge = req.session?.cookie?.maxAge;

    // Đánh dấu thu hồi tất cả phiên cũ của người dùng này trong UserSession
    try {
      await UserSession.updateMany(
        { userId: updatedUser._id, isRevoked: false },
        { $set: { isRevoked: true, revokedAt: new Date() } }
      );
    } catch (metaErr) {
      console.error('[Session Error] Lỗi đánh dấu thu hồi session cũ khi đổi mật khẩu:', metaErr.message);
    }

    req.session.regenerate(async (regenErr) => {
      if (regenErr) {
        console.error('[Session Error] Regenerate session thất bại sau khi đổi mật khẩu:', regenErr.message);
        if (req.session) {
          try {
            req.session.destroy(() => {});
          } catch {
            // ignore
          }
        }
        res.clearCookie('shp_sid', COOKIE_OPTIONS);
        return res.status(200).json({
          success: true,
          code: 'PASSWORD_CHANGED_RELOGIN_REQUIRED',
          message: 'Mật khẩu đã được thay đổi thành công. Do sự cố cập nhật phiên làm việc, vui lòng đăng nhập lại.',
          data: {
            passwordChanged: true,
            requiresLogin: true
          }
        });
      }

      req.session.userId = updatedUser._id.toString();
      req.session.authVersion = newAuthVersion;
      if (currentCookieMaxAge) {
        req.session.cookie.maxAge = currentCookieMaxAge;
      }

      // Sinh mã quản lý phiên công khai cho phiên mới sau đổi mật khẩu
      const publicSessionId = crypto.randomUUID();
      req.session.managedSessionId = publicSessionId;

      const { deviceLabel, browserLabel } = parseUserAgent(req.headers['user-agent']);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (currentCookieMaxAge || 24 * 60 * 60 * 1000));

      try {
        await UserSession.create({
          sessionId: publicSessionId,
          userId: updatedUser._id,
          sessionStoreId: req.sessionID,
          authVersion: newAuthVersion,
          deviceLabel,
          browserLabel,
          createdAt: now,
          lastActiveAt: now,
          expiresAt,
          isRevoked: false
        });
      } catch (metaErr) {
        console.error('[Session Error] Lỗi lưu metadata phiên mới sau khi đổi mật khẩu:', metaErr.message);
        if (req.session) {
          try {
            req.session.destroy(() => {});
          } catch {
            // ignore
          }
        }
        res.clearCookie('shp_sid', COOKIE_OPTIONS);
        return res.status(200).json({
          success: true,
          code: 'PASSWORD_CHANGED_RELOGIN_REQUIRED',
          message: 'Mật khẩu đã được thay đổi thành công. Do sự cố lưu thông tin phiên, vui lòng đăng nhập lại.',
          data: {
            passwordChanged: true,
            requiresLogin: true
          }
        });
      }

      req.session.save(async (saveErr) => {
        if (saveErr) {
          console.error('[Session Error] Lưu session thất bại sau khi đổi mật khẩu:', saveErr.message);
          try {
            await UserSession.deleteOne({ sessionId: publicSessionId });
          } catch {
            // ignore
          }
          if (req.session) {
            try {
              req.session.destroy(() => {});
            } catch {
              // ignore
            }
          }
          res.clearCookie('shp_sid', COOKIE_OPTIONS);
          return res.status(200).json({
            success: true,
            code: 'PASSWORD_CHANGED_RELOGIN_REQUIRED',
            message: 'Mật khẩu đã được thay đổi thành công. Do sự cố lưu phiên làm việc, vui lòng đăng nhập lại.',
            data: {
              passwordChanged: true,
              requiresLogin: true
            }
          });
        }

        // Đổi mật khẩu và tái tạo phiên thành công trọn vẹn
        return res.status(200).json({
          success: true,
          message: 'Đổi mật khẩu thành công.',
          data: {
            passwordChanged: true,
            requiresLogin: false
          }
        });
      });
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Liệt kê danh sách các phiên đăng nhập đang hoạt động của người dùng (GET /api/account/sessions).
 * Yêu cầu: requireAuth.
 * 
 * Đặc điểm:
 * 1. Chỉ trả về các phiên của chính người dùng hiện tại (cách ly tuyệt đối theo userId).
 * 2. Lọc bỏ các phiên đã hết hạn, đã bị thu hồi hoặc không khớp authVersion hiện tại.
 * 3. Hỗ trợ phiên legacy (nếu phiên hiện tại chưa có metadata: tự động khởi tạo với createdAt: null).
 * 4. Không để lộ raw session ID, cookie, secret hay passwordHash.
 */
export async function listSessions(req, res, next) {
  try {
    let currentManagedId = req.session?.managedSessionId;
    const userAuthVersion = typeof req.user.authVersion === 'number' ? req.user.authVersion : 0;
    const now = new Date();

    // Cập nhật lastActiveAt cho phiên hiện tại
    try {
      if (currentManagedId) {
        await UserSession.updateOne(
          { sessionId: currentManagedId, userId: req.user._id },
          { $set: { lastActiveAt: now } }
        );
      } else if (req.sessionID) {
        const found = await UserSession.findOneAndUpdate(
          { sessionStoreId: req.sessionID, userId: req.user._id },
          { $set: { lastActiveAt: now } },
          { returnDocument: 'after' }
        );
        if (found) {
          currentManagedId = found.sessionId;
          req.session.managedSessionId = found.sessionId;
        }
      }
    } catch {
      // ignore
    }

    const currentId = currentManagedId || req.session?.managedSessionId;

    // Truy vấn các phiên đang hoạt động của người dùng (sử dụng compound index)
    const sessions = await UserSession.find({
      userId: req.user._id,
      isRevoked: false,
      expiresAt: { $gt: now },
      authVersion: userAuthVersion
    })
      .sort({ lastActiveAt: -1, _id: -1 })
      .limit(50);

    const formattedSessions = sessions.map((s) => ({
      id: s.sessionId,
      deviceLabel: s.deviceLabel || null,
      browserLabel: s.browserLabel || null,
      createdAt: s.createdAt || null,
      lastActiveAt: s.lastActiveAt,
      expiresAt: s.expiresAt,
      isCurrent: (Boolean(currentId) && s.sessionId === currentId) || (Boolean(req.sessionID) && s.sessionStoreId === req.sessionID)
    }));

    return res.status(200).json({
      success: true,
      data: {
        sessions: formattedSessions,
        total: formattedSessions.length
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Thu hồi một phiên làm việc cụ thể của người dùng (DELETE /api/account/sessions/:sessionId).
 * Yêu cầu: requireAuth, verifyOrigin.
 * 
 * Đặc điểm:
 * 1. Chỉ chủ tài khoản mới được thu hồi phiên của chính mình.
 * 2. Lỗi trung tính 404 SESSION_NOT_FOUND nếu phiên không tồn tại, hết hạn, đã thu hồi hoặc thuộc user khác.
 * 3. Nếu thu hồi phiên hiện tại: xóa cookie, hủy session và trả requiresLogin: true.
 * 4. Nếu thu hồi phiên khác: trả requiresLogin: false, các phiên còn lại vẫn hoạt động bình thường.
 * 5. Ngăn chặn phiên đã thu hồi sống lại bằng cờ isRevoked trong UserSession.
 */
export async function revokeSession(req, res, next) {
  try {
    const currentUserId = req.session?.userId;
    const targetSessionId = req.params?.sessionId;
    const store = req.app.locals.sessionStore;

    // 1. Kiểm tra định dạng sessionId
    const validation = validateSessionId(targetSessionId);
    if (!validation.isValid) {
      return res.status(validation.status || 400).json({
        success: false,
        code: validation.code,
        message: validation.message
      });
    }

    // 2. Tìm và thu hồi nguyên tử bằng findOneAndUpdate (Compare-and-Swap chống Race Condition)
    const now = new Date();
    const userAuthVersion = typeof req.user.authVersion === 'number' ? req.user.authVersion : 0;

    const revokedSession = await UserSession.findOneAndUpdate(
      {
        sessionId: validation.sessionId,
        userId: currentUserId,
        isRevoked: false,
        expiresAt: { $gt: now },
        authVersion: userAuthVersion
      },
      {
        $set: {
          isRevoked: true,
          revokedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    // 3. Nếu phiên không tồn tại, thuộc user khác, đã hết hạn hoặc đã bị thu hồi trước đó:
    if (!revokedSession) {
      return res.status(404).json({
        success: false,
        code: 'SESSION_NOT_FOUND',
        message: 'Phiên làm việc không tồn tại hoặc đã hết hạn.'
      });
    }

    // 4. Xóa phiên khỏi connect-mongo store
    if (store && revokedSession.sessionStoreId) {
      try {
        store.destroy(revokedSession.sessionStoreId, () => {});
      } catch (storeErr) {
        console.error('[Session Error] Không thể xóa phiên khỏi store:', storeErr.message);
      }
    }

    // 4.1 Dispatch thông báo thu hồi phiên cho chủ tài khoản (Best-effort: lỗi tạo thông báo không ảnh hưởng việc thu hồi)
    try {
      await dispatchSessionRevokedNotification({
        user: req.user,
        revokedSession
      });
    } catch (notifErr) {
      console.error('[Notification Error] Không thể tạo thông báo thu hồi phiên:', notifErr.message);
    }

    // 5. Kiểm tra xem có đang thu hồi phiên hiện tại không
    const isCurrentSession = (validation.sessionId === req.session?.managedSessionId) ||
      (revokedSession.sessionStoreId === req.sessionID);

    if (isCurrentSession) {
      if (req.session) {
        req.session.destroy(() => {});
      }
      res.clearCookie('shp_sid', COOKIE_OPTIONS);
      return res.status(200).json({
        success: true,
        message: 'Đã đăng xuất phiên làm việc hiện tại thành công.',
        data: {
          revoked: true,
          sessionId: validation.sessionId,
          requiresLogin: true
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Đã thu hồi phiên làm việc thành công.',
      data: {
        revoked: true,
        sessionId: validation.sessionId,
        requiresLogin: false
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Đăng xuất khỏi tất cả các thiết bị, bao gồm phiên hiện tại (POST /api/account/logout-all).
 * Yêu cầu: requireAuth, verifyOrigin, requireJsonContentType.
 * 
 * Đặc điểm:
 * 1. Tăng authVersion trên User document nguyên tử ($inc: { authVersion: 1 }).
 *    Không đọc rồi save User để tránh ghi đè name, settings hay passwordHash.
 * 2. Tất cả phiên cũ của người dùng (kể cả phiên trên các thiết bị khác) lập tức bị từ chối ở request kế tiếp.
 * 3. Đánh dấu isRevoked: true cho tất cả bản ghi phiên của người dùng trong UserSession.
 * 4. Hủy phiên hiện tại, xóa cookie shp_sid và trả về requiresLogin: true.
 * 5. Nếu dọn dẹp store lỗi, vẫn trả về kết quả đăng xuất thành công do authVersion đã tăng trên DB.
 */
export async function logoutAll(req, res, next) {
  try {
    const userId = req.session?.userId;
    const store = req.app.locals.sessionStore;

    // 1. Kiểm tra body nếu có truyền
    const bodyValidation = validateLogoutAll(req.body);
    if (!bodyValidation.isValid) {
      return res.status(bodyValidation.status || 400).json({
        success: false,
        code: bodyValidation.code,
        message: bodyValidation.message
      });
    }

    // 2. Tăng authVersion nguyên tử trên MongoDB (hỗ trợ cả tài khoản legacy với authVersion null/unset/0)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      [
        {
          $set: {
            authVersion: {
              $add: [
                {
                  $cond: {
                    if: {
                      $and: [
                        { $ne: ['$authVersion', null] },
                        { $isNumber: '$authVersion' },
                        { $gt: ['$authVersion', 0] }
                      ]
                    },
                    then: '$authVersion',
                    else: 0
                  }
                },
                1
              ]
            }
          }
        }
      ],
      { returnDocument: 'after', updatePipeline: true }
    );

    if (!updatedUser) {
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

    // 3. Đánh dấu tất cả session trong UserSession là đã thu hồi
    let sessionsToDestroy = [];
    try {
      const activeSessions = await UserSession.find({
        userId,
        isRevoked: false
      }).select('sessionStoreId');
      sessionsToDestroy = activeSessions.map((s) => s.sessionStoreId);

      await UserSession.updateMany(
        { userId, isRevoked: false },
        { $set: { isRevoked: true, revokedAt: new Date() } }
      );
    } catch (metaErr) {
      console.error('[Session Error] Lỗi cập nhật UserSession khi logout-all:', metaErr.message);
    }

    // 4. Xóa các session khỏi connect-mongo store
    if (store && sessionsToDestroy.length > 0) {
      for (const sid of sessionsToDestroy) {
        try {
          store.destroy(sid, () => {});
        } catch {
          // ignore cleanup error
        }
      }
    }

    // 5. Hủy phiên hiện tại và xóa cookie
    if (req.session) {
      try {
        await new Promise((resolve) => {
          req.session.destroy(() => resolve());
        });
      } catch {
        // ignore
      }
    }
    res.clearCookie('shp_sid', COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      code: 'LOGOUT_ALL_SUCCESS',
      message: 'Đã đăng xuất thành công khỏi tất cả các thiết bị.',
      data: {
        loggedOutAll: true,
        requiresLogin: true
      }
    });
  } catch (error) {
    next(error);
  }
}
