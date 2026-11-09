/**
 * Trình xác thực dữ liệu cho API Tài khoản (Account Profile)
 * 
 * Quy tắc:
 * 1. Body phải là object hợp lệ, không null, không array, không primitive.
 * 2. Body rỗng trả về mã lỗi EMPTY_UPDATE_BODY.
 * 3. Allowlist nghiêm ngặt: chỉ chấp nhận trường duy nhất là "name".
 * 4. Chặn các trường lạ, trường đặc quyền (email, role, owned, passwordHash, settings, userId, _id...),
 *    hoặc key chứa ký tự "." hoặc "$": trả về UNKNOWN_FIELD_REJECTED.
 * 5. Trường name phải là chuỗi ký tự (string thật, không ép kiểu từ số/boolean).
 * 6. Độ dài họ và tên sau khi trim: tối thiểu 2 ký tự, tối đa 100 ký tự.
 */

export function validateProfileUpdate(body) {
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

  // 3. Kiểm tra các key trong body (Chỉ chấp nhận duy nhất "name")
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

    if (key !== 'name') {
      return {
        isValid: false,
        status: 400,
        code: 'UNKNOWN_FIELD_REJECTED',
        message: `Trường "${key}" không được phép cập nhật hoặc không được hỗ trợ.`,
        errors: {
          [key]: 'Trường này không được phép cập nhật.'
        }
      };
    }
  }

  // 4. Kiểm tra trường name
  if (!('name' in body)) {
    return {
      isValid: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Họ và tên là bắt buộc.',
      errors: {
        name: 'Họ và tên là bắt buộc.'
      }
    };
  }

  if (typeof body.name !== 'string') {
    return {
      isValid: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Họ và tên phải là chuỗi ký tự.',
      errors: {
        name: 'Họ và tên phải là chuỗi ký tự.'
      }
    };
  }

  const trimmedName = body.name.trim();

  if (trimmedName.length < 2) {
    return {
      isValid: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Họ và tên phải có tối thiểu 2 ký tự.',
      errors: {
        name: 'Họ và tên phải có tối thiểu 2 ký tự.'
      }
    };
  }

  if (trimmedName.length > 100) {
    return {
      isValid: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Họ và tên không được vượt quá 100 ký tự.',
      errors: {
        name: 'Họ và tên không được vượt quá 100 ký tự.'
      }
    };
  }

  return {
    isValid: true,
    trimmedName
  };
}

/**
 * Trình xác thực dữ liệu cho API Đổi mật khẩu (POST /api/account/change-password)
 *
 * Quy tắc:
 * 1. Body phải là object hợp lệ, không null, không array, không primitive.
 * 2. Allowlist nghiêm ngặt: chỉ chấp nhận "currentPassword" và "newPassword".
 * 3. Chặn các trường lạ, trường đặc quyền, key chứa "." hoặc "$": trả về UNKNOWN_FIELD_REJECTED.
 * 4. Hai mật khẩu phải là string thật, không ép kiểu, không trim hoặc chuẩn hóa (bảo toàn khoảng trắng).
 * 5. Mật khẩu mới: tối thiểu 8 ký tự, tối đa 72 byte UTF-8 (đồng nhất với đăng ký).
 * 6. Mật khẩu mới không được trùng với mật khẩu hiện tại.
 * 7. Không để lộ giá trị mật khẩu trong thông báo lỗi.
 */
