import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDevices } from '../context/DevicesContext';
import { getDeviceHistoryApi } from '../api/devicesApi';

export default function DeviceDetailScreen({ device, onBack }) {
  const { liveData, updateDeviceName, unclaimDevice, togglePlug, resetPlugOverload } = useDevices();

  const isOwner = device.access === 'owner';
  const live = liveData[device.id];
  const data = live?.data || {};

  const [customName, setCustomName] = useState(device.customName || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [isUnclaiming, setIsUnclaiming] = useState(false);

  const [historyItems, setHistoryItems] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      const res = await getDeviceHistoryApi(device.id, 20);
      if (res.success && Array.isArray(res.data?.items)) {
        setHistoryItems(res.data.items);
      }
    } catch (err) {
      console.warn('Lỗi tải lịch sử:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [device.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleSaveName = async () => {
    if (!isOwner) return;
    setIsUpdatingName(true);
    try {
      const res = await updateDeviceName(device.id, customName.trim());
      if (res.success) {
        Alert.alert('Thành công', 'Đã lưu tên gợi nhớ mới cho thiết bị.');
      } else {
        Alert.alert('Lỗi', res.message || 'Không thể đổi tên.');
      }
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleUnclaim = () => {
    if (!isOwner) return;

    Alert.alert(
      '⚠️ Vùng nguy hiểm: Gỡ thiết bị',
      'Bạn có chắc chắn muốn gỡ thiết bị này khỏi tài khoản?\n\nLưu ý: Mã ghép nối in trên tem thiết bị vẫn giữ nguyên giá trị vật lý và bất kỳ ai biết mã đều có thể ghép nối lại.',
      [
        { text: 'Hủy bỏ', style: 'cancel' },
        {
          text: 'Gỡ thiết bị',
          style: 'destructive',
          onPress: async () => {
            setIsUnclaiming(true);
            try {
              const res = await unclaimDevice(device.id);
              if (res.success) {
                Alert.alert('Đã gỡ thiết bị', 'Thiết bị đã được xóa khỏi danh sách sở hữu của bạn.', [
                  { text: 'OK', onPress: onBack }
                ]);
              } else {
                Alert.alert('Lỗi', res.message || 'Không thể gỡ thiết bị.');
              }
            } finally {
              setIsUnclaiming(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {device.customName || device.code || device.id}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Thẻ Tổng quan thiết bị */}
        <View style={styles.card}>
          <View style={styles.deviceHeroRow}>
            <View style={styles.heroBadge}>
              <Ionicons name="hardware-chip-outline" size={32} color="#0f766e" />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroName}>{device.customName || device.id}</Text>
              <Text style={styles.heroCode}>Mã phần cứng: {device.code || device.id}</Text>
            </View>
            <View style={[styles.accessPill, isOwner ? styles.ownerPill : styles.viewerPill]}>
              <Text style={[styles.accessPillText, isOwner ? styles.ownerPillText : styles.viewerPillText]}>
                {isOwner ? 'Chủ sở hữu' : 'Chỉ xem'}
              </Text>
            </View>
          </View>
        </View>

        {/* Đổi tên gợi nhớ (Chỉ Chủ sở hữu) */}
        {isOwner && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tên gợi nhớ của bạn</Text>
            <View style={styles.nameInputRow}>
              <TextInput
                style={styles.nameInput}
                placeholder="VD: Thùng rác ban công"
                value={customName}
                onChangeText={setCustomName}
                maxLength={50}
              />
              <TouchableOpacity
                style={styles.saveNameBtn}
                onPress={handleSaveName}
                disabled={isUpdatingName}
              >
                {isUpdatingName ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.saveNameBtnText}>Lưu</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Bảng Dữ liệu viễn trắc tức thời */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dữ liệu viễn trắc trực tiếp</Text>
          <View style={styles.telemetryTable}>
            {Object.entries(data).map(([key, val]) => (
              <View key={key} style={styles.tableRow}>
                <Text style={styles.tableKey}>{key}:</Text>
                <Text style={styles.tableVal}>
                  {typeof val === 'boolean' ? (val ? 'BẬT / CÓ' : 'TẮT / KHÔNG') : String(val)}
                </Text>
              </View>
            ))}
            {Object.keys(data).length === 0 && (
              <Text style={styles.emptyHint}>Chưa nhận được gói tin telemetry từ Gateway.</Text>
            )}
          </View>
        </View>

        {/* Lịch sử quan sát */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nhật ký quan sát gần đây</Text>
          {loadingHistory ? (
            <ActivityIndicator size="small" color="#0f766e" style={{ padding: 16 }} />
          ) : historyItems.length === 0 ? (
            <Text style={styles.emptyHint}>Không có lịch sử quan sát trong lần sở hữu này.</Text>
          ) : (
            historyItems.slice(0, 10).map((item, idx) => (
              <View key={idx} style={styles.historyRow}>
                <Text style={styles.historyTime}>
                  {new Date(item.observedAt).toLocaleTimeString()}
                </Text>
                <Text style={styles.historyData} numberOfLines={1}>
                  {JSON.stringify(item.data)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Vùng Nguy Hiểm: Gỡ thiết bị (Chỉ Chủ sở hữu) */}
        {isOwner && (
          <View style={[styles.card, styles.dangerCard]}>
            <Text style={styles.dangerTitle}>Vùng nguy hiểm</Text>
            <Text style={styles.dangerDesc}>
              Gỡ thiết bị khỏi tài khoản của bạn. Mọi tài khoản được chia sẻ sẽ mất quyền xem ngay lập tức.
            </Text>
            <TouchableOpacity
              style={styles.unclaimBtn}
              onPress={handleUnclaim}
              disabled={isUnclaiming}
            >
              {isUnclaiming ? (
                <ActivityIndicator color="#dc2626" />
              ) : (
                <Text style={styles.unclaimBtnText}>Gỡ thiết bị khỏi tài khoản</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  backBtn: {
    padding: 6
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1,
    textAlign: 'center'
  },
  content: {
    padding: 16,
    paddingBottom: 40
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  deviceHeroRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  heroBadge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#f0fdfa',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  heroText: {
    flex: 1
  },
  heroName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  heroCode: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  accessPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  ownerPill: {
    backgroundColor: '#ecfdf5'
  },
  viewerPill: {
    backgroundColor: '#f1f5f9'
  },
  accessPillText: {
    fontSize: 11,
    fontWeight: '700'
  },
  ownerPillText: {
    color: '#059669'
  },
  viewerPillText: {
    color: '#64748b'
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12
  },
  nameInputRow: {
    flexDirection: 'row',
    gap: 8
  },
  nameInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#0f172a'
  },
  saveNameBtn: {
    backgroundColor: '#0f766e',
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },
  saveNameBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  telemetryTable: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  tableKey: {
    fontSize: 13,
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  tableVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a'
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  historyTime: {
    fontSize: 12,
    color: '#64748b',
    width: 70
  },
  historyData: {
    fontSize: 12,
    color: '#334155',
    flex: 1
  },
  emptyHint: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    padding: 10
  },
  dangerCard: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff1f2'
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#b91c1c',
    marginBottom: 4
  },
  dangerDesc: {
    fontSize: 12,
    color: '#7f1d1d',
    lineHeight: 16,
    marginBottom: 14
  },
  unclaimBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 10,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center'
  },
  unclaimBtnText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '700'
  }
});
