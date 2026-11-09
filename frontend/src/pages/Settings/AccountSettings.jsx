import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { useLanguage, getDeviceDisplayName, getErrorMessage } from '../../context/LanguageContext.jsx';
import { deviceRegistry } from '../../modules/registry.js';
import { updateProfileService } from '../../services/accountService.js';
import { isPreviewMode } from '../../services/authService.js';
import { getDeviceIcon, LockIcon } from '../../shared/components/AuthIcons.jsx';
import ChangePasswordDialog from './ChangePasswordDialog.jsx';

/**
 * Tạo chữ cái đại diện (Avatar Initials) từ họ tên với hỗ trợ Unicode đầy đủ
 */
export function getAvatarInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return Array.from(parts[0])[0].toUpperCase();
  }
  const lastPart = parts[parts.length - 1];
  return Array.from(lastPart)[0].toUpperCase();
}

/**
 * Kiểm tra tính hợp lệ của họ và tên phía client
 */
export function validateAccountName(nameStr) {
  if (!nameStr || typeof nameStr !== 'string' || nameStr.trim().length === 0) {
    return 'val_fullname_required';
  }
  const trimmed = nameStr.trim();
  if (trimmed.length < 2) {
    return 'val_fullname_min2';
  }
  if (trimmed.length > 100) {
    return 'val_fullname_max100';
  }
  return null;
}

