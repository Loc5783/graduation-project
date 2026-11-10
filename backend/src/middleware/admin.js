/**
 * Middleware kiểm tra quyền Quản trị viên (Role: admin)
 * Yêu cầu phải đứng sau middleware requireAuth để có req.user.
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      message: 'Yêu cầu quyền Quản trị viên (Admin) để thực hiện thao tác này.'
    });
  }
  next();
}

export default requireAdmin;
