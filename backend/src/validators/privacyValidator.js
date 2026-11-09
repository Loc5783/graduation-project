import {
  ALLOWED_PRIVACY_FIELDS,
  PRIVACY_ENUMS
} from '../constants/privacyDefaults.js';

/**
 * Kiểm tra và xác thực dữ liệu đầu vào cho yêu cầu cập nhật cài đặt quyền riêng tư (PATCH /api/settings/privacy).
 *
 * Quy tắc:
 * 1. Body phải là object JSON, không null, không array.
 * 2. Body rỗng trả về mã lỗi EMPTY_UPDATE_BODY.
 * 3. Whitelist nghiêm ngặt: chỉ chấp nhận trường retentionDays.
 * 4. Bất kỳ trường lạ, trường đặc quyền, hoặc key chứa '.' / '$':
 *    Trả về mã lỗi UNKNOWN_FIELD_REJECTED và từ chối toàn bộ request.
 * 5. Kiểm tra kiểu dữ liệu số nguyên nghiêm ngặt (strict number): không ép kiểu chuỗi thành số.
 * 6. Giá trị retentionDays bắt buộc thuộc [7, 30, 90].
 *
 * @param {any} body Dữ liệu payload từ req.body
 * @returns {{ isValid: boolean, status?: number, code?: string, message?: string, errors?: object, data?: { retentionDays: number } }}
 */
export function validatePrivacyUpdate(body) {
  // 1. Kiểm tra cấu trúc body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dữ liệu yêu cầu phải là một đối tượng JSON.'
    };
  }

  const keys = Object.keys(body);

  // 2. Kiểm tra body rỗng
  if (keys.length === 0) {
    return {
      isValid: false,
      status: 400,
      code: 'EMPTY_UPDATE_BODY',
      message: 'Dữ liệu cập nhật không được để trống.'
    };
  }

  // 3. Kiểm tra whitelist trường và chặn các ký tự độc hại / trường lạ
  for (const key of keys) {
    if (key.includes('.') || key.includes('$')) {
      return {
        isValid: false,
        status: 400,
        code: 'UNKNOWN_FIELD_REJECTED',
        message: `Tên trường "${key}" chứa ký tự không hợp lệ.`,
        errors: {
          [key]: 'Tên trường không được chứa ký tự "." hoặc "$".'
        }
      };
    }

    if (!ALLOWED_PRIVACY_FIELDS.includes(key)) {
      return {
        isValid: false,
        status: 400,
        code: 'UNKNOWN_FIELD_REJECTED',
        message: `Trường "${key}" không được phép cập nhật trong cài đặt quyền riêng tư.`,
        errors: {
          [key]: 'Trường không nằm trong danh sách cho phép.'
        }
      };
    }
  }

  // 4. Kiểm tra trường retentionDays
  const { retentionDays } = body;
  if (retentionDays === undefined) {
    return {
      isValid: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Trường retentionDays là bắt buộc.',
      errors: {
        retentionDays: 'Trường retentionDays là bắt buộc.'
      }
    };
  }

  // Bắt buộc là number nguyên, không chấp nhận chuỗi ép kiểu, boolean, float
  if (typeof retentionDays !== 'number' || !Number.isInteger(retentionDays)) {
    return {
      isValid: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Trường retentionDays phải là số nguyên (7, 30 hoặc 90).',
      errors: {
        retentionDays: 'Giá trị phải là một số nguyên, không được là chuỗi hay kiểu dữ liệu khác.'
      }
    };
  }

  if (!PRIVACY_ENUMS.retentionDays.includes(retentionDays)) {
    return {
      isValid: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Thời gian lưu giữ phải là 7, 30 hoặc 90 ngày.',
      errors: {
        retentionDays: 'Giá trị hợp lệ bao gồm: 7, 30 hoặc 90.'
      }
    };
  }

  return {
    isValid: true,
    data: {
      retentionDays
    }
  };
}
