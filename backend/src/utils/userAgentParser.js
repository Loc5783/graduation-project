/**
 * Trích xuất nhãn thiết bị và trình duyệt từ User-Agent
 * 
 * Quy tắc:
 * - Không tin cậy mù quáng client, chỉ dùng để mô tả giao diện (UI display).
 * - Nếu không nhận diện được hoặc thiếu thông tin: trả về null trung thực (để frontend hiển thị "Không xác định").
 * - Không tự ý sinh tên máy hay vị trí địa lý.
 * 
 * @param {string|undefined} userAgent Chuỗi User-Agent từ req.headers['user-agent']
 * @returns {{ deviceLabel: string|null, browserLabel: string|null }}
 */
export function parseUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string' || userAgent.trim().length === 0) {
    return { deviceLabel: null, browserLabel: null };
  }

  const ua = userAgent.trim();

  // 1. Nhận diện thiết bị / Hệ điều hành (Device / OS Label)
  let deviceLabel = null;
  if (/windows nt/i.test(ua)) {
    deviceLabel = 'Windows';
  } else if (/iphone/i.test(ua)) {
    deviceLabel = 'iPhone';
  } else if (/ipad/i.test(ua)) {
    deviceLabel = 'iPad';
  } else if (/macintosh|mac os x/i.test(ua)) {
    deviceLabel = 'macOS';
  } else if (/android/i.test(ua)) {
    deviceLabel = 'Android';
  } else if (/cros/i.test(ua)) {
    deviceLabel = 'ChromeOS';
  } else if (/linux/i.test(ua)) {
    deviceLabel = 'Linux';
  }

  // 2. Nhận diện Trình duyệt (Browser Label)
  let browserLabel = null;
  if (/edg(?:e|ios|a)?\/[0-9]+/i.test(ua)) {
    browserLabel = 'Edge';
  } else if (/opr\/|opera/i.test(ua)) {
    browserLabel = 'Opera';
  } else if (/chrome|crios/i.test(ua) && !/edg/i.test(ua) && !/opr/i.test(ua)) {
    browserLabel = 'Chrome';
  } else if (/firefox|fxios/i.test(ua)) {
    browserLabel = 'Firefox';
  } else if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) {
    browserLabel = 'Safari';
  }

  return {
    deviceLabel,
    browserLabel
  };
}

export default parseUserAgent;
