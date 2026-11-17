import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getMyDevicesApi,
  getLiveDevicesApi,
  togglePlugRelayApi,
  resetPlugOverloadApi,
  claimDeviceApi,
  updateDeviceApi,
  unclaimDeviceApi
} from '../api/devicesApi';
import { useAuth } from './AuthContext';

const DevicesContext = createContext(null);

export function DevicesProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [devices, setDevices] = useState([]);
  const [liveData, setLiveData] = useState({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Nạp danh sách thiết bị thuộc quyền sở hữu/chia sẻ
  const refreshDevices = useCallback(async () => {
    if (!isAuthenticated) {
      setDevices([]);
      return;
    }
    try {
      const res = await getMyDevicesApi();
      console.log('[DevicesContext] my-devices response:', JSON.stringify(res));
      if (res.success && Array.isArray(res.data?.devices)) {
        setDevices(res.data.devices);
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách thiết bị:', err);
    }
  }, [isAuthenticated]);

  // Nạp trạng thái telemetry tức thời từ Gateway
  const refreshLiveData = useCallback(async () => {
    if (!isAuthenticated) {
      setLiveData({});
      return;
    }
    try {
      const res = await getLiveDevicesApi();
      if (res.success && Array.isArray(res.data?.devices)) {
        const map = {};
        res.data.devices.forEach(d => {
          map[d.id] = {
            brokerConnected: d.brokerConnected,
            fresh: d.fresh,
            telemetryAgeSeconds: d.telemetryAgeSeconds,
            data: d.data || {}
          };
        });
        setLiveData(map);
      }
    } catch (err) {
      console.warn('Lỗi tải telemetry:', err);
    }
  }, [isAuthenticated]);

  const reloadAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshDevices(), refreshLiveData()]);
    setRefreshing(false);
  }, [refreshDevices, refreshLiveData]);

  useEffect(() => {
    if (isAuthenticated) {
      setLoading(true);
      reloadAll().finally(() => setLoading(false));

      // Cập nhật telemetry liên tục mỗi 3 giây và thiết bị mỗi 5 giây
      const liveInterval = setInterval(refreshLiveData, 3000);
      const devInterval = setInterval(refreshDevices, 5000);
      return () => {
        clearInterval(liveInterval);
        clearInterval(devInterval);
      };
    } else {
      setDevices([]);
      setLiveData({});
    }
  }, [isAuthenticated, reloadAll, refreshLiveData]);

  // Điều khiển Smart Plug Relay
  const togglePlug = async (state) => {
    const res = await togglePlugRelayApi(state);
    if (res.success) {
      await refreshLiveData();
    }
    return res;
  };

  // Reset Quá tải Smart Plug
  const resetPlugOverload = async () => {
    const res = await resetPlugOverloadApi();
    if (res.success) {
      await refreshLiveData();
    }
    return res;
  };

  // Ghép nối thiết bị mới
  const claimDevice = async ({ code, pairingSecret }) => {
    const res = await claimDeviceApi({ code, pairingSecret });
    if (res.success) {
      await reloadAll();
    }
    return res;
  };

  // Đổi tên gợi nhớ
  const updateDeviceName = async (deviceId, customName) => {
    const res = await updateDeviceApi(deviceId, { customName });
    if (res.success) {
      await refreshDevices();
    }
    return res;
  };

  // Gỡ thiết bị khỏi tài khoản
  const unclaimDevice = async (deviceId) => {
    const res = await unclaimDeviceApi(deviceId);
    if (res.success) {
      await reloadAll();
    }
    return res;
  };

  return (
    <DevicesContext.Provider
      value={{
        devices,
        liveData,
        loading,
        refreshing,
        reloadAll,
        togglePlug,
        resetPlugOverload,
        claimDevice,
        updateDeviceName,
        unclaimDevice
      }}
    >
      {children}
    </DevicesContext.Provider>
  );
}

export function useDevices() {
  const ctx = useContext(DevicesContext);
  if (!ctx) throw new Error('useDevices must be used within a DevicesProvider');
  return ctx;
}
