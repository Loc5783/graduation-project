/**
 * Tiện ích định dạng ngày giờ dùng chung cho toàn ứng dụng.
 * Tôn trọng múi giờ IANA (timeZone), định dạng ngày (dateFormat) và định dạng giờ (hourFormat).
 * Tuyệt đối không dùng múi giờ máy khách để ghép ngày khiến lệch ngày hoặc lệch giờ.
 */

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const DEFAULT_DATE_FORMAT = 'DD/MM/YYYY';
export const DEFAULT_HOUR_FORMAT = '24h';

/**
 * Định dạng một mốc thời gian theo cấu hình giao diện.
 *
 * @param {Date|string|number} dateInput Mốc thời gian cần định dạng
 * @param {object} options Các tùy chọn định dạng
 * @param {string} [options.timeZone='Asia/Ho_Chi_Minh'] Định danh múi giờ IANA
 * @param {string} [options.dateFormat='DD/MM/YYYY'] 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY'
 * @param {string} [options.hourFormat='24h'] '12h' | '24h'
 * @param {string} [options.locale='vi'] 'vi' | 'en'
 * @returns {string} Chuỗi ngày giờ đã định dạng
 */
export function formatDateTime(dateInput, options = {}) {
  if (!dateInput) return '';

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const timeZone = (typeof options.timeZone === 'string' && options.timeZone.trim()) || DEFAULT_TIMEZONE;
  const dateFormat = options.dateFormat || DEFAULT_DATE_FORMAT;
  const hourFormat = options.hourFormat || DEFAULT_HOUR_FORMAT;
  const hour12 = hourFormat === '12h';

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12
    });

    const parts = formatter.formatToParts(date);
    const partMap = {};
    for (const part of parts) {
      partMap[part.type] = part.value;
    }

    const day = partMap.day || '01';
    const month = partMap.month || '01';
    const year = partMap.year || '1970';
    const hour = partMap.hour || '00';
    const minute = partMap.minute || '00';
    const second = partMap.second || '00';
    const dayPeriod = partMap.dayPeriod ? ` ${partMap.dayPeriod}` : '';

    // Ghép ngày theo định dạng đã chọn
    let dateStr = `${day}/${month}/${year}`;
    if (dateFormat === 'YYYY-MM-DD') {
      dateStr = `${year}-${month}-${day}`;
    } else if (dateFormat === 'MM/DD/YYYY') {
      dateStr = `${month}/${day}/${year}`;
    }

    const timeStr = `${hour}:${minute}:${second}${dayPeriod}`;

    return `${dateStr} ${timeStr}`;
  } catch (err) {
    console.warn('Lỗi định dạng ngày giờ với timeZone:', timeZone, err);
    // Fallback an toàn nếu múi giờ lỗi
    return date.toISOString().replace('T', ' ').substring(0, 19);
  }
}

/**
 * Trợ giúp định dạng chuỗi mẫu cho card xem trước (AppearancePreview).
 */
export function formatDateTimeSample({ timeZone, dateFormat, hourFormat, date = new Date() } = {}) {
  return formatDateTime(date, { timeZone, dateFormat, hourFormat });
}

/**
 * Kiểm tra xem một chuỗi có phải là múi giờ IANA hợp lệ hay không.
 * Chặn chuỗi offset thô (+07:00, -05:00) theo đúng hợp đồng backend.
 */
export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  const trimmed = tz.trim();
  if (/^[+-]/.test(trimmed)) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}
