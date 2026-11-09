import {
  ALLOWED_NOTIFICATION_TOP_LEVEL_FIELDS,
  ALLOWED_NOTIFICATION_TYPES_FIELDS,
  ALLOWED_NOTIFICATION_QUIET_HOURS_FIELDS,
  ALLOWED_NOTIFICATION_CHANNELS_FIELDS,
  NOTIFICATION_ENUMS,
  isValidTimeFormat
} from '../constants/notificationDefaults.js';

/**
 * Kiểm tra và xác thực dữ liệu đầu vào cho yêu cầu cập nhật cài đặt thông báo (PATCH /api/settings/notifications).
 *
 * Quy tắc:
 * 1. Body phải là object, không null, không array.
 * 2. Body rỗng trả về mã lỗi EMPTY_UPDATE_BODY.
 * 3. Whitelist nghiêm ngặt ở mọi cấp (top-level và các nhánh con):
 *    - Top-level: types, minSeverity, quietHours, channels.
 *    - types: unusualAccess, deviceDisconnected, permissionChanges, monthlyReport.
 *    - quietHours: enabled, startTime, endTime, allowUrgentBypass.
 *    - channels: inAppWeb, email.
 * 4. Bất kỳ trường lạ, trường đặc quyền, hoặc key chứa '.' / '$':
 *    Trả về mã lỗi UNKNOWN_FIELD_REJECTED và từ chối toàn bộ request.
 * 5. Kiểm tra kiểu dữ liệu nguyên bản (strict types):
 *    - boolean phải là boolean thật, không ép "false", 0 hoặc null.
 *    - minSeverity là string thuộc enum ['urgent', 'warning', 'all'].
 *    - startTime, endTime phải là chuỗi đúng định dạng HH:mm (từ 00:00 đến 23:59).
 * 6. Khóa nghiệp vụ:
 *    - allowUrgentBypass không thể đặt thành false (trả về lỗi 400).
 *    - email: true chưa khả dụng -> trả về lỗi 400 CHANNEL_NOT_AVAILABLE.
 * 7. Validate toàn bộ trước khi ghi; một trường sai không cho phép lưu một phần.
 *
 * @param {any} body Dữ liệu payload từ req.body
 * @returns {{ isValid: boolean, status?: number, code?: string, message?: string, errors?: object, data?: object }}
 */
