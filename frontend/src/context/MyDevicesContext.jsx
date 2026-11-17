import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  resolvedUserId: null,
  isProvided: false
};

export const MyDevicesContext = createContext(DEFAULT_VALUE);

export function MyDevicesProvider({ children }) {
  const { currentUser, handleUnauthorized } = useAuthContext();
  const userId = currentUser?.id;
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resolvedUserId, setResolvedUserId] = useState(null);
  const activeUserIdRef = useRef(userId);
  const inFlightLockRef = useRef(null); // { userId, seq }
  const fetchSeqRef = useRef(0);
  const abortControllerRef = useRef(null);

  const refreshDevices = useCallback(async () => {
    if (!userId || isPreviewMode()) {
      setDevices([]);
      setLoading(false);
      return;
    }
    // Chống request trùng lặp cho CÙNG một người dùng đang có request in-flight
    if (inFlightLockRef.current?.userId === userId) return;

    const thisSeq = ++fetchSeqRef.current;
    inFlightLockRef.current = { userId, seq: thisSeq };
    const currentFetchUserId = userId;

    // Hủy request mạng trước đó (của user cũ hoặc request dở dang)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await getMyDevices({ signal: controller.signal });
      // Bỏ qua nếu user đã đổi hoặc đã có lượt fetch mới hơn
      if (activeUserIdRef.current !== currentFetchUserId || fetchSeqRef.current !== thisSeq) return;
      if (res.status === 401) {
        handleUnauthorized?.(currentFetchUserId);
        return;
      }
      if (res.success && Array.isArray(res.data?.devices)) {
        setDevices(res.data.devices);
      } else {
        setError(res.message || 'Không thể tải danh sách thiết bị.');
      }
    } catch (err) {
      if (activeUserIdRef.current === currentFetchUserId && fetchSeqRef.current === thisSeq) {
        if (err?.name !== 'AbortError') {
          setError('Lỗi kết nối khi tải danh sách thiết bị.');
        }
      }
    } finally {
      // Chỉ request đang sở hữu khóa mới được nhả khóa
      if (inFlightLockRef.current?.seq === thisSeq) {
        inFlightLockRef.current = null;
      }
      // Chỉ tắt loading nếu lượt fetch này là lượt mới nhất của user hiện tại
      if (fetchSeqRef.current === thisSeq && activeUserIdRef.current === currentFetchUserId) {
        setLoading(false);
        setResolvedUserId(currentFetchUserId);
      }
      // Không để finally cũ xóa abortControllerRef của request mới
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [userId, handleUnauthorized]);

  useEffect(() => {
    activeUserIdRef.current = userId;
    // Khi đổi user hoặc logout: Hủy ngay request đang chờ của user trước
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Xóa khóa in-flight cũ nếu khóa đó không thuộc về user mới
    if (inFlightLockRef.current?.userId !== userId) {
      inFlightLockRef.current = null;
    }
    setDevices([]);
    setError(null);
    setResolvedUserId(null);
    if (userId && !isPreviewMode()) {
      void refreshDevices();
    } else {
      setLoading(false);
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

  const value = useMemo(() => ({
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
    resolvedUserId,
    isProvided: true
  }), [devices, loading, error, refreshDevices, claim, updateDevice, unclaimDevice, hasDevice, getDeviceAccess, isOwner, isViewer, resolvedUserId]);

  return (
    <MyDevicesContext.Provider value={value}>
      {children}
    </MyDevicesContext.Provider>
  );
}

export function useMyDevices() {
  return useContext(MyDevicesContext) || DEFAULT_VALUE;
}
