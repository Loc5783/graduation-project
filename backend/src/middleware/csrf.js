/**
 * Middleware kiểm tra tính hợp lệ của Origin và Referer (Chống CSRF)
 * Áp dụng cho các phương thức thay đổi trạng thái (POST, PUT, PATCH, DELETE).
 *
 * Quy tắc:
 * 1. Không tin cậy tiêu đề do client tự khai; chỉ so sánh với allowlist cấu hình phía server.
 * 2. Nếu có Origin: phải thuộc allowlist; từ chối 'null' hoặc domain lạ.
 * 3. Nếu thiếu Origin: chỉ chấp nhận khi có Referer hợp lệ (bắt đầu bằng một trong các Origin cho phép).
 * 4. Thiếu cả hai hoặc không hợp lệ -> Trả về 403 Forbidden.
 */

export function parseAllowedOrigins() {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map((o) => o.trim()).filter(Boolean);
  }
  return [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5000',
    'http://127.0.0.1:5000'
  ];
}

export function createOriginVerifier(customOrigins) {
  return function verifyOrigin(req, res, next) {
    // Chỉ kiểm tra các phương thức thay đổi trạng thái
    const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!stateChangingMethods.includes(req.method.toUpperCase())) {
      return next();
    }

    const allowedOrigins = customOrigins || parseAllowedOrigins();
    const origin = req.headers['origin'];
    const referer = req.headers['referer'];

    // 1. Nếu có Origin header
    if (origin) {
      if (origin === 'null' || !allowedOrigins.includes(origin)) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_ORIGIN',
          message: 'Nguồn gửi yêu cầu (Origin) không hợp lệ hoặc bị từ chối.'
        });
      }
      return next();
    }

    // 2. Nếu thiếu Origin, kiểm tra Referer
    if (referer) {
      const isAllowedReferer = allowedOrigins.some((allowed) => {
        try {
          const refererUrl = new URL(referer);
          return refererUrl.origin === allowed;
        } catch {
          return false;
        }
      });

      if (!isAllowedReferer) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_ORIGIN',
          message: 'Nguồn gửi yêu cầu (Referer) không thuộc danh sách được phép.'
        });
      }
      return next();
    }

    // 3. Thiếu cả Origin và Referer
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN_ORIGIN',
      message: 'Yêu cầu bị từ chối do thiếu cả hai tiêu đề Origin và Referer.'
    });
  };
}

export const verifyOrigin = createOriginVerifier();
export default verifyOrigin;