export function validateNotificationUpdate(body) {
  // 1. Kiểm tra cấu trúc body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dữ liệu yêu cầu phải là một đối tượng JSON.'
    };
  }

  const topKeys = Object.keys(body);

  // 2. Kiểm tra body rỗng
  if (topKeys.length === 0) {
    return {
      isValid: false,
      status: 400,
      code: 'EMPTY_UPDATE_BODY',
      message: 'Dữ liệu cập nhật không được để trống.'
    };
  }

  // 3. Kiểm tra whitelist trường cấp 1 và chặn ký tự '.' hoặc '$'
  for (const key of topKeys) {
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

    if (!ALLOWED_NOTIFICATION_TOP_LEVEL_FIELDS.includes(key)) {
      return {
        isValid: false,
        status: 400,
        code: 'UNKNOWN_FIELD_REJECTED',
        message: `Yêu cầu chứa trường không được phép: ${key}`,
        errors: {
          [key]: 'Trường không được phép trong cài đặt thông báo.'
        }
      };
    }
  }

  const validatedData = {};
  let validLeafCount = 0;

  // 4. Xác thực nhánh types
  if ('types' in body) {
    const typesVal = body.types;
    if (!typesVal || typeof typesVal !== 'object' || Array.isArray(typesVal)) {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_FIELD_TYPE',
        message: 'Trường types phải là một đối tượng JSON.',
        errors: { types: 'Giá trị phải là đối tượng JSON.' }
      };
    }

    const typesKeys = Object.keys(typesVal);
    for (const tKey of typesKeys) {
      if (tKey.includes('.') || tKey.includes('$') || !ALLOWED_NOTIFICATION_TYPES_FIELDS.includes(tKey)) {
        return {
          isValid: false,
          status: 400,
          code: 'UNKNOWN_FIELD_REJECTED',
          message: `Trường không được phép trong types: ${tKey}`,
          errors: { [`types.${tKey}`]: 'Trường không hợp lệ trong danh mục loại thông báo.' }
        };
      }

      if (typeof typesVal[tKey] !== 'boolean') {
        return {
          isValid: false,
          status: 400,
          code: 'INVALID_FIELD_TYPE',
          message: `Trường types.${tKey} phải có kiểu boolean.`,
          errors: { [`types.${tKey}`]: 'Giá trị phải là kiểu boolean (true hoặc false).' }
        };
      }
    }

    if (typesKeys.length > 0) {
      validatedData.types = {};
      for (const tKey of typesKeys) {
        validatedData.types[tKey] = typesVal[tKey];
        validLeafCount++;
      }
    }
  }

  // 5. Xác thực trường minSeverity
  if ('minSeverity' in body) {
    const minSev = body.minSeverity;
    if (typeof minSev !== 'string') {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_FIELD_TYPE',
        message: 'Trường minSeverity phải có kiểu chuỗi.',
        errors: { minSeverity: 'Giá trị phải là chuỗi ký tự.' }
      };
    }

    if (!NOTIFICATION_ENUMS.minSeverity.includes(minSev)) {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_ENUM_VALUE',
        message: 'Giá trị của minSeverity không hợp lệ.',
        errors: { minSeverity: `Giá trị phải thuộc: ${NOTIFICATION_ENUMS.minSeverity.join(', ')}.` }
      };
    }

    validatedData.minSeverity = minSev;
    validLeafCount++;
  }

  // 6. Xác thực nhánh quietHours
  if ('quietHours' in body) {
    const qhVal = body.quietHours;
    if (!qhVal || typeof qhVal !== 'object' || Array.isArray(qhVal)) {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_FIELD_TYPE',
        message: 'Trường quietHours phải là một đối tượng JSON.',
        errors: { quietHours: 'Giá trị phải là đối tượng JSON.' }
      };
    }

    const qhKeys = Object.keys(qhVal);
    for (const qKey of qhKeys) {
      if (qKey.includes('.') || qKey.includes('$') || !ALLOWED_NOTIFICATION_QUIET_HOURS_FIELDS.includes(qKey)) {
        return {
          isValid: false,
          status: 400,
          code: 'UNKNOWN_FIELD_REJECTED',
          message: `Trường không được phép trong quietHours: ${qKey}`,
          errors: { [`quietHours.${qKey}`]: 'Trường không hợp lệ trong cài đặt giờ không làm phiền.' }
        };
      }
    }

    let qhData = null;

    if ('enabled' in qhVal) {
      if (typeof qhVal.enabled !== 'boolean') {
        return {
          isValid: false,
          status: 400,
          code: 'INVALID_FIELD_TYPE',
          message: 'Trường quietHours.enabled phải có kiểu boolean.',
          errors: { 'quietHours.enabled': 'Giá trị phải là kiểu boolean (true hoặc false).' }
        };
      }
      qhData = qhData || {};
      qhData.enabled = qhVal.enabled;
      validLeafCount++;
    }

    if ('startTime' in qhVal) {
      if (typeof qhVal.startTime !== 'string' || !isValidTimeFormat(qhVal.startTime)) {
        return {
          isValid: false,
          status: 400,
          code: 'INVALID_FIELD_VALUE',
          message: 'Trường quietHours.startTime không hợp lệ (phải theo chuẩn HH:mm từ 00:00 đến 23:59).',
          errors: { 'quietHours.startTime': 'Định dạng giờ không hợp lệ (HH:mm).' }
        };
      }
      qhData = qhData || {};
      qhData.startTime = qhVal.startTime;
      validLeafCount++;
    }

    if ('endTime' in qhVal) {
      if (typeof qhVal.endTime !== 'string' || !isValidTimeFormat(qhVal.endTime)) {
        return {
          isValid: false,
          status: 400,
          code: 'INVALID_FIELD_VALUE',
          message: 'Trường quietHours.endTime không hợp lệ (phải theo chuẩn HH:mm từ 00:00 đến 23:59).',
          errors: { 'quietHours.endTime': 'Định dạng giờ không hợp lệ (HH:mm).' }
        };
      }
      qhData = qhData || {};
      qhData.endTime = qhVal.endTime;
      validLeafCount++;
    }

    if ('allowUrgentBypass' in qhVal) {
      if (typeof qhVal.allowUrgentBypass !== 'boolean') {
        return {
          isValid: false,
          status: 400,
          code: 'INVALID_FIELD_TYPE',
          message: 'Trường quietHours.allowUrgentBypass phải có kiểu boolean.',
          errors: { 'quietHours.allowUrgentBypass': 'Giá trị phải là kiểu boolean.' }
        };
      }
      // Khóa nghiệp vụ: Cảnh báo khẩn cấp luôn vượt qua giờ yên lặng, không cho đặt false
      if (qhVal.allowUrgentBypass !== true) {
        return {
          isValid: false,
          status: 400,
          code: 'INVALID_FIELD_VALUE',
          message: 'Cảnh báo khẩn cấp luôn được phép vượt qua giờ không làm phiền (allowUrgentBypass phải là true).',
          errors: { 'quietHours.allowUrgentBypass': 'Không thể đặt allowUrgentBypass thành false.' }
        };
      }
      qhData = qhData || {};
      qhData.allowUrgentBypass = true;
      validLeafCount++;
    }

    if (qhData) {
      validatedData.quietHours = qhData;
    }
  }

  // 7. Xác thực nhánh channels
  if ('channels' in body) {
    const chVal = body.channels;
    if (!chVal || typeof chVal !== 'object' || Array.isArray(chVal)) {
      return {
        isValid: false,
        status: 400,
        code: 'INVALID_FIELD_TYPE',
        message: 'Trường channels phải là một đối tượng JSON.',
        errors: { channels: 'Giá trị phải là đối tượng JSON.' }
      };
    }

    const chKeys = Object.keys(chVal);
    for (const cKey of chKeys) {
      if (cKey.includes('.') || cKey.includes('$') || !ALLOWED_NOTIFICATION_CHANNELS_FIELDS.includes(cKey)) {
        return {
          isValid: false,
          status: 400,
          code: 'UNKNOWN_FIELD_REJECTED',
          message: `Trường không được phép trong channels: ${cKey}`,
          errors: { [`channels.${cKey}`]: 'Trường không hợp lệ trong cài đặt kênh thông báo.' }
        };
      }
    }

    let chData = null;

    if ('inAppWeb' in chVal) {
      if (typeof chVal.inAppWeb !== 'boolean') {
        return {
          isValid: false,
          status: 400,
          code: 'INVALID_FIELD_TYPE',
          message: 'Trường channels.inAppWeb phải có kiểu boolean.',
          errors: { 'channels.inAppWeb': 'Giá trị phải là kiểu boolean (true hoặc false).' }
        };
      }
      chData = chData || {};
      chData.inAppWeb = chVal.inAppWeb;
      validLeafCount++;
    }

    if ('email' in chVal) {
      if (typeof chVal.email !== 'boolean') {
        return {
          isValid: false,
          status: 400,
          code: 'INVALID_FIELD_TYPE',
          message: 'Trường channels.email phải có kiểu boolean.',
          errors: { 'channels.email': 'Giá trị phải là kiểu boolean.' }
        };
      }

      // Khóa nghiệp vụ: Kênh email chưa khả dụng -> từ chối khi client cố tình bật true
      if (chVal.email === true) {
        return {
          isValid: false,
          status: 400,
          code: 'CHANNEL_NOT_AVAILABLE',
          message: 'Kênh thông báo email hiện chưa khả dụng do hệ thống chưa tích hợp máy chủ gửi thư.',
          errors: { 'channels.email': 'Kênh thông báo email hiện chưa khả dụng.' }
        };
      }

      chData = chData || {};
      chData.email = false;
      validLeafCount++;
    }

    if (chData) {
      validatedData.channels = chData;
    }
  }

  // 8. Đảm bảo có ít nhất một trường lá hợp lệ được gửi lên
  if (validLeafCount === 0) {
    return {
      isValid: false,
      status: 400,
      code: 'EMPTY_UPDATE_BODY',
      message: 'Dữ liệu cập nhật không chứa trường hợp lệ nào để lưu.'
    };
  }

  return {
    isValid: true,
    data: validatedData
  };
}
