import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertContext';
import { testConnectionApi } from '../api/authApi';

export default function SettingsScreen({ onBack }) {
  const { currentUser, serverUrl, updateServerUrl, logout } = useAuth();
  const { isVibrationEnabled, setIsVibrationEnabled } = useAlerts();

  const [inputUrl, setInputUrl] = useState(serverUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (serverUrl) {
      setInputUrl(serverUrl);
    }
  }, [serverUrl]);

  const handleSaveUrl = async () => {
    const targetUrl = (inputUrl || '').trim();
    if (!targetUrl) return;
    setIsSaving(true);
    try {
      await updateServerUrl(targetUrl);
      Alert.alert('Thành công', `Đã lưu địa chỉ máy chủ mới:\n${targetUrl}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    const targetUrl = (inputUrl || '').trim();
    if (!targetUrl) {
      Alert.alert('Lỗi', 'Vui lòng nhập địa chỉ URL máy chủ.');
      return;
    }
    setIsTesting(true);
    try {
      await updateServerUrl(targetUrl);
      const res = await testConnectionApi();
      if (res.status === 200 || res.status === 401 || res.code === 'SUCCESS') {
        Alert.alert('Kết nối thành công', `Đã kết nối tốt tới máy chủ Backend!\nURL: ${targetUrl}\nTrạng thái: Máy chủ phản hồi UP.`);
      } else {
        Alert.alert('Lỗi kết nối', `Máy chủ phản hồi mã: ${res.status || res.code}\n${res.message || 'Không có phản hồi'}`);
      }
    } catch {
      Alert.alert('Thất bại', `Không thể kết nối tới ${targetUrl}.\nVui lòng kiểm tra Wi-Fi và đảm bảo Backend đang chạy.`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất khỏi ứng dụng?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          await logout();
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cài đặt hệ thống</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Thông tin tài khoản */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tài khoản đang đăng nhập</Text>
          <View style={styles.profileRow}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={28} color="#0f766e" />
            </View>
            <View style={styles.profileText}>
              <Text style={styles.userName}>{currentUser?.name || 'Người dùng'}</Text>
              <Text style={styles.userEmail}>{currentUser?.email || ''}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>
                  Vai trò: {currentUser?.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Địa chỉ máy chủ Backend */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cấu hình kết nối Backend</Text>
          <Text style={styles.cardDesc}>
            Địa chỉ API của máy tính hoặc Cloud Server mà ứng dụng mobile gửi lệnh:
          </Text>

          <TextInput
            style={styles.input}
            value={inputUrl}
            onChangeText={setInputUrl}
            placeholder="http://192.168.1.15:5000"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.testBtn}
              onPress={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting ? (
                <ActivityIndicator size="small" color="#0f766e" />
              ) : (
                <Text style={styles.testBtnText}>Kiểm tra kết nối</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSaveUrl}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveBtnText}>Lưu địa chỉ</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Cài đặt Báo động */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Thông báo & Rung</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingTextGroup}>
              <Text style={styles.settingTitle}>Rung khi có sự cố khẩn cấp</Text>
              <Text style={styles.settingDesc}>
                Tự động rung điện thoại khi nồng độ gas nguy hiểm hoặc có đột nhập.
              </Text>
            </View>
            <Switch
              value={isVibrationEnabled}
              onValueChange={setIsVibrationEnabled}
              trackColor={{ false: '#d1d5db', true: '#a7f3d0' }}
              thumbColor={isVibrationEnabled ? '#059669' : '#f3f4f6'}
            />
          </View>
        </View>

        {/* Nút Đăng xuất */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color="#dc2626" style={{ marginRight: 8 }} />
          <Text style={styles.logoutBtnText}>Đăng xuất khỏi ứng dụng</Text>
        </TouchableOpacity>
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
    color: '#0f172a'
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
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
    marginBottom: 12
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ccfbf1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },
  profileText: {
    flex: 1
  },
  userName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  userEmail: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2
  },
  roleBadge: {
    backgroundColor: '#f1f5f9',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6
  },
  roleText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600'
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 10
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10
  },
  testBtn: {
    flex: 1,
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#0f766e',
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center'
  },
  testBtnText: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '700'
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#0f766e',
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center'
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  settingTextGroup: {
    flex: 1,
    marginRight: 12
  },
  settingTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b'
  },
  settingDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 12,
    height: 46,
    marginTop: 10
  },
  logoutBtnText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '700'
  }
});
