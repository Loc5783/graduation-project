/**
 * Middleware kiểm tra Content-Type cho các API chỉ tiếp nhận dữ liệu JSON
 * - Chấp nhận 'application/json' kể cả có charset (ví dụ: 'application/json; charset=utf-8')
 * - Từ chối các định dạng khác như 'text/plain', 'application/x-www-form-urlencoded' với mã lỗi 415
 */
export function requireJsonContentType(req, res, next) {
  const contentType = req.headers['content-type'];

  if (!contentType) {
    return res.status(415).json({
      success: false,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Yêu cầu phải có tiêu đề Content-Type là application/json.'
    });
  }

  // Phân tích MIME type, loại bỏ charset và tham số tùy chọn
  const mimeType = contentType.split(';')[0].trim().toLowerCase();

  if (mimeType !== 'application/json') {
    return res.status(415).json({
      success: false,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Hệ thống chỉ chấp nhận dữ liệu định dạng JSON (Content-Type: application/json).'
    });
  }

  next();
}

export default requireJsonContentType;