export default function AccountSettings() {
  const { currentUser, updateProfileUser, handleUnauthorized } = useAuthContext();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const isPreview = isPreviewMode();

  const [draftName, setDraftName] = useState(currentUser?.name || '');
  const [validationError, setValidationError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = useState(null);

  // Trạng thái cho tính năng Đổi mật khẩu
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordSuccessNotice, setPasswordSuccessNotice] = useState(null);
  const changePasswordBtnRef = useRef(null);

  const prevUserIdRef = useRef(currentUser?.id);
  const accountGenRef = useRef(0);
  const inFlightNameRef = useRef(null);
  const queuedDraftRef = useRef(null);
  const draftNameRef = useRef(draftName);
  draftNameRef.current = draftName;
  const lastConfirmedNameRef = useRef(currentUser?.name || '');
  const currentUserIdRef = useRef(currentUser?.id);
  currentUserIdRef.current = currentUser?.id;

  // 1. Đồng bộ khi tài khoản thay đổi (đổi tài khoản, đăng xuất/đăng nhập lại)
  useEffect(() => {
    if (currentUser?.id !== prevUserIdRef.current) {
      prevUserIdRef.current = currentUser?.id;
      accountGenRef.current += 1;
      inFlightNameRef.current = null;
      queuedDraftRef.current = null;
      lastConfirmedNameRef.current = currentUser?.name || '';
      setDraftName(currentUser?.name || '');
      setValidationError(null);
      setSaveStatus('idle');
      setSaveError(null);
      setIsPasswordDialogOpen(false);
      setPasswordSuccessNotice(null);
    } else if (currentUser?.name) {
      lastConfirmedNameRef.current = currentUser.name;
    }
  }, [currentUser?.id, currentUser?.name]);

  // Xử lý khi đổi mật khẩu thành công bình thường
  const handlePasswordSuccess = useCallback((res, targetUserId) => {
    if (!targetUserId || targetUserId !== currentUserIdRef.current) return;
    setPasswordSuccessNotice('account_password_changed_success');
  }, []);

  // Xử lý khi đổi mật khẩu thành công nhưng cần đăng nhập lại
  const handlePasswordRequiresLogin = useCallback((res, targetUserId) => {
    if (!targetUserId || targetUserId !== currentUserIdRef.current) return;
    if (typeof handleUnauthorized === 'function') {
      handleUnauthorized(targetUserId);
    }
    navigate('/login', {
      state: {
        noticeCode: 'PASSWORD_CHANGED_RELOGIN_REQUIRED',
        noticeType: 'success'
      },
      replace: true
    });
  }, [handleUnauthorized, navigate]);

  // Lấy tên đích hiện tại: ưu tiên draft đang xếp hàng -> draft đang bay -> tên đã xác nhận
  const getCurrentTargetName = useCallback(() => {
    if (queuedDraftRef.current !== null) {
      return queuedDraftRef.current;
    }
    if (inFlightNameRef.current !== null) {
      return inFlightNameRef.current;
    }
    return lastConfirmedNameRef.current;
  }, []);

  const executeSaveRef = useRef(null);

  // 2. Hàm thực thi lưu tên lên server
  const executeSave = useCallback(async (nameToSave) => {
    if (isPreview) return;

    const trimmed = (nameToSave !== undefined ? nameToSave : draftNameRef.current).trim();

    // So sánh với target hiện tại: nếu trùng target (đang bay hoặc chờ), không gửi/xếp hàng thừa
    const currentTarget = getCurrentTargetName();
    if (trimmed === currentTarget) {
      setValidationError(null);
      setSaveStatus((prev) => (prev === 'error' ? 'idle' : prev));
      setSaveError(null);
      return;
    }

    // Kiểm tra tính hợp lệ
    const valErr = validateAccountName(trimmed);
    if (valErr) {
      setValidationError(valErr);
      return;
    }
    setValidationError(null);

    // Nếu đang có request bay: xếp draft mới nhất vào hàng đợi (thay thế draft cũ nếu có)
    if (inFlightNameRef.current !== null) {
      queuedDraftRef.current = trimmed;
      return;
    }

    const myGen = accountGenRef.current;
    const reqUserId = currentUserIdRef.current;

    inFlightNameRef.current = trimmed;
    queuedDraftRef.current = null;
    setSaveStatus('saving');
    setSaveError(null);

    try {
      const res = await updateProfileService({ name: trimmed });

      // Nếu tài khoản hoặc generation đã đổi trong lúc chờ phản hồi: bỏ qua
      if (accountGenRef.current !== myGen || currentUserIdRef.current !== reqUserId) {
        return;
      }

      inFlightNameRef.current = null;

      // Xử lý 401 Unauthorized
      if (res.status === 401) {
        queuedDraftRef.current = null;
        setSaveStatus('error');
        setSaveError('UNAUTHORIZED');
        if (typeof handleUnauthorized === 'function') {
          handleUnauthorized(reqUserId);
        }
        return;
      }

      if (res.success && res.data?.user?.name) {
        const confirmedName = res.data.user.name;
        lastConfirmedNameRef.current = confirmedName;

        // Cập nhật an toàn vào AuthContext mà không làm ảnh hưởng SettingsContext
        if (typeof updateProfileUser === 'function') {
          updateProfileUser(res.data.user, reqUserId);
        }

        // Nếu trong lúc chờ gửi có một draft mới hơn đã xếp hàng:
        if (queuedDraftRef.current !== null) {
          const nextDraft = queuedDraftRef.current;
          queuedDraftRef.current = null;
          if (nextDraft !== confirmedName) {
            executeSaveRef.current?.(nextDraft);
            return;
          }
        }

        // Chỉ hiển thị 'saved' nếu bản nháp hiện tại của input khớp với tên vừa được xác nhận
        if (draftNameRef.current.trim() === confirmedName) {
          setSaveStatus('saved');
        } else {
          setSaveStatus('idle');
        }
        setSaveError(null);
      } else {
        queuedDraftRef.current = null;
        setSaveStatus('error');
        setSaveError(res.code || 'SAVE_ERROR');
        if (res.errors?.name) {
          setValidationError(res.errors.name);
        }
      }
    } catch {
      if (accountGenRef.current !== myGen || currentUserIdRef.current !== reqUserId) {
        return;
      }
      inFlightNameRef.current = null;
      queuedDraftRef.current = null;
      setSaveStatus('error');
      setSaveError('NETWORK_ERROR');
    }
  }, [isPreview, getCurrentTargetName, handleUnauthorized, updateProfileUser]);

  executeSaveRef.current = executeSave;

  const isBlurringFromEnterRef = useRef(false);

  // 3. Xử lý khi rời trường (Blur)
  const handleBlur = () => {
    if (isBlurringFromEnterRef.current) return;
    executeSave(draftNameRef.current);
  };

  // 4. Xử lý khi nhấn phím Enter (xác nhận và blur mà không gửi 2 request)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      isBlurringFromEnterRef.current = true;
      executeSave(draftNameRef.current);
      if (typeof e.target?.blur === 'function') {
        e.target.blur();
      }
      setTimeout(() => {
        isBlurringFromEnterRef.current = false;
      }, 100);
    }
  };

  // 5. Thử lại khi lưu thất bại
  const handleRetry = () => {
    queuedDraftRef.current = null;
    executeSave(draftNameRef.current);
  };

  const getRoleLabel = (role) => {
    if (role === 'admin') return t('user_role_admin');
    if (role === 'member') return t('user_role_member');
    return t('user_role_viewer');
  };

  const ownedDevices = Array.isArray(currentUser?.owned) ? currentUser.owned : [];

  return (
    <div className="settings-section account-settings-page">
      <div className="settings-section-header">
        <h2 className="settings-section-title">{t('account_title')}</h2>
        <p className="settings-section-subtitle">{t('account_subtitle')}</p>
      </div>

      {isPreview && (
        <div className="alert alert-info account-preview-notice" role="status">
          ℹ️ {t('account_preview_notice')}
        </div>
      )}

      {/* A. Khối nhận diện (Identity Card) */}
      <div className="account-card account-identity-card">
        <div className="account-avatar-wrapper">
          <div className="account-avatar" aria-hidden="true">
            {getAvatarInitials(currentUser?.name)}
          </div>
        </div>
        <div className="account-identity-details">
          <h3 className="account-identity-name">{currentUser?.name || '---'}</h3>
          <p className="account-identity-email">{currentUser?.email || '---'}</p>
          <div className="account-identity-badges">
            <span className={`role-badge role-${currentUser?.role || 'viewer'}`}>
              {getRoleLabel(currentUser?.role)}
            </span>
          </div>
        </div>
      </div>

      {/* B. Thông tin cá nhân (Personal Information) */}
      <div className="account-card account-personal-info-card">
        <h3 className="account-card-title">{t('account_personal_info')}</h3>

        <div className="account-form-grid">
          {/* Trường Họ và tên: cho phép chỉnh sửa */}
          <div className="form-group account-field-name">
            <label htmlFor="account-fullname-input" className="form-label">
              {t('account_fullname_label')}
            </label>
            <div className="input-with-status">
              <input
                id="account-fullname-input"
                type="text"
                className={`form-control ${validationError ? 'is-invalid' : ''}`}
                value={draftName}
                placeholder={t('account_fullname_placeholder')}
                disabled={isPreview}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  queuedDraftRef.current = null;
                  if (validationError) {
                    setValidationError(null);
                  }
                  if (saveStatus === 'saved') {
                    setSaveStatus('idle');
                  }
                }}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                maxLength={100}
              />
            </div>

            {/* Thông báo lỗi validation ngay dưới trường */}
            {validationError && (
              <div className="field-error-message" role="alert">
                ⚠️ {getErrorMessage(validationError, t)}
              </div>
            )}

            {/* Trạng thái lưu riêng cho hồ sơ */}
            <div className="account-save-status" aria-live="polite">
              {saveStatus === 'saving' && (
                <span className="status-badge status-saving">
                  <span className="spinner-mini" aria-hidden="true"></span>
                  {t('account_status_saving')}
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="status-badge status-saved">
                  ✓ {t('account_status_saved')}
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="status-badge status-error" role="alert">
                  <span>⚠️ {t('account_status_error')}</span>
                  {saveError && saveError !== 'SAVE_ERROR' && (
                    <small className="error-code-hint">({getErrorMessage(saveError, t)})</small>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline btn-xs btn-retry-account"
                    onClick={handleRetry}
                  >
                    {t('account_btn_retry')}
                  </button>
                </span>
              )}
            </div>
          </div>

          {/* Trường Email: chỉ đọc */}
          <div className="form-group account-field-email">
            <div className="label-with-badge">
              <label htmlFor="account-email-input" className="form-label">
                {t('account_email_label')}
              </label>
              <span className="badge-readonly">{t('account_readonly_badge')}</span>
            </div>
            <input
              id="account-email-input"
              type="email"
              className="form-control field-readonly"
              value={currentUser?.email || ''}
              readOnly
            />
            <small className="field-caption">{t('account_email_caption')}</small>
          </div>
        </div>
      </div>

      {/* C. Bảo mật và Mật khẩu (Password Card) */}
      <div className="account-card account-password-card">
        <h3 className="account-card-title">{t('account_password_card_title')}</h3>
        <div className="account-password-content">
          <p className="account-password-desc">{t('account_password_card_desc')}</p>
          <button
            ref={changePasswordBtnRef}
            type="button"
            className="btn btn-outline account-btn-change-password"
            onClick={() => {
              setPasswordSuccessNotice(null);
              setIsPasswordDialogOpen(true);
            }}
          >
            <LockIcon className="btn-icon" aria-hidden="true" />
            <span>{t('account_btn_change_password')}</span>
          </button>
        </div>

        {/* Thông báo thành công sau khi đóng hộp thoại */}
        {passwordSuccessNotice && (
          <div className="account-password-success-alert" role="status" aria-live="polite">
            <span>✓ {getErrorMessage(passwordSuccessNotice, t)}</span>
            <button
              type="button"
              className="alert-close-btn"
              onClick={() => setPasswordSuccessNotice(null)}
              aria-label={t('close_notice') || 'Đóng'}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* D. Quyền hạn và phân công (Permissions & Assignments) */}
      <div className="account-card account-assignments-card">
        <h3 className="account-card-title">{t('account_permissions_title')}</h3>

        <div className="account-role-info">
          <span className="account-role-label">{t('account_role_label')}:</span>
          <strong className="account-role-value">{getRoleLabel(currentUser?.role)}</strong>
        </div>

        <div className="account-devices-section">
          <h4 className="account-devices-title">{t('account_assigned_devices')}</h4>

          {ownedDevices.length === 0 ? (
            <p className="account-no-devices">{t('account_no_devices')}</p>
          ) : (
            <div className="account-device-list">
              {ownedDevices.map((devId) => {
                const dev = deviceRegistry.find((d) => d.id === devId);
                if (dev) {
                  return (
                    <div key={devId} className="account-device-item">
                      <span className="account-dev-icon" aria-hidden="true">
                        {getDeviceIcon(dev.id)}
                      </span>
                      <div className="account-dev-details">
                        <span className="account-dev-name">{getDeviceDisplayName(dev.id, t, dev.name)}</span>
                        <span className="account-dev-id">ID: {dev.id}</span>
                      </div>
                      <Link to={dev.path} className="account-dev-link btn btn-outline btn-xs">
                        {t('account_device_view')}
                      </Link>
                    </div>
                  );
                }
                return (
                  <div key={devId} className="account-device-item fallback-item">
                    <span className="account-dev-icon" aria-hidden="true">
                      ⚙️
                    </span>
                    <div className="account-dev-details">
                      <span className="account-dev-name">{t('account_unrecognized_device')}</span>
                      <span className="account-dev-id">ID: {devId}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Hộp thoại Đổi mật khẩu */}
      <ChangePasswordDialog
        isOpen={isPasswordDialogOpen}
        onClose={() => setIsPasswordDialogOpen(false)}
        onSuccess={handlePasswordSuccess}
        onRequiresLogin={handlePasswordRequiresLogin}
        isPreview={isPreview}
        triggerRef={changePasswordBtnRef}
      />
    </div>
  );
}
