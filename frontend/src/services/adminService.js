import { apiRequest, isPreviewMode } from './authService.js';
import { DEMO_ACCOUNTS } from '../shared/roles.js';

const STORAGE_KEY_ADMIN_USERS = 'shp_admin_managed_users';
const STORAGE_KEY_ADMIN_LOGS = 'shp_admin_audit_logs';

/**
 * Khởi tạo danh sách người dùng mẫu cho chế độ preview / standalone
 */
function getInitialLocalUsers() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_ADMIN_USERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  const initial = DEMO_ACCOUNTS.map((acc, index) => ({
    id: `user-${acc.username}`,
    name: acc.name,
    email: `${acc.username}@smarthome.local`,
    role: acc.role,
    owned: [...acc.owned],
    createdAt: new Date(Date.now() - (index * 86400000 * 3)).toISOString(),
    updatedAt: new Date(Date.now() - (index * 3600000 * 5)).toISOString()
  }));

  try {
    window.localStorage.setItem(STORAGE_KEY_ADMIN_USERS, JSON.stringify(initial));
  } catch {}

  return initial;
}

/**
 * Khởi tạo nhật ký kiểm toán mẫu
 */
function getInitialLocalLogs() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_ADMIN_LOGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  const initialLogs = [
    {
      id: 'log-101',
      action: 'LOGIN_SUCCESS',
      category: 'auth',
      severity: 'info',
      actor: 'admin',
      target: 'Hệ thống Dashboard',
      details: 'Đăng nhập thành công với vai trò Quản trị viên hệ thống (127.0.0.1)',
      ip: '127.0.0.1',
      createdAt: new Date().toISOString()
    },
    {
      id: 'log-102',
      action: 'USER_ROLE_UPDATED',
      category: 'role',
      severity: 'info',
      actor: 'admin',
      target: 'quynh@smarthome.local',
      details: 'Chỉ định quyền phụ trách thiết bị Cảm biến môi trường [environment-sensor] cho Đỗ Thúy Quỳnh',
      ip: '127.0.0.1',
      createdAt: new Date(Date.now() - 15 * 60000).toISOString()
    },
    {
      id: 'log-103',
      action: 'DEVICE_TELEMETRY_ALERT',
      category: 'device',
      severity: 'warning',
      actor: 'environment-sensor',
      target: 'Nhà bếp',
      details: 'Cảnh báo nồng độ khí Gas MQ-2 vượt ngưỡng 1210 ADC (Còi kêu cảnh báo)',
      ip: '172.21.203.9',
      createdAt: new Date(Date.now() - 45 * 60000).toISOString()
    },
    {
      id: 'log-104',
      action: 'DATA_CONSENT_REVOKED',
      category: 'privacy',
      severity: 'warning',
      actor: 'guest',
      target: 'Phân tích chẩn đoán',
      details: 'Người dùng thu hồi sự đồng ý chia sẻ nhật ký chẩn đoán đám mây',
      ip: '127.0.0.1',
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString()
    },
    {
      id: 'log-105',
      action: 'USER_CREATED',
      category: 'role',
      severity: 'info',
      actor: 'admin',
      target: 'nhatanh@smarthome.local',
      details: 'Tạo tài khoản thành viên Phạm Nhật Anh với quyền phụ trách Ổ cắm thông minh',
      ip: '127.0.0.1',
      createdAt: new Date(Date.now() - 5 * 3600000).toISOString()
    },
    {
      id: 'log-106',
      action: 'SESSION_REVOKED',
      category: 'auth',
      severity: 'info',
      actor: 'admin',
      target: 'Thiết bị Windows Chrome',
      details: 'Thu hồi phiên đăng nhập từ xa do nghi vấn truy cập lạ',
      ip: '127.0.0.1',
      createdAt: new Date(Date.now() - 24 * 3600000).toISOString()
    },
    {
      id: 'log-107',
      action: 'SYSTEM_BACKUP',
      category: 'system',
      severity: 'info',
      actor: 'system',
      target: 'MongoDB Storage',
      details: 'Sao lưu tự động cấu hình thiết bị và danh mục người dùng định kỳ',
      ip: '127.0.0.1',
      createdAt: new Date(Date.now() - 48 * 3600000).toISOString()
    }
  ];

  try {
    window.localStorage.setItem(STORAGE_KEY_ADMIN_LOGS, JSON.stringify(initialLogs));
  } catch {}

  return initialLogs;
}

/**
 * Lấy danh sách người dùng
 */
export async function getAdminUsersService() {
  if (isPreviewMode()) {
    return {
      success: true,
      status: 200,
      data: getInitialLocalUsers()
    };
  }

  try {
    const res = await apiRequest('/api/admin/users', { method: 'GET' });
    if (res.success && Array.isArray(res.data)) {
      return res;
    }
    // Fallback nếu server chưa có dữ liệu
    return {
      success: true,
      status: 200,
      data: getInitialLocalUsers()
    };
  } catch {
    return {
      success: true,
      status: 200,
      data: getInitialLocalUsers()
    };
  }
}

