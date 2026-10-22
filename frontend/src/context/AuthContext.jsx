import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ROLES, findDemoAccount } from '../shared/roles.js';
import {
  loginService,
  registerService,
  getMeService,
  logoutService,
  isValidUserData
} from '../services/authService.js';

export const AuthContext = createContext(null);

export const STORAGE_KEY_AUTH = 'shp_auth_session';

/**
 * Lấy đối tượng storage an toàn, bảo vệ cả bước gọi property getter của window.
 */
export function getStorage(type = 'local') {
  try {
    if (typeof window === 'undefined') return null;
    if (type === 'local') {
      return window.localStorage || null;
    }
    if (type === 'session') {
      return window.sessionStorage || null;
    }
  } catch (err) {
    console.warn(`Không thể truy cập window.${type === 'local' ? 'localStorage' : 'sessionStorage'}:`, err);
  }
  return null;
}

/**
 * Hàm đọc storage an toàn tuyệt đối
 */
export function safeGetItem(type, key) {
  try {
    const storage = getStorage(type);
    if (!storage) return null;
    return storage.getItem(key);
  } catch (err) {
    console.warn(`Lỗi khi đọc ${key} từ ${type}Storage:`, err);
    return null;
  }
}

/**
 * Hàm ghi storage an toàn tuyệt đối
 */
export function safeSetItem(type, key, value) {
  try {
    const storage = getStorage(type);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`Lỗi khi ghi ${key} vào ${type}Storage:`, err);
    return false;
  }
}

/**
 * Hàm xóa storage an toàn tuyệt đối
 */
export function safeRemoveItem(type, key) {
  try {
    const storage = getStorage(type);
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch (err) {
    console.warn(`Lỗi khi xóa ${key} khỏi ${type}Storage:`, err);
    return false;
  }
}

/**
 * Xóa sạch phiên đăng nhập ở cả localStorage và sessionStorage một cách ĐỘC LẬP.
 */
export function clearAllAuthStorages() {
  const localRemoved = safeRemoveItem('local', STORAGE_KEY_AUTH);
  const sessionRemoved = safeRemoveItem('session', STORAGE_KEY_AUTH);

  return {
    localRemoved,
    sessionRemoved,
    isFullyCleared: localRemoved && sessionRemoved
  };
}

/**
 * Tính toán độ mạnh mật khẩu theo 4 mức (1: Yếu, 2: Trung bình, 3: Khá, 4: Mạnh)
 */
export function calculatePasswordStrength(password = '') {
  if (!password || password.length === 0) return 0;
  if (password.length < 8) return 1;

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const diversity = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

  if (password.length >= 12 && diversity >= 4) return 4;
  if (password.length >= 10 && diversity >= 3) return 3;
  if (password.length >= 8 && diversity >= 2) return 2;
  return 1;
}

/**
 * Chuẩn hóa và xác thực dữ liệu session đọc từ storage (chỉ dùng cho chế độ demo cũ)
 */
export function normalizeAuthSession(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const rawUsername = parsed.username;
  if (!rawUsername || typeof rawUsername !== 'string') {
    return null;
  }

  const cleanUsername = rawUsername.trim().toLowerCase();
  if (!cleanUsername) {
    return null;
  }

  // 1. Kiểm tra nếu là một trong 7 tài khoản demo
  const demoAccount = findDemoAccount(cleanUsername);
  if (demoAccount) {
    return {
      username: demoAccount.username,
      name: demoAccount.name,
      role: demoAccount.role,
      owned: [...demoAccount.owned],
      remember: Boolean(parsed.remember),
      isDemoRegistered: false
    };
  }

  // 2. Nếu không phải tài khoản demo, phải là tài khoản đăng ký demo
  if (!parsed.isDemoRegistered) {
    return null;
  }

  const displayName = typeof parsed.name === 'string' && parsed.name.trim()
    ? parsed.name.trim()
    : cleanUsername;

  return {
    username: cleanUsername,
    name: displayName,
    role: ROLES.VIEWER,
    owned: [],
    remember: Boolean(parsed.remember),
    isDemoRegistered: true
  };
}

/**
 * Khôi phục session từ storage (chỉ dùng cho chế độ demo cũ)
 */
export function restoreAuthSession() {
  if (typeof window === 'undefined') return null;

  let raw = null;
  let isRemembered = false;

  const localRaw = safeGetItem('local', STORAGE_KEY_AUTH);
  if (localRaw) {
    raw = localRaw;
    isRemembered = true;
  } else {
    const sessionRaw = safeGetItem('session', STORAGE_KEY_AUTH);
    if (sessionRaw) {
      raw = sessionRaw;
      isRemembered = false;
    }
  }

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeAuthSession(parsed);
    if (normalized) {
      normalized.remember = isRemembered;
      return normalized;
    }
    console.warn('Session trong storage không hợp lệ hoặc không an toàn, tiến hành dọn dẹp.');
  } catch (err) {
    console.warn('Dữ liệu session trong storage bị hỏng JSON, tiến hành dọn dẹp:', err);
  }

  clearAllAuthStorages();
  return null;
}

