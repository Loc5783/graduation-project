import { apiRequest, isPreviewMode } from './authService.js';

/**
 * Cập nhật thông tin hồ sơ tài khoản (PATCH /api/account/profile).
 * Chỉ hỗ trợ cập nhật họ và tên (name).
 *
 * @param {{ name: string }} data Dữ liệu cập nhật hồ sơ
 * @returns {Promise<{ success: boolean, status: number, code: string, message: string, data: any, errors?: object, isNetworkError?: boolean }>}
 */
export async function updateProfileService(data) {
  if (isPreviewMode()) {
    return {
      success: false,
      status: 200,
      code: 'PREVIEW_MODE_NO_SAVE',
      message: 'Chế độ xem trước không hỗ trợ lưu thay đổi hồ sơ vào máy chủ.',
      data: null
    };
  }

  return apiRequest('/api/account/profile', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
}

/**
 * Đổi mật khẩu tài khoản (POST /api/account/change-password).
 * Gửi mật khẩu hiện tại và mật khẩu mới qua kết nối bảo mật tới máy chủ.
 *
 * @param {{ currentPassword: string, newPassword: string }} data Dữ liệu đổi mật khẩu
 * @returns {Promise<{ success: boolean, status: number, code: string, message: string, data: any, errors?: object, isNetworkError?: boolean }>}
 */
export async function changePasswordService(data) {
  if (isPreviewMode()) {
    return {
      success: false,
      status: 200,
      code: 'PREVIEW_MODE_NO_CHANGE_PASSWORD',
      message: 'Chế độ xem trước không hỗ trợ đổi mật khẩu.',
      data: null
    };
  }

  return apiRequest('/api/account/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      currentPassword: data?.currentPassword,
      newPassword: data?.newPassword
    })
  });
}

/**
 * Liệt kê danh sách các phiên đăng nhập đang hoạt động (GET /api/account/sessions).
 *
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] Signal để hủy yêu cầu khi cần
 * @returns {Promise<{ success: boolean, status: number, code: string, message: string, data: any, errors?: object, isNetworkError?: boolean }>}
 */
export async function getSessionsService(options = {}) {
  if (isPreviewMode()) {
    return {
      success: false,
      status: 200,
      code: 'PREVIEW_MODE',
      message: 'Cần đăng nhập để quản lý phiên.',
      data: null
    };
  }

  return apiRequest('/api/account/sessions', {
    method: 'GET',
    signal: options.signal
  });
}

/**
 * Thu hồi một phiên làm việc cụ thể theo ID (DELETE /api/account/sessions/:sessionId).
 *
 * @param {string} sessionId Định danh phiên cần thu hồi
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] Signal để hủy yêu cầu khi cần
 * @returns {Promise<{ success: boolean, status: number, code: string, message: string, data: any, errors?: object, isNetworkError?: boolean }>}
 */
export async function revokeSessionService(sessionId, options = {}) {
  if (isPreviewMode()) {
    return {
      success: false,
      status: 200,
      code: 'PREVIEW_MODE',
      message: 'Cần đăng nhập để quản lý phiên.',
      data: null
    };
  }

  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    return {
      success: false,
      status: 400,
      code: 'INVALID_SESSION_ID',
      message: 'Định danh phiên không hợp lệ.',
      data: null
    };
  }

  const encodedId = encodeURIComponent(sessionId.trim());
  return apiRequest(`/api/account/sessions/${encodedId}`, {
    method: 'DELETE',
    signal: options.signal
  });
}

/**
 * Đăng xuất khỏi tất cả các thiết bị đang hoạt động (POST /api/account/logout-all).
 *
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] Signal để hủy yêu cầu khi cần
 * @returns {Promise<{ success: boolean, status: number, code: string, message: string, data: any, errors?: object, isNetworkError?: boolean }>}
 */
export async function logoutAllSessionsService(options = {}) {
  if (isPreviewMode()) {
    return {
      success: false,
      status: 200,
      code: 'PREVIEW_MODE',
      message: 'Cần đăng nhập để quản lý phiên.',
      data: null
    };
  }

  return apiRequest('/api/account/logout-all', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({}),
    signal: options.signal
  });
}
