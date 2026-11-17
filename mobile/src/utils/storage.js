import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  SERVER_URL: 'shp_server_url',
  SESSION_COOKIE: 'shp_session_cookie',
  USER_INFO: 'shp_user_info',
  ALERT_SETTINGS: 'shp_alert_settings'
};

// Mặc định địa chỉ máy chủ backend:
// - Máy thật cùng mạng Wi-Fi hoặc qua LAN: http://192.168.1.178:5000
// - Cáp USB chuyển tiếp: http://localhost:5000
// - Máy ảo Android Emulator: http://10.0.2.2:5000
export const DEFAULT_SERVER_URL = 'http://192.168.1.178:5000';

export async function getServerUrl() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_URL);
    // Older builds saved the USB-only loopback address. On a physical phone,
    // localhost points to the phone itself, so migrate it to the LAN default.
    if (saved && /^https?:\/\/(localhost|127\.0\.0\.1):5000\/?$/i.test(saved)) {
      await AsyncStorage.setItem(STORAGE_KEYS.SERVER_URL, DEFAULT_SERVER_URL);
      return DEFAULT_SERVER_URL;
    }
    return saved || DEFAULT_SERVER_URL;
  } catch {
    return DEFAULT_SERVER_URL;
  }
}

export async function setServerUrl(url) {
  try {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    await AsyncStorage.setItem(STORAGE_KEYS.SERVER_URL, cleanUrl);
    return cleanUrl;
  } catch (err) {
    console.error('Lỗi lưu server URL:', err);
    return null;
  }
}

export async function getSessionCookie() {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.SESSION_COOKIE);
  } catch {
    return null;
  }
}

export async function setSessionCookie(cookie) {
  try {
    if (cookie) {
      await AsyncStorage.setItem(STORAGE_KEYS.SESSION_COOKIE, cookie);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.SESSION_COOKIE);
    }
  } catch (err) {
    console.error('Lỗi lưu session cookie:', err);
  }
}

export async function getUserInfo() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER_INFO);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setUserInfo(user) {
  try {
    if (user) {
      await AsyncStorage.setItem(STORAGE_KEYS.USER_INFO, JSON.stringify(user));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.USER_INFO);
    }
  } catch (err) {
    console.error('Lỗi lưu thông tin user:', err);
  }
}
