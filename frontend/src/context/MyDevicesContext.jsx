import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuthContext } from './AuthContext.jsx';
import {
  getMyDevices,
  claimDevice as apiClaimDevice,
  updateDevice as apiUpdateDevice,
  unclaimDevice as apiUnclaimDevice
} from '../services/myDeviceService.js';
import { isPreviewMode } from '../services/authService.js';

const DEFAULT_VALUE = {
  devices: [],
  loading: false,
  error: null,
  refreshDevices: async () => {},
  claimDevice: async () => ({ success: false, code: 'NO_PROVIDER' }),
  updateDevice: async () => ({ success: false, code: 'NO_PROVIDER' }),
  unclaimDevice: async () => ({ success: false, code: 'NO_PROVIDER' }),
  hasDevice: () => false,
  getDeviceAccess: () => null,
  isOwner: () => false,
  isViewer: () => false,
  isProvided: false
};

const MyDevicesContext = createContext(DEFAULT_VALUE);

export function MyDevicesProvider({ children }) {
  const { currentUser, handleUnauthorized } = useAuthContext();
  const userId = currentUser?.id;
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const activeUserIdRef = useRef(userId);

  const refreshDevices = useCallback(async () => {
    if (!userId || isPreviewMode()) {
      setDevices([]);
      setLoading(false);
      return;
    }
    const currentFetchUserId = userId;
    setLoading(true);
    setError(null);
    try {
      const res = await getMyDevices();
      if (activeUserIdRef.current !== currentFetchUserId) return;
      if (res.status === 401) {
        handleUnauthorized?.(userId);
        return;
      }
      if (res.success && Array.isArray(res.data?.devices)) {
        setDevices(res.data.devices);
      } else {
        setError(res.message || 'Không thể tải danh sách thiết bị.');
      }
    } catch {
      if (activeUserIdRef.current === currentFetchUserId) {
        setError('Lỗi kết nối khi tải danh sách thiết bị.');
      }
    } finally {
      if (activeUserIdRef.current === currentFetchUserId) {
        setLoading(false);
      }
    }
  }, [userId, handleUnauthorized]);

  useEffect(() => {
    activeUserIdRef.current = userId;
    // Xóa ngay dữ liệu của tài khoản cũ khi chuyển đổi hoặc logout
    setDevices([]);
    setError(null);
    if (userId && !isPreviewMode()) {
      void refreshDevices();
    }
  }, [userId, refreshDevices]);

  // Tự động làm mới danh sách quyền khi quay lại tab/trang hoặc khi nhận tín hiệu 403
  useEffect(() => {
    if (!userId || isPreviewMode()) return;

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible' || document.hasFocus?.()) {
        void refreshDevices();
      }
    };

    const handleForbidden = () => {
      void refreshDevices();
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    window.addEventListener('app:forbidden', handleForbidden);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.removeEventListener('app:forbidden', handleForbidden);
    };
  }, [userId, refreshDevices]);

  const claim = useCallback(async ({ code, pairingSecret }) => {
    const res = await apiClaimDevice({ code, pairingSecret });
    if (res.success) {
      await refreshDevices();
    }
    return res;
  }, [refreshDevices]);

  const hasDevice = useCallback((deviceId) => {
    return devices.some((d) => d.id === deviceId);
  }, [devices]);

  const getDeviceAccess = useCallback((deviceId) => {
    const found = devices.find((d) => d.id === deviceId);
    return found ? found.access : null;
  }, [devices]);

  const isOwner = useCallback((deviceId) => {
    return getDeviceAccess(deviceId) === 'owner';
  }, [getDeviceAccess]);

  const isViewer = useCallback((deviceId) => {
    return getDeviceAccess(deviceId) === 'viewer';
  }, [getDeviceAccess]);

  const updateDevice = useCallback(async (deviceId, data) => {
    const res = await apiUpdateDevice(deviceId, data);
    if (res.success) {
      await refreshDevices();
    }
    return res;
  }, [refreshDevices]);

  const unclaimDevice = useCallback(async (deviceId) => {
    const res = await apiUnclaimDevice(deviceId);
    if (res.success) {
      await refreshDevices();
    }
    return res;
  }, [refreshDevices]);

  const value = {
    devices,
    loading,
    error,
    refreshDevices,
    claimDevice: claim,
    updateDevice,
    unclaimDevice,
    hasDevice,
    getDeviceAccess,
    isOwner,
    isViewer,
    isProvided: true
  };

  return (
    <MyDevicesContext.Provider value={value}>
      {children}
    </MyDevicesContext.Provider>
  );
}

export function useMyDevices() {
  return useContext(MyDevicesContext) || DEFAULT_VALUE;
}
