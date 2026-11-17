import React, { useCallback, useEffect, useState } from 'react';
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
  Alert,
  BackHandler
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

export default function RegisterScreen({ onNavigateLogin, initialVerificationEmail = '' }) {
  const { register, verifyEmail, resendVerification, cancelRegistration } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState(initialVerificationEmail);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');
  const [resendWait, setResendWait] = useState(0);
  const [cancellationToken, setCancellationToken] = useState('');
  const [verificationDeadline, setVerificationDeadline] = useState(0);

  const handleCancel = useCallback(async (expired = false) => {
    if (isSubmitting) return;
    if (cancellationToken) {
      setIsSubmitting(true);
      const result = await cancelRegistration({ email: verificationEmail, cancellationToken });
      setIsSubmitting(false);
      if (!result.success) {
        Alert.alert('Chưa hủy được đăng ký', result.message || 'Vui lòng kiểm tra kết nối và thử lại.');
        return;
      }
    }
    setVerificationCode('');
    setCancellationToken('');
    setVerificationDeadline(0);
    onNavigateLogin();
    if (expired) Alert.alert('Mã đã hết hạn', 'Lượt đăng ký đã được hủy. Bạn có thể đăng ký lại.');
  }, [cancelRegistration, cancellationToken, isSubmitting, onNavigateLogin, verificationEmail]);

  useEffect(() => {
    if (!verificationDeadline) return undefined;
    const timer = setTimeout(() => { void handleCancel(true); }, Math.max(0, verificationDeadline - Date.now()));
    return () => clearTimeout(timer);
  }, [handleCancel, verificationDeadline]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isSubmitting) return true;
      if (verificationEmail) void handleCancel();
      else onNavigateLogin();
      return true;
    });
    return () => subscription.remove();
  }, [handleCancel, isSubmitting, onNavigateLogin, verificationEmail]);

  useEffect(() => {
    if (resendWait <= 0) return undefined;
    const timer = setTimeout(() => setResendWait((remaining) => Math.max(0, remaining - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendWait]);

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ tất cả các trường.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Lỗi', 'Mật khẩu phải có độ dài tối thiểu 8 ký tự.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Lỗi', 'Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await register({
        fullName: fullName.trim(),
        email: email.trim(),
        password
      });

      if (res.success) {
        setPassword('');
        setConfirmPassword('');
        if (res.data?.verificationRequired) {
          setCancellationToken(res.data.cancellationToken || '');
          setVerificationEmail(email.trim().toLowerCase());
          setVerificationDeadline(Date.now() + 10 * 60 * 1000);
          setVerificationNotice('Mã 6 số đã được gửi đến email của bạn. Mã có hiệu lực 10 phút.');
          setResendWait(60);
        } else {
          Alert.alert('Đăng ký thành công', 'Vui lòng đăng nhập để tiếp tục.', [
            { text: 'Đăng nhập', onPress: onNavigateLogin }
          ]);
        }
      } else {
        if (res.code === 'EMAIL_DELIVERY_FAILED') {
          Alert.alert('Chưa gửi được mã', res.message || 'Vui lòng thử đăng ký lại.');
          return;
        }
        Alert.alert('Đăng ký thất bại', res.message || 'Không thể tạo tài khoản.');
      }
    } catch (err) {
      Alert.alert('Lỗi', err.message || 'Lỗi khi gửi yêu cầu đăng ký.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (isSubmitting || !/^\d{6}$/.test(verificationCode)) return;
    setIsSubmitting(true);
    try {
      const res = await verifyEmail({ email: verificationEmail, code: verificationCode });
      if (res.success) {
        setVerificationCode('');
        Alert.alert('Đã xác minh email', 'Bạn có thể đăng nhập.', [
          { text: 'Đăng nhập', onPress: onNavigateLogin }
        ]);
      } else setVerificationNotice(res.message || 'Mã không hợp lệ hoặc đã hết hạn.');
    } catch {
      setVerificationNotice('Không thể kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (isSubmitting || resendWait > 0) return;
    setIsSubmitting(true);
    try {
      const res = await resendVerification({ email: verificationEmail });
      setVerificationNotice(res.message || 'Không thể gửi lại mã.');
      if (res.success) setResendWait(60);
    } catch {
      setVerificationNotice('Không thể kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (verificationEmail) {
    return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} disabled={isSubmitting} onPress={() => { void handleCancel(); }}><Ionicons name="arrow-back" size={24} color="#1e293b" /></TouchableOpacity>
        <View style={styles.header}><Text style={styles.title}>Xác minh email</Text><Text style={styles.subtitle}>Mã xác minh được gửi đến {verificationEmail}</Text></View>
        <View style={styles.formCard}>
          <Text style={styles.label}>Mã 6 số</Text>
          <View style={styles.inputWrapper}><TextInput style={styles.input} value={verificationCode}
            onChangeText={(value) => setVerificationCode(value.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code"
            maxLength={6} placeholder="Nhập mã xác minh" /></View>
          {!!verificationNotice && <Text style={[styles.subtitle, { marginTop: 12 }]} accessibilityRole="alert">{verificationNotice}</Text>}
          <TouchableOpacity style={[styles.registerBtn, (isSubmitting || verificationCode.length !== 6) && styles.disabledBtn]}
            disabled={isSubmitting || verificationCode.length !== 6} onPress={handleVerify}>
            {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.registerBtnText}>Xác minh</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.loginRow} disabled={isSubmitting || resendWait > 0} onPress={handleResend}>
            <Text style={styles.loginLink}>Gửi lại mã{resendWait > 0 ? ` (${resendWait}s)` : ''}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={onNavigateLogin}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Tạo tài khoản mới</Text>
          <Text style={styles.subtitle}>Bảo vệ quyền riêng tư & giám sát an ninh ngôi nhà</Text>
        </View>

        <View style={styles.formCard}>
          {/* Họ và tên */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Họ và tên</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color="#6b7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Nguyễn Văn A"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#6b7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="email@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Mật khẩu */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mật khẩu (tối thiểu 8 ký tự)</Text>
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

          {/* Xác nhận mật khẩu */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Xác nhận mật khẩu</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#6b7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Nhập lại mật khẩu"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Nút đăng ký */}
          <TouchableOpacity
            style={[styles.registerBtn, isSubmitting && styles.disabledBtn]}
            onPress={handleRegister}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.registerBtnText}>Đăng ký tài khoản</Text>
            )}
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={styles.loginPrompt}>Đã có tài khoản? </Text>
            <TouchableOpacity onPress={onNavigateLogin}>
              <Text style={styles.loginLink}>Đăng nhập</Text>
            </TouchableOpacity>
          </View>
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  header: {
    marginBottom: 24
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f766e'
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4
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
  inputGroup: {
    marginBottom: 14
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
  registerBtn: {
    backgroundColor: '#0f766e',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#0f766e',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3
  },
  disabledBtn: {
    opacity: 0.6
  },
  registerBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700'
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16
  },
  loginPrompt: {
    fontSize: 13,
    color: '#64748b'
  },
  loginLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f766e'
  }
});
