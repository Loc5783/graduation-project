
import { useState, useRef, useEffect, useCallback } from 'react';
import { useLanguage, getErrorMessage } from '../../context/LanguageContext.jsx';
import { useAuthContext, calculatePasswordStrength } from '../../context/AuthContext.jsx';
import { changePasswordService } from '../../services/accountService.js';
import {
  LockIcon,
  EyeIcon,
  EyeSlashIcon,
  AlertCircleIcon,
  CloseIcon
} from '../../shared/components/AuthIcons.jsx';

/**
 * Tính toán độ dài byte UTF-8 của chuỗi bằng TextEncoder chuẩn,
 * có fallback an toàn cho môi trường không có TextEncoder.
 * Tuyệt đối không dùng str.length (chỉ đo ký tự UTF-16, sai với Unicode).
 *
 * @param {string} str
 * @returns {number}
 */
export function getUtf8ByteLength(str) {
  if (typeof str !== 'string') return 0;
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  return encodeURIComponent(str).replace(/%[A-F\d]{2}/g, 'U').length;
}

/**
 * Component Hộp thoại Đổi mật khẩu (Change Password Dialog).
 * Tuân thủ tiêu chuẩn WAI-ARIA modal dialog:
 * - role="dialog", aria-modal="true", aria-labelledby, aria-describedby
 * - Bẫy focus Tab / Shift+Tab khép kín bên trong hộp thoại
 * - Tự động focus vào trường mật khẩu hiện tại khi mở
 * - Trả focus về nút trigger ban đầu khi đóng
 * - Khóa cuộn nền (body scroll lock)
 * - Đóng bằng phím Escape hoặc click nền khi chưa gửi
 * - Chặn gửi lặp (double submit guard) và chặn đóng thông thường khi đang gửi
 *
 * @param {object} props
 * @param {boolean} props.isOpen Trạng thái hiển thị hộp thoại
 * @param {() => void} props.onClose Callback đóng hộp thoại
 * @param {(res: object) => void} props.onSuccess Callback khi đổi thành công bình thường
 * @param {(res: object) => void} props.onRequiresLogin Callback khi đổi thành công nhưng cần đăng nhập lại
 * @param {boolean} [props.isPreview] Cờ chế độ xem trước
 * @param {React.RefObject<HTMLElement>} [props.triggerRef] Ref của nút mở hộp thoại để hoàn trả focus
 */
