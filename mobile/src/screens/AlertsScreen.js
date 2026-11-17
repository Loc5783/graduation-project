import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Vibration,
  Platform,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAlerts } from '../context/AlertContext';
import { useDevices } from '../context/DevicesContext';

export default function AlertsScreen({ onBack }) {
  const {
    activeAlerts,
    criticalCount,
    warningCount,
    latestGasLevel,
    isLiveConnected,
    isVibrationEnabled,
    setIsVibrationEnabled,
    dismissAlert,
    refreshAlerts
  } = useAlerts();

  const { liveData } = useDevices();

  // Kiểm tra tình trạng từng phân hệ an ninh
  const doorData = liveData['smart-door-lock']?.data || {};
  const isDoorAlarm = Boolean(doorData.alarm || doorData.forcedOpen);
  const isDoorHeld = Boolean(doorData.heldOpen);

  const plugData = liveData['smart-plug']?.data || {};
  const isPlugOverload = Boolean(plugData.isOverloaded);

  const windowData = liveData['window-sensor']?.data || {};
  const isWindowAlarm = Boolean(windowData.alarm);

  const binData = liveData['smart-bin']?.data || {};
  const isBinFull = (binData.fillPercent ?? 0) >= 90;

  const testVibration = () => {
    if (Platform.OS !== 'web') {
      Vibration.vibrate([0, 400, 150, 400, 150, 400]);
    }
    Alert.alert('Thử nghiệm thành công', 'Điện thoại đã kích hoạt nhịp rung cảnh báo khẩn cấp!');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>Trung tâm Cảnh báo</Text>
          <Text style={styles.headerSubtitle}>
            {isLiveConnected ? 'Kết nối trực tiếp · Giám sát 24/7' : 'Đang ngắt kết nối với Hub'}
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={refreshAlerts}>
          <Ionicons name="refresh" size={20} color="#0f766e" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Banner Tổng Quan Nguy Hiểm */}
        <View style={[styles.statusBanner, criticalCount > 0 ? styles.bannerDanger : styles.bannerSafe]}>
          <Ionicons
            name={criticalCount > 0 ? 'flame' : 'shield-checkmark'}
            size={36}
            color="#ffffff"
            style={styles.bannerIcon}
          />
          <View style={styles.bannerTextGroup}>
            <Text style={styles.bannerHeadline}>
              {criticalCount > 0 ? 'PHÁT HIỆN SỰ CỐ KHẨN CẤP!' : 'Hệ thống an toàn'}
            </Text>
            <Text style={styles.bannerSub}>
              {criticalCount > 0
                ? `Có ${criticalCount} cảnh báo mức độ cao cần xử lý ngay lập tức.`
                : warningCount > 0
                ? `Có ${warningCount} cảnh báo mức độ chú ý cần kiểm tra.`
                : 'Mọi thông số cảm biến và an ninh đều ở mức an toàn.'}
            </Text>
          </View>
        </View>

        {/* Danh sách Sự cố Đang Kích Hoạt */}
        <Text style={styles.sectionTitle}>
          Sự cố đang kích hoạt ({activeAlerts.length})
        </Text>

        {activeAlerts.length === 0 ? (
          <View style={styles.noAlertsCard}>
            <Ionicons name="checkmark-done-circle" size={48} color="#10b981" />
            <Text style={styles.noAlertsTitle}>Không có sự cố nào</Text>
            <Text style={styles.noAlertsDesc}>
              Ngôi nhà của bạn hiện đang được giám sát chặt chẽ. Mọi cảnh báo gas, cạy cửa hay quá tải điện sẽ xuất hiện ngay tại đây.
            </Text>
          </View>
        ) : (
          activeAlerts.map((alert) => (
            <View
              key={alert.id}
              style={[
                styles.alertCard,
                alert.severity === 'CRITICAL' ? styles.alertCardCritical : styles.alertCardWarning
              ]}
            >
              <View style={styles.alertCardTop}>
                <View style={styles.alertBadge}>
                  <Text style={styles.alertBadgeText}>
                    {alert.severity === 'CRITICAL' ? 'KHẨN CẤP' : 'CẢNH BÁO'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.dismissBtn}
                  onPress={() => dismissAlert(alert.id)}
                >
                  <Text style={styles.dismissBtnText}>Đã xử lý</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.alertItemTitle}>{alert.title}</Text>
              <Text style={styles.alertItemMessage}>{alert.message}</Text>
            </View>
          ))
        )}

        {/* Bảng Giám Sát Cảm Biến Thời Gian Thực */}
        <Text style={styles.sectionTitle}>Trạng thái an toàn từng khu vực</Text>
        <View style={styles.radarCard}>
          {/* 1. Gas MQ-2 */}
          <View style={styles.radarRow}>
            <View style={styles.radarLeft}>
              <Ionicons
                name="flame"
                size={22}
                color={latestGasLevel === 'DANGER' ? '#ef4444' : latestGasLevel === 'WARNING' ? '#f59e0b' : '#10b981'}
              />
              <Text style={styles.radarName}>Khí gas nhà bếp</Text>
            </View>
            <View
              style={[
                styles.radarPill,
                latestGasLevel === 'DANGER'
                  ? styles.pillRed
                  : latestGasLevel === 'WARNING'
                  ? styles.pillYellow
                  : styles.pillGreen
              ]}
            >
              <Text style={styles.radarPillText}>
                {latestGasLevel === 'DANGER' ? 'Nguy hiểm' : latestGasLevel === 'WARNING' ? 'Cảnh báo' : 'An toàn'}
              </Text>
            </View>
          </View>

          {/* 2. Khóa cửa */}
          <View style={styles.radarRow}>
            <View style={styles.radarLeft}>
              <Ionicons
                name="lock-closed"
                size={22}
                color={isDoorAlarm ? '#ef4444' : isDoorHeld ? '#f59e0b' : '#10b981'}
              />
              <Text style={styles.radarName}>Khóa cửa chính</Text>
            </View>
            <View
              style={[
                styles.radarPill,
                isDoorAlarm ? styles.pillRed : isDoorHeld ? styles.pillYellow : styles.pillGreen
              ]}
            >
              <Text style={styles.radarPillText}>
                {isDoorAlarm ? 'Bị cạy mở!' : isDoorHeld ? 'Mở lâu' : 'An toàn'}
              </Text>
            </View>
          </View>

          {/* 3. Cửa sổ */}
          <View style={styles.radarRow}>
            <View style={styles.radarLeft}>
              <Ionicons
                name="grid"
                size={22}
                color={isWindowAlarm ? '#ef4444' : '#10b981'}
              />
              <Text style={styles.radarName}>Cảm biến cửa sổ</Text>
            </View>
            <View style={[styles.radarPill, isWindowAlarm ? styles.pillRed : styles.pillGreen]}>
              <Text style={styles.radarPillText}>
                {isWindowAlarm ? 'Báo động' : 'An toàn'}
              </Text>
            </View>
          </View>

          {/* 4. Ổ cắm */}
          <View style={styles.radarRow}>
            <View style={styles.radarLeft}>
              <Ionicons
                name="flash"
                size={22}
                color={isPlugOverload ? '#ef4444' : '#10b981'}
              />
              <Text style={styles.radarName}>An toàn lưới điện</Text>
            </View>
            <View style={[styles.radarPill, isPlugOverload ? styles.pillRed : styles.pillGreen]}>
              <Text style={styles.radarPillText}>
                {isPlugOverload ? 'Quá tải điện!' : 'Bình thường'}
              </Text>
            </View>
          </View>

          {/* 5. Thùng rác */}
          <View style={[styles.radarRow, { borderBottomWidth: 0 }]}>
            <View style={styles.radarLeft}>
              <Ionicons
                name="trash"
                size={22}
                color={isBinFull ? '#f59e0b' : '#10b981'}
              />
              <Text style={styles.radarName}>Mức đầy thùng rác</Text>
            </View>
            <View style={[styles.radarPill, isBinFull ? styles.pillYellow : styles.pillGreen]}>
              <Text style={styles.radarPillText}>
                {isBinFull ? 'Đã đầy' : 'Bình thường'}
              </Text>
            </View>
          </View>
        </View>

        {/* Cài đặt Báo động & Rung Trực Tiếp */}
        <Text style={styles.sectionTitle}>Tùy chỉnh cảnh báo di động</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingTextGroup}>
              <Text style={styles.settingTitle}>Rung báo động khẩn cấp</Text>
              <Text style={styles.settingDesc}>
                Tự động kích hoạt nhịp rung mạnh khi phát hiện rò rỉ gas hoặc cạy cửa.
              </Text>
            </View>
            <Switch
              value={isVibrationEnabled}
              onValueChange={setIsVibrationEnabled}
              trackColor={{ false: '#d1d5db', true: '#a7f3d0' }}
              thumbColor={isVibrationEnabled ? '#059669' : '#f3f4f6'}
            />
          </View>

          <TouchableOpacity style={styles.testVibrationBtn} onPress={testVibration}>
            <Ionicons name="notifications-circle" size={20} color="#0f766e" />
            <Text style={styles.testVibrationText}>Thử nghiệm nhịp rung cảnh báo</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  backBtn: {
    padding: 6,
    marginRight: 8
  },
  headerTitleGroup: {
    flex: 1
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a'
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748b'
  },
  refreshBtn: {
    padding: 8
  },
  content: {
    padding: 16,
    paddingBottom: 40
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4
  },
  bannerSafe: {
    backgroundColor: '#059669'
  },
  bannerDanger: {
    backgroundColor: '#dc2626'
  },
  bannerIcon: {
    marginRight: 14
  },
  bannerTextGroup: {
    flex: 1
  },
  bannerHeadline: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 2
  },
  bannerSub: {
    fontSize: 12,
    color: '#f0fdfa',
    lineHeight: 16
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 10,
    marginTop: 6
  },
  noAlertsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20
  },
  noAlertsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 8,
    marginBottom: 4
  },
  noAlertsDesc: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 16
  },
  alertCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1
  },
  alertCardCritical: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5'
  },
  alertCardWarning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a'
  },
  alertCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  alertBadge: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  alertBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800'
  },
  dismissBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  dismissBtnText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600'
  },
  alertItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4
  },
  alertItemMessage: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16
  },
  radarCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20
  },
  radarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  radarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  radarName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b'
  },
  radarPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8
  },
  pillGreen: {
    backgroundColor: '#ecfdf5'
  },
  pillYellow: {
    backgroundColor: '#fef3c7'
  },
  pillRed: {
    backgroundColor: '#fee2e2'
  },
  radarPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b'
  },
  settingsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  settingTextGroup: {
    flex: 1,
    marginRight: 12
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b'
  },
  settingDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  testVibrationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#0f766e',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6
  },
  testVibrationText: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '700'
  }
});
