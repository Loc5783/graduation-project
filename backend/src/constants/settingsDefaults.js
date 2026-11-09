/**
 * Hằng số cấu hình mặc định, enum và hàm chuẩn hóa dữ liệu cho Cài đặt giao diện (Appearance Settings).
 * Đóng vai trò là "Single Source of Truth" cho cả Mongoose Schema, Validator và Normalizer.
 */

export const APPEARANCE_DEFAULTS = Object.freeze({
  theme: 'dark',
  language: 'vi',
  fontSize: 'medium',
  highContrast: false,
  reducedMotion: false,
  timeZone: 'Asia/Ho_Chi_Minh',
  dateFormat: 'DD/MM/YYYY',
  hourFormat: '24h'
});

export const APPEARANCE_ENUMS = Object.freeze({
  theme: Object.freeze(['dark', 'light', 'system']),
  language: Object.freeze(['vi', 'en']),
  fontSize: Object.freeze(['small', 'medium', 'large']),
  dateFormat: Object.freeze(['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']),
  hourFormat: Object.freeze(['12h', '24h'])
});

export const ALLOWED_APPEARANCE_FIELDS = Object.freeze([
  'theme',
  'language',
  'fontSize',
  'highContrast',
  'reducedMotion',
  'timeZone',
  'dateFormat',
  'hourFormat'
]);

/**
 * Kiểm tra xem một chuỗi có phải là định danh múi giờ IANA hợp lệ được runtime hỗ trợ hay không.
 * Giới hạn độ dài tối đa 50 ký tự.
 * Quy định:
 * - Nhận tên múi giờ IANA (ví dụ: 'Asia/Ho_Chi_Minh', 'America/New_York').
 * - Cho phép 'UTC'.
 * - Từ chối các định dạng offset như '+07:00', '-05:00' hoặc tương đương.
 * - Không bắt buộc phải có dấu '/'.
 *
 * @param {any} tz Giá trị cần kiểm tra
 * @returns {boolean}
 */
export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || tz.trim().length === 0 || tz.length > 50) {
    return false;
  }
  const trimmed = tz.trim();
  // Từ chối định dạng offset bắt đầu bằng dấu + hoặc -
  if (/^[+-]/.test(trimmed)) {
    return false;
  }
  try {
    const dtf = new Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    const resolved = dtf.resolvedOptions().timeZone;
    // Đảm bảo runtime không resolve ra dạng offset
    if (/^[+-]/.test(resolved)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Chuẩn hóa đối tượng appearance từ database hoặc input thô thành đúng 8 trường hợp lệ.
 * Đảm bảo:
 * 1. Chỉ xuất đúng 8 trường được phép.
 * 2. Dữ liệu cũ bị null, sai kiểu hoặc enum lạ được thay bằng giá trị default an toàn.
 * 3. Giá trị boolean false hợp lệ KHÔNG bị biến thành default do kiểm tra truthy sai cách.
 *
 * @param {object|null|undefined} raw Đối tượng thô từ MongoDB
 * @returns {object} Đối tượng appearance đầy đủ 8 trường chuẩn
 */
export function normalizeAppearance(raw) {
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};

  // 1. theme: enum ['dark', 'light', 'system']
  const theme = (typeof source.theme === 'string' && APPEARANCE_ENUMS.theme.includes(source.theme))
    ? source.theme
    : APPEARANCE_DEFAULTS.theme;

  // 2. language: enum ['vi', 'en']
  const language = (typeof source.language === 'string' && APPEARANCE_ENUMS.language.includes(source.language))
    ? source.language
    : APPEARANCE_DEFAULTS.language;

  // 3. fontSize: enum ['small', 'medium', 'large']
  const fontSize = (typeof source.fontSize === 'string' && APPEARANCE_ENUMS.fontSize.includes(source.fontSize))
    ? source.fontSize
    : APPEARANCE_DEFAULTS.fontSize;

  // 4. highContrast: boolean thật (chú ý: false là giá trị hợp lệ, không dùng truthy check)
  const highContrast = typeof source.highContrast === 'boolean'
    ? source.highContrast
    : APPEARANCE_DEFAULTS.highContrast;

  // 5. reducedMotion: boolean thật (chú ý: false là giá trị hợp lệ, không dùng truthy check)
  const reducedMotion = typeof source.reducedMotion === 'boolean'
    ? source.reducedMotion
    : APPEARANCE_DEFAULTS.reducedMotion;

  // 6. timeZone: chuỗi IANA hợp lệ và <= 50 ký tự
  const timeZone = (typeof source.timeZone === 'string' && isValidTimeZone(source.timeZone))
    ? source.timeZone.trim()
    : APPEARANCE_DEFAULTS.timeZone;

  // 7. dateFormat: enum ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']
  const dateFormat = (typeof source.dateFormat === 'string' && APPEARANCE_ENUMS.dateFormat.includes(source.dateFormat))
    ? source.dateFormat
    : APPEARANCE_DEFAULTS.dateFormat;

  // 8. hourFormat: enum ['12h', '24h']
  const hourFormat = (typeof source.hourFormat === 'string' && APPEARANCE_ENUMS.hourFormat.includes(source.hourFormat))
    ? source.hourFormat
    : APPEARANCE_DEFAULTS.hourFormat;

  return {
    theme,
    language,
    fontSize,
    highContrast,
    reducedMotion,
    timeZone,
    dateFormat,
    hourFormat
  };
}