export function AuthProvider({ children, enableDemoAuth = false }) {
  const [currentUser, setCurrentUser] = useState(() => {
    if (enableDemoAuth) {
      return restoreAuthSession();
    }
    return null;
  });

  // Trạng thái kiểm tra phiên với backend thật
  const [isCheckingSession, setIsCheckingSession] = useState(!enableDemoAuth);
  const [sessionError, setSessionError] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [storageNotice, setStorageNotice] = useState('');
  const [isStorageAvailable, setIsStorageAvailable] = useState(true);

  // Biến đếm thứ tự yêu cầu để chống phản hồi /me cũ ghi đè sau login/logout
  const activeSeqRef = useRef(0);

  /**
   * Kiểm tra phiên làm việc với backend (/api/auth/me)
   */
  const checkSession = useCallback(async () => {
    if (enableDemoAuth) {
      const demoUser = restoreAuthSession();
      setCurrentUser(demoUser);
      setIsCheckingSession(false);
      return demoUser;
    }

    const currentSeq = ++activeSeqRef.current;
    setIsCheckingSession(true);
    setSessionError(null);

    try {
      const res = await getMeService();

      // Nếu có thao tác mới (login/logout/check khác) xen vào, bỏ qua response cũ
      if (currentSeq !== activeSeqRef.current) return null;

      if (res.success && res.data?.user && isValidUserData(res.data.user)) {
        // Phiên đăng nhập hợp lệ
        setCurrentUser(res.data.user);
        setSessionError(null);
        return res.data.user;
      }

      if (res.status === 401) {
        // Chưa đăng nhập hoặc cookie hết hạn bình thường
        setCurrentUser(null);
        setSessionError(null);
        return null;
      }

      // Mất kết nối mạng, lỗi server 500 hoặc INVALID_RESPONSE: hiển thị thông báo lỗi, không tự suy ra hết hạn
      setCurrentUser(null);
      setSessionError(res.message || 'Không thể xác thực phiên làm việc với máy chủ.');
      return null;
    } catch {
      if (currentSeq !== activeSeqRef.current) return null;
      setCurrentUser(null);
      setSessionError('Không thể kết nối đến máy chủ để kiểm tra phiên làm việc.');
      return null;
    } finally {
      if (currentSeq === activeSeqRef.current) {
        setIsCheckingSession(false);
      }
    }
  }, [enableDemoAuth]);

  // Tự động kiểm tra phiên khi ứng dụng khởi động hoặc reload trang
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  /**
   * Thao tác đăng nhập
   */
  const login = useCallback(async ({ email, username, usernameOrEmail, password, remember = false } = {}) => {
    setAuthError(null);
    setStorageNotice('');

    // Nếu chạy chế độ demo cũ (stage 1 tests)
    if (enableDemoAuth) {
      const targetUsername = username || email || usernameOrEmail;
      if (!targetUsername || !targetUsername.trim()) {
        const err = 'Vui lòng nhập tên tài khoản hoặc email.';
        setAuthError(err);
        throw new Error(err);
      }

      if (!password || !password.trim()) {
        const err = 'Vui lòng nhập mật khẩu đăng nhập.';
        setAuthError(err);
        throw new Error(err);
      }

      const demoAccount = findDemoAccount(targetUsername);
      if (!demoAccount) {
        const err = `Tài khoản "${targetUsername}" không tồn tại trong danh sách 7 tài khoản demo. Hãy dùng các tài khoản: admin, thanh, loc, minh, nhatanh, quynh, guest.`;
        setAuthError(err);
        throw new Error(err);
      }

      const sessionUser = {
        username: demoAccount.username,
        name: demoAccount.name,
        role: demoAccount.role,
        owned: [...demoAccount.owned],
        remember: Boolean(remember),
        isDemoRegistered: false
      };

      clearAllAuthStorages();

      const targetType = remember ? 'local' : 'session';
      const saveSuccess = safeSetItem(targetType, STORAGE_KEY_AUTH, JSON.stringify(sessionUser));

      if (!saveSuccess) {
        setIsStorageAvailable(false);
        setStorageNotice('Không thể lưu phiên đăng nhập vào bộ nhớ trình duyệt do quyền truy cập bị chặn. Phiên đang được duy trì trong bộ nhớ tạm.');
      } else {
        setIsStorageAvailable(true);
        setStorageNotice('');
      }

      setCurrentUser(sessionUser);
      return sessionUser;
    }

    // Luồng chính: Gọi API thật POST /api/auth/login
    const targetEmail = (email || usernameOrEmail || '').trim();
    const res = await loginService({
      email: targetEmail,
      password,
      remember: Boolean(remember)
    });

    if (!res.success || !res.data?.user || !isValidUserData(res.data.user)) {
      const errMsg = res.message || 'Phản hồi đăng nhập từ máy chủ không hợp lệ.';
      setAuthError(errMsg);
      return {
        ...res,
        success: false,
        code: res.code || 'INVALID_RESPONSE',
        message: errMsg
      };
    }

    // Đăng nhập thành công: tăng sequence để ngăn response /me cũ ghi đè, và kết thúc trạng thái kiểm tra phiên
    activeSeqRef.current++;
    setCurrentUser(res.data.user);
    setIsCheckingSession(false);
    setSessionError(null);
    setAuthError(null);
    return res;
  }, [enableDemoAuth]);

  /**
   * Thao tác đăng ký tài khoản mới
   */
  const register = useCallback(async ({ fullName, email, password, confirmPassword, agreed = true }) => {
    setAuthError(null);
    setStorageNotice('');

    // Nếu chạy chế độ demo cũ
    if (enableDemoAuth) {
      if (!fullName || !fullName.trim()) {
        const err = 'Vui lòng nhập họ và tên.';
        setAuthError(err);
        throw new Error(err);
      }

      if (!email || !email.trim()) {
        const err = 'Vui lòng nhập địa chỉ email.';
        setAuthError(err);
        throw new Error(err);
      }

      const cleanEmail = email.trim().toLowerCase();
      if (findDemoAccount(cleanEmail)) {
        const err = 'Tên tài khoản này đã được sử dụng cho tài khoản demo hệ thống. Vui lòng chọn tên khác.';
        setAuthError(err);
        throw new Error(err);
      }

      if (!password || password.length < 8) {
        const err = 'Mật khẩu phải có độ dài tối thiểu 8 ký tự.';
        setAuthError(err);
        throw new Error(err);
      }

      if (password !== confirmPassword) {
        const err = 'Mật khẩu xác nhận không khớp.';
        setAuthError(err);
        throw new Error(err);
      }

      if (!agreed) {
        const err = 'Bạn cần đồng ý với điều khoản mô phỏng demo để tiếp tục.';
        setAuthError(err);
        throw new Error(err);
      }

      const sessionUser = {
        username: cleanEmail,
        name: fullName.trim(),
        role: ROLES.VIEWER,
        owned: [],
        remember: false,
        isDemoRegistered: true
      };

      clearAllAuthStorages();
      safeSetItem('session', STORAGE_KEY_AUTH, JSON.stringify(sessionUser));
      setCurrentUser(sessionUser);
      return sessionUser;
    }

    // Luồng chính: Gọi API thật POST /api/auth/register
    const res = await registerService({
      fullName: (fullName || '').trim(),
      email: (email || '').trim().toLowerCase(),
      password
    });

    if (!res.success || !res.data?.user || !isValidUserData(res.data.user)) {
      const errMsg = res.message || 'Phản hồi đăng ký từ máy chủ không hợp lệ.';
      setAuthError(errMsg);
      return {
        ...res,
        success: false,
        code: res.code || 'INVALID_RESPONSE',
        message: errMsg
      };
    }

    // Không tự động đăng nhập
    return res;
  }, [enableDemoAuth]);

  /**
   * Thao tác đăng xuất
   */
  const logout = useCallback(async () => {
    setAuthError(null);

    if (enableDemoAuth) {
      const { localRemoved, sessionRemoved } = clearAllAuthStorages();
      setCurrentUser(null);
      if (!localRemoved && !sessionRemoved) {
        setStorageNotice('Trình duyệt từ chối quyền truy cập bộ nhớ lưu trữ; không thể bảo đảm đã xóa phiên bền vững trên thiết bị.');
      } else if (!localRemoved) {
        setStorageNotice('Đã kết thúc phiên, nhưng không thể xóa dữ liệu trên localStorage do quyền truy cập bị chặn.');
      } else if (!sessionRemoved) {
        setStorageNotice('Đã kết thúc phiên, nhưng không thể xóa dữ liệu trên sessionStorage do quyền truy cập bị chặn.');
      } else {
        setStorageNotice('');
      }
      return { success: true };
    }

    // Gọi API thật POST /api/auth/logout
    const res = await logoutService();

    if (res.success) {
      // Hủy phiên thành công trên server: tăng sequence và kết thúc trạng thái kiểm tra phiên
      activeSeqRef.current++;
      setCurrentUser(null);
      setIsCheckingSession(false);
      setSessionError(null);
      return { success: true };
    }

    // Nếu thất bại: không báo đã đăng xuất, thông báo chưa xác nhận hủy phiên
    const errMsg = res.message || 'Không thể xác nhận hủy phiên với máy chủ. Vui lòng thử lại.';
    setAuthError(errMsg);
    return { success: false, message: errMsg };
  }, [enableDemoAuth]);

  const dismissStorageNotice = useCallback(() => {
    setStorageNotice('');
  }, []);

  const value = {
    currentUser,
    isAuthenticated: Boolean(currentUser),
    isCheckingSession,
    sessionError,
    retryCheckSession: checkSession,
    authError,
    storageNotice,
    isStorageAvailable,
    dismissStorageNotice,
    login,
    register,
    logout,
    checkSession
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext phải được sử dụng bên trong AuthProvider');
  }
  return context;
}