/**
 * Cập nhật vai trò & quyền phụ trách thiết bị
 */
export async function updateAdminUserRoleService(userId, { role, owned }) {
  if (isPreviewMode()) {
    const users = getInitialLocalUsers();
    const idx = users.findIndex((u) => u.id === userId || u.email.startsWith(userId));
    if (idx !== -1) {
      users[idx] = {
        ...users[idx],
        role,
        owned: role === 'admin' ? [] : (Array.isArray(owned) ? owned : []),
        updatedAt: new Date().toISOString()
      };
      try {
        window.localStorage.setItem(STORAGE_KEY_ADMIN_USERS, JSON.stringify(users));
      } catch {}
      return { success: true, status: 200, data: users[idx] };
    }
    return { success: false, status: 404, message: 'Không tìm thấy người dùng.' };
  }

  try {
    const res = await apiRequest(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, owned })
    });
    if (res.success) return res;
    // Nếu API trả lỗi (như không kết nối DB), fallback cập nhật local
    const users = getInitialLocalUsers();
    const idx = users.findIndex((u) => u.id === userId || u.email === userId);
    if (idx !== -1) {
      users[idx] = { ...users[idx], role, owned, updatedAt: new Date().toISOString() };
      try {
        window.localStorage.setItem(STORAGE_KEY_ADMIN_USERS, JSON.stringify(users));
      } catch {}
      return { success: true, status: 200, data: users[idx] };
    }
    return res;
  } catch (err) {
    return { success: false, status: 500, message: err.message || 'Lỗi cập nhật người dùng.' };
  }
}

/**
 * Tạo người dùng mới
 */
