import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { testConnectionApi } from '../api/authApi';

export default function LoginScreen({ onNavigateRegister }) {
  const { login, serverUrl, updateServerUrl } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState(serverUrl || '');
  const [isTestingServer, setIsTestingServer] = useState(false);

  useEffect(() => {
    if (serverUrl) {
      setCustomServerUrl(serverUrl);
    }
  }, [serverUrl]);

  const handleTestConnection = async () => {
    const targetUrl = (customServerUrl || '').trim();
    if (!targetUrl) {
      Alert.alert('Lỗi', 'Vui lòng nhập địa chỉ URL máy chủ.');
      return;
    }
    setIsTestingServer(true);
    try {
      await updateServerUrl(targetUrl);
      const res = await testConnectionApi();
      if (res.status === 200 || res.status === 401 || res.code === 'SUCCESS') {
        Alert.alert('Kết nối thành công', `Đã kết nối tốt tới máy chủ Backend!\nURL: ${targetUrl}\nTrạng thái: Máy chủ đang hoạt động.`);
      } else {
        Alert.alert('Không thể kết nối', `Máy chủ phản hồi mã: ${res.status || res.code}\n${res.message || 'Không có phản hồi hợp lệ'}`);
      }
    } catch {
      Alert.alert('Lỗi kết nối', `Không thể kết nối tới ${targetUrl}.\nVui lòng kiểm tra:\n1. Laptop và điện thoại cùng kết nối 1 mạng Wi-Fi.\n2. Địa chỉ IP laptop hiện tại đúng (VD: http://192.168.1.178:5000).\n3. Backend đang chạy trên laptop.`);
    } finally {
      setIsTestingServer(false);
    }
  };

  const handleSaveServerUrl = async () => {
    const targetUrl = (customServerUrl || '').trim();
    if (!targetUrl) return;
    await updateServerUrl(targetUrl);
    Alert.alert('Đã lưu', `Địa chỉ máy chủ đã được lưu:\n${targetUrl}`);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (customServerUrl && customServerUrl !== serverUrl) {
        await updateServerUrl(customServerUrl);
      }
      const res = await login({ email: email.trim(), password });
      if (!res.success) {
        if (res.code === 'EMAIL_NOT_VERIFIED') {
          Alert.alert('Cần xác minh email', res.message || 'Vui lòng nhập mã đã gửi đến email.', [
            { text: 'Để sau', style: 'cancel' },
            { text: 'Nhập mã', onPress: () => onNavigateRegister(email.trim().toLowerCase()) }
          ]);
          return;
        }
        Alert.alert('Đăng nhập thất bại', res.message || 'Email hoặc mật khẩu không chính xác.');
      }
    } catch (err) {
      Alert.alert('Lỗi hệ thống', err.message || 'Không thể đăng nhập.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Logo & Tiêu đề */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark" size={40} color="#0f766e" />
          </View>
          <Text style={styles.brandTitle}>SmartHome Privacy</Text>
          <Text style={styles.subTitle}>Hệ thống giám sát an ninh & cảnh báo trực tiếp</Text>
        </View>

        {/* Form đăng nhập */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Đăng nhập</Text>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#6b7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="vidu@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Mật khẩu */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mật khẩu</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#6b7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Nhập mật khẩu"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#6b7280"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Nút đăng nhập */}
          <TouchableOpacity
            style={[styles.loginBtn, isSubmitting && styles.disabledBtn]}
            onPress={handleLogin}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.loginBtnText}>Đăng nhập</Text>
            )}
          </TouchableOpacity>

          {/* Chuyển sang đăng ký */}
          <View style={styles.registerRow}>
            <Text style={styles.registerPrompt}>Chưa có tài khoản? </Text>
            <TouchableOpacity onPress={() => onNavigateRegister()}>
              <Text style={styles.registerLink}>Đăng ký ngay</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Cấu hình IP Máy chủ Backend */}
        <View style={styles.serverCard}>
          <TouchableOpacity
            style={styles.serverHeader}
            onPress={() => setShowServerConfig(!showServerConfig)}
          >
            <Ionicons name="server-outline" size={18} color="#4b5563" />
            <Text style={styles.serverHeaderText}>
              Địa chỉ máy chủ: {serverUrl}
            </Text>
            <Ionicons
              name={showServerConfig ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#4b5563"
            />
          </TouchableOpacity>

          {showServerConfig && (
            <View style={styles.serverBody}>
              <Text style={styles.serverHint}>
                Nhập địa chỉ IP mạng Wi-Fi của máy tính (Hiện tại: http://192.168.1.178:5000):
              </Text>
              <TextInput
                style={styles.serverInput}
                value={customServerUrl}
                onChangeText={setCustomServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.serverBtnRow}>
                <TouchableOpacity
                  style={[styles.testBtn, { flex: 1, marginRight: 6 }]}
                  onPress={handleTestConnection}
                  disabled={isTestingServer}
                >
                  {isTestingServer ? (
                    <ActivityIndicator size="small" color="#0f766e" />
                  ) : (
                    <Text style={styles.testBtnText}>Kiểm tra kết nối</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { flex: 1, marginLeft: 6 }]}
                  onPress={handleSaveServerUrl}
                >
                  <Text style={styles.saveBtnText}>Lưu địa chỉ</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  scrollContent: {
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%'
  },
  header: {
    alignItems: 'center',
    marginBottom: 28
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ccfbf1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f766e',
    letterSpacing: -0.5
  },
  subTitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center'
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 18
  },
  inputGroup: {
    marginBottom: 16
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48
  },
  inputIcon: {
    marginRight: 8
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a'
  },
  eyeBtn: {
    padding: 4
  },
  loginBtn: {
    backgroundColor: '#0f766e',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#0f766e',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3
  },
  disabledBtn: {
    opacity: 0.6
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700'
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 18
  },
  registerPrompt: {
    fontSize: 13,
    color: '#64748b'
  },
  registerLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f766e'
  },
  serverCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  serverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  serverHeaderText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    marginHorizontal: 8
  },
  serverBody: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  serverHint: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 6
  },
  serverInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    fontSize: 13,
    color: '#0f172a',
    marginBottom: 8
  },
  testBtn: {
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#0f766e',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center'
  },
  testBtnText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '600'
  },
  serverBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  saveBtn: {
    backgroundColor: '#0f766e',
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center'
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  }
});
