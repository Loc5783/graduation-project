import express from 'express';
import {
  listNotifications,
  markAsRead,
  markAllAsRead
} from '../controllers/notificationController.js';
import requireAuth from '../middleware/auth.js';
import verifyOrigin from '../middleware/csrf.js';
import requireJsonContentType from '../middleware/validateContentType.js';

/**
 * Khởi tạo Notification Router với các middleware bảo mật tương ứng
 *
 * Quy tắc:
 * - GET /api/notifications: requireAuth
 * - PATCH /api/notifications/read-all: requireAuth + verifyOrigin + requireJsonContentType
 * - PATCH /api/notifications/:id/read: requireAuth + verifyOrigin + requireJsonContentType
 *
 * Lưu ý: Đăng ký /read-all trước /:id/read để tránh xung đột định tuyến Express.
 */
export function createNotificationRouter(options = {}) {
  const router = express.Router();
  const authMiddleware = options.requireAuth || requireAuth;
  const originMiddleware = options.verifyOrigin || verifyOrigin;
  const jsonMiddleware = options.requireJsonContentType || requireJsonContentType;

  router.get('/', authMiddleware, listNotifications);
  router.patch('/read-all', authMiddleware, originMiddleware, jsonMiddleware, markAllAsRead);
  router.patch('/:id/read', authMiddleware, originMiddleware, jsonMiddleware, markAsRead);

  return router;
}

export const notificationRoutes = createNotificationRouter();
export default notificationRoutes;