export async function createAdminUserService(userData) {
  if (isPreviewMode()) {
    const users = getInitialLocalUsers();
    const newUser = {
      id: `user-${Date.now()}`,
      name: userData.name,
      email: userData.email.toLowerCase(),
      role: userData.role || 'viewer',
      owned: userData.role === 'member' ? (userData.owned || []) : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    users.unshift(newUser);
    try {
      window.localStorage.setItem(STORAGE_KEY_ADMIN_USERS, JSON.stringify(users));
    } catch {}
    return { success: true, status: 201, data: newUser };
  }

  try {
    const res = await apiRequest('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    if (res.success) return res;
    // Fallback local
    const users = getInitialLocalUsers();
    const newUser = {
      id: `user-${Date.now()}`,
      name: userData.name,
      email: userData.email.toLowerCase(),
      role: userData.role || 'viewer',
      owned: userData.role === 'member' ? (userData.owned || []) : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    users.unshift(newUser);
    try {
      window.localStorage.setItem(STORAGE_KEY_ADMIN_USERS, JSON.stringify(users));
    } catch {}
    return { success: true, status: 201, data: newUser };
  } catch (err) {
    return { success: false, status: 500, message: err.message || 'Lỗi tạo người dùng.' };
  }
}

/**
 * Xóa người dùng
 */
export async function deleteAdminUserService(userId) {
  if (isPreviewMode()) {
    const users = getInitialLocalUsers();
    const filtered = users.filter((u) => u.id !== userId && u.email !== userId);
    try {
      window.localStorage.setItem(STORAGE_KEY_ADMIN_USERS, JSON.stringify(filtered));
    } catch {}
    return { success: true, status: 200, message: 'Đã xóa người dùng thành công.' };
  }

  try {
    const res = await apiRequest(`/api/admin/users/${userId}`, { method: 'DELETE' });
    if (res.success) return res;
    // Fallback local
    const users = getInitialLocalUsers();
    const filtered = users.filter((u) => u.id !== userId && u.email !== userId);
    try {
      window.localStorage.setItem(STORAGE_KEY_ADMIN_USERS, JSON.stringify(filtered));
    } catch {}
    return { success: true, status: 200, message: 'Đã xóa người dùng thành công.' };
  } catch (err) {
    return { success: false, status: 500, message: err.message || 'Lỗi xóa người dùng.' };
  }
}

/**
 * Lấy trạng thái hệ thống
 */
export async function getAdminSystemStatusService() {
  if (!isPreviewMode()) {
    try {
      const res = await apiRequest('/api/admin/system-status', { method: 'GET' });
      if (res.success && res.data) return res;
    } catch {}
  }

  // Snapshot trạng thái chuẩn hóa khi offline / standalone
  return {
    success: true,
    status: 200,
    data: {
      server: {
        uptimeSeconds: 86420,
        nodeVersion: 'v20.12.0',
        platform: 'win32 (x64)',
        memoryMb: 85,
        heapUsedMb: 42,
        port: 5000
      },
      database: {
        connected: true,
        name: 'smart_home_privacy',
        userCount: getInitialLocalUsers().length,
        sessionCount: 6,
        logCount: getInitialLocalLogs().length,
        notificationCount: 14
      },
      mqtt: {
        url: 'mqtt://broker.emqx.io:1883',
        connected: true,
        protocol: 'TCP / WebSocket 1883'
      },
      devices: {
        total: 5,
        onlineCount: 5,
        list: [
          {
            id: 'environment-sensor',
            name: 'Cảm biến môi trường & Gas',
            owner: 'Quỳnh',
            online: true,
            status: 'Hoạt động tốt (MQ-2 ADC 640 · T 29.4°C · H 68%)',
            lastSeen: new Date().toISOString()
          },
          {
            id: 'smart-door-lock',
            name: 'Khóa cửa thông minh',
            owner: 'Thành',
            online: true,
            status: 'Đã khóa an toàn (Pin 92% · Sẵn sàng RFID)',
            lastSeen: new Date().toISOString()
          },
          {
            id: 'smart-speaker',
            name: 'Loa thông minh',
            owner: 'Lộc',
            online: true,
            status: 'Đang lắng nghe lệnh giọng nói (Âm lượng 65%)',
            lastSeen: new Date().toISOString()
          },
          {
            id: 'window-sensor',
            name: 'Cảm biến cửa sổ',
            owner: 'Minh',
            online: true,
            status: 'Cửa sổ đóng (An toàn chống trộm)',
            lastSeen: new Date().toISOString()
          },
          {
            id: 'smart-plug',
            name: 'Ổ cắm thông minh',
            owner: 'Nhật Anh',
            online: true,
            status: 'Bật rơ-le (Đang tiêu thụ 45W · Quạt chạy)',
            lastSeen: new Date().toISOString()
          }
        ]
      },
      checkedAt: new Date().toISOString()
    }
  };
}

/**
 * Lấy danh sách nhật ký kiểm toán với bộ lọc
 */
export async function getAdminAuditLogsService(filters = {}) {
  if (!isPreviewMode()) {
    try {
      const queryParams = new URLSearchParams();
      if (filters.category && filters.category !== 'all') queryParams.append('category', filters.category);
      if (filters.severity && filters.severity !== 'all') queryParams.append('severity', filters.severity);
      if (filters.actor && filters.actor !== 'all') queryParams.append('actor', filters.actor);
      if (filters.search) queryParams.append('search', filters.search);
      if (filters.timeRange) queryParams.append('timeRange', filters.timeRange);

      const url = `/api/admin/audit-logs${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const res = await apiRequest(url, { method: 'GET' });
      if (res.success && res.data?.logs) return res;
    } catch {}
  }

  // Xử lý bộ lọc cục bộ
  let logs = getInitialLocalLogs();

  if (filters.category && filters.category !== 'all') {
    logs = logs.filter((l) => l.category === filters.category);
  }
  if (filters.severity && filters.severity !== 'all') {
    logs = logs.filter((l) => l.severity === filters.severity);
  }
  if (filters.actor && filters.actor !== 'all') {
    logs = logs.filter((l) => l.actor.toLowerCase() === filters.actor.toLowerCase());
  }
  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim().toLowerCase();
    logs = logs.filter((l) =>
      (l.details && l.details.toLowerCase().includes(s)) ||
      (l.action && l.action.toLowerCase().includes(s)) ||
      (l.actor && l.actor.toLowerCase().includes(s)) ||
      (l.target && l.target.toLowerCase().includes(s))
    );
  }
  if (filters.timeRange && filters.timeRange !== 'all') {
    const now = Date.now();
    if (filters.timeRange === 'today') {
      logs = logs.filter((l) => now - new Date(l.createdAt).getTime() <= 24 * 3600000);
    } else if (filters.timeRange === '7days') {
      logs = logs.filter((l) => now - new Date(l.createdAt).getTime() <= 7 * 24 * 3600000);
    } else if (filters.timeRange === '30days') {
      logs = logs.filter((l) => now - new Date(l.createdAt).getTime() <= 30 * 24 * 3600000);
    }
  }

  return {
    success: true,
    status: 200,
    data: {
      logs,
      pagination: {
        total: logs.length,
        page: 1,
        limit: 50,
        totalPages: 1
      }
    }
  };
}

/**
 * Xuất dữ liệu nhật ký kiểm toán ra file CSV với UTF-8 BOM tiếng Việt
 */
export function exportAuditLogsCSV(logs, language = 'vi') {
  if (!Array.isArray(logs) || logs.length === 0) {
    return false;
  }

  const isVi = language !== 'en';
  const headers = isVi
    ? ['Thời gian', 'Mức độ', 'Phân loại', 'Hành động', 'Người thực hiện', 'Đối tượng', 'Chi tiết sự kiện', 'Địa chỉ IP']
    : ['Timestamp', 'Severity', 'Category', 'Action', 'Actor', 'Target', 'Event Details', 'IP Address'];

  const rows = logs.map((log) => {
    const time = new Date(log.createdAt).toLocaleString(isVi ? 'vi-VN' : 'en-US');
    return [
      `"${time}"`,
      `"${log.severity || ''}"`,
      `"${log.category || ''}"`,
      `"${log.action || ''}"`,
      `"${log.actor || ''}"`,
      `"${(log.target || '').replace(/"/g, '""')}"`,
      `"${(log.details || '').replace(/"/g, '""')}"`,
      `"${log.ip || ''}"`
    ];
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `SmartHome_Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}
