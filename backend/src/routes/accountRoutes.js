import express from 'express';
import {
  updateProfile,
  changePassword,
  listSessions,
  revokeSession,
  logoutAll
} from '../controllers/accountController.js';
import requireAuth from '../middleware/auth.js';
import verifyOrigin from '../middleware/csrf.js';
import requireJsonContentType from '../middleware/validateContentType.js';
import { changePasswordRateLimiter } from '../middleware/rateLimiter.js';
import ActivityLog from '../models/ActivityLog.js';
import { publicActivity } from '../services/activityLog.js';

/**
 * Khởi tạo Account Router với các middleware bảo mật tương ứng
 * 
 * Quy tắc:
 * - PATCH /api/account/profile: requireAuth + verifyOrigin (CSRF) + requireJsonContentType.
 * - POST /api/account/change-password: requireAuth + verifyOrigin (CSRF) + requireJsonContentType + changePasswordRateLimiter.
 * - GET /api/account/sessions: requireAuth (không bắt buộc Origin hay Content-Type cho GET).
 * - DELETE /api/account/sessions/:sessionId: requireAuth + verifyOrigin (CSRF) (không bắt buộc JSON Content-Type).
 * - POST /api/account/logout-all: requireAuth + verifyOrigin (CSRF) + requireJsonContentType.
 */
export function createAccountRouter(options = {}) {
  const router = express.Router();
  const authMiddleware = options.requireAuth || requireAuth;
  const originMiddleware = options.verifyOrigin || verifyOrigin;
  const jsonMiddleware = options.requireJsonContentType || requireJsonContentType;
  const limiterMiddleware = options.changePasswordRateLimiter || changePasswordRateLimiter;

  router.patch('/profile', authMiddleware, originMiddleware, jsonMiddleware, updateProfile);
  router.post('/change-password', authMiddleware, originMiddleware, jsonMiddleware, limiterMiddleware, changePassword);

  // Giai đoạn 3A: Quản lý phiên đăng nhập thật
  router.get('/sessions', authMiddleware, listSessions);
  router.get('/activity', authMiddleware, async (req, res, next) => {
    try {
      const rows = await ActivityLog.find({ actorId: req.user._id, action: { $in: ['REGISTER', 'LOGIN_SUCCESS', 'LOGIN_FAILED'] } })
        .sort({ createdAt: -1, _id: -1 }).limit(50).lean();
      res.set('Cache-Control', 'no-store, private');
      return res.json({ success: true, data: { items: rows.map(publicActivity) } });
    } catch (error) { return next(error); }
  });
  router.delete('/sessions/:sessionId', authMiddleware, originMiddleware, revokeSession);
  router.post('/logout-all', authMiddleware, originMiddleware, jsonMiddleware, logoutAll);

  return router;
}

export const accountRoutes = createAccountRouter();
export default accountRoutes;
