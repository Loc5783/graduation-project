/**
 * Hằng số cấu hình mặc định, enum và hàm chuẩn hóa dữ liệu cho Cài đặt thông báo (Notification Settings).
 * Đóng vai trò là "Single Source of Truth" cho cả Mongoose Schema, Validator và Normalizer.
 */

export const NOTIFICATION_DEFAULTS = Object.freeze({
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

export const NOTIFICATION_ENUMS = Object.freeze({
  minSeverity: Object.freeze(['urgent', 'warning', 'all'])
});

export const ALLOWED_NOTIFICATION_TOP_LEVEL_FIELDS = Object.freeze([
  'types',
  'minSeverity',
  'quietHours',
  'channels'
]);

export const ALLOWED_NOTIFICATION_TYPES_FIELDS = Object.freeze([
  'unusualAccess',
  'deviceDisconnected',
  'permissionChanges',
  'monthlyReport'
]);

export const ALLOWED_NOTIFICATION_QUIET_HOURS_FIELDS = Object.freeze([
  'enabled',
  'startTime',
  'endTime',
  'allowUrgentBypass'
]);

export const ALLOWED_NOTIFICATION_CHANNELS_FIELDS = Object.freeze([
  'inAppWeb',
  'email'
]);

/**
 * Biểu thức chính quy kiểm tra định dạng giờ 24h: HH:mm từ 00:00 đến 23:59.
 */
export const TIME_FORMAT_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * Kiểm tra xem một chuỗi có phải là định dạng giờ HH:mm hợp lệ hay không.
 *
 * @param {any} val
 * @returns {boolean}
 */
export function isValidTimeFormat(val) {
  return typeof val === 'string' && TIME_FORMAT_REGEX.test(val);
}

/**
 * Chuẩn hóa đối tượng notifications từ database hoặc input thô thành cấu trúc đầy đủ, an toàn.
 *
 * Quy tắc:
 * 1. Trả cấu trúc đầy đủ, đúng kiểu, không có trường lạ.
 * 2. Hỗ trợ raw thiếu/null/sai kiểu hoặc từng nhánh con thiếu/null/sai kiểu.
 * 3. Bảo toàn boolean false hợp lệ; không dùng truthiness để thay false thành default.
 * 4. Enum hoặc giờ không hợp lệ được thay bằng giá trị mặc định an toàn.
 * 5. allowUrgentBypass chuẩn hóa luôn là true.
 * 6. email chuẩn hóa luôn là false khi hệ thống chưa hỗ trợ gửi email.
 * 7. Tuyệt đối không mutate đầu vào hoặc object defaults.
 * 8. Không thực hiện bất kỳ thao tác ghi database nào trong hàm.
 *
 * @param {object|null|undefined} raw Đối tượng thô từ MongoDB
 * @returns {object} Đối tượng notifications chuẩn hóa đầy đủ
 */
export function normalizeNotifications(raw) {
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};

  // 1. types
  const rawTypes = (source.types && typeof source.types === 'object' && !Array.isArray(source.types))
    ? source.types
    : {};
  const unusualAccess = typeof rawTypes.unusualAccess === 'boolean'
    ? rawTypes.unusualAccess
    : NOTIFICATION_DEFAULTS.types.unusualAccess;
  const deviceDisconnected = typeof rawTypes.deviceDisconnected === 'boolean'
    ? rawTypes.deviceDisconnected
    : NOTIFICATION_DEFAULTS.types.deviceDisconnected;
  const permissionChanges = typeof rawTypes.permissionChanges === 'boolean'
    ? rawTypes.permissionChanges
    : NOTIFICATION_DEFAULTS.types.permissionChanges;
  const monthlyReport = typeof rawTypes.monthlyReport === 'boolean'
    ? rawTypes.monthlyReport
    : NOTIFICATION_DEFAULTS.types.monthlyReport;

  // 2. minSeverity: enum ['urgent', 'warning', 'all']
  const minSeverity = (typeof source.minSeverity === 'string' && NOTIFICATION_ENUMS.minSeverity.includes(source.minSeverity))
    ? source.minSeverity
    : NOTIFICATION_DEFAULTS.minSeverity;

  // 3. quietHours
  const rawQH = (source.quietHours && typeof source.quietHours === 'object' && !Array.isArray(source.quietHours))
    ? source.quietHours
    : {};
  const qhEnabled = typeof rawQH.enabled === 'boolean'
    ? rawQH.enabled
    : NOTIFICATION_DEFAULTS.quietHours.enabled;
  const startTime = isValidTimeFormat(rawQH.startTime)
    ? rawQH.startTime
    : NOTIFICATION_DEFAULTS.quietHours.startTime;
  const endTime = isValidTimeFormat(rawQH.endTime)
    ? rawQH.endTime
    : NOTIFICATION_DEFAULTS.quietHours.endTime;
  // allowUrgentBypass luôn chuẩn hóa là true
  const allowUrgentBypass = true;

  // 4. channels
  const rawChannels = (source.channels && typeof source.channels === 'object' && !Array.isArray(source.channels))
    ? source.channels
    : {};
  const inAppWeb = typeof rawChannels.inAppWeb === 'boolean'
    ? rawChannels.inAppWeb
    : NOTIFICATION_DEFAULTS.channels.inAppWeb;
  // email luôn chuẩn hóa là false khi khả năng gửi email chưa được hỗ trợ
  const email = false;

  return {
    types: {
      unusualAccess,
      deviceDisconnected,
      permissionChanges,
      monthlyReport
    },
    minSeverity,
    quietHours: {
      enabled: qhEnabled,
      startTime,
      endTime,
      allowUrgentBypass
    },
    channels: {
      inAppWeb,
      email
    }
  };
}
