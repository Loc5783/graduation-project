import { apiRequest, isPreviewMode } from './authService.js';

/**
 * Kiểm tra xem một bản ghi thông báo từ phản hồi của máy chủ có đúng hợp đồng dữ liệu không.
 *
 * @param {any} item
 * @returns {boolean}
 */
export function isValidNotificationItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return false;
  }

  const { id, eventCode, type, severity, isRead, isSilent, createdAt, readAt } = item;

  if (typeof id !== 'string' || id.trim().length === 0) return false;
  if (typeof eventCode !== 'string' || eventCode.trim().length === 0) return false;
  if (typeof type !== 'string' || type.trim().length === 0) return false;
  if (typeof severity !== 'string' || !['info', 'warning', 'urgent'].includes(severity)) return false;
  if (typeof isRead !== 'boolean') return false;
  if (typeof isSilent !== 'boolean') return false;

  if (typeof createdAt !== 'string' || Number.isNaN(new Date(createdAt).getTime())) {
    return false;
  }

  if (readAt !== null && (typeof readAt !== 'string' || Number.isNaN(new Date(readAt).getTime()))) {
    return false;
  }

  return true;
}

/**
 * Lấy danh sách thông báo của người dùng hiện tại (GET /api/notifications).
 *
 * @param {object} [options={}]
 * @param {number} [options.limit] Số lượng bản ghi (1 đến 50)
 * @param {string} [options.cursor] Con trỏ phân trang base64url
 * @returns {Promise<{ success: boolean, status: number, code: string, message: string, data: { items: Array, nextCursor: string|null, unreadCount: number } | null }>}
 */
export async function getNotificationsService({ limit, cursor } = {}) {
  if (isPreviewMode()) {
    return {
      success: false,
      status: 200,
      code: 'PREVIEW_MODE_NO_NOTIFICATIONS',
      message: 'Chế độ xem trước không hỗ trợ thông báo từ máy chủ.',
      data: null
    };
  }

  const params = new URLSearchParams();
  if (typeof limit === 'number' && Number.isInteger(limit) && limit > 0) {
    params.set('limit', String(limit));
  }
  if (cursor && typeof cursor === 'string' && cursor.trim().length > 0) {
    params.set('cursor', cursor.trim());
  }

  const qs = params.toString();
  const endpoint = qs ? `/api/notifications?${qs}` : '/api/notifications';

  const res = await apiRequest(endpoint, {
    method: 'GET'
  });

  if (!res.success) {
    return res;
  }

  // Xác thực nghiêm ngặt hợp đồng response của GET /api/notifications
  const data = res.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      success: false,
      status: res.status,
      code: 'INVALID_RESPONSE',
      message: 'Phản hồi từ máy chủ không đúng định dạng dữ liệu.',
      data: null
    };
  }

  const { items, nextCursor, unreadCount } = data;

  if (!Array.isArray(items)) {
    return {
      success: false,
      status: res.status,
      code: 'INVALID_RESPONSE',
      message: 'Danh sách thông báo phải là một mảng.',
      data: null
    };
  }

  for (const item of items) {
    if (!isValidNotificationItem(item)) {
      return {
        success: false,
        status: res.status,
        code: 'INVALID_RESPONSE',
        message: 'Mục thông báo không đúng cấu trúc yêu cầu.',
        data: null
      };
    }
  }

  if (nextCursor !== null && (typeof nextCursor !== 'string' || nextCursor.trim().length === 0)) {
    return {
      success: false,
      status: res.status,
      code: 'INVALID_RESPONSE',
      message: 'Con trỏ nextCursor không đúng định dạng.',
      data: null
    };
  }

  if (typeof unreadCount !== 'number' || !Number.isInteger(unreadCount) || unreadCount < 0) {
    return {
      success: false,
      status: res.status,
      code: 'INVALID_RESPONSE',
      message: 'Số lượng chưa đọc không hợp lệ.',
      data: null
    };
  }

  return res;
}

/**
 * Đánh dấu một thông báo đã đọc (PATCH /api/notifications/:id/read).
 *
 * @param {string} id Mã ID của thông báo (ObjectId 24 hex)
 * @returns {Promise<{ success: boolean, status: number, code: string, message: string, data: { notification: object } | null }>}
 */
export async function markNotificationAsReadService(id) {
  if (isPreviewMode()) {
    return {
      success: false,
      status: 200,
      code: 'PREVIEW_MODE_NO_NOTIFICATIONS',
      message: 'Chế độ xem trước không hỗ trợ thao tác thông báo.',
      data: null
    };
  }

  if (!id || typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id.trim())) {
    return {
      success: false,
      status: 400,
      code: 'INVALID_ID',
      message: 'Mã ID thông báo không hợp lệ.',
      data: null
    };
  }

  const trimmedId = id.trim();
  const res = await apiRequest(`/api/notifications/${encodeURIComponent(trimmedId)}/read`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });

  if (!res.success) {
    return res;
  }

  // Xác thực nghiêm ngặt response
  const notif = res.data?.notification;
  if (!isValidNotificationItem(notif) || notif.id !== trimmedId || notif.isRead !== true || !notif.readAt) {
    return {
      success: false,
      status: res.status,
      code: 'INVALID_RESPONSE',
      message: 'Phản hồi cập nhật thông báo không hợp lệ.',
      data: null
    };
  }

  return res;
}

/**
 * Đánh dấu tất cả thông báo hiện có là đã đọc (PATCH /api/notifications/read-all).
 *
 * @returns {Promise<{ success: boolean, status: number, code: string, message: string, data: { updatedCount: number } | null }>}
 */
export async function markAllNotificationsAsReadService() {
  if (isPreviewMode()) {
    return {
      success: false,
      status: 200,
      code: 'PREVIEW_MODE_NO_NOTIFICATIONS',
      message: 'Chế độ xem trước không hỗ trợ thao tác thông báo.',
      data: null
    };
  }

  const res = await apiRequest('/api/notifications/read-all', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });

  if (!res.success) {
    return res;
  }

  const updatedCount = res.data?.updatedCount;
  if (typeof updatedCount !== 'number' || !Number.isInteger(updatedCount) || updatedCount < 0) {
    return {
      success: false,
      status: res.status,
      code: 'INVALID_RESPONSE',
      message: 'Phản hồi đánh dấu tất cả không hợp lệ.',
      data: null
    };
  }

  return res;
}
