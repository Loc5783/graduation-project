import express from 'express';
import { register, login, me, logout } from '../controllers/authController.js';
import requireAuth from '../middleware/auth.js';
import verifyOrigin from '../middleware/csrf.js';
import authRateLimiter from '../middleware/rateLimiter.js';
import requireJsonContentType from '../middleware/validateContentType.js';

/**
 * Khởi tạo Auth Router với các middleware bảo mật tương ứng
 */
export function createAuthRouter(options = {}) {
  const router = express.Router();
  const originMiddleware = options.verifyOrigin || verifyOrigin;
  const limiterMiddleware = options.rateLimiter || authRateLimiter;
  const jsonMiddleware = options.requireJsonContentType || requireJsonContentType;

  // Đăng ký tài khoản mới: kiểm tra nguồn, bắt buộc JSON, giới hạn tần suất
  router.post('/register', originMiddleware, jsonMiddleware, limiterMiddleware, register);

  // Đăng nhập: kiểm tra nguồn, bắt buộc JSON, giới hạn tần suất
  router.post('/login', originMiddleware, jsonMiddleware, limiterMiddleware, login);

  // Lấy thông tin tài khoản: yêu cầu session đăng nhập hợp lệ
  router.get('/me', requireAuth, me);

  // Đăng xuất: kiểm tra nguồn gửi yêu cầu và bắt buộc JSON
  router.post('/logout', originMiddleware, jsonMiddleware, logout);

  return router;
}

export const authRoutes = createAuthRouter();
export default authRoutes;
