/**
 * Middleware xử lý lỗi tập trung cho toàn bộ ứng dụng Express.
 * Đảm bảo định dạng phản hồi chuẩn: { success: false, code, message, errors? }
 * Tuyệt đối không để lộ stack trace ra ngoài response.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // 1. Lỗi phân tích cú pháp JSON (JSON parse error)
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400 && 'body' in err)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_JSON',
      message: 'Dữ liệu JSON gửi lên không đúng định dạng.'
    });
  }

  // 2. Kích thước body vượt giới hạn (Payload Too Large)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Kích thước dữ liệu gửi lên vượt quá giới hạn cho phép.'
    });
  }

  // 3. Trùng lặp khóa MongoDB (E11000 duplicate key error)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'email';
    return res.status(409).json({
      success: false,
      code: 'DUPLICATE_KEY',
      message: field === 'email' ? 'Địa chỉ email này đã được sử dụng.' : `Giá trị cho trường ${field} đã tồn tại.`,
      errors: {
        [field]: 'Đã tồn tại trong hệ thống.'
      }
    });
  }

  // 4. Lỗi xác thực Mongoose Schema (Mongoose ValidationError)
  if (err.name === 'ValidationError') {
    const errors = {};
    for (const key of Object.keys(err.errors || {})) {
      errors[key] = err.errors[key].message;
    }
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Dữ liệu không đáp ứng quy chuẩn hợp lệ.',
      errors
    });
  }

  // 5. Lỗi CastError (ID không đúng chuẩn Mongoose ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      code: 'INVALID_ID',
      message: 'Mã định danh không đúng định dạng.'
    });
  }

  // 6. Lỗi chung / Lỗi máy chủ 500
  const statusCode = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  // Ghi log trên server nhưng không in stack trace ra ngoài cho client
  console.error(`[Server Error] ${err.name || 'Error'}: ${err.message}`);

  return res.status(statusCode).json({
    success: false,
    code: (typeof err.code === 'string' && err.code) ? err.code : 'INTERNAL_SERVER_ERROR',
    message: statusCode === 500 ? 'Đã xảy ra lỗi máy chủ nội bộ. Vui lòng thử lại sau.' : err.message
  });
}

export default errorHandler;
