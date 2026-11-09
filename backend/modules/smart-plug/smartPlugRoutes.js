import express from 'express';
import rateLimit from 'express-rate-limit';
import { getState, toggleRelay, postTelemetry, getHistory, resetOverload } from './smartPlugController.js';
import requireAuth from '../../src/middleware/auth.js';
import verifyOrigin from '../../src/middleware/csrf.js';
import requireJsonContentType from '../../src/middleware/validateContentType.js';

const telemetryRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      code: 'TOO_MANY_REQUESTS',
      message: 'Tần suất gửi telemetry quá cao. Vui lòng thử lại sau.'
    });
  }
});

export function createSmartPlugRouter() {
  const router = express.Router();

  // 1. Lấy trạng thái hiện tại (Công khai cho người dùng đã đăng nhập hoặc xem trước)
  router.get('/state', getState);

  // 2. Điều khiển rơ-le (Bắt buộc xác thực và kiểm tra bảo mật CSRF)
  router.post('/relay', requireAuth, verifyOrigin, requireJsonContentType, toggleRelay);

  // 3. Tiếp nhận bản tin telemetry từ phần cứng/worker (Có rate limiting)
  router.post('/telemetry', telemetryRateLimiter, requireJsonContentType, postTelemetry);

  // 4. Lấy lịch sử đo đạc vẽ biểu đồ
  router.get('/history', getHistory);

  // 5. Khôi phục trạng thái an toàn sau quá tải (Bắt buộc xác thực và kiểm tra CSRF)
  router.post('/reset-overload', requireAuth, verifyOrigin, requireJsonContentType, resetOverload);

  return router;
}

export const smartPlugRoutes = createSmartPlugRouter();
export default smartPlugRoutes;
