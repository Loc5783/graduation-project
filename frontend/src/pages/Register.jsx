import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { calculatePasswordStrength, useAuthContext } from '../context/AuthContext.jsx';
import { useLanguage, getErrorMessage } from '../context/LanguageContext.jsx';
import LanguageToggle from '../shared/components/LanguageToggle.jsx';
import {
  AuthBrandHeader,
  UserIcon,
  MailIcon,
  LockIcon,
  ShieldCheckIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  CloseIcon
} from '../shared/components/AuthIcons.jsx';

// Regex kiểm tra định dạng email chuẩn
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Tính toán độ dài theo byte UTF-8 của chuỗi
 */
function getUtf8ByteLength(str = '') {
  return new TextEncoder().encode(str).length;
}

export default function Register() {
  const { register } = useAuthContext();
  const { t } = useLanguage();

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverNotice, setServerNotice] = useState(null);
  const [isRegisterSuccess, setIsRegisterSuccess] = useState(false);

  // Refs để tự động focus vào trường lỗi đầu tiên
  const fullNameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);

  /**
   * Trả về descriptor lỗi ({ code: string }) thay vì chuỗi đã dịch sẵn
   * để khi người dùng đổi ngôn ngữ VI <-> EN, lỗi hiển thị lập tức cập nhật theo ngôn ngữ mới
   */
  const validateField = (field, value, allData = formData) => {
    if (field === 'fullName') {
      if (!value || !value.trim()) {
        return { code: 'val_fullname_required' };
      }
      if (value.trim().length < 2) {
        return { code: 'val_fullname_min2' };
      }
      if (value.trim().length > 100) {
        return { code: 'val_fullname_max100' };
      }
    }
    if (field === 'email') {
      if (!value || !value.trim()) {
        return { code: 'val_email_required' };
      }
      if (!EMAIL_REGEX.test(value.trim())) {
        return { code: 'val_email_format' };
      }
    }
    if (field === 'password') {
      if (!value) {
        return { code: 'val_password_required' };
      }
      if (value.length < 8) {
        return { code: 'val_password_min8' };
      }
      if (getUtf8ByteLength(value) > 72) {
        return { code: 'val_password_max72' };
      }
    }
    if (field === 'confirmPassword') {
      if (!value) {
        return { code: 'val_confirm_required' };
      }
      if (value !== allData.password) {
        return { code: 'val_confirm_match' };
      }
    }
    return null;
  };

  const handleBlur = (field, e) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const val = (e && e.target && e.target.value !== undefined) ? e.target.value : formData[field];
    const error = validateField(field, val);
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    // Tuyệt đối không tự ý cắt hoặc trim mật khẩu
    const nextData = {
      ...formData,
      [name]: value
    };
    setFormData(nextData);

    if (touched[name]) {
      const error = validateField(name, value, nextData);
      setErrors((prev) => ({ ...prev, [name]: error }));
    }

    if (name === 'password' && touched.confirmPassword) {
      const confirmErr = validateField('confirmPassword', formData.confirmPassword, nextData);
      setErrors((prev) => ({ ...prev, confirmPassword: confirmErr }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerNotice(null);

    const fullNameError = validateField('fullName', formData.fullName);
    const emailError = validateField('email', formData.email);
    const passwordError = validateField('password', formData.password);
    const confirmPasswordError = validateField('confirmPassword', formData.confirmPassword);

    const newErrors = {
      fullName: fullNameError,
      email: emailError,
      password: passwordError,
      confirmPassword: confirmPasswordError
    };

    setErrors(newErrors);
    setTouched({
      fullName: true,
      email: true,
      password: true,
      confirmPassword: true
    });

    // Focus trường lỗi đầu tiên
    if (fullNameError) {
      fullNameRef.current?.focus();
      return;
    }
    if (emailError) {
      emailRef.current?.focus();
      return;
    }
    if (passwordError) {
      passwordRef.current?.focus();
      return;
    }
    if (confirmPasswordError) {
      confirmPasswordRef.current?.focus();
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await register({
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
        password: formData.password,
        confirmPassword: formData.confirmPassword
      });

      if (result.success) {
        // Đăng ký thành công: xóa mật khẩu và thông tin khỏi state
        setFormData({
          fullName: '',
          email: '',
          password: '',
          confirmPassword: ''
        });
        setIsRegisterSuccess(true);
      } else {
        // Xử lý email trùng lặp: hiển thị ngay dưới ô email bằng mã lỗi DUPLICATE_KEY
        if (result.status === 409 || result.code === 'DUPLICATE_KEY' || result.errors?.email) {
          setErrors((prev) => ({
            ...prev,
            email: { code: 'DUPLICATE_KEY' }
          }));
          emailRef.current?.focus();
        } else if (result.errors) {
          const mappedErrors = {};
          for (const [k, v] of Object.entries(result.errors)) {
            mappedErrors[k] = { code: result.code || 'VALIDATION_ERROR', message: v };
          }
          setErrors((prev) => ({
            ...prev,
            ...mappedErrors
          }));
        }

        setServerNotice({
          type: result.isNetworkError ? 'warning' : 'danger',
          code: result.code || (result.status === 409 ? 'DUPLICATE_KEY' : 'err_register_failed'),
          message: result.message
        });
      }
    } catch (err) {
      setServerNotice({
        type: 'danger',
        code: 'NETWORK_ERROR',
        message: err.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const strength = calculatePasswordStrength(formData.password);
  const strengthLabels = {
    1: t('strength_weak'),
    2: t('strength_medium'),
    3: t('strength_good'),
    4: t('strength_strong')
  };

  // Màn hình thông báo Đăng ký thành công
  if (isRegisterSuccess) {
    return (
      <div className="au-page-wrapper">
        <div className="au-card au-card-success">
          <div className="au-card-glow-bar" aria-hidden="true" />

          <div className="au-success-badge" aria-hidden="true">
            <CheckCircleIcon />
          </div>

          <h1 className="au-title">{t('register_success_title')}</h1>
          <p className="au-success-desc">{t('register_success_desc')}</p>

          <Link to="/login" className="au-btn au-btn-primary">
            {t('btn_go_to_login')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="au-page-wrapper">
      <div className="au-card au-card-register">
        {/* Đường viền sáng gradient trên cùng */}
        <div className="au-card-glow-bar" aria-hidden="true" />

        {/* Khối đầu card gồm nhận diện thương hiệu và nút chuyển đổi ngôn ngữ */}
        <div className="au-card-header-bar">
          <AuthBrandHeader subtitle={t('brand_subtitle')} />
          <LanguageToggle className="au-lang-toggle" />
        </div>

        {/* Tiêu đề ngắn gọn */}
        <h1 className="au-title">{t('register_title')}</h1>

        {/* Thông báo lỗi từ máy chủ hoặc mạng */}
        {serverNotice && (
          <div className={`au-alert au-alert-${serverNotice.type}`} role="alert">
            <span className="au-input-icon" style={{ position: 'static' }}>
              <AlertCircleIcon />
            </span>
            <span style={{ flex: 1 }}>{getErrorMessage(serverNotice, t)}</span>
            <button
              type="button"
              className="au-alert-close-btn"
              onClick={() => setServerNotice(null)}
              aria-label={t('close_notice')}
            >
              <CloseIcon />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="au-form" noValidate>
          {/* Họ và tên */}
          <div className="au-form-group">
            <label htmlFor="fullName" className="au-label">
              {t('fullname_label')} <span className="au-required">*</span>
            </label>
            <div className="au-input-wrapper">
              <span className="au-input-icon">
                <UserIcon />
              </span>
              <input
                ref={fullNameRef}
                id="fullName"
                name="fullName"
                type="text"
                value={formData.fullName}
                onChange={handleChange}
                onBlur={(e) => handleBlur('fullName', e)}
                disabled={isSubmitting}
                className={`au-input ${errors.fullName ? 'au-input-error' : ''}`}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={errors.fullName ? 'fullName-error' : undefined}
                autoComplete="name"
                placeholder={t('fullname_placeholder')}
              />
            </div>
            {errors.fullName && (
              <span id="fullName-error" className="au-error-text" role="alert">
                {getErrorMessage(errors.fullName, t)}
              </span>
            )}
          </div>

          {/* Email */}
          <div className="au-form-group">
            <label htmlFor="email" className="au-label">
              {t('email_label')} <span className="au-required">*</span>
            </label>
            <div className="au-input-wrapper">
              <span className="au-input-icon">
                <MailIcon />
              </span>
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                onBlur={(e) => handleBlur('email', e)}
                disabled={isSubmitting}
                className={`au-input ${errors.email ? 'au-input-error' : ''}`}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                autoComplete="email"
                placeholder={t('email_placeholder')}
              />
            </div>
            {errors.email && (
              <span id="email-error" className="au-error-text" role="alert">
                {getErrorMessage(errors.email, t)}
              </span>
            )}
          </div>

          {/* Mật khẩu */}
          <div className="au-form-group">
            <label htmlFor="password" className="au-label">
              {t('password_label')} <span className="au-required">*</span>
            </label>
            <div className="au-input-wrapper">
              <span className="au-input-icon">
                <LockIcon />
              </span>
              <input
                ref={passwordRef}
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                onBlur={(e) => handleBlur('password', e)}
                disabled={isSubmitting}
                className={`au-input au-input-with-toggle ${errors.password ? 'au-input-error' : ''}`}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'password-error' : undefined}
                autoComplete="new-password"
                placeholder={t('password_reg_placeholder')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="au-password-toggle-btn"
                aria-label={showPassword ? t('password_hide') : t('password_show')}
                tabIndex={0}
              >
                {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>

            {/* Thanh đo độ mạnh mật khẩu 4 mức: chỉ xuất hiện khi đã bắt đầu nhập */}
            {formData.password.length > 0 && (
              <div className="au-strength-container" aria-live="polite">
                <div className="au-strength-meta">
                  <span>{t('strength_label')}</span>
                  <span className={`au-strength-val meter-${strength}`}>
                    {strengthLabels[strength] || t('strength_weak')}
                  </span>
                </div>
                <div className={`au-strength-bars meter-${strength}`}>
                  <div className="au-strength-segment" />
                  <div className="au-strength-segment" />
                  <div className="au-strength-segment" />
                  <div className="au-strength-segment" />
                </div>
              </div>
            )}

            {errors.password && (
              <span id="password-error" className="au-error-text" role="alert">
                {getErrorMessage(errors.password, t)}
              </span>
            )}
          </div>

          {/* Xác nhận mật khẩu */}
          <div className="au-form-group">
            <label htmlFor="confirmPassword" className="au-label">
              {t('confirm_password_label')} <span className="au-required">*</span>
            </label>
            <div className="au-input-wrapper">
              <span className="au-input-icon">
                <ShieldCheckIcon />
              </span>
              <input
                ref={confirmPasswordRef}
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleChange}
                onBlur={(e) => handleBlur('confirmPassword', e)}
                disabled={isSubmitting}
                className={`au-input au-input-with-toggle ${errors.confirmPassword ? 'au-input-error' : ''}`}
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
                autoComplete="new-password"
                placeholder={t('confirm_password_placeholder')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="au-password-toggle-btn"
                aria-label={showConfirmPassword ? t('confirm_password_hide') : t('confirm_password_show')}
                tabIndex={0}
              >
                {showConfirmPassword ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>
            {errors.confirmPassword && (
              <span id="confirmPassword-error" className="au-error-text" role="alert">
                {getErrorMessage(errors.confirmPassword, t)}
              </span>
            )}
          </div>

          {/* Nút gửi */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="au-btn au-btn-primary"
          >
            {isSubmitting ? t('btn_registering') : t('btn_register')}
          </button>
        </form>

        <footer className="au-footer">
          {t('have_account')}{' '}
          <Link to="/login" className="au-link">
            {t('link_login')}
          </Link>
        </footer>
      </div>
    </div>
  );
}