export default function ChangePasswordDialog({
  isOpen,
  onClose,
  onSuccess,
  onRequiresLogin,
  isPreview = false,
  triggerRef
}) {
  const { t } = useLanguage();
  const { currentUser, handleUnauthorized } = useAuthContext();

  // Dữ liệu form: tuyệt đối không trim
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Trạng thái hiện/ẩn mật khẩu cho từng trường
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Trạng thái lỗi và gửi yêu cầu
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalNotice, setGeneralNotice] = useState(null); // { type: 'danger'|'warning', code: string }

  // Refs điều khiển Focus, Vòng đời, Guard và Cách ly tài khoản
  const dialogRef = useRef(null);
  const currentPasswordInputRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const dialogGenRef = useRef(0);
  const activeReqGenRef = useRef(null);
  const activeReqUserIdRef = useRef(null);
  const prevUserIdRef = useRef(currentUser?.id);
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const focusTimerRef = useRef(null);

  // Xóa trắng toàn bộ dữ liệu mật khẩu và trạng thái lỗi
  const resetForm = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setErrors({});
    setTouched({});
    setGeneralNotice(null);
    isSubmittingRef.current = false;
    setIsSubmitting(false);
  }, []);

  // 1. Quản lý vòng đời mount/unmount component
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Vô hiệu hóa ngay lập tức mọi request đang bay khi component bị unmount
      dialogGenRef.current += 1;
      activeReqGenRef.current = null;
      activeReqUserIdRef.current = null;
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      document.body.style.overflow = '';
    };
  }, []);

  // 2. Quản lý vòng đời mở/đóng hộp thoại: Focus ban đầu, generation và khóa cuộn nền
  useEffect(() => {
    if (!isOpen) {
      // Vô hiệu hóa request đang bay khi hộp thoại bị đóng từ bên ngoài
      dialogGenRef.current += 1;
      activeReqGenRef.current = null;
      activeReqUserIdRef.current = null;
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      resetForm();
      document.body.style.overflow = '';
      return;
    }

    dialogGenRef.current += 1;
    resetForm();

    // Khóa cuộn trang nền khi mở modal
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus vào trường mật khẩu hiện tại
    focusTimerRef.current = setTimeout(() => {
      if (isOpenRef.current && isMountedRef.current) {
        currentPasswordInputRef.current?.focus();
      }
    }, 50);

    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, resetForm]);

  // 3. Tự động đóng và xóa dữ liệu khi đổi tài khoản đăng nhập hoặc đăng xuất
  useEffect(() => {
    if (currentUser?.id !== prevUserIdRef.current) {
      prevUserIdRef.current = currentUser?.id;
      // Tăng generation vô hiệu hóa mọi request của user cũ
      dialogGenRef.current += 1;
      activeReqGenRef.current = null;
      activeReqUserIdRef.current = null;
      resetForm();
      if (isOpen) {
        onClose();
      }
    }
  }, [currentUser?.id, isOpen, onClose, resetForm]);

  // 4. Xử lý đóng an toàn và trả focus về trigger button
  const handleClose = useCallback(() => {
    if (isSubmittingRef.current) {
      // Đang gửi request: Chặn đóng thông thường để tránh hiểu nhầm request bị hủy
      return;
    }
    // Tăng generation để vô hiệu hóa
    dialogGenRef.current += 1;
    activeReqGenRef.current = null;
    activeReqUserIdRef.current = null;
    resetForm();
    onClose();
    // Trả focus về nút "Đổi mật khẩu"
    setTimeout(() => {
      triggerRef?.current?.focus();
    }, 0);
  }, [onClose, resetForm, triggerRef]);

  // 4. Bẫy Focus (Focus Trap) và phím Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (!isSubmittingRef.current) {
          e.preventDefault();
          handleClose();
        }
        return;
      }

      if (e.key === 'Tab') {
        const dialogEl = dialogRef.current;
        if (!dialogEl) return;

        const focusableElements = dialogEl.querySelectorAll(
          'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  // 5. Kiểm tra tính hợp lệ từng trường (Validation)
  const validateField = useCallback((field, value, allValues = {}) => {
    if (field === 'currentPassword') {
      if (!value || value.length === 0) {
        return { code: 'val_current_password_required' };
      }
      if (getUtf8ByteLength(value) > 72) {
        return { code: 'val_password_max72_bytes' };
      }
    }

    if (field === 'newPassword') {
      if (!value || value.length === 0) {
        return { code: 'val_new_password_required' };
      }
      if (value.length < 8) {
        return { code: 'val_password_min8' };
      }
      if (getUtf8ByteLength(value) > 72) {
        return { code: 'val_password_max72_bytes' };
      }
      const curPass = allValues.currentPassword !== undefined ? allValues.currentPassword : currentPassword;
      if (curPass && value === curPass) {
        return { code: 'val_password_same_as_current' };
      }
    }

    if (field === 'confirmPassword') {
      if (!value || value.length === 0) {
        return { code: 'val_confirm_required' };
      }
      const targetNewPass = allValues.newPassword !== undefined ? allValues.newPassword : newPassword;
      if (value !== targetNewPass) {
        return { code: 'val_confirm_match' };
      }
    }

    return null;
  }, [currentPassword, newPassword]);

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    let val = '';
    if (field === 'currentPassword') val = currentPassword;
    if (field === 'newPassword') val = newPassword;
    if (field === 'confirmPassword') val = confirmPassword;

    const error = validateField(field, val);
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  // 6. Xử lý gửi Form
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setGeneralNotice(null);

    // Chặn gửi lần hai (Double Submit Guard bằng Ref đồng bộ)
    if (isSubmittingRef.current) return;

    // Kiểm tra toàn bộ các trường trước khi gửi
    const curErr = validateField('currentPassword', currentPassword);
    const newErr = validateField('newPassword', newPassword);
    const confErr = validateField('confirmPassword', confirmPassword);

    const newErrors = {
      currentPassword: curErr,
      newPassword: newErr,
      confirmPassword: confErr
    };

    setErrors(newErrors);
    setTouched({
      currentPassword: true,
      newPassword: true,
      confirmPassword: true
    });

    if (curErr || newErr || confErr) {
      return;
    }

    // Chế độ xem trước (Preview): Không gọi API thật
    if (isPreview) {
      setGeneralNotice({
        type: 'warning',
        code: 'account_password_preview_notice'
      });
      return;
    }

    const myGen = dialogGenRef.current;
    const reqUserId = currentUser?.id;

    isSubmittingRef.current = true;
    activeReqGenRef.current = myGen;
    activeReqUserIdRef.current = reqUserId;
    setIsSubmitting(true);

    const isStale = () => {
      return (
        !isMountedRef.current ||
        !isOpenRef.current ||
        dialogGenRef.current !== myGen ||
        currentUserRef.current?.id !== reqUserId ||
        activeReqGenRef.current !== myGen ||
        activeReqUserIdRef.current !== reqUserId
      );
    };

    try {
      // Gửi đúng 2 trường allowlist, tuyệt đối không gửi confirmPassword
      const res = await changePasswordService({
        currentPassword,
        newPassword
      });

      // Nếu người dùng đã đóng/mở lại hộp thoại hoặc tài khoản đã thay đổi: bỏ qua phản hồi cũ
      if (isStale()) {
        return;
      }

      // Xử lý Hết phiên (401 UNAUTHORIZED)
      if (res?.status === 401) {
        if (typeof handleUnauthorized === 'function') {
          handleUnauthorized(reqUserId);
        }
        resetForm();
        onClose();
        return;
      }

      // Xử lý A: Thành công bình thường (chỉ công nhận khi passwordChanged === true VÀ requiresLogin === false)
      if (res?.success === true && res?.data?.passwordChanged === true && res?.data?.requiresLogin === false) {
        resetForm();
        onClose();
        if (typeof onSuccess === 'function') {
          onSuccess(res, reqUserId);
        }
        // Trả focus về nút trigger
        setTimeout(() => {
          triggerRef?.current?.focus();
        }, 0);
        return;
      }

      // Xử lý B: Đổi mật khẩu thành công nhưng cần đăng nhập lại (chỉ công nhận khi passwordChanged === true VÀ requiresLogin === true)
      if (res?.success === true && res?.data?.passwordChanged === true && res?.data?.requiresLogin === true) {
        resetForm();
        onClose();
        if (typeof onRequiresLogin === 'function') {
          onRequiresLogin(res, reqUserId);
        }
        return;
      }

      // Hợp đồng response không hợp lệ (res.success === true nhưng thiếu/sai requiresLogin hoặc passwordChanged !== true)
      if (res?.success === true) {
        setGeneralNotice({
          type: 'warning',
          code: 'change_password_indeterminate_warning'
        });
        return;
      }

      // Xử lý C: Sai mật khẩu hiện tại
      if (res?.code === 'INCORRECT_CURRENT_PASSWORD' || res?.errors?.currentPassword) {
        setErrors((prev) => ({
          ...prev,
          currentPassword: { code: 'INCORRECT_CURRENT_PASSWORD' }
        }));
        return;
      }

      // Xử lý D: Mật khẩu mới trùng với mật khẩu hiện tại
      if (res?.code === 'PASSWORD_SAME_AS_CURRENT' || res?.errors?.newPassword) {
        setErrors((prev) => ({
          ...prev,
          newPassword: { code: 'PASSWORD_SAME_AS_CURRENT' }
        }));
        return;
      }

      // Xử lý G: Xung đột tài khoản (AUTH_CONFLICT)
      if (res?.code === 'AUTH_CONFLICT') {
        setGeneralNotice({
          type: 'danger',
          code: 'AUTH_CONFLICT'
        });
        return;
      }

      // Xử lý E: Giới hạn tần suất 429
      if (res?.status === 429 || res?.code === 'TOO_MANY_REQUESTS') {
        setGeneralNotice({
          type: 'warning',
          code: 'TOO_MANY_REQUESTS'
        });
        return;
      }

      // Xử lý E: Quyền truy cập 403
      if (res?.status === 403 || res?.code === 'FORBIDDEN_ORIGIN') {
        setGeneralNotice({
          type: 'danger',
          code: 'FORBIDDEN_ORIGIN'
        });
        return;
      }

      // Xử lý H: Lỗi mạng, timeout hoặc phản hồi không xác định
      if (res?.isNetworkError || res?.code === 'TIMEOUT' || res?.code === 'NETWORK_ERROR' || res?.code === 'INVALID_RESPONSE') {
        setGeneralNotice({
          type: 'warning',
          code: 'change_password_indeterminate_warning'
        });
        return;
      }

      // Các lỗi validation khác từ server
      if (res?.code === 'VALIDATION_ERROR' && res?.errors) {
        if (res.errors.currentPassword) {
          setErrors((prev) => ({
            ...prev,
            currentPassword: { message: res.errors.currentPassword }
          }));
        }
        if (res.errors.newPassword) {
          setErrors((prev) => ({
            ...prev,
            newPassword: { message: res.errors.newPassword }
          }));
        }
        return;
      }

      // Lỗi hệ thống chung
      setGeneralNotice({
        type: 'danger',
        code: res?.code || 'INTERNAL_SERVER_ERROR'
      });
    } catch {
      if (!isStale()) {
        setGeneralNotice({
          type: 'warning',
          code: 'change_password_indeterminate_warning'
        });
      }
    } finally {
      if (
        dialogGenRef.current === myGen &&
        activeReqGenRef.current === myGen &&
        activeReqUserIdRef.current === reqUserId
      ) {
        isSubmittingRef.current = false;
        if (isMountedRef.current) {
          setIsSubmitting(false);
        }
        activeReqGenRef.current = null;
        activeReqUserIdRef.current = null;
      }
    }
  };

  if (!isOpen) return null;

  // Tính độ mạnh mật khẩu mới (0 đến 4)
  const strengthScore = calculatePasswordStrength(newPassword);
  const getStrengthLabel = (score) => {
    switch (score) {
      case 1: return t('strength_weak');
      case 2: return t('strength_medium');
      case 3: return t('strength_good');
      case 4: return t('strength_strong');
      default: return '';
    }
  };
  const strengthLabel = getStrengthLabel(strengthScore);

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        // Chỉ đóng khi click trực tiếp vào vùng nền backdrop ngoài dialog
        if (e.target === e.currentTarget && !isSubmitting) {
          handleClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        aria-describedby="change-password-session-notice"
        className="dialog-container change-password-dialog"
      >
        {/* Thanh gradient trên cùng */}
        <div className="dialog-glow-bar" aria-hidden="true" />

        {/* Tiêu đề và nút đóng */}
        <div className="dialog-header">
          <div className="dialog-title-wrapper">
            <span className="dialog-header-icon" aria-hidden="true">
              <LockIcon />
            </span>
            <h2 id="change-password-title" className="dialog-title">
              {t('dialog_change_password_title')}
            </h2>
          </div>
          <button
            type="button"
            className="dialog-close-btn"
            onClick={handleClose}
            disabled={isSubmitting}
            aria-label={t('dialog_close')}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Thông báo chung (nếu có lỗi hệ thống / mạng / timeout) */}
        {generalNotice && (
          <div className={`au-alert au-alert-${generalNotice.type} dialog-alert`} role="alert">
            <span className="au-input-icon" style={{ position: 'static' }}>
              <AlertCircleIcon />
            </span>
            <span style={{ flex: 1 }}>{getErrorMessage(generalNotice, t)}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="dialog-form" noValidate>
          {/* 1. Mật khẩu hiện tại */}
          <div className="form-group dialog-form-group">
            <label htmlFor="current-password-input" className="form-label">
              {t('field_current_password')} <span className="au-required">*</span>
            </label>
            <div className="dialog-input-wrapper">
              <input
                ref={currentPasswordInputRef}
                id="current-password-input"
                name="currentPassword"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (touched.currentPassword) {
                    setErrors((prev) => ({
                      ...prev,
                      currentPassword: validateField('currentPassword', e.target.value)
                    }));
                  }
                }}
                onBlur={() => handleBlur('currentPassword')}
                disabled={isSubmitting}
                className={`form-control ${errors.currentPassword ? 'is-invalid' : ''}`}
                placeholder={t('field_current_password_placeholder')}
                autoComplete="current-password"
                aria-invalid={Boolean(errors.currentPassword)}
                aria-describedby={errors.currentPassword ? 'current-password-error' : undefined}
              />
              <button
                type="button"
                className="dialog-eye-btn"
                onClick={() => setShowCurrent((prev) => !prev)}
                aria-label={showCurrent ? t('hide_current_password') : t('show_current_password')}
                aria-pressed={showCurrent}
                tabIndex={0}
              >
                {showCurrent ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>
            {errors.currentPassword && (
              <span id="current-password-error" className="field-error-text" role="alert">
                ⚠️ {getErrorMessage(errors.currentPassword, t)}
              </span>
            )}
          </div>

          {/* 2. Mật khẩu mới */}
          <div className="form-group dialog-form-group">
            <label htmlFor="new-password-input" className="form-label">
              {t('field_new_password')} <span className="au-required">*</span>
            </label>
            <div className="dialog-input-wrapper">
              <input
                id="new-password-input"
                name="newPassword"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewPassword(val);
                  if (touched.newPassword) {
                    setErrors((prev) => ({
                      ...prev,
                      newPassword: validateField('newPassword', val)
                    }));
                  }
                  if (touched.confirmPassword && confirmPassword) {
                    setErrors((prev) => ({
                      ...prev,
                      confirmPassword: validateField('confirmPassword', confirmPassword, { newPassword: val })
                    }));
                  }
                }}
                onBlur={() => handleBlur('newPassword')}
                disabled={isSubmitting}
                className={`form-control ${errors.newPassword ? 'is-invalid' : ''}`}
                placeholder={t('field_new_password_placeholder')}
                autoComplete="new-password"
                aria-invalid={Boolean(errors.newPassword)}
                aria-describedby={errors.newPassword ? 'new-password-error' : undefined}
              />
              <button
                type="button"
                className="dialog-eye-btn"
                onClick={() => setShowNew((prev) => !prev)}
                aria-label={showNew ? t('hide_new_password') : t('show_new_password')}
                aria-pressed={showNew}
                tabIndex={0}
              >
                {showNew ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>
            {errors.newPassword && (
              <span id="new-password-error" className="field-error-text" role="alert">
                ⚠️ {getErrorMessage(errors.newPassword, t)}
              </span>
            )}

            {/* Thanh đo độ mạnh mật khẩu mới */}
            <div className="dialog-strength-container">
              <div className="dialog-strength-header">
                <span className="strength-caption">{t('strength_label')}</span>
                {strengthLabel && (
                  <span className={`strength-badge strength-${strengthScore}`}>
                    {strengthLabel}
                  </span>
                )}
              </div>
              <div
                className="dialog-strength-meter"
                role="meter"
                aria-valuenow={strengthScore}
                aria-valuemin="0"
                aria-valuemax="4"
                aria-valuetext={strengthLabel || t('strength_weak')}
              >
                <div
                  className={`dialog-strength-bar strength-bar-${strengthScore}`}
                  style={{ width: `${(strengthScore / 4) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* 3. Xác nhận mật khẩu mới */}
          <div className="form-group dialog-form-group">
            <label htmlFor="confirm-password-input" className="form-label">
              {t('field_confirm_password')} <span className="au-required">*</span>
            </label>
            <div className="dialog-input-wrapper">
              <input
                id="confirm-password-input"
                name="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  const val = e.target.value;
                  setConfirmPassword(val);
                  if (touched.confirmPassword) {
                    setErrors((prev) => ({
                      ...prev,
                      confirmPassword: validateField('confirmPassword', val)
                    }));
                  }
                }}
                onBlur={() => handleBlur('confirmPassword')}
                disabled={isSubmitting}
                className={`form-control ${errors.confirmPassword ? 'is-invalid' : ''}`}
                placeholder={t('field_confirm_password_placeholder')}
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
              />
              <button
                type="button"
                className="dialog-eye-btn"
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label={showConfirm ? t('hide_confirm_password') : t('show_confirm_password')}
                aria-pressed={showConfirm}
                tabIndex={0}
              >
                {showConfirm ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>
            {errors.confirmPassword && (
              <span id="confirm-password-error" className="field-error-text" role="alert">
                ⚠️ {getErrorMessage(errors.confirmPassword, t)}
              </span>
            )}
          </div>

          {/* Dòng ghi chú bảo mật bắt buộc */}
          <p id="change-password-session-notice" className="dialog-session-notice">
            ℹ️ {t('change_password_session_notice')}
          </p>

          {/* Khối nút thao tác: Hủy và Đổi mật khẩu */}
          <div className="dialog-actions">
            <button
              type="button"
              className="btn btn-outline dialog-btn-cancel"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {t('btn_cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary dialog-btn-submit"
              disabled={isSubmitting || (isPreview && false)}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner-mini" aria-hidden="true" />
                  <span>{t('btn_submitting_change_password')}</span>
                </>
              ) : (
                <span>{t('btn_submit_change_password')}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
