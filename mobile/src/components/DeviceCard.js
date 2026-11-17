import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useDevices } from '../context/DevicesContext';

const DEVICE_CONFIG = {
  'smart-bin': {
    name: 'Thùng rác thông minh',
    iconName: 'trash-can-outline',
    iconFamily: 'MaterialCommunityIcons',
    color: '#059669'
  },
  'smart-door-lock': {
    name: 'Khóa cửa thông minh',
    iconName: 'lock',
    iconFamily: 'Ionicons',
    color: '#2563eb'
  },
  'smart-plug': {
    name: 'Ổ cắm thông minh',
    iconName: 'power-plug-outline',
    iconFamily: 'MaterialCommunityIcons',
    color: '#d97706'
  },
  'environment-sensor': {
    name: 'Cảm biến môi trường',
    iconName: 'leaf-outline',
    iconFamily: 'Ionicons',
    color: '#10b981'
  },
  'window-sensor': {
    name: 'Cảm biến cửa sổ',
    iconName: 'window-closed-variant',
    iconFamily: 'MaterialCommunityIcons',
    color: '#8b5cf6'
  },
  'smart-speaker': {
    name: 'Loa thông minh',
    iconName: 'volume-high-outline',
    iconFamily: 'Ionicons',
    color: '#0284c7'
  }
};

