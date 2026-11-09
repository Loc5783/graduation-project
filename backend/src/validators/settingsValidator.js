import {
  ALLOWED_APPEARANCE_FIELDS,
  APPEARANCE_ENUMS,
  isValidTimeZone
} from '../constants/settingsDefaults.js';

/**
 * Kiểm tra và xác thực dữ liệu đầu vào cho yêu cầu cập nhật cài đặt giao diện (PATCH /api/settings/appearance).
 * 
 * Quy tắc:
 * 1. Body phải là object, không null, không array.
 * 2. Body rỗng trả về mã lỗi EMPTY_UPDATE_BODY.
 * 3. Whitelist nghiêm ngặt: chỉ chấp nhận 8 trường đã định nghĩa.
 * 4. Bất kỳ trường lạ, trường đặc quyền (role, owned, userId, ...), hoặc key chứa '.' / '$':
 *    Trả về mã lỗi UNKNOWN_FIELD_REJECTED và từ chối toàn bộ request.
 * 5. Kiểm tra kiểu dữ liệu nguyên bản (strict types): không ép kiểu chuỗi thành boolean hay số thành chuỗi.
 * 6. Kiểm tra giá trị enum và múi giờ IANA.
 * 
 * @param {any} body Dữ liệu payload từ req.body
 * @returns {{ isValid: boolean, status?: number, code?: string, message?: string, errors?: object, data?: object }}
 */
export function validateAppearanceUpdate(body) {
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
    // Chặn key chứa dấu chấm (.) hoặc ký tự MongoDB ($)
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

    // Chặn trường lạ hoặc trường đặc quyền không nằm trong allowlist 8 trường
    if (!ALLOWED_APPEARANCE_FIELDS.includes(key)) {
      return {
        isValid: false,
        status: 400,
        code: 'UNKNOWN_FIELD_REJECTED',
        message: `Yêu cầu chứa trường không được phép: ${key}`,
        errors: {
          [key]: 'Trường không được phép trong cài đặt giao diện.'
        }
      };
    }
  }

  // 4. Kiểm tra kiểu dữ liệu và giá trị cho từng trường được gửi lên
  const validatedData = {};

  // theme: string, enum ['dark', 'light', 'system']
  if ('theme' in body) {
    const val = body.theme;
    if (typeof val !== 'string') {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_FIELD_TYPE',
        message: 'Trường theme phải có kiểu chuỗi.',
        errors: { theme: 'Giá trị phải là chuỗi ký tự.' }
      };
    }
    if (!APPEARANCE_ENUMS.theme.includes(val)) {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_ENUM_VALUE',
        message: 'Giá trị của theme không hợp lệ.',
        errors: { theme: `Giá trị phải thuộc: ${APPEARANCE_ENUMS.theme.join(', ')}.` }
      };
    }
    validatedData.theme = val;
  }

  // language: string, enum ['vi', 'en']
  if ('language' in body) {
    const val = body.language;
    if (typeof val !== 'string') {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_FIELD_TYPE',
        message: 'Trường language phải có kiểu chuỗi.',
        errors: { language: 'Giá trị phải là chuỗi ký tự.' }
      };
    }
    if (!APPEARANCE_ENUMS.language.includes(val)) {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_ENUM_VALUE',
        message: 'Giá trị của language không hợp lệ.',
        errors: { language: `Giá trị phải thuộc: ${APPEARANCE_ENUMS.language.join(', ')}.` }
      };
    }
    validatedData.language = val;
  }

  // fontSize: string, enum ['small', 'medium', 'large']
  if ('fontSize' in body) {
    const val = body.fontSize;
    if (typeof val !== 'string') {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_FIELD_TYPE',
        message: 'Trường fontSize phải có kiểu chuỗi.',
        errors: { fontSize: 'Giá trị phải là chuỗi ký tự.' }
      };
    }
    if (!APPEARANCE_ENUMS.fontSize.includes(val)) {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_ENUM_VALUE',
        message: 'Giá trị của fontSize không hợp lệ.',
        errors: { fontSize: `Giá trị phải thuộc: ${APPEARANCE_ENUMS.fontSize.join(', ')}.` }
      };
    }
    validatedData.fontSize = val;
  }

  // highContrast: strict boolean
  if ('highContrast' in body) {
    const val = body.highContrast;
    if (typeof val !== 'boolean') {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_FIELD_TYPE',
        message: 'Trường highContrast phải có kiểu boolean.',
        errors: { highContrast: 'Giá trị phải là boolean thật (true hoặc false).' }
      };
    }
    validatedData.highContrast = val;
  }

  // reducedMotion: strict boolean
  if ('reducedMotion' in body) {
    const val = body.reducedMotion;
    if (typeof val !== 'boolean') {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_FIELD_TYPE',
        message: 'Trường reducedMotion phải có kiểu boolean.',
        errors: { reducedMotion: 'Giá trị phải là boolean thật (true hoặc false).' }
      };
    }
    validatedData.reducedMotion = val;
  }

  // timeZone: string, IANA supported <= 50 chars
  if ('timeZone' in body) {
    const val = body.timeZone;
    if (typeof val !== 'string') {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_FIELD_TYPE',
        message: 'Trường timeZone phải có kiểu chuỗi.',
        errors: { timeZone: 'Giá trị phải là chuỗi ký tự.' }
      };
    }
    if (val.length > 50 || !isValidTimeZone(val)) {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_TIMEZONE',
        message: 'Múi giờ không hợp lệ hoặc không được hệ thống hỗ trợ.',
        errors: { timeZone: 'Múi giờ phải là định danh IANA hợp lệ và tối đa 50 ký tự.' }
      };
    }
    validatedData.timeZone = val.trim();
  }

  // dateFormat: string, enum ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']
  if ('dateFormat' in body) {
    const val = body.dateFormat;
    if (typeof val !== 'string') {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_FIELD_TYPE',
        message: 'Trường dateFormat phải có kiểu chuỗi.',
        errors: { dateFormat: 'Giá trị phải là chuỗi ký tự.' }
      };
    }
    if (!APPEARANCE_ENUMS.dateFormat.includes(val)) {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_ENUM_VALUE',
        message: 'Giá trị của dateFormat không hợp lệ.',
        errors: { dateFormat: `Giá trị phải thuộc: ${APPEARANCE_ENUMS.dateFormat.join(', ')}.` }
      };
    }
    validatedData.dateFormat = val;
  }

  // hourFormat: string, enum ['12h', '24h']
  if ('hourFormat' in body) {
    const val = body.hourFormat;
    if (typeof val !== 'string') {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_FIELD_TYPE',
        message: 'Trường hourFormat phải có kiểu chuỗi.',
        errors: { hourFormat: 'Giá trị phải là chuỗi ký tự.' }
      };
    }
    if (!APPEARANCE_ENUMS.hourFormat.includes(val)) {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_ENUM_VALUE',
        message: 'Giá trị của hourFormat không hợp lệ.',
        errors: { hourFormat: `Giá trị phải thuộc: ${APPEARANCE_ENUMS.hourFormat.join(', ')}.` }
      };
    }
    validatedData.hourFormat = val;
  }

  return {
    isValid: true,
    data: validatedData
  };
}
