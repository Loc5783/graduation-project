import { useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext.jsx';
import { useLanguage, getErrorMessage } from '../context/LanguageContext.jsx';
import LanguageToggle from '../shared/components/LanguageToggle.jsx';
import {
  AuthBrandHeader,
  MailIcon,
  LockIcon,
  EyeIcon,
  EyeSlashIcon,
  AlertCircleIcon,
  CloseIcon
} from '../shared/components/AuthIcons.jsx';

// Regex kiểm tra định dạng email chuẩn
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { login } = useAuthContext();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    remember: false
  });

  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverNotice, setServerNotice] = useState(null);
  const [showForgotNotice, setShowForgotNotice] = useState(false);

  // Refs để tự động focus vào trường lỗi đầu tiên
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  /**
   * Trả về descriptor lỗi ({ code: string }) thay vì chuỗi đã dịch sẵn
   * để khi người dùng đổi ngôn ngữ VI <-> EN, lỗi hiển thị lập tức cập nhật theo ngôn ngữ mới
   */
  const validateField = (field, value) => {
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
    const { name, value, type, checked } = e.target;
    // Không tự ý trim mật khẩu khi người dùng gõ
    const finalValue = type === 'checkbox' ? checked : value;

    setFormData((prev) => ({
      ...prev,
      [name]: finalValue
    }));

    if (touched[name]) {
      const error = validateField(name, finalValue);
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerNotice(null);

    // Kiểm tra toàn bộ các trường
    const emailError = validateField('email', formData.email);
    const passwordError = validateField('password', formData.password);

    const newErrors = {
      email: emailError,
      password: passwordError
    };

    setErrors(newErrors);
    setTouched({
      email: true,
      password: true
    });

    // Focus trường lỗi đầu tiên
    if (emailError) {
      emailRef.current?.focus();
      return;
    }
    if (passwordError) {
      passwordRef.current?.focus();
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await login({
        email: formData.email.trim(),
        password: formData.password,
        remember: Boolean(formData.remember)
      });

      if (result.success) {
        // Đăng nhập thành công: chuyển hướng vào dashboard hoặc trang trước đó
        const destination = location.state?.from?.pathname || '/overview';
        navigate(destination, { replace: true });
      } else {
        // Phân biệt rõ lỗi mạng và sai thông tin, lưu code để hỗ trợ dịch động
        setServerNotice({
          type: result.isNetworkError ? 'warning' : 'danger',
          code: result.code || 'INVALID_CREDENTIALS',
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

  return (
    <div className="au-page-wrapper">
      <div className="au-card au-card-login">
        {/* Đường viền sáng gradient trên cùng */}
        <div className="au-card-glow-bar" aria-hidden="true" />

        {/* Khối đầu card gồm nhận diện thương hiệu và nút chuyển đổi ngôn ngữ */}
        <div className="au-card-header-bar">
          <AuthBrandHeader subtitle={t('brand_subtitle')} />
          <LanguageToggle className="au-lang-toggle" />
        </div>

        {/* Tiêu đề ngắn gọn */}
        <h1 className="au-title">{t('login_title')}</h1>

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

        {/* Thông báo hướng dẫn Quên mật khẩu */}
        {showForgotNotice && (
          <div className="au-alert au-alert-info" role="status">
            <span style={{ flex: 1 }}>{t('forgot_password_notice')}</span>
            <button
              type="button"
              className="au-alert-close-btn"
              onClick={() => setShowForgotNotice(false)}
              aria-label={t('close_notice')}
            >
              <CloseIcon />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="au-form" noValidate>
          {/* Trường Email */}
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

          {/* Trường Mật khẩu có nút hiện/ẩn */}
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
                autoComplete="current-password"
                placeholder={t('password_placeholder')}
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
            {errors.password && (
              <span id="password-error" className="au-error-text" role="alert">
                {getErrorMessage(errors.password, t)}
              </span>
            )}
          </div>

          {/* Hàng: Ghi nhớ đăng nhập bên trái & Quên mật khẩu bên phải */}
          <div className="au-options-row">
            <label className="au-checkbox-label" htmlFor="remember">
              <input
                type="checkbox"
                id="remember"
                name="remember"
                checked={formData.remember}
                onChange={handleChange}
                disabled={isSubmitting}
                className="au-checkbox"
              />
              <span>{t('remember_me')}</span>
            </label>

            <button
              type="button"
              onClick={() => setShowForgotNotice(true)}
              className="au-forgot-link"
            >
              {t('forgot_password')}
            </button>
          </div>

          {/* Nút gửi form */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="au-btn au-btn-primary"
          >
            {isSubmitting ? t('btn_logging_in') : t('btn_login')}
          </button>
        </form>

        <footer className="au-footer">
          {t('no_account')}{' '}
          <Link to="/register" className="au-link">
            {t('link_register')}
          </Link>
        </footer>
      </div>
    </div>
  );
}
