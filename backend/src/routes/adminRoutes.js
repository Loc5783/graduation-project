import express from 'express';
import requireAuth from '../middleware/auth.js';
import requireAdmin from '../middleware/admin.js';
import verifyOrigin from '../middleware/csrf.js';
import requireJsonContentType from '../middleware/validateContentType.js';
import {
  listUsers,
  updateUserRole,
  createUser,
  deleteUser,
  getSystemStatus,
  listAuditLogs
} from '../controllers/adminController.js';

/**
 * Khởi tạo Admin Router bảo vệ toàn diện bằng requireAuth + requireAdmin
 */
export function createAdminRouter(options = {}) {
  const router = express.Router();
  const authMiddleware = options.requireAuth || requireAuth;
  const adminMiddleware = options.requireAdmin || requireAdmin;
  const originMiddleware = options.verifyOrigin || verifyOrigin;
  const jsonMiddleware = options.requireJsonContentType || requireJsonContentType;

  // Áp dụng xác thực và phân quyền Admin cho toàn bộ route
  router.use(authMiddleware);
  router.use(adminMiddleware);

  // 1. Quản lý người dùng & phân quyền (Users & RBAC)
  router.get('/users', listUsers);
  router.patch('/users/:userId/role', originMiddleware, jsonMiddleware, updateUserRole);
  router.post('/users', originMiddleware, jsonMiddleware, createUser);
  router.delete('/users/:userId', originMiddleware, deleteUser);

  // 2. Trạng thái hệ thống (System Status)
  router.get('/system-status', getSystemStatus);

  // 3. Nhật ký kiểm toán (Audit Logs)
  router.get('/audit-logs', listAuditLogs);

  return router;
}

export const adminRoutes = createAdminRouter();
export default adminRoutes;
