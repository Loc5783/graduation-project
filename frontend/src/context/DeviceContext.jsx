import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { deviceConfigs } from '../modules/configs.js';

export const DeviceContext = createContext(null);

export const STORAGE_KEY_DEVICE_PREFERENCES = 'shp_device_preferences';

/**
 * Lấy đối tượng localStorage an toàn, bảo vệ cả bước getter window.localStorage
 */
export function getDeviceStorage() {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage || null;
  } catch (err) {
    console.warn('Không thể truy cập window.localStorage:', err);
    return null;
  }
}

/**
 * Đọc an toàn từ storage
 */
export function safeGetDeviceStorageItem(key) {
  try {
    const storage = getDeviceStorage();
    if (!storage) return null;
    return storage.getItem(key);
  } catch (err) {
    console.warn(`Lỗi truy cập storage để đọc ${key}:`, err);
    return null;
  }
}

/**
 * Ghi an toàn vào storage
 */
export function safeSetDeviceStorageItem(key, value) {
  try {
    const storage = getDeviceStorage();
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`Lỗi ghi storage ${key}:`, err);
    return false;
  }
}

/**
 * Tạo trạng thái mặc định từ các config thiết bị (tất cả dataTypes có enabled theo config)
 */
export function buildDefaultPreferences() {
  const prefs = {};
  for (const config of deviceConfigs) {
    prefs[config.id] = {};
    for (const dt of config.dataTypes || []) {
      prefs[config.id][dt.key] = dt.enabled !== undefined ? Boolean(dt.enabled) : true;
    }
  }
  return prefs;
}

/**
 * Validate và chuẩn hóa preferences đọc từ storage so với config hiện tại
 */
export function sanitizePreferences(rawParsed) {
  const defaults = buildDefaultPreferences();
  if (!rawParsed || typeof rawParsed !== 'object' || Array.isArray(rawParsed)) {
    return defaults;
  }

  const sanitized = {};
  for (const config of deviceConfigs) {
    const devId = config.id;
    sanitized[devId] = {};
    const rawDev = rawParsed[devId];

    for (const dt of config.dataTypes || []) {
      const key = dt.key;
      if (rawDev && typeof rawDev === 'object' && typeof rawDev[key] === 'boolean') {
        sanitized[devId][key] = rawDev[key];
      } else {
        sanitized[devId][key] = dt.enabled !== undefined ? Boolean(dt.enabled) : true;
      }
    }
  }

  return sanitized;
}

/**
 * Hàm đọc khởi tạo thuần (pure read), thu nhận đồng thời preferences và trạng thái lỗi.
 * Không có tác dụng phụ, bảo đảm an toàn khi chạy với React StrictMode.
 */
export function readInitialDevicePreferences() {
  const defaults = buildDefaultPreferences();
  let stored = null;
  let isBlocked = false;

  try {
    const storage = getDeviceStorage();
    if (!storage) {
      isBlocked = true;
    } else {
      stored = storage.getItem(STORAGE_KEY_DEVICE_PREFERENCES);
    }
  } catch (err) {
    console.warn('Lỗi truy cập storage khi đọc cấu hình ban đầu:', err);
    isBlocked = true;
  }

  if (isBlocked) {
    return {
      preferences: defaults,
      isStorageAvailable: false,
      storageNotice: 'Bộ nhớ trình duyệt bị chặn hoặc không khả dụng. Trạng thái đang được lưu tạm trong bộ nhớ.'
    };
  }

  if (!stored) {
    return {
      preferences: defaults,
      isStorageAvailable: true,
      storageNotice: ''
    };
  }

  try {
    const parsed = JSON.parse(stored);
    const sanitized = sanitizePreferences(parsed);
    return {
      preferences: sanitized,
      isStorageAvailable: true,
      storageNotice: ''
    };
  } catch (jsonErr) {
    console.warn('Dữ liệu JSON trong storage bị hỏng, khôi phục mặc định:', jsonErr);
    return {
      preferences: defaults,
      isStorageAvailable: true,
      storageNotice: 'Dữ liệu cấu hình trong bộ nhớ bị hỏng và đã được đặt lại về mặc định.'
    };
  }
}

