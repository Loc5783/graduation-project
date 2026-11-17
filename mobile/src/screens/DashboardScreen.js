import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDevices } from '../context/DevicesContext';
import { useAlerts } from '../context/AlertContext';
import Header from '../components/Header';
import AlertBanner from '../components/AlertBanner';
import DeviceCard from '../components/DeviceCard';

export default function DashboardScreen({ onSelectDevice, onOpenNotifications, onOpenAlerts }) {
  const { devices, loading, refreshing, reloadAll, claimDevice } = useDevices();
  const { latestGasLevel, criticalCount } = useAlerts();

  // State Modal ghép nối thiết bị mới
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deviceCode, setDeviceCode] = useState('');
  const [pairingSecret, setPairingSecret] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);

  const handleClaim = async () => {
    if (!deviceCode.trim() || !pairingSecret.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập cả Mã nhận diện và Mã ghép nối bí mật.');
      return;
    }
    if (pairingSecret.trim().length < 12) {
      Alert.alert('Lỗi', 'Mã ghép nối bí mật trên tem thiết bị phải có ít nhất 12 ký tự.');
      return;
    }

    setIsClaiming(true);
    try {
      const res = await claimDevice({
        code: deviceCode.trim().toUpperCase(),
        pairingSecret: pairingSecret.trim()
      });

      if (res.success) {
        Alert.alert('Thành công', 'Đã ghép nối và nhận quyền sở hữu thiết bị!');
        setIsModalOpen(false);
        setDeviceCode('');
        setPairingSecret('');
      } else {
        Alert.alert('Ghép nối thất bại', res.message || 'Mã thiết bị hoặc mã bí mật không đúng.');
      }
    } catch (err) {
      Alert.alert('Lỗi', err.message || 'Lỗi khi gửi yêu cầu.');
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Topbar chuẩn */}
      <Header
        onOpenNotifications={onOpenNotifications}
        onOpenAlerts={onOpenAlerts}
      />

      {/* Banner Cảnh báo nổi nếu có sự cố khẩn cấp */}
      <AlertBanner onOpenAlerts={onOpenAlerts} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={reloadAll} colors={['#0f766e']} />
        }
      >
        {/* Thanh Tóm Tắt An Toàn Toàn Nhà */}
        <View style={styles.summaryBar}>
          <TouchableOpacity
            style={[styles.summaryCard, criticalCount > 0 ? styles.summaryDanger : styles.summaryNormal]}
            onPress={onOpenAlerts}
            activeOpacity={0.8}
          >
            <Ionicons
              name={criticalCount > 0 ? 'alert-circle' : 'shield-checkmark'}
              size={22}
              color={criticalCount > 0 ? '#ef4444' : '#10b981'}
            />
            <View style={styles.summaryTextGroup}>
              <Text style={styles.summaryTitle}>Trạng thái An ninh</Text>
              <Text style={[styles.summaryStatus, criticalCount > 0 && { color: '#ef4444' }]}>
                {criticalCount > 0 ? `${criticalCount} BÁO ĐỘNG KHẨN` : 'Toàn bộ an toàn'}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.summaryCard}>
            <Ionicons
              name="flame-outline"
              size={22}
              color={latestGasLevel === 'DANGER' ? '#ef4444' : latestGasLevel === 'WARNING' ? '#f59e0b' : '#059669'}
            />
            <View style={styles.summaryTextGroup}>
              <Text style={styles.summaryTitle}>Nồng độ Khí Gas</Text>
              <Text
                style={[
                  styles.summaryStatus,
                  {
                    color: latestGasLevel === 'DANGER' ? '#ef4444' : latestGasLevel === 'WARNING' ? '#f59e0b' : '#059669'
                  }
                ]}
              >
                {latestGasLevel === 'DANGER' ? 'NGUY HIỂM!' : latestGasLevel === 'WARNING' ? 'Cảnh báo' : 'Bình thường'}
              </Text>
            </View>
          </View>
        </View>

        {/* Tiêu đề danh sách thiết bị */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Thiết bị thông minh ({devices.length})</Text>
            <Text style={styles.sectionSubtitle}>
              {devices.length === 0
                ? 'Chưa kết nối thiết bị nào'
                : `Đang quản lý ${devices.length} thiết bị trong nhà`}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.addDeviceSmallBtn}
            onPress={() => setIsModalOpen(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={18} color="#0f766e" />
            <Text style={styles.addDeviceSmallBtnText}>Thêm</Text>
          </TouchableOpacity>
        </View>

        {/* Trạng thái Loading ban đầu */}
        {loading && devices.length === 0 && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#0f766e" />
            <Text style={styles.loadingText}>Đang tải danh sách thiết bị...</Text>
          </View>
        )}

        {/* Trạng thái Trống: Chưa nhận thiết bị */}
        {!loading && devices.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="radio-outline" size={48} color="#0f766e" />
            </View>
            <Text style={styles.emptyTitle}>Chưa có thiết bị nào</Text>
            <Text style={styles.emptyDesc}>
              Nhập mã nhận diện (VD: TRTM01) và mã ghép nối bí mật dán trên tem thiết bị để bắt đầu giám sát và nhận thông báo trực tiếp.
            </Text>
            <TouchableOpacity
              style={styles.claimCtaBtn}
              onPress={() => setIsModalOpen(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle-outline" size={20} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.claimCtaText}>Ghép nối thiết bị ngay</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Danh sách các Thẻ Thiết Bị */}
        {devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            onPress={() => onSelectDevice(device)}
          />
        ))}
      </ScrollView>

      {/* Modal Thêm & Ghép Nối Thiết Bị */}
      <Modal
        visible={isModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ghép nối thiết bị mới</Text>
              <TouchableOpacity onPress={() => setIsModalOpen(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Nhập mã nhận diện và mã bí mật in trên nhãn dán vật lý của thiết bị IoT.
            </Text>

            {/* Mã thiết bị */}
            <View style={styles.modalInputGroup}>
              <Text style={styles.modalLabel}>Mã thiết bị (VD: TRTM01, OCTM01, KCTM01)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="VD: TRTM01"
                value={deviceCode}
                onChangeText={setDeviceCode}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>

            {/* Mã bí mật */}
            <View style={styles.modalInputGroup}>
              <Text style={styles.modalLabel}>Mã ghép nối bí mật (Tối thiểu 12 ký tự)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Nhập mã bí mật trên tem dán"
                value={pairingSecret}
                onChangeText={setPairingSecret}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            {/* Nút Submit */}
            <TouchableOpacity
              style={[styles.modalSubmitBtn, isClaiming && styles.disabledBtn]}
              onPress={handleClaim}
              disabled={isClaiming}
              activeOpacity={0.8}
            >
              {isClaiming ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.modalSubmitText}>Xác nhận ghép nối</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  summaryBar: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18
  },
  summaryCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  summaryNormal: {
    borderColor: '#e2e8f0'
  },
  summaryDanger: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff1f2'
  },
  summaryTextGroup: {
    marginLeft: 8,
    flex: 1
  },
  summaryTitle: {
    fontSize: 11,
    color: '#64748b'
  },
  summaryStatus: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 1
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a'
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  addDeviceSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ccfbf1',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  addDeviceSmallBtnText: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 2
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center'
  },
  loadingText: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 10
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 10
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0fdfa',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20
  },
  claimCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f766e',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#0f766e',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3
  },
  claimCtaText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a'
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 18
  },
  modalInputGroup: {
    marginBottom: 14
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 14,
    color: '#0f172a'
  },
  modalSubmitBtn: {
    backgroundColor: '#0f766e',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16
  },
  modalSubmitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700'
  },
  disabledBtn: {
    opacity: 0.6
  }
});
