import User from '../models/User.js';

/**
 * Middleware yêu cầu đăng nhập (Authentication Guard).
 * Kiểm tra session hợp lệ và xác thực người dùng từ cơ sở dữ liệu.
 */
export async function requireAuth(req, res, next) {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn.'
      });
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      // Hủy session nếu người dùng không còn trong database
      req.session.destroy(() => {});
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Người dùng không tồn tại hoặc tài khoản đã bị xóa.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export default requireAuth;
