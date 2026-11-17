import { getServerUrl, getSessionCookie, setSessionCookie } from '../utils/storage';

export let onUnauthorizedCallback = null;

export function setOnUnauthorized(cb) {
  onUnauthorizedCallback = cb;
}

/**
 * Rút trích cookie `shp_sid` từ Set-Cookie header
 */
function extractSessionCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  // Set-Cookie có thể là mảng hoặc chuỗi
  const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader.join(';') : setCookieHeader;
  const match = cookieStr.match(/shp_sid=([^;]+)/);
  if (match) {
    return `shp_sid=${match[1]}`;
  }
  return null;
}

/**
 * Trình gửi HTTP request tự động quản lý phiên Cookie và Base URL
 */
export async function apiRequest(endpoint, options = {}) {
  const baseUrl = await getServerUrl();
  const fullUrl = `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const storedCookie = await getSessionCookie();

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Origin': baseUrl,
    'Referer': `${baseUrl}/`,
    ...(options.headers || {})
  };

  if (storedCookie) {
    headers['Cookie'] = storedCookie;
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 10000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(fullUrl, {
      ...options,
      credentials: 'include',
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Bắt và lưu cookie phiên mới nếu server gửi Set-Cookie
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const extracted = extractSessionCookie(setCookie);
      if (extracted) {
        await setSessionCookie(extracted);
      }
    }

    if (res.status === 401 && !endpoint.includes('/api/auth/login') && !endpoint.includes('/api/auth/register') && !endpoint.includes('/api/health')) {
      // Hết phiên làm việc
      await setSessionCookie(null);
      if (typeof onUnauthorizedCallback === 'function') {
        onUnauthorizedCallback();
      }
    }

    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }

    return {
      status: res.status,
      ok: res.ok,
      success: res.ok && data?.success !== false,
      code: data?.code || (res.ok ? 'SUCCESS' : `HTTP_${res.status}`),
      message: data?.message || (res.ok ? 'Thành công' : `Lỗi ${res.status}`),
      data: data?.data ?? data
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        status: 0,
        ok: false,
        success: false,
        code: 'TIMEOUT',
        message: 'Hết thời gian chờ kết nối máy chủ.'
      };
    }
    return {
      status: 0,
      ok: false,
      success: false,
      code: 'NETWORK_ERROR',
      message: `Không thể kết nối máy chủ tại ${baseUrl}. Vui lòng kiểm tra IP và Wi-Fi.`
    };
  }
}
