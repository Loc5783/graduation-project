import { useMemo, useCallback } from 'react';
import { useDeviceContext } from '../context/DeviceContext.jsx';
import { useAuthContext } from '../context/AuthContext.jsx';
import {
  generateLogs,
  enrichLogsWithPreferences,
  getActiveAlerts,
  calculateShareScore
} from './mockData.js';
import { canEditDevice, getPermissionExplanation } from './roles.js';

/**
 * Hook kết nối dữ liệu thiết bị, tuỳ chọn quyền riêng tư và phân quyền.
 */
export function useDeviceData(config) {
  const { preferences, setDataTypeEnabled, setAllDataTypes, resetToDefaults } = useDeviceContext();
  const { currentUser } = useAuthContext();

  const deviceId = config?.id;

  // Lấy danh sách preferences hiện tại của thiết bị
  const currentDevicePreferences = useMemo(() => {
    return (preferences && deviceId && preferences[deviceId]) ? preferences[deviceId] : {};
  }, [preferences, deviceId]);

  // Sinh 40 bản ghi log tất định từ config
  const baseLogs = useMemo(() => {
    if (!config) return [];
    return generateLogs(config, 40);
  }, [config]);

  // Trộn trạng thái allowed / blocked theo preferences (hàm thuần, không sửa baseLogs)
  const enrichedLogs = useMemo(() => {
    return enrichLogsWithPreferences(baseLogs, currentDevicePreferences);
  }, [baseLogs, currentDevicePreferences]);

  // Lấy các cảnh báo đang hoạt động (chỉ gồm anomalous và allowed)
  const activeAlerts = useMemo(() => {
    return getActiveAlerts(enrichedLogs);
  }, [enrichedLogs]);

  // Tính Điểm chia sẻ dữ liệu
  const shareScore = useMemo(() => {
    if (!config?.dataTypes) return 0;
    return calculateShareScore(config.dataTypes, currentDevicePreferences);
  }, [config?.dataTypes, currentDevicePreferences]);

  // Thống kê số lượng
  const stats = useMemo(() => {
    const totalTypes = config?.dataTypes?.length || 0;
    let enabledTypes = 0;
    for (const dt of config?.dataTypes || []) {
      const isEnabled = currentDevicePreferences[dt.key] !== undefined
        ? Boolean(currentDevicePreferences[dt.key])
        : Boolean(dt.enabled);
      if (isEnabled) enabledTypes++;
    }

    return {
      totalTypes,
      enabledTypes,
      totalAccesses: enrichedLogs.length,
      activeAlertsCount: activeAlerts.length,
      shareScore
    };
  }, [config?.dataTypes, currentDevicePreferences, enrichedLogs.length, activeAlerts.length, shareScore]);

  // Kiểm tra quyền chỉnh sửa
  const userCanEdit = useMemo(() => {
    return canEditDevice(currentUser, deviceId);
  }, [currentUser, deviceId]);

  const permissionMessage = useMemo(() => {
    return getPermissionExplanation(currentUser, deviceId);
  }, [currentUser, deviceId]);

  // Hành động có kiểm tra quyền (bảo vệ ở cấp handler)
  const handleToggleDataType = useCallback((dataKey, enabled) => {
    if (!userCanEdit) {
      alert(permissionMessage || 'Bạn không có quyền thay đổi thiết lập của thiết bị này.');
      return;
    }
    setDataTypeEnabled(deviceId, dataKey, enabled);
  }, [userCanEdit, permissionMessage, setDataTypeEnabled, deviceId]);

  const handleToggleAll = useCallback((enabled) => {
    if (!userCanEdit) {
      alert(permissionMessage || 'Bạn không có quyền thay đổi thiết lập của thiết bị này.');
      return;
    }
    setAllDataTypes(deviceId, enabled);
  }, [userCanEdit, permissionMessage, setAllDataTypes, deviceId]);

  const handleReset = useCallback(() => {
    if (!userCanEdit) {
      alert(permissionMessage || 'Bạn không có quyền thay đổi thiết lập của thiết bị này.');
      return;
    }
    resetToDefaults(deviceId);
  }, [userCanEdit, permissionMessage, resetToDefaults, deviceId]);

  return {
    deviceId,
    config,
    preferences: currentDevicePreferences,
    baseLogs,
    enrichedLogs,
    activeAlerts,
    stats,
    userCanEdit,
    permissionMessage,
    handleToggleDataType,
    handleToggleAll,
    handleReset
  };
}

export default useDeviceData;
