import rateLimit from 'express-rate-limit';

/**
 * Tạo middleware giới hạn tần suất yêu cầu (Rate Limiter) cho các endpoint xác thực.
 * Trả về mã lỗi 429 cùng định dạng JSON lỗi chuẩn khi vượt ngưỡng.
 */
export function createAuthRateLimiter(options = {}) {
  const windowMs = options.windowMs || (process.env.RATE_LIMIT_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) : 15 * 60 * 1000);
  const max = options.max || (process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : 50);

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        code: 'TOO_MANY_REQUESTS',
        message: 'Bạn đã gửi quá nhiều yêu cầu xác thực. Vui lòng thử lại sau ít phút.'
      });
    },
    ...options
  });
}

export const authRateLimiter = createAuthRateLimiter();
export default authRateLimiter;
