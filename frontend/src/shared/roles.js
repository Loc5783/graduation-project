/**
 * Phân quyền giao diện (RBAC) và danh sách tài khoản demo.
 * Các vai trò:
 * - admin: toàn quyền xem/sửa mọi thiết bị và xuất báo cáo.
 * - member: chỉ sửa thiết bị có trong mảng user.owned; có quyền xuất báo cáo.
 * - viewer: chỉ xem, không được chỉnh sửa công tắc hay xuất báo cáo.
 */

export const ROLES = {
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer'
};

export const DEMO_ACCOUNTS = [
  {
    username: 'admin',
    name: 'Quản trị viên hệ thống',
    role: ROLES.ADMIN,
    owned: []
  },
  {
    username: 'thanh',
    name: 'Nguyễn Văn Thành',
    role: ROLES.MEMBER,
    owned: ['smart-door-lock']
  },
  {
    username: 'loc',
    name: 'Trần Văn Lộc',
    role: ROLES.MEMBER,
    owned: ['smart-speaker']
  },
  {
    username: 'minh',
    name: 'Lê Quang Minh',
    role: ROLES.MEMBER,
    owned: ['window-sensor']
  },
  {
    username: 'nhatanh',
    name: 'Phạm Nhật Anh',
    role: ROLES.MEMBER,
    owned: ['smart-plug']
  },
  {
    username: 'quynh',
    name: 'Đỗ Thúy Quỳnh',
    role: ROLES.MEMBER,
    owned: ['environment-sensor']
  },
  {
    username: 'guest',
    name: 'Khách trải nghiệm',
    role: ROLES.VIEWER,
    owned: []
  }
];

export function findDemoAccount(username) {
  if (!username || typeof username !== 'string') return null;
  const clean = username.trim().toLowerCase();
  return DEMO_ACCOUNTS.find(acc => acc.username.toLowerCase() === clean) || null;
}

/**
 * Kiểm tra quyền chỉnh sửa thiết bị
 */
export function canEditDevice(user, deviceId) {
  if (!user || !user.role) {
    return false;
  }
  if (user.role === ROLES.ADMIN) {
    return true;
  }
  if (user.role === ROLES.MEMBER) {
    return Array.isArray(user.owned) && user.owned.includes(deviceId);
  }
  return false;
}

/**
 * Kiểm tra quyền xuất/in báo cáo
 */
export function canExportReport(user) {
  if (!user || !user.role) {
    return false;
  }
  return user.role === ROLES.ADMIN || user.role === ROLES.MEMBER;
}

/**
 * Trả về thông điệp giải thích phân quyền bằng tiếng Việt
 */
export function getPermissionExplanation(user, deviceId) {
  if (!user) {
    return 'Vui lòng đăng nhập để thao tác.';
  }
  if (user.role === ROLES.VIEWER) {
    return 'Tài khoản của bạn có vai trò Khách xem (Viewer), chỉ có quyền xem dữ liệu.';
  }
  if (user.role === ROLES.MEMBER && !canEditDevice(user, deviceId)) {
    return 'Bạn chỉ có quyền quản trị thiết bị do mình phụ trách.';
  }
  return '';
}
