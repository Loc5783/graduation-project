import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { normalizeNotifications } from '../constants/notificationDefaults.js';
import { normalizeAppearance, isValidTimeZone } from '../constants/settingsDefaults.js';

/**
 * Làm sạch chuỗi tham số: loại bỏ thẻ/ký tự HTML và cắt ngắn tối đa 100 ký tự.
 *
 * @param {any} val
 * @param {number} [maxLen=100]
 * @returns {string|null}
 */
export function sanitizeParamString(val, maxLen = 100) {
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/[<>]/g, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}

/**
 * Kiểm tra xem một thời điểm có nằm trong khoảng giờ không làm phiền (quiet hours) hay không.
 *
 * Quy tắc:
 * 1. Nếu quietHours.enabled !== true: không áp dụng (trả về false).
 * 2. startTime và endTime có định dạng HH:mm.
 * 3. startTime === endTime: không có khoảng yên lặng (trả về false).
 * 4. Cùng ngày (startTime < endTime): start inclusive, end exclusive -> [startTime, endTime).
 * 5. Qua đêm (startTime > endTime): now >= startTime || now < endTime.
 * 6. Tính toán giờ địa phương theo đúng timeZone của người dùng (fallback: 'Asia/Ho_Chi_Minh').
 *
 * @param {Date} now Thời điểm kiểm tra
 * @param {object} quietHours Cấu hình quietHours từ settings
 * @param {string} [timeZone='Asia/Ho_Chi_Minh'] Múi giờ IANA của người dùng
 * @returns {boolean}
 */
export function isInQuietHours(now = new Date(), quietHours = {}, timeZone = 'Asia/Ho_Chi_Minh') {
  if (!quietHours || !quietHours.enabled) {
    return false;
  }

  const startTime = quietHours.startTime;
  const endTime = quietHours.endTime;

  if (typeof startTime !== 'string' || typeof endTime !== 'string') {
    return false;
  }

  if (startTime === endTime) {
    return false;
  }

  const safeTz = isValidTimeZone(timeZone) ? timeZone : 'Asia/Ho_Chi_Minh';

  let currentHHmm;
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: safeTz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    currentHHmm = formatter.format(now);
  } catch {
    const fallbackFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    currentHHmm = fallbackFormatter.format(now);
  }

  if (startTime < endTime) {
    // Cùng ngày: [startTime, endTime)
    return currentHHmm >= startTime && currentHHmm < endTime;
  } else {
    // Qua đêm (ví dụ: 22:00 -> 07:00)
    return currentHHmm >= startTime || currentHHmm < endTime;
  }
}

/**
 * Kiểm tra xem mức độ nghiêm trọng (severity) của sự kiện có đạt ngưỡng minSeverity của người dùng không.
 *
 * Ngưỡng:
 * - 'urgent': chỉ nhận thông báo 'urgent'.
 * - 'warning': nhận thông báo 'warning' và 'urgent'.
 * - 'all': nhận tất cả ('info', 'warning', 'urgent').
 *
 * @param {string} eventSeverity Mức độ của sự kiện ('info' | 'warning' | 'urgent')
 * @param {string} userMinSeverity Ngưỡng cài đặt của người dùng ('urgent' | 'warning' | 'all')
 * @returns {boolean}
 */
export function isSeverityAllowed(eventSeverity, userMinSeverity) {
  if (userMinSeverity === 'urgent') {
    return eventSeverity === 'urgent';
  }
  if (userMinSeverity === 'warning') {
    return eventSeverity === 'warning' || eventSeverity === 'urgent';
  }
  if (userMinSeverity === 'all') {
    return ['info', 'warning', 'urgent'].includes(eventSeverity);
  }
  // Mặc định fallback an toàn như 'warning'
  return eventSeverity === 'warning' || eventSeverity === 'urgent';
}