export function validateChangePassword(body) {
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
      code: 'VALIDATION_ERROR',
      message: 'Dữ liệu đổi mật khẩu không được để trống.'
    };
  }

  // 3. Kiểm tra các key trong body: Chỉ chấp nhận "currentPassword" và "newPassword"
  const ALLOWED_KEYS = new Set(['currentPassword', 'newPassword']);
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

    if (!ALLOWED_KEYS.has(key)) {
      return {
        isValid: false,
        status: 400,
        code: 'UNKNOWN_FIELD_REJECTED',
        message: `Trường "${key}" không được hỗ trợ hoặc không được phép gửi kèm.`,
        errors: {
          [key]: 'Trường này không được phép gửi kèm.'
        }
      };
    }
  }

  const errors = {};

  // 4. Kiểm tra currentPassword (KHÔNG TRIM mật khẩu, kiểm tra tối đa 72 byte UTF-8)
  if (!('currentPassword' in body)) {
    errors.currentPassword = 'Mật khẩu hiện tại là bắt buộc.';
  } else if (typeof body.currentPassword !== 'string') {
    errors.currentPassword = 'Mật khẩu hiện tại phải là chuỗi ký tự.';
  } else if (body.currentPassword.length === 0) {
    errors.currentPassword = 'Mật khẩu hiện tại không được để trống.';
  } else {
    const currentByteLength = Buffer.byteLength(body.currentPassword, 'utf8');
    if (currentByteLength > 72) {
      errors.currentPassword = 'Mật khẩu hiện tại không được vượt quá 72 byte UTF-8.';
    }
  }

  // 5. Kiểm tra newPassword
  if (!('newPassword' in body)) {
    errors.newPassword = 'Mật khẩu mới là bắt buộc.';
  } else if (typeof body.newPassword !== 'string') {
    errors.newPassword = 'Mật khẩu mới phải là chuỗi ký tự.';
  } else {
    // Bảo toàn nguyên vẹn mật khẩu, KHÔNG TRIM
    const newPassword = body.newPassword;
    const byteLength = Buffer.byteLength(newPassword, 'utf8');

    if (newPassword.length < 8) {
      errors.newPassword = 'Mật khẩu mới phải có tối thiểu 8 ký tự.';
    } else if (byteLength > 72) {
      errors.newPassword = 'Mật khẩu mới không được vượt quá 72 byte UTF-8.';
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      isValid: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Thông tin đổi mật khẩu không hợp lệ.',
      errors
    };
  }

  // 6. Kiểm tra mật khẩu mới không được trùng mật khẩu hiện tại
  if (body.currentPassword === body.newPassword) {
    return {
      isValid: false,
      status: 400,
      code: 'PASSWORD_SAME_AS_CURRENT',
      message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.',
      errors: {
        newPassword: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.'
      }
    };
  }

  return {
    isValid: true,
    currentPassword: body.currentPassword,
    newPassword: body.newPassword
  };
}

/**
 * Trình xác thực mã phiên làm việc công khai (sessionId) từ đường dẫn /api/account/sessions/:sessionId
 * 
 * Quy tắc:
 * - Phải là chuỗi ký tự không rỗng.
 * - Độ dài tối đa 128 ký tự.
 * - Chỉ chấp nhận các ký tự an toàn (chữ cái, chữ số, dấu gạch ngang, gạch dưới).
 * - Không cho phép chứa ký tự MongoDB injection ($) hoặc ký tự đặc biệt lạ.
 */
export function validateSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return {
      isValid: false,
      status: 400,
      code: 'INVALID_SESSION_ID',
      message: 'Mã phiên làm việc không được để trống.'
    };
  }

  const trimmed = sessionId.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      status: 400,
      code: 'INVALID_SESSION_ID',
      message: 'Mã phiên làm việc không được để trống.'
    };
  }

  if (trimmed.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return {
      isValid: false,
      status: 400,
      code: 'INVALID_SESSION_ID',
      message: 'Mã phiên làm việc không đúng định dạng.'
    };
  }

  return {
    isValid: true,
    sessionId: trimmed
  };
}

/**
 * Trình xác thực cho yêu cầu đăng xuất mọi nơi (POST /api/account/logout-all)
 * 
 * Quy tắc:
 * - Cho phép body rỗng ({}) hoặc không truyền.
 * - Nếu truyền body: phải là object hợp lệ, không phải mảng hay kiểu nguyên thủy.
 * - Không cho phép truyền trường lạ hoặc key chứa "." / "$".
 */
export function validateLogoutAll(body) {
  if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
    return { isValid: true };
  }

  if (typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dữ liệu yêu cầu phải là một đối tượng JSON.'
    };
  }

  const keys = Object.keys(body);
  for (const key of keys) {
    if (key.includes('.') || key.includes('$')) {
      return {
        isValid: false,
        status: 400,
        code: 'UNKNOWN_FIELD_REJECTED',
        message: `Tên trường "${key}" chứa ký tự không hợp lệ.`
      };
    }

    return {
      isValid: false,
      status: 400,
      code: 'UNKNOWN_FIELD_REJECTED',
      message: `Trường "${key}" không được hỗ trợ trong yêu cầu đăng xuất tất cả phiên.`
    };
  }

  return { isValid: true };
}