export default function DeviceCard({ device, onPress }) {
  const { liveData, togglePlug, resetPlugOverload } = useDevices();
  const [plugLoading, setPlugLoading] = React.useState(false);

  const config = DEVICE_CONFIG[device.id] || {
    name: device.id,
    iconName: 'hardware-chip-outline',
    iconFamily: 'Ionicons',
    color: '#6b7280'
  };

  const isOwner = device.access === 'owner';
  const live = liveData[device.id];
  const isOnline = Boolean(live?.brokerConnected);
  const data = live?.data || {};

  const handleTogglePlug = async (val) => {
    if (!isOwner) return;
    setPlugLoading(true);
    try {
      await togglePlug(val ? 'ON' : 'OFF');
    } finally {
      setPlugLoading(false);
    }
  };

  const handleResetOverload = async () => {
    if (!isOwner) return;
    setPlugLoading(true);
    try {
      await resetPlugOverload();
    } finally {
      setPlugLoading(false);
    }
  };

  // Render thông số viễn trắc tùy theo loại thiết bị
  const renderTelemetry = () => {
    switch (device.id) {
      case 'environment-sensor': {
        const alertLevel = data.alertLevel || 'SAFE';
        let badgeColor = '#10b981';
        let badgeText = 'An toàn';
        if (alertLevel === 'DANGER') {
          badgeColor = '#ef4444';
          badgeText = 'Khí Gas Nguy Hiểm!';
        } else if (alertLevel === 'WARNING') {
          badgeColor = '#f59e0b';
          badgeText = 'Cảnh báo Gas';
        }

        return (
          <View style={styles.telemetryGrid}>
            <View style={styles.telemetryItem}>
              <Text style={styles.metricLabel}>Khí gas:</Text>
              <View style={[styles.gasBadge, { backgroundColor: badgeColor }]}>
                <Text style={styles.gasBadgeText}>{badgeText}</Text>
              </View>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Nhiệt độ:</Text>
              <Text style={styles.metricValue}>{data.temperature != null ? `${data.temperature}°C` : '--'}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Độ ẩm:</Text>
              <Text style={styles.metricValue}>{data.humidity != null ? `${data.humidity}%` : '--'}</Text>
            </View>
          </View>
        );
      }

      case 'smart-plug': {
        const isOn = data.relayState === 'ON';
        const isOverloaded = Boolean(data.isOverloaded);

        return (
          <View style={styles.telemetryContainer}>
            {isOverloaded ? (
              <View style={styles.overloadBox}>
                <Text style={styles.overloadText}>⚠️ ĐÃ NGẮT DO QUÁ TẢI</Text>
                {isOwner && (
                  <TouchableOpacity
                    style={styles.resetBtn}
                    onPress={handleResetOverload}
                    disabled={plugLoading}
                  >
                    <Text style={styles.resetBtnText}>Mở lại nguồn an toàn</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.plugControlRow}>
                <View>
                  <Text style={styles.metricLabel}>Nguồn điện</Text>
                  <Text style={[styles.relayStatus, { color: isOn ? '#059669' : '#6b7280' }]}>
                    {isOn ? 'Đang BẬT' : 'Đang TẮT'}
                  </Text>
                </View>
                {isOwner ? (
                  plugLoading ? (
                    <ActivityIndicator size="small" color="#059669" />
                  ) : (
                    <Switch
                      value={isOn}
                      onValueChange={handleTogglePlug}
                      trackColor={{ false: '#d1d5db', true: '#a7f3d0' }}
                      thumbColor={isOn ? '#059669' : '#f3f4f6'}
                    />
                  )
                ) : (
                  <Text style={styles.readOnlyHint}>Chỉ xem</Text>
                )}
              </View>
            )}

            <View style={styles.plugMetrics}>
              <Text style={styles.metricMini}>
                Công suất: {data.powerWatt != null ? `${data.powerWatt} W` : '--'}
              </Text>
              <Text style={styles.metricMini}>
                Điện áp: {data.voltage != null ? `${data.voltage} V` : '--'}
              </Text>
            </View>
          </View>
        );
      }

      case 'smart-door-lock': {
        const isLocked = Boolean(data.locked);
        const isOpen = Boolean(data.doorOpen);
        const isForced = Boolean(data.forcedOpen || data.alarm);

        return (
          <View style={styles.telemetryGrid}>
            {isForced && (
              <View style={styles.dangerPill}>
                <Text style={styles.dangerPillText}>🚨 PHÁT HIỆN CẠY CỬA</Text>
              </View>
            )}
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Chốt khóa:</Text>
              <Text style={[styles.metricValue, { color: isLocked ? '#059669' : '#dc2626' }]}>
                {isLocked ? 'Đã khóa an toàn' : 'Đang mở chốt'}
              </Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Cánh cửa:</Text>
              <Text style={styles.metricValue}>{isOpen ? 'Đang MỞ' : 'Đang ĐÓNG'}</Text>
            </View>
          </View>
        );
      }

      case 'smart-bin': {
        const fill = data.fillPercent ?? 0;
        const isFull = fill >= 90;

        return (
          <View style={styles.telemetryContainer}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Mức đầy rác:</Text>
              <Text style={[styles.metricValue, { color: isFull ? '#dc2626' : '#1f2937' }]}>
                {fill}% {isFull ? '(Đầy)' : ''}
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.min(100, Math.max(0, fill))}%`,
                    backgroundColor: isFull ? '#ef4444' : fill > 60 ? '#f59e0b' : '#10b981'
                  }
                ]}
              />
            </View>
            <View style={styles.binDetails}>
              <Text style={styles.metricMini}>
                Nắp: {data.lidOpen ? 'Đang mở' : 'Đã đóng'}
              </Text>
              <Text style={styles.metricMini}>
                Khoảng cách: {data.distanceCm != null ? `${data.distanceCm} cm` : '--'}
              </Text>
            </View>
          </View>
        );
      }

      case 'window-sensor': {
        const isOpen = Boolean(data.doorOpen);
        const isAlarm = Boolean(data.alarm);

        return (
          <View style={styles.telemetryGrid}>
            {isAlarm && (
              <View style={styles.dangerPill}>
                <Text style={styles.dangerPillText}>🚨 CẢNH BÁO CỬA SỔ</Text>
              </View>
            )}
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Cửa sổ:</Text>
              <Text style={[styles.metricValue, { color: isOpen ? '#dc2626' : '#059669' }]}>
                {isOpen ? 'Đang hé/mở' : 'Đang đóng'}
              </Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Chuyển động:</Text>
              <Text style={styles.metricValue}>
                {data.motion ? 'Có người lại gần' : 'Không có chuyển động'}
              </Text>
            </View>
          </View>
        );
      }

      default:
        return (
          <Text style={styles.defaultHint}>
            {isOnline ? 'Đang gửi dữ liệu bình thường' : 'Chưa có dữ liệu viễn trắc'}
          </Text>
        );
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {/* Header của thẻ */}
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconWrapper, { backgroundColor: `${config.color}18` }]}>
            {config.iconFamily === 'Ionicons' ? (
              <Ionicons name={config.iconName} size={22} color={config.color} />
            ) : (
              <MaterialCommunityIcons name={config.iconName} size={22} color={config.color} />
            )}
          </View>
          <View style={styles.titleArea}>
            <Text style={styles.deviceName} numberOfLines={1}>
              {device.customName || config.name}
            </Text>
            <Text style={styles.deviceCode}>{device.code || device.id}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.accessBadge, isOwner ? styles.ownerBadge : styles.viewerBadge]}>
            <Text style={[styles.accessText, isOwner ? styles.ownerText : styles.viewerText]}>
              {isOwner ? 'Chủ sở hữu' : 'Chỉ xem'}
            </Text>
          </View>
        </View>
      </View>

      {/* Nội dung telemetry */}
      <View style={styles.telemetrySection}>
        {renderTelemetry()}
      </View>

      {/* Footer */}
      <View style={styles.cardFooter}>
        <View style={styles.statusBadge}>
          <View style={[styles.dot, isOnline ? styles.onlineDot : styles.offlineDot]} />
          <Text style={styles.statusLabel}>
            {isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f3f4f6'
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  titleArea: {
    flex: 1
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937'
  },
  deviceCode: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2
  },
  headerRight: {
    alignItems: 'flex-end'
  },
  accessBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  ownerBadge: {
    backgroundColor: '#ecfdf5'
  },
  viewerBadge: {
    backgroundColor: '#f3f4f6'
  },
  accessText: {
    fontSize: 11,
    fontWeight: '600'
  },
  ownerText: {
    color: '#059669'
  },
  viewerText: {
    color: '#4b5563'
  },
  telemetrySection: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    marginVertical: 4
  },
  telemetryGrid: {
    gap: 6
  },
  telemetryContainer: {
    gap: 6
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  metricLabel: {
    fontSize: 13,
    color: '#4b5563'
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827'
  },
  telemetryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  gasBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  gasBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },
  plugControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  relayStatus: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2
  },
  plugMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb'
  },
  overloadBox: {
    backgroundColor: '#fee2e2',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center'
  },
  overloadText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 6
  },
  resetBtn: {
    backgroundColor: '#dc2626',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  resetBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  readOnlyHint: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic'
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 4
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4
  },
  binDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  metricMini: {
    fontSize: 11,
    color: '#6b7280'
  },
  dangerPill: {
    backgroundColor: '#fee2e2',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4
  },
  dangerPillText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '700'
  },
  defaultHint: {
    fontSize: 12,
    color: '#6b7280'
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f9fafb'
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6
  },
  onlineDot: {
    backgroundColor: '#10b981'
  },
  offlineDot: {
    backgroundColor: '#d1d5db'
  },
  statusLabel: {
    fontSize: 11,
    color: '#6b7280'
  }
});