/**
 * Dispatch một thông báo nội bộ tới hộp thư người dùng.
 *
 * Thứ tự áp dụng:
 * A. Xác định người nhận hợp lệ từ User thật (reject nếu không tìm thấy user).
 * B. Đọc và chuẩn hóa cấu hình cài đặt notifications và appearance.
 * C. Kiểm tra loại thông báo có được bật không (notifications.types[type]).
 * D. Kiểm tra ngưỡng mức độ nhận (minSeverity).
 * E. Kiểm tra kênh nhận trên web (channels.inAppWeb).
 * F. Kiểm tra giờ yên lặng (quiet hours). Nếu trong giờ yên lặng:
 *    - Nếu sự kiện là 'urgent' và allowUrgentBypass = true: isSilent = false (vượt giờ yên lặng).
 *    - Ngược lại: isSilent = true (phát âm thầm).
 * G. Tạo bản ghi Notification trên MongoDB với khóa chống trùng (dedupKey).
 *    Xử lý lỗi duplicate key E11000 an toàn, trả về document đã có hoặc null.
 *
 * @param {object} params
 * @param {string|mongoose.Types.ObjectId|object} params.user User document hoặc userId
 * @param {string} params.eventCode Mã sự kiện (ví dụ: 'SESSION_REVOKED')
 * @param {string} params.type Phân loại sự kiện (ví dụ: 'permissionChanges')
 * @param {string} params.severity Mức độ nghiêm trọng ('info' | 'warning' | 'urgent')
 * @param {object} [params.eventParams={}] Tham số hiển thị đã làm sạch
 * @param {string} params.dedupKey Khóa chống trùng sự kiện
 * @param {Date} [params.now=new Date()] Mốc thời gian phát sinh sự kiện
 * @returns {Promise<object|null>} Document Notification đã tạo hoặc null nếu bị lọc/trùng
 */
export async function dispatchNotification({
  user,
  eventCode,
  type,
  severity,
  eventParams = {},
  dedupKey,
  now = new Date()
}) {
  if (!user || !eventCode || !type || !severity || !dedupKey) {
    return null;
  }

  // A. Xác định người nhận hợp lệ
  let targetUser = user;
  if (!targetUser._id || !targetUser.settings) {
    targetUser = await User.findById(user._id || user).select('settings');
    if (!targetUser) {
      return null;
    }
  }

  // B. Chuẩn hóa cài đặt notifications và appearance
  const notificationsSettings = normalizeNotifications(targetUser.settings?.notifications);
  const appearanceSettings = normalizeAppearance(targetUser.settings?.appearance);

  // C. Kiểm tra loại thông báo có được bật không
  if (notificationsSettings.types[type] === false) {
    return null;
  }

  // D. Kiểm tra ngưỡng mức độ nhận (minSeverity)
  if (!isSeverityAllowed(severity, notificationsSettings.minSeverity)) {
    return null;
  }

  // E. Kiểm tra kênh nhận trên web (inAppWeb)
  if (!notificationsSettings.channels.inAppWeb) {
    return null;
  }

  // F. Kiểm tra giờ yên lặng (quiet hours)
  const inQuiet = isInQuietHours(now, notificationsSettings.quietHours, appearanceSettings.timeZone);
  let isSilent = false;
  if (inQuiet) {
    if (severity === 'urgent' && notificationsSettings.quietHours.allowUrgentBypass) {
      isSilent = false;
    } else {
      isSilent = true;
    }
  }

  // G. Tạo bản ghi Notification với khóa chống trùng
  try {
    const notification = await Notification.create({
      userId: targetUser._id,
      eventCode,
      type,
      severity,
      params: eventParams,
      isRead: false,
      readAt: null,
      isSilent,
      dedupKey,
      createdAt: now
    });
    return notification;
  } catch (error) {
    // Bắt lỗi trùng khóa E11000 (Duplicate Key)
    if (error.code === 11000) {
      return null;
    }
    throw error;
  }
}

/**
 * Dispatch thông báo khi một phiên đăng nhập bị thu hồi (sự kiện SESSION_REVOKED).
 *
 * @param {object} options
 * @param {object|string} options.user User document hoặc userId
 * @param {object} options.revokedSession Bản ghi UserSession vừa bị thu hồi
 * @param {Date} [options.now=new Date()]
 * @returns {Promise<object|null>}
 */
export async function dispatchSessionRevokedNotification({ user, revokedSession, now = new Date() }) {
  if (!revokedSession || !revokedSession.sessionId) {
    return null;
  }

  const eventParams = {};
  const cleanDevice = sanitizeParamString(revokedSession.deviceLabel);
  const cleanBrowser = sanitizeParamString(revokedSession.browserLabel);

  if (cleanDevice) eventParams.deviceLabel = cleanDevice;
  if (cleanBrowser) eventParams.browserLabel = cleanBrowser;

  return dispatchNotification({
    user,
    eventCode: 'SESSION_REVOKED',
    type: 'permissionChanges',
    severity: 'warning',
    eventParams,
    dedupKey: `session_revoked:${revokedSession.sessionId}`,
    now
  });
}
