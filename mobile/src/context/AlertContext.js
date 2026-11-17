import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Vibration, Platform } from 'react-native';
import { getLiveDevicesApi } from '../api/devicesApi';
import { getNotificationsApi } from '../api/notificationsApi';
import { useAuth } from './AuthContext';

const AlertContext = createContext(null);

export function AlertProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [latestGasLevel, setLatestGasLevel] = useState('SAFE');
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isVibrationEnabled, setIsVibrationEnabled] = useState(true);

  const prevCriticalAlertIdsRef = useRef(new Set());
  const pollingRef = useRef(null);

  /**
   * Phân tích và phát hiện các mối nguy hiểm thời gian thực từ dữ liệu thiết bị sống
   */
  const processLiveTelemetry = useCallback((devicesList) => {
    if (!Array.isArray(devicesList)) return [];
    const alerts = [];

    for (const dev of devicesList) {
      const data = dev.data || {};
      const devId = dev.id;

      // 1. Cảm biến Môi trường: Rò rỉ Gas
      if (devId === 'environment-sensor') {
        const gasAlert = data.alertLevel;
        setLatestGasLevel(gasAlert || 'SAFE');

        if (gasAlert === 'DANGER') {
          alerts.push({
            id: `gas-danger-${Date.now()}`,
            type: 'gas',
            severity: 'CRITICAL',
            title: '🚨 NGUY HIỂM: RÒ RỈ KHÍ GAS MỨC CAO!',
            message: `Nồng độ khí gas đo được: ${data.gasRaw ?? 'Cao'} ADC. Còi báo động đang kêu!`,
            deviceId: devId,
            timestamp: new Date()
          });
        } else if (gasAlert === 'WARNING') {
          alerts.push({
            id: `gas-warning-${Date.now()}`,
            type: 'gas',
            severity: 'WARNING',
            title: '⚠️ CẢNH BÁO: Phát hiện khí Gas trong nhà',
            message: `Nồng độ khí gas đo được: ${data.gasRaw ?? 'Vượt ngưỡng'} ADC. Hãy kiểm tra khu vực bếp.`,
            deviceId: devId,
            timestamp: new Date()
          });
        }
      }

      // 2. Khóa cửa thông minh: Cạy cửa, cửa mở lâu, báo động
      if (devId === 'smart-door-lock') {
        if (data.forcedOpen || data.alarm) {
          alerts.push({
            id: `door-alarm-${Date.now()}`,
            type: 'security',
            severity: 'CRITICAL',
            title: '🚨 CẢNH BÁO AN NINH: PHÁT HIỆN CẠY CỬA!',
            message: 'Khóa cửa thông minh phát hiện lực tác động bất thường hoặc bị cạy mở!',
            deviceId: devId,
            timestamp: new Date()
          });
        } else if (data.heldOpen) {
          alerts.push({
            id: `door-held-${Date.now()}`,
            type: 'security',
            severity: 'WARNING',
            title: '⚠️ Cửa chính đang mở quá lâu',
            message: 'Cửa nhà đã mở liên tục vượt quá thời gian an toàn cho phép.',
            deviceId: devId,
            timestamp: new Date()
          });
        }
      }

      // 3. Cửa sổ thông minh: Cạy cửa sổ / Chuyển động đêm
      if (devId === 'window-sensor') {
        if (data.alarm) {
          alerts.push({
            id: `window-alarm-${Date.now()}`,
            type: 'security',
            severity: 'CRITICAL',
            title: '🚨 BÁO ĐỘNG CỬA SỔ BỊ CẠY MỞ!',
            message: 'Cảm biến cửa sổ phát hiện mở cửa hoặc rung chấn bất thường.',
            deviceId: devId,
            timestamp: new Date()
          });
        }
      }

      // 4. Ổ cắm thông minh: Quá tải điện chập cháy
      if (devId === 'smart-plug') {
        if (data.isOverloaded) {
          alerts.push({
            id: `plug-overload-${Date.now()}`,
            type: 'power',
            severity: 'CRITICAL',
            title: '🔥 NGUY HIỂM: QUÁ TẢI ĐIỆN Ổ CẮM!',
            message: `Dòng điện vượt ngưỡng an toàn. Rơ-le đã tự động ngắt nguồn để chống cháy nổ.`,
            deviceId: devId,
            timestamp: new Date()
          });
        }
      }

      // 5. Thùng rác thông minh: Đầy rác
      if (devId === 'smart-bin') {
        if (typeof data.fillPercent === 'number' && data.fillPercent >= 90) {
          alerts.push({
            id: `bin-full-${Date.now()}`,
            type: 'bin',
            severity: 'WARNING',
            title: '🗑️ Thùng rác đã đầy (>90%)',
            message: `Mức đầy hiện tại là ${data.fillPercent}%. Hãy thu gom rác để giữ vệ sinh.`,
            deviceId: devId,
            timestamp: new Date()
          });
        }
      }
    }

    return alerts;
  }, []);

  /**
   * Vòng lặp giám sát trực tiếp (Direct Live Alert Polling)
   */
  const pollAlerts = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      // 1. Quét dữ liệu tức thời của các thiết bị
      const liveRes = await getLiveDevicesApi();
      if (liveRes.success && Array.isArray(liveRes.data?.devices)) {
        setIsLiveConnected(true);
        const newAlerts = processLiveTelemetry(liveRes.data.devices);
        setActiveAlerts(newAlerts);

        // Kích hoạt rung khẩn cấp nếu có cảnh báo CRITICAL mới
        const criticalAlerts = newAlerts.filter(a => a.severity === 'CRITICAL');
        if (criticalAlerts.length > 0 && isVibrationEnabled) {
          const newCriticalKey = criticalAlerts.map(a => a.type).join('-');
          if (!prevCriticalAlertIdsRef.current.has(newCriticalKey)) {
            prevCriticalAlertIdsRef.current.add(newCriticalKey);
            // Kiểu rung khẩn cấp: Rung 500ms - Nghỉ 200ms - Rung 500ms
            if (Platform.OS !== 'web') {
              Vibration.vibrate([0, 500, 200, 500]);
            }
          }
        } else if (criticalAlerts.length === 0) {
          prevCriticalAlertIdsRef.current.clear();
        }
      } else {
        setIsLiveConnected(false);
      }

      // 2. Quét số lượng thông báo chưa đọc trong hộp thư
      const notifRes = await getNotificationsApi({ limit: 1 });
      if (notifRes.success && typeof notifRes.data?.unreadCount === 'number') {
        setUnreadNotificationsCount(notifRes.data.unreadCount);
      }
    } catch (err) {
      setIsLiveConnected(false);
    }
  }, [isAuthenticated, isVibrationEnabled, processLiveTelemetry]);

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveAlerts([]);
      setIsLiveConnected(false);
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    // Quét ngay lập tức
    pollAlerts();

    // Thiết lập chu kỳ quét mỗi 2.5 giây để đảm bảo nhận thông báo trực tiếp gần như tức thời
    pollingRef.current = setInterval(pollAlerts, 2500);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isAuthenticated, pollAlerts]);

  const dismissAlert = (alertId) => {
    setActiveAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  const criticalCount = activeAlerts.filter(a => a.severity === 'CRITICAL').length;
  const warningCount = activeAlerts.filter(a => a.severity === 'WARNING').length;

  return (
    <AlertContext.Provider
      value={{
        activeAlerts,
        criticalCount,
        warningCount,
        latestGasLevel,
        unreadNotificationsCount,
        isLiveConnected,
        isVibrationEnabled,
        setIsVibrationEnabled,
        dismissAlert,
        refreshAlerts: pollAlerts
      }}
    >
      {children}
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlerts must be used within an AlertProvider');
  return ctx;
}