export function DeviceProvider({ children }) {
  const [initialData] = useState(() => readInitialDevicePreferences());

  const [preferences, setPreferences] = useState(initialData.preferences);
  const [isStorageAvailable, setIsStorageAvailable] = useState(initialData.isStorageAvailable);
  const [storageNotice, setStorageNotice] = useState(initialData.storageNotice);

  // Đánh dấu người dùng đã thực sự thay đổi lựa chọn (không dựa vào số lần chạy của effect)
  const userModifiedRef = useRef(false);

  // Lưu vào localStorage khi preferences thay đổi
  useEffect(() => {
    // Nếu người dùng chưa thực hiện thay đổi nào (chỉ là mount hoặc remount dưới StrictMode)
    if (!userModifiedRef.current) {
      // Nếu ban đầu JSON hỏng, sửa lại storage bằng cách lưu preferences mặc định hợp lệ
      if (initialData.storageNotice) {
        try {
          const storage = getDeviceStorage();
          if (storage) {
            storage.setItem(STORAGE_KEY_DEVICE_PREFERENCES, JSON.stringify(preferences));
          }
        } catch (err) {
          console.warn('Không thể ghi lại defaults vào storage sau khi phát hiện JSON hỏng:', err);
        }
      }
      // Giữ nguyên thông điệp khôi phục storageNotice ban đầu cho người dùng
      return;
    }

    // Khi người dùng THỰC SỰ thay đổi lựa chọn:
    const saveSuccess = safeSetDeviceStorageItem(STORAGE_KEY_DEVICE_PREFERENCES, JSON.stringify(preferences));
    if (saveSuccess) {
      setIsStorageAvailable(true);
      // Người dùng đã thao tác thành công, xóa thông báo khôi phục cũ
      setStorageNotice('');
    } else {
      setIsStorageAvailable(false);
      setStorageNotice('Bộ nhớ trình duyệt không khả dụng. Thay đổi đang được lưu tạm trong phiên làm việc hiện tại.');
    }
  }, [preferences, initialData.storageNotice]);

  const setDataTypeEnabled = useCallback((deviceId, dataKey, enabled) => {
    userModifiedRef.current = true;
    setPreferences(prev => {
      const devPrefs = prev[deviceId] || {};
      return {
        ...prev,
        [deviceId]: {
          ...devPrefs,
          [dataKey]: Boolean(enabled)
        }
      };
    });
  }, []);

  const setAllDataTypes = useCallback((deviceId, enabled) => {
    userModifiedRef.current = true;
    setPreferences(prev => {
      const config = deviceConfigs.find(c => c.id === deviceId);
      if (!config) return prev;

      const nextDevPrefs = {};
      for (const dt of config.dataTypes || []) {
        nextDevPrefs[dt.key] = Boolean(enabled);
      }

      return {
        ...prev,
        [deviceId]: nextDevPrefs
      };
    });
  }, []);

  const resetToDefaults = useCallback((deviceId) => {
    userModifiedRef.current = true;
    const defaults = buildDefaultPreferences();
    setPreferences(prev => {
      if (deviceId) {
        return {
          ...prev,
          [deviceId]: { ...(defaults[deviceId] || {}) }
        };
      }
      return defaults;
    });
  }, []);

  const dismissStorageNotice = useCallback(() => {
    setStorageNotice('');
  }, []);

  const getDevicePreferences = useCallback((deviceId) => {
    return preferences[deviceId] || {};
  }, [preferences]);

  const value = {
    preferences,
    setDataTypeEnabled,
    setAllDataTypes,
    resetToDefaults,
    dismissStorageNotice,
    getDevicePreferences,
    isStorageAvailable,
    storageNotice
  };

  return (
    <DeviceContext.Provider value={value}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDeviceContext() {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDeviceContext phải được sử dụng bên trong DeviceProvider');
  }
  return context;
}
