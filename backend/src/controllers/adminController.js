import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const VALID_ROLES = ['admin', 'member', 'viewer'];

/**
 * Lấy danh sách tất cả người dùng trong hệ thống (GET /api/admin/users)
 */
export async function listUsers(req, res, next) {
  try {
    const users = await User.find({})
      .select('-passwordHash -authVersion')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      role: u.role || 'viewer',
      isLocked: u.isLocked === true,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt
    }));

    return res.status(200).json({
      success: true,
      data: formatted
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cập nhật vai trò và quyền phụ trách thiết bị của người dùng (PATCH /api/admin/users/:userId/role)
 */
export async function updateUserRole(req, res, next) {
  try {
    const { userId } = req.params;
    const { role } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_USER_ID',
        message: 'Mã định danh người dùng không hợp lệ.'
      });
    }

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ROLE',
        message: `Vai trò không hợp lệ. Phải là một trong: ${VALID_ROLES.join(', ')}.`
      });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Không tìm thấy người dùng cần cập nhật.'
      });
    }

    // Kiểm tra an toàn: Nếu admin đang cập nhật chính mình và muốn hạ quyền
    const isSelf = req.user._id.toString() === targetUser._id.toString();
    if (isSelf && role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          code: 'CANNOT_DEMOTE_SOLE_ADMIN',
          message: 'Không thể hạ quyền Quản trị viên duy nhất trong hệ thống.'
        });
      }
    }

    const oldRole = targetUser.role;
    targetUser.role = role;

    await targetUser.save();

    // Ghi lại nhật ký kiểm toán (Audit Log)
    try {
      await AuditLog.create({
        action: 'USER_ROLE_UPDATED',
        category: 'role',
        severity: 'info',
        actor: req.user.email || req.user.name || 'Admin',
        actorId: req.user._id,
        target: targetUser.email,
        details: `Đã đổi vai trò của ${targetUser.name} (${targetUser.email}) từ "${oldRole}" thành "${role}".`,
        ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
        userAgent: req.headers['user-agent'] || ''
      });
    } catch {
      // Không chặn luồng chính nếu lưu log phụ gặp lỗi
    }

    return res.status(200).json({
      success: true,
      message: 'Cập nhật vai trò thành công.',
      data: {
        id: targetUser._id.toString(),
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function setUserLock(req, res, next) {
  try {
    const { userId } = req.params;
    const locked = req.body?.locked;
    if (!mongoose.Types.ObjectId.isValid(userId) || typeof locked !== 'boolean' || Object.keys(req.body || {}).length !== 1) {
      return res.status(400).json({ success: false, code: 'INVALID_REQUEST' });
    }
    if (req.user._id.toString() === userId) return res.status(400).json({ success: false, code: 'CANNOT_LOCK_SELF' });
    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ success: false, code: 'USER_NOT_FOUND' });
    if (target.role === 'admin' && locked) {
      const adminCount = await User.countDocuments({ role: 'admin', isLocked: { $ne: true } });
      if (adminCount <= 1) return res.status(400).json({ success: false, code: 'CANNOT_LOCK_SOLE_ADMIN' });
    }
    target.isLocked = locked;
    if (locked) target.authVersion = (target.authVersion || 0) + 1;
    await target.save();
    try {
      await AuditLog.create({ action: locked ? 'USER_LOCKED' : 'USER_UNLOCKED', category: 'role', severity: 'warning',
        actor: req.user.email, actorId: req.user._id, target: target.email,
        details: locked ? 'Quản trị viên đã khóa tài khoản.' : 'Quản trị viên đã mở khóa tài khoản.',
        ip: req.ip || '127.0.0.1', userAgent: req.headers['user-agent'] || '' });
    } catch { /* Account lock remains authoritative even if audit storage fails. */ }
    return res.status(200).json({ success: true, data: { id: userId, isLocked: target.isLocked } });
  } catch (error) { return next(error); }
}

/**
 * Tạo người dùng mới từ khu vực quản trị (POST /api/admin/users)
 */
export async function createUser(req, res, next) {
  try {
    const { name, email, password, role = 'viewer' } = req.body || {};

    const errors = {};

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      errors.name = 'Họ và tên phải có tối thiểu 2 ký tự.';
    }

    if (!email || typeof email !== 'string') {
      errors.email = 'Địa chỉ email là bắt buộc.';
    } else {
      const cleanEmail = email.trim().toLowerCase();
      if (!EMAIL_REGEX.test(cleanEmail) || cleanEmail.length > 255) {
        errors.email = 'Địa chỉ email không đúng định dạng.';
      }
    }

    if (!password || typeof password !== 'string') {
      errors.password = 'Mật khẩu là bắt buộc.';
    } else if (password.length < 8) {
      errors.password = 'Mật khẩu phải có tối thiểu 8 ký tự.';
    } else if (Buffer.byteLength(password, 'utf8') > 72) {
      errors.password = 'Mật khẩu không được vượt quá 72 byte.';
    }

    if (!VALID_ROLES.includes(role)) {
      errors.role = 'Vai trò không hợp lệ.';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu không hợp lệ.',
        errors
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_EMAIL',
        message: 'Địa chỉ email này đã được sử dụng trên hệ thống.'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      name: name.trim(),
      email: cleanEmail,
      passwordHash,
      role,
      owned: []
    });

    try {
      await AuditLog.create({
        action: 'USER_CREATED',
        category: 'role',
        severity: 'info',
        actor: req.user.email || req.user.name || 'Admin',
        actorId: req.user._id,
        target: cleanEmail,
        details: `Quản trị viên đã tạo tài khoản mới: ${name.trim()} (${cleanEmail}) với vai trò "${role}".`,
        ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
        userAgent: req.headers['user-agent'] || ''
      });
    } catch {}

    return res.status(201).json({
      success: true,
      message: 'Tạo tài khoản người dùng thành công.',
      data: {
        id: newUser._id.toString(),
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Xóa người dùng (DELETE /api/admin/users/:userId)
 */
export async function deleteUser(req, res, next) {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_USER_ID',
        message: 'Mã định danh người dùng không hợp lệ.'
      });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Không tìm thấy người dùng cần xóa.'
      });
    }

    // Không được xóa chính mình
    if (req.user._id.toString() === targetUser._id.toString()) {
      return res.status(400).json({
        success: false,
        code: 'CANNOT_DELETE_SELF',
        message: 'Bạn không thể tự xóa tài khoản của chính mình.'
      });
    }

    // Nếu xóa admin: phải còn ít nhất 1 admin khác
    if (targetUser.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          code: 'CANNOT_DELETE_SOLE_ADMIN',
          message: 'Không thể xóa Quản trị viên duy nhất trong hệ thống.'
        });
      }
    }

    await User.findByIdAndDelete(userId);

    try {
      await AuditLog.create({
        action: 'USER_DELETED',
        category: 'role',
        severity: 'warning',
        actor: req.user.email || req.user.name || 'Admin',
        actorId: req.user._id,
        target: targetUser.email,
        details: `Quản trị viên đã xóa tài khoản: ${targetUser.name} (${targetUser.email}) có vai trò "${targetUser.role}".`,
        ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
        userAgent: req.headers['user-agent'] || ''
      });
    } catch {}

    return res.status(200).json({
      success: true,
      message: `Đã xóa người dùng ${targetUser.name} thành công.`
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Lấy nhật ký quản trị thực tế; không tạo sự kiện mẫu khi danh sách trống.
 */
export async function listAuditLogs(req, res, next) {
  try {
    const {
      category,
      severity,
      actor,
      search,
      timeRange,
      page = 1,
      limit = 20
    } = req.query;

    const allowed = new Set(['category', 'severity', 'actor', 'search', 'timeRange', 'page', 'limit']);
    if (Object.keys(req.query).some((key) => !allowed.has(key)) ||
        [category, severity, actor, search, timeRange, page, limit].some((value) => value != null && typeof value !== 'string' && typeof value !== 'number') ||
        (search && search.length > 80) || (actor && actor.length > 150) ||
        (timeRange && !['today', '7days', '30days'].includes(timeRange)) ||
        (category && !['all', 'auth', 'role', 'device', 'privacy', 'system'].includes(category)) ||
        (severity && !['all', 'info', 'warning', 'danger'].includes(severity)) ||
        !/^\d+$/.test(String(page)) || !/^\d+$/.test(String(limit))) {
      return res.status(400).json({ success: false, code: 'INVALID_QUERY' });
    }

    const escapeRegex = (value) => value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');

    const query = {};

    if (category && category !== 'all') {
      query.category = category;
    }

    if (severity && severity !== 'all') {
      query.severity = severity;
    }

    if (actor && actor !== 'all') {
      query.actor = new RegExp(`^${escapeRegex(actor)}$`, 'i');
    }

    if (search && typeof search === 'string' && search.trim()) {
      const cleanSearch = escapeRegex(search.trim());
      query.$or = [
        { details: new RegExp(cleanSearch, 'i') },
        { action: new RegExp(cleanSearch, 'i') },
        { actor: new RegExp(cleanSearch, 'i') },
        { target: new RegExp(cleanSearch, 'i') }
      ];
    }

    if (timeRange) {
      const now = new Date();
      if (timeRange === 'today') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query.createdAt = { $gte: startOfDay };
      } else if (timeRange === '7days') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query.createdAt = { $gte: sevenDaysAgo };
      } else if (timeRange === '30days') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        query.createdAt = { $gte: thirtyDaysAgo };
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const isDbConnected = mongoose.connection.readyState === 1;
    if (!isDbConnected) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    let logs = [];
    let total = 0;

    if (isDbConnected) {
      [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        AuditLog.countDocuments(query)
      ]);
    }

    return res.status(200).json({
      success: true,
      data: {
        logs: logs.map((l) => ({
          id: l._id ? l._id.toString() : l.id,
          action: l.action,
          category: l.category,
          severity: l.severity,
          actor: l.actor,
          target: l.target,
          details: l.details,
          ip: l.ip,
          createdAt: l.createdAt
        })),
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum) || 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
}
