/**
 * Lớp dịch vụ xác thực (Auth Service) kết nối trực tiếp với backend qua /api/auth/*
 * Tách biệt hoàn toàn giao tiếp mạng và giao thức HTTP khỏi các component UI.
 */

export const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Kiểm tra xem đối tượng user từ backend có đầy đủ các trường bắt buộc và đúng kiểu hay không.
 * Các trường bắt buộc theo hợp đồng API:
 * - id: chuỗi (hoặc số) không rỗng
 * - name: chuỗi không rỗng
 * - email: chuỗi không rỗng
 * - role: chuỗi không rỗng
 * - owned: mảng danh sách thiết bị sở hữu
 *
 * @param {any} user
 * @returns {boolean}
 */
export function isValidUserData(user) {
  if (!user || typeof user !== 'object' || Array.isArray(user)) {
    return false;
  }
  const { id, name, email, role, owned } = user;
  const hasValidId = (typeof id === 'string' && id.trim().length > 0) || (typeof id === 'number' && !Number.isNaN(id));
  const hasValidName = typeof name === 'string' && name.trim().length > 0;
  const hasValidEmail = typeof email === 'string' && email.trim().length > 0;
  const hasValidRole = typeof role === 'string' && role.trim().length > 0;
  const hasValidOwned = Array.isArray(owned);

  return Boolean(hasValidId && hasValidName && hasValidEmail && hasValidRole && hasValidOwned);
}

/**
 * Thực hiện yêu cầu HTTP an toàn tới backend với cookie HttpOnly tự động.
 * Giữ timeout cho đến khi hoàn tất đọc và phân tích toàn bộ response body.
 *
 * @param {string} endpoint Đường dẫn API tương đối (ví dụ /api/auth/login)
 * @param {object} options Tùy chọn fetch
 * @returns {Promise<{ success: boolean, status: number, code: string, message: string, data: any, errors?: object, isNetworkError?: boolean }>}
 */
export async function apiRequest(endpoint, options = {}) {
  const controller = new AbortController();
  let isTimedOut = false;

  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    isTimedOut = true;
    controller.abort();
  }, timeoutMs);

  const handleCallerAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', handleCallerAbort, { once: true });
    }
  }

  const fetchOptions = {
    ...options,
    signal: controller.signal,
    credentials: 'include', // Luôn gửi và nhận cookie HttpOnly shp_sid
    headers: {
      Accept: 'application/json',
      ...options.headers
    }
  };

  try {
    const res = await fetch(endpoint, fetchOptions);

    let body = null;
    try {
      body = await res.json();
    } catch (parseErr) {
      // Phân biệt timeout khi đang đọc response body với lỗi cú pháp JSON thuần túy
      const wasAborted = isTimedOut || controller.signal.aborted || parseErr.name === 'AbortError';
      if (wasAborted) {
        const timeoutErr = new Error('Hết thời gian chờ kết nối máy chủ.');
        timeoutErr.name = 'AbortError';
        throw timeoutErr;
      }

      return {
        success: false,
        status: res.status,
        code: res.status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'INVALID_RESPONSE',
        message: res.status >= 500
          ? 'Máy chủ gặp sự cố nội bộ. Vui lòng thử lại sau.'
          : `Phản hồi không đúng định dạng JSON từ máy chủ (HTTP ${res.status}).`,
        data: null,
        errors: null
      };
    }

    // Kiểm tra cấu trúc phản hồi cơ bản: bắt buộc phải là một đối tượng JSON
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return {
        success: false,
        status: res.status,
        code: 'INVALID_RESPONSE',
        message: 'Phản hồi từ máy chủ không đúng định dạng dữ liệu (phải là đối tượng JSON).',
        data: null,
        errors: null
      };
    }

    const isSuccess = res.ok && Boolean(body.success);
    return {
      success: isSuccess,
      status: res.status,
      code: body.code || (isSuccess ? 'OK' : 'ERROR'),
      message: body.message || (isSuccess ? 'Thành công' : 'Đã xảy ra lỗi.'),
      data: body.data !== undefined ? body.data : null,
      errors: body.errors || null
    };
  } catch (err) {
    const isTimeout = isTimedOut || controller.signal.aborted || err.name === 'AbortError';
    return {
      success: false,
      status: 0,
      isNetworkError: true,
      code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isTimeout
        ? 'Hết thời gian chờ kết nối máy chủ. Vui lòng kiểm tra lại dịch vụ backend.'
        : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra dịch vụ backend hoặc kết nối mạng.',
      data: null,
      errors: null
    };
  } finally {
    clearTimeout(timeoutId);
    if (options.signal) {
      options.signal.removeEventListener('abort', handleCallerAbort);
    }
  }
}

