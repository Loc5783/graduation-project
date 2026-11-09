import { apiRequest, isPreviewMode } from './authService.js';

export const DEFAULT_APPEARANCE = Object.freeze({
  theme: 'dark',
  language: 'vi',
  fontSize: 'medium',
  highContrast: false,
  reducedMotion: false,
  timeZone: 'Asia/Ho_Chi_Minh',
  dateFormat: 'DD/MM/YYYY',
  hourFormat: '24h'
});

export const DEFAULT_NOTIFICATIONS = Object.freeze({
  types: Object.freeze({
    unusualAccess: true,
    deviceDisconnected: true,
    permissionChanges: true,
    monthlyReport: false
  }),
  minSeverity: 'warning',
  quietHours: Object.freeze({
    enabled: false,
    startTime: '22:00',
    endTime: '07:00',
    allowUrgentBypass: true
  }),
  channels: Object.freeze({
    inAppWeb: true,
    email: false
  })
});

export const DEFAULT_PRIVACY = Object.freeze({
  retentionDays: 30
});

/**
 * Lấy toàn bộ thông tin cấu hình người dùng từ máy chủ (GET /api/settings).
 * Chỉ gọi khi có phiên thật (không gọi trong preview mode).
 *
 * @returns {Promise<{ success: boolean, status: number, code: string, message: string, data: any, errors?: object }>}
 */
export async function getSettingsService() {
  if (isPreviewMode()) {
    return {
      success: true,
      status: 200,
      code: 'OK',
      message: 'Chế độ xem trước giao diện nội bộ',
      data: {
        appearance: { ...DEFAULT_APPEARANCE },
        notifications: {
          types: { ...DEFAULT_NOTIFICATIONS.types },
          minSeverity: DEFAULT_NOTIFICATIONS.minSeverity,
          quietHours: { ...DEFAULT_NOTIFICATIONS.quietHours },
          channels: { ...DEFAULT_NOTIFICATIONS.channels }
        },
        privacy: { ...DEFAULT_PRIVACY }
      },
      isPreview: true
    };
  }

  return apiRequest('/api/settings', {
    method: 'GET'
  });
}

/**
 * Cập nhật một hoặc nhiều trường cài đặt giao diện (PATCH /api/settings/appearance).
 * Chỉ gửi delta các trường thay đổi, không gửi toàn bộ snapshot.
 *
 * @param {object} diffPayload Các trường thực sự thay đổi
 * @returns {Promise<{ success: boolean, status: number, code: string, message: string, data: any, errors?: object }>}
 */
export async function updateAppearanceService(diffPayload) {
  if (isPreviewMode()) {
    return {
      success: false,
      status: 200,
      code: 'PREVIEW_MODE_NO_SAVE',
      message: 'Cần đăng nhập tài khoản thật để lưu cài đặt vào hệ thống.',
      data: null
    };
  }

  return apiRequest('/api/settings/appearance', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(diffPayload)
  });
}

/**
 * Cập nhật một hoặc nhiều trường cài đặt thông báo (PATCH /api/settings/notifications).
 * Chỉ gửi delta các trường thay đổi, không gửi toàn bộ snapshot.
 *
 * @param {object} diffPayload Các trường thực sự thay đổi
 * @returns {Promise<{ success: boolean, status: number, code: string, message: string, data: any, errors?: object }>}
 */
export async function updateNotificationsService(diffPayload) {
  if (isPreviewMode()) {
    return {
      success: false,
      status: 200,
      code: 'PREVIEW_MODE_NO_SAVE',
      message: 'Cần đăng nhập tài khoản thật để lưu cài đặt vào hệ thống.',
      data: null
    };
  }

  return apiRequest('/api/settings/notifications', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(diffPayload)
  });
}

/**
 * Cập nhật cài đặt quyền riêng tư (PATCH /api/settings/privacy).
 *
 * @param {object} diffPayload Các trường thực sự thay đổi ({ retentionDays: 7 | 30 | 90 })
 * @returns {Promise<{ success: boolean, status: number, code: string, message: string, data: any, errors?: object }>}
 */
export async function updatePrivacyService(diffPayload) {
  if (isPreviewMode()) {
    return {
      success: false,
      status: 200,
      code: 'PREVIEW_MODE_NO_SAVE',
      message: 'Cần đăng nhập tài khoản thật để lưu cài đặt vào hệ thống.',
      data: null
    };
  }

  return apiRequest('/api/settings/privacy', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(diffPayload)
  });
}
