/**
 * Hằng số cấu hình mặc định, enum và hàm chuẩn hóa dữ liệu cho Cài đặt quyền riêng tư (Privacy Settings).
 * Đóng vai trò là "Single Source of Truth" cho cả Mongoose Schema, Validator và Normalizer.
 */

export const PRIVACY_DEFAULTS = Object.freeze({
  retentionDays: 30
});

export const PRIVACY_ENUMS = Object.freeze({
  retentionDays: Object.freeze([7, 30, 90])
});

export const ALLOWED_PRIVACY_FIELDS = Object.freeze([
  'retentionDays'
]);

/**
 * Chuẩn hóa đối tượng privacy từ database hoặc input thô thành đúng cấu trúc hợp lệ.
 * Đảm bảo:
 * 1. Chỉ xuất đúng các trường được phép (hiện tại là retentionDays).
 * 2. Dữ liệu cũ bị null, undefined, sai kiểu (chuỗi, boolean, float) hoặc enum lạ
 *    được thay bằng giá trị default an toàn (30 ngày).
 * 3. Không ép chuỗi "7" hay "30" thành số.
 *
 * @param {object|null|undefined} raw Đối tượng thô từ MongoDB
 * @returns {{ retentionDays: number }} Đối tượng privacy chuẩn hóa
 */
export function normalizePrivacy(raw) {
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};

  // retentionDays: phải là number nguyên thuộc [7, 30, 90]
  const retentionDays = (
    typeof source.retentionDays === 'number' &&
    Number.isInteger(source.retentionDays) &&
    PRIVACY_ENUMS.retentionDays.includes(source.retentionDays)
  )
    ? source.retentionDays
    : PRIVACY_DEFAULTS.retentionDays;

  return {
    retentionDays
  };
}
