import express from 'express';
import { getSettings, updateAppearance, updateNotifications, updatePrivacy } from '../controllers/settingsController.js';
import requireAuth from '../middleware/auth.js';
import verifyOrigin from '../middleware/csrf.js';
import requireJsonContentType from '../middleware/validateContentType.js';

/**
 * Khởi tạo Settings Router với các middleware bảo mật tương ứng
 * 
 * Quy tắc:
 * - GET /api/settings: requireAuth, không bắt buộc JSON Content-Type.
 * - PATCH /api/settings/appearance: requireAuth + verifyOrigin (CSRF) + requireJsonContentType.
 * - PATCH /api/settings/notifications: requireAuth + verifyOrigin (CSRF) + requireJsonContentType.
 * - PATCH /api/settings/privacy: requireAuth + verifyOrigin (CSRF) + requireJsonContentType.
 */
export function createSettingsRouter(options = {}) {
  const router = express.Router();
  const authMiddleware = options.requireAuth || requireAuth;
  const originMiddleware = options.verifyOrigin || verifyOrigin;
  const jsonMiddleware = options.requireJsonContentType || requireJsonContentType;

  // Lấy thông tin cài đặt: Yêu cầu session đăng nhập hợp lệ
  router.get('/', authMiddleware, getSettings);

  // Cập nhật cài đặt giao diện: Yêu cầu đăng nhập, kiểm tra nguồn gốc và bắt buộc định dạng JSON
  router.patch('/appearance', authMiddleware, originMiddleware, jsonMiddleware, updateAppearance);

  // Cập nhật cài đặt thông báo: Yêu cầu đăng nhập, kiểm tra nguồn gốc và bắt buộc định dạng JSON
  router.patch('/notifications', authMiddleware, originMiddleware, jsonMiddleware, updateNotifications);

  // Cập nhật cài đặt quyền riêng tư: Yêu cầu đăng nhập, kiểm tra nguồn gốc và bắt buộc định dạng JSON
  router.patch('/privacy', authMiddleware, originMiddleware, jsonMiddleware, updatePrivacy);

  return router;
}

export const settingsRoutes = createSettingsRouter();
export default settingsRoutes;