/**
 * Gửi yêu cầu đăng ký tài khoản mới (POST /api/auth/register)
 *
 * @param {object} params
 * @param {string} params.fullName Họ và tên
 * @param {string} params.email Địa chỉ email
 * @param {string} params.password Mật khẩu (không trim)
 * @param {object} [options] Tùy chọn mở rộng cho request
 */
export async function registerService({ fullName, email, password } = {}, options = {}) {
  const res = await apiRequest('/api/auth/register', {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: JSON.stringify({
      fullName,
      email,
      password
    })
  });

  if (!res.success) {
    return res;
  }

  // HTTP 201 thành công bắt buộc phải có data.user hợp lệ
  if (!res.data || typeof res.data !== 'object' || !isValidUserData(res.data.user)) {
    return {
      success: false,
      status: res.status,
      code: 'INVALID_RESPONSE',
      message: 'Phản hồi đăng ký từ máy chủ không đúng định dạng dữ liệu người dùng.',
      data: null,
      errors: null
    };
  }

  return res;
}

/**
 * Gửi yêu cầu đăng nhập tài khoản (POST /api/auth/login)
 *
 * @param {object} params
 * @param {string} params.email Địa chỉ email
 * @param {string} params.password Mật khẩu (không trim)
 * @param {boolean} [params.remember=false] Duy trì phiên 14 ngày (bắt buộc kiểu boolean)
 * @param {object} [options] Tùy chọn mở rộng cho request
 */
export async function loginService({ email, password, remember = false } = {}, options = {}) {
  const res = await apiRequest('/api/auth/login', {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: JSON.stringify({
      email,
      password,
      remember: Boolean(remember)
    })
  });

  if (!res.success) {
    return res;
  }

  // HTTP 200 thành công bắt buộc phải có data.user hợp lệ (không chỉ kiểm tra truthy)
  if (!res.data || typeof res.data !== 'object' || !isValidUserData(res.data.user)) {
    return {
      success: false,
      status: res.status,
      code: 'INVALID_RESPONSE',
      message: 'Phản hồi đăng nhập từ máy chủ không đúng định dạng dữ liệu người dùng.',
      data: null,
      errors: null
    };
  }

  return res;
}

/**
 * Kiểm tra và lấy thông tin phiên làm việc hiện tại (GET /api/auth/me)
 *
 * @param {object} [options] Tùy chọn mở rộng cho request
 */
export async function getMeService(options = {}) {
  const res = await apiRequest('/api/auth/me', {
    ...options,
    method: 'GET'
  });

  if (!res.success) {
    return res;
  }

  // HTTP 200 thành công bắt buộc phải có data.user hợp lệ
  if (!res.data || typeof res.data !== 'object' || !isValidUserData(res.data.user)) {
    return {
      success: false,
      status: res.status,
      code: 'INVALID_RESPONSE',
      message: 'Phản hồi phiên làm việc từ máy chủ không đúng định dạng dữ liệu người dùng.',
      data: null,
      errors: null
    };
  }

  return res;
}

/**
 * Gửi yêu cầu đăng xuất và hủy phiên làm việc (POST /api/auth/logout)
 * Bắt buộc gửi Content-Type: application/json và body rỗng {}
 * Không bắt buộc phải có data.user.
 *
 * @param {object} [options] Tùy chọn mở rộng cho request
 */
export async function logoutService(options = {}) {
  const res = await apiRequest('/api/auth/logout', {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: JSON.stringify({})
  });

  if (!res.success) {
    return res;
  }

  // Đăng xuất thành công chỉ cần success: true
  return res;
}

/**
 * Kiểm tra xem ứng dụng có đang ở chế độ xem trước nội bộ (Preview Mode) hay không.
 *
 * YÊU CẦU AN TOÀN:
 * 1. Đang chạy trong môi trường phát triển (Development / DEV).
 * 2. Cờ cấu hình VITE_PREVIEW_MODE='true'.
 * Bản build Production (PROD) tuyệt đối TẮT cơ chế xem trước.
 *
 * @param {object} [env=import.meta.env] Đối tượng môi trường để kiểm tra (hỗ trợ kiểm thử)
 * @returns {boolean}
 */
export function isPreviewMode(env = import.meta.env) {
  if (!env || typeof env !== 'object') return false;

  const isProd = Boolean(env.PROD) || env.MODE === 'production';
  if (isProd) {
    return false;
  }

  const isDev = Boolean(env.DEV) || env.MODE === 'development';
  const isFlagEnabled = env.VITE_PREVIEW_MODE === 'true';

  return isDev && isFlagEnabled;
}
