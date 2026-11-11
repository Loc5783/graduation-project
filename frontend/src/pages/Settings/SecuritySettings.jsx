import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage, getErrorMessage } from '../../context/LanguageContext.jsx';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import {
  getSessionsService,
  revokeSessionService,
  logoutAllSessionsService
} from '../../services/accountService.js';
import { isPreviewMode, getSecurityStatusService } from '../../services/authService.js';
import { formatDateTime } from '../../shared/dateTimeFormatter.js';
import { CloseIcon, AlertCircleIcon } from '../../shared/components/AuthIcons.jsx';

/**
 * Biểu tượng thiết bị SVG tương ứng theo nhãn thiết bị
 */
function DeviceIcon({ deviceLabel }) {
  const label = (deviceLabel || '').toLowerCase();

  // Mobile / Smartphone
  if (label.includes('mobile') || label.includes('iphone') || label.includes('android') || label.includes('phone')) {
    return (
      <svg className="device-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
        <line x1="12" x2="12.01" y1="18" y2="18" />
      </svg>
    );
  }

  // Tablet / iPad
  if (label.includes('tablet') || label.includes('ipad')) {
    return (
      <svg className="device-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
        <line x1="12" x2="12.01" y1="18" y2="18" />
      </svg>
    );
  }

  // Desktop / PC / Laptop
  if (label.includes('desktop') || label.includes('windows') || label.includes('mac') || label.includes('linux') || label.includes('pc')) {
    return (
      <svg className="device-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="20" height="14" x="2" y="3" rx="2" />
        <line x1="8" x2="16" y1="21" y2="21" />
        <line x1="12" x2="12.01" y1="17" y2="21" />
      </svg>
    );
  }

  // Thiết bị chung / không xác định
  return (
    <svg className="device-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

/**
 * Biểu tượng quay làm mới
 */
function RefreshIcon({ isSpinning }) {
  return (
    <svg className={`btn-icon ${isSpinning ? 'spinner-rotate' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

/**
 * Component Quản lý Bảo mật & Phiên đăng nhập thật (Route: /settings/security)
 */
export default function SecuritySettings() {
  const { t, lang } = useLanguage();
  const { currentUser, handleUnauthorized } = useAuthContext();
  const { currentSettings } = useSettings();
  const navigate = useNavigate();

  // Dữ liệu danh sách phiên
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null); // { type: 'success' | 'warning' | 'danger', key?: string, text?: string }
  const [mfaEnabled, setMfaEnabled] = useState(null);
  const [mfaLoadError, setMfaLoadError] = useState(false);
  const [mfaReloadKey, setMfaReloadKey] = useState(0);
  const mfaUserIdRef = useRef(currentUser?.id);
  mfaUserIdRef.current = currentUser?.id;

  useEffect(() => {
    setMfaEnabled(null);
    setMfaLoadError(false);
    if (!currentUser?.id || isPreviewMode()) return;
    const userId = currentUser.id;
    let cancelled = false;
    getSecurityStatusService().then((result) => {
      if (cancelled || mfaUserIdRef.current !== userId) return;
      if (result.success && typeof result.data?.mfaEnabled === 'boolean') setMfaEnabled(result.data.mfaEnabled);
      else setMfaLoadError(true);
    });
    return () => { cancelled = true; };
  }, [currentUser?.id, mfaReloadKey]);

  // Hộp thoại xác nhận thu hồi một phiên
  const [revokingSession, setRevokingSession] = useState(null);
  const [isSubmittingRevoke, setIsSubmittingRevoke] = useState(false);
  const revokeTriggerRef = useRef(null);

  // Hộp thoại xác nhận đăng xuất mọi nơi
  const [isLogoutAllDialogOpen, setIsLogoutAllDialogOpen] = useState(false);
  const [isSubmittingLogoutAll, setIsSubmittingLogoutAll] = useState(false);
  const logoutAllTriggerRef = useRef(null);

  // 1. Ngữ cảnh tài khoản (Account Epoch): Tăng mỗi khi tài khoản thay đổi
  const accountEpochRef = useRef(0);
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const prevUserIdRef = useRef(currentUser?.id);

  // 2. Thứ tự nạp danh sách (List Fetch Sequence): Độc lập với các thao tác thay đổi phiên
  const listFetchSeqRef = useRef(0);

  // 3. Khóa và định danh thao tác thay đổi phiên (Action Mutation): Đơn nhiệm, khóa đồng bộ
  const actionSeqRef = useRef(0);
  const activeMutationLockRef = useRef(null);
  const isActionInProgressRef = useRef(false);

  // 4. Tập hợp các ID phiên đã thu hồi ở client trong epoch này (ngăn stale GET phục hồi)
  const locallyRevokedIdsRef = useRef(new Set());

  // 5. Tham chiếu ngôn ngữ tRef để các hàm nghiệp vụ bất đồng bộ không phụ thuộc `t`
  const tRef = useRef(t);
  tRef.current = t;

  // 6. Refs điều khiển Focus Trap cho Modals
  const revokeModalRef = useRef(null);
  const logoutAllModalRef = useRef(null);
  const revokeCancelBtnRef = useRef(null);
  const logoutAllCancelBtnRef = useRef(null);

  // 7. Vòng đời unmount bảo vệ component
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Định dạng mốc thời gian an toàn theo cấu hình người dùng (Settings)
   */
  const formatDateTimeSafe = useCallback((dateInput) => {
    if (!dateInput) return '';
    try {
      const formatted = formatDateTime(dateInput, {
        timeZone: currentSettings?.timeZone,
        dateFormat: currentSettings?.dateFormat,
        hourFormat: currentSettings?.hourFormat,
        locale: lang
      });
      return formatted || '';
    } catch {
      return '';
    }
  }, [currentSettings, lang]);

  /**
   * Nạp danh sách phiên từ máy chủ (GET /api/account/sessions)
   * Độc lập với thao tác mutation, có sequence và epoch riêng.
   */
  const loadSessions = useCallback(async (isSilent = false) => {
    if (isPreviewMode()) {
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const fetchEpoch = accountEpochRef.current;
    const fetchUserId = currentUserRef.current?.id;
    const fetchSeq = ++listFetchSeqRef.current;

    if (!isSilent) {
      setIsLoading(true);
      setLoadError(null);
    } else {
      setIsRefreshing(true);
    }

    try {
      const res = await getSessionsService();

      // Guard 1: Kiểm tra unmount hoặc đổi tài khoản / epoch
      if (!isMountedRef.current) return;
      if (accountEpochRef.current !== fetchEpoch || currentUserRef.current?.id !== fetchUserId) return;

      // Guard 2: Chỉ lượt fetch mới nhất trong epoch này mới được cập nhật state
      if (listFetchSeqRef.current !== fetchSeq) return;

      // Guard 3: Xử lý 401 Unauthorized
      if (res.status === 401) {
        if (typeof handleUnauthorized === 'function') {
          handleUnauthorized(fetchUserId);
        }
        navigate('/login', { replace: true });
        return;
      }

      // Guard 4: Xử lý phản hồi thành công theo đúng hợp đồng API
      if (res.success && res.data && Array.isArray(res.data.sessions)) {
        // Lọc bỏ các phiên đã thu hồi ở client trong epoch này (Anti-resurrection)
        const validSessions = res.data.sessions.filter(
          (s) => !locallyRevokedIdsRef.current.has(s.id)
        );
        setSessions(validSessions);
        setLoadError(null);
      } else {
        const errorMsg = res.message || tRef.current('security_load_error');
        if (isSilent) {
          setNotice({ type: 'warning', key: 'security_refresh_error', text: tRef.current('security_refresh_error') });
        } else {
          setLoadError(errorMsg);
        }
      }
    } catch {
      if (!isMountedRef.current) return;
      if (accountEpochRef.current !== fetchEpoch || currentUserRef.current?.id !== fetchUserId) return;
      if (listFetchSeqRef.current !== fetchSeq) return;

      if (isSilent) {
        setNotice({ type: 'warning', key: 'security_refresh_error', text: tRef.current('security_refresh_error') });
      } else {
        setLoadError(tRef.current('security_network_error'));
      }
    } finally {
      if (isMountedRef.current && accountEpochRef.current === fetchEpoch) {
        if (listFetchSeqRef.current === fetchSeq) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }
  }, [handleUnauthorized, navigate]);

  // Nạp dữ liệu lần đầu hoặc khi tài khoản thay đổi (User context switch)
  useEffect(() => {
    const isUserChanged = currentUser?.id !== prevUserIdRef.current;
    if (isUserChanged) {
      prevUserIdRef.current = currentUser?.id;
      accountEpochRef.current += 1;
      listFetchSeqRef.current += 1;

      // Khởi tạo sạch toàn bộ trạng thái UI và lock của tài khoản cũ
      locallyRevokedIdsRef.current.clear();
      isActionInProgressRef.current = false;
      activeMutationLockRef.current = null;
      setRevokingSession(null);
      setIsSubmittingRevoke(false);
      setIsLogoutAllDialogOpen(false);
      setIsSubmittingLogoutAll(false);
      setIsRefreshing(false);
      setNotice(null);
      setLoadError(null);
      setSessions([]);
    }

    if (currentUser?.id && !isPreviewMode()) {
      loadSessions(false);
    } else {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentUser?.id, loadSessions]);

  /**
   * Mở hộp thoại xác nhận thu hồi phiên
   */
  const handleOpenRevokeDialog = useCallback((session, e) => {
    if (isActionInProgressRef.current) return;
    setNotice(null);
    revokeTriggerRef.current = e?.currentTarget || null;
    setRevokingSession(session);
  }, []);

  /**
   * Đóng hộp thoại xác nhận thu hồi phiên
   */
  const handleCloseRevokeDialog = useCallback(() => {
    if (isSubmittingRevoke) return;
    setRevokingSession(null);
    if (revokeTriggerRef.current && typeof revokeTriggerRef.current.focus === 'function') {
      revokeTriggerRef.current.focus();
    }
  }, [isSubmittingRevoke]);

  /**
   * Thực hiện gọi API thu hồi phiên cụ thể (DELETE /api/account/sessions/:sessionId)
   */
  const handleConfirmRevoke = useCallback(async () => {
    if (!revokingSession || !revokingSession.id) return;
    if (isActionInProgressRef.current) return;

    // Khóa đồng bộ chống double click trước khi state React cập nhật
    isActionInProgressRef.current = true;
    const actionEpoch = accountEpochRef.current;
    const actionUserId = currentUserRef.current?.id;
    const actionId = ++actionSeqRef.current;
    activeMutationLockRef.current = actionId;

    const targetSessionId = revokingSession.id;
    const isTargetCurrent = Boolean(revokingSession.isCurrent);

    setIsSubmittingRevoke(true);
    setNotice(null);

    try {
      const res = await revokeSessionService(targetSessionId);

      // Guard 1: Kiểm tra unmount hoặc đổi tài khoản
      if (!isMountedRef.current) return;
      if (accountEpochRef.current !== actionEpoch || currentUserRef.current?.id !== actionUserId) return;
      if (activeMutationLockRef.current !== actionId) return;

      // Guard 2: Xử lý 401
      if (res.status === 401) {
        if (typeof handleUnauthorized === 'function') {
          handleUnauthorized(actionUserId);
        }
        navigate('/login', { replace: true });
        return;
      }

      // Guard 3: Xử lý 404 (Phiên không còn hoạt động hoặc đã bị thu hồi trước đó)
      if (res.status === 404) {
        locallyRevokedIdsRef.current.add(targetSessionId);
        setRevokingSession(null);
        setNotice({
          type: 'warning',
          key: 'security_session_already_revoked',
          text: tRef.current('security_session_already_revoked')
        });
        loadSessions(true);
        return;
      }

      // Guard 4: Kiểm tra hợp đồng API nghiêm ngặt:
      // success === true, status 200, revoked === true (boolean), sessionId khớp target, requiresLogin là boolean
      const isHttpSuccess = (res.status === 200 || res.status === undefined);
      const isContractValid = Boolean(
        res &&
        res.success === true &&
        isHttpSuccess &&
        res.data &&
        res.data.revoked === true &&
        res.data.sessionId === targetSessionId &&
        typeof res.data.requiresLogin === 'boolean'
      );

      // Tính nhất quán giữa phiên được chọn và cờ requiresLogin
      const isConsistent = isContractValid && (
        isTargetCurrent ? res.data.requiresLogin === true : res.data.requiresLogin === false
      );

      if (isConsistent) {
        locallyRevokedIdsRef.current.add(targetSessionId);
        setRevokingSession(null);

        if (res.data.requiresLogin) {
          // Thu hồi chính phiên hiện tại: dọn dẹp client và chuyển hướng về login
          if (typeof handleUnauthorized === 'function') {
            handleUnauthorized(actionUserId);
          }
          navigate('/login', {
            replace: true,
            state: { notice: tRef.current('security_revoke_success') }
          });
          return;
        }

        // Thu hồi phiên khác thành công: loại bỏ phiên khỏi UI ngay lập tức
        setSessions((prev) => prev.filter((s) => s.id !== targetSessionId));
        setNotice({
          type: 'success',
          key: 'security_revoke_success',
          text: tRef.current('security_revoke_success')
        });

        // Đồng bộ lại với máy chủ
        loadSessions(true);
      } else {
        // Phản hồi sai hợp đồng hoặc kết quả không xác định (indeterminate)
        // Tuyệt đối không báo thành công, không xóa phiên, không tự logout
        setRevokingSession(null);
        setNotice({
          type: 'warning',
          key: 'security_indeterminate_result',
          text: res?.message || tRef.current('security_indeterminate_result')
        });
      }
    } catch {
      if (!isMountedRef.current) return;
      if (accountEpochRef.current !== actionEpoch || currentUserRef.current?.id !== actionUserId) return;
      if (activeMutationLockRef.current !== actionId) return;

      setRevokingSession(null);
      setNotice({
        type: 'danger',
        key: 'security_network_error',
        text: tRef.current('security_network_error')
      });
    } finally {
      // Chỉ giải phóng lock nếu chính action này sở hữu lock trong epoch này
      if (accountEpochRef.current === actionEpoch && activeMutationLockRef.current === actionId) {
        isActionInProgressRef.current = false;
        activeMutationLockRef.current = null;
        if (isMountedRef.current) {
          setIsSubmittingRevoke(false);
        }
      }
    }
  }, [handleUnauthorized, loadSessions, navigate, revokingSession]);

  /**
   * Mở hộp thoại xác nhận đăng xuất mọi nơi
   */
  const handleOpenLogoutAllDialog = useCallback((e) => {
    if (isActionInProgressRef.current) return;
    setNotice(null);
    logoutAllTriggerRef.current = e?.currentTarget || null;
    setIsLogoutAllDialogOpen(true);
  }, []);

  /**
   * Đóng hộp thoại xác nhận đăng xuất mọi nơi
   */
  const handleCloseLogoutAllDialog = useCallback(() => {
    if (isSubmittingLogoutAll) return;
    setIsLogoutAllDialogOpen(false);
    if (logoutAllTriggerRef.current && typeof logoutAllTriggerRef.current.focus === 'function') {
      logoutAllTriggerRef.current.focus();
    }
  }, [isSubmittingLogoutAll]);

  /**
   * Thực hiện gọi API đăng xuất mọi nơi (POST /api/account/logout-all)
   */
  const handleConfirmLogoutAll = useCallback(async () => {
    if (isActionInProgressRef.current) return;

    // Khóa đồng bộ chống double click
    isActionInProgressRef.current = true;
    const actionEpoch = accountEpochRef.current;
    const actionUserId = currentUserRef.current?.id;
    const actionId = ++actionSeqRef.current;
    activeMutationLockRef.current = actionId;

    setIsSubmittingLogoutAll(true);
    setNotice(null);

    try {
      const res = await logoutAllSessionsService();

      // Guard 1: Kiểm tra unmount hoặc đổi tài khoản
      if (!isMountedRef.current) return;
      if (accountEpochRef.current !== actionEpoch || currentUserRef.current?.id !== actionUserId) return;
      if (activeMutationLockRef.current !== actionId) return;

      // Guard 2: Xử lý 401
      if (res.status === 401) {
        if (typeof handleUnauthorized === 'function') {
          handleUnauthorized(actionUserId);
        }
        navigate('/login', { replace: true });
        return;
      }

      // Guard 3: Kiểm tra hợp đồng API nghiêm ngặt:
      // success === true, loggedOutAll === true (boolean), requiresLogin === true (boolean)
      const isHttpSuccess = (res.status === 200 || res.status === undefined);
      const isLogoutAllValid = Boolean(
        res &&
        res.success === true &&
        isHttpSuccess &&
        res.data &&
        res.data.loggedOutAll === true &&
        res.data.requiresLogin === true
      );

      if (isLogoutAllValid) {
        setIsLogoutAllDialogOpen(false);
        if (typeof handleUnauthorized === 'function') {
          handleUnauthorized(actionUserId);
        }
        navigate('/login', {
          replace: true,
          state: { notice: tRef.current('security_logout_all_success') }
        });
        return;
      }

      // Phản hồi sai hợp đồng hoặc kết quả không xác định
      setIsLogoutAllDialogOpen(false);
      setNotice({
        type: 'danger',
        key: 'security_indeterminate_result',
        text: res?.message || tRef.current('security_indeterminate_result')
      });
    } catch {
      if (!isMountedRef.current) return;
      if (accountEpochRef.current !== actionEpoch || currentUserRef.current?.id !== actionUserId) return;
      if (activeMutationLockRef.current !== actionId) return;

      setIsLogoutAllDialogOpen(false);
      setNotice({
        type: 'danger',
        key: 'security_network_error',
        text: tRef.current('security_network_error')
      });
    } finally {
      if (accountEpochRef.current === actionEpoch && activeMutationLockRef.current === actionId) {
        isActionInProgressRef.current = false;
        activeMutationLockRef.current = null;
        if (isMountedRef.current) {
          setIsSubmittingLogoutAll(false);
        }
      }
    }
  }, [handleUnauthorized, navigate]);

  // Focus trap và xử lý phím Escape cho Revoke Dialog
  useEffect(() => {
    if (!revokingSession) return;

    const timer = setTimeout(() => {
      if (revokeCancelBtnRef.current) {
        revokeCancelBtnRef.current.focus();
      }
    }, 50);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmittingRevoke) {
        e.preventDefault();
        handleCloseRevokeDialog();
      }

      if (e.key === 'Tab' && revokeModalRef.current) {
        const focusable = revokeModalRef.current.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleCloseRevokeDialog, isSubmittingRevoke, revokingSession]);

  // Focus trap và xử lý phím Escape cho Logout All Dialog
  useEffect(() => {
    if (!isLogoutAllDialogOpen) return;

    const timer = setTimeout(() => {
      if (logoutAllCancelBtnRef.current) {
        logoutAllCancelBtnRef.current.focus();
      }
    }, 50);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmittingLogoutAll) {
        e.preventDefault();
        handleCloseLogoutAllDialog();
      }

      if (e.key === 'Tab' && logoutAllModalRef.current) {
        const focusable = logoutAllModalRef.current.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleCloseLogoutAllDialog, isLogoutAllDialogOpen, isSubmittingLogoutAll]);

  // Trạng thái khóa tác vụ
  const isActionBusy = isLoading || isSubmittingRevoke || isSubmittingLogoutAll;

  return (
    <div className="security-settings-container">
      {/* Header trang Bảo mật */}
      <div className="settings-page-header">
        <h2 className="settings-page-title">{t('security_title')}</h2>
        <p className="settings-page-desc">{t('security_page_desc')}</p>
      </div>

      {/* Chế độ xem trước (Preview Mode): Không dựng phiên giả, không gọi API */}
      {isPreviewMode() && (
        <div className="security-preview-banner" role="status" aria-live="polite">
          <span className="preview-banner-icon" aria-hidden="true">ℹ️</span>
          <span>{t('security_preview_notice')}</span>
        </div>
      )}

      {/* Thẻ Quản lý Phiên đăng nhập thật */}
      {!isPreviewMode() && <div className="security-card" style={{ marginBottom: 24 }}>
        <div className="security-card-header"><div className="security-card-title-group">
          <h3 className="security-extra-title">{t('security_mfa_title')}</h3>
          <p className="security-card-desc">{t('security_mfa_desc')}</p>
        </div></div>
        <div style={{ padding: '0 24px 24px' }}>
          <p>{mfaEnabled === null ? mfaLoadError ? t('security_mfa_load_error') : t('security_mfa_loading') : mfaEnabled ? t('security_mfa_required') : t('security_mfa_unavailable')}</p>
          {mfaLoadError && <button type="button" className="btn btn-outline btn-sm" onClick={() => setMfaReloadKey((value) => value + 1)}>{t('security_btn_retry')}</button>}
        </div>
      </div>}
      {!isPreviewMode() && <div className="security-card" style={{ marginBottom: 24 }}>
        <div className="security-card-header"><div className="security-card-title-group">
          <h3 className="security-extra-title">{t('security_idle_title')}</h3>
          <p className="security-card-desc">{t('security_idle_desc')}</p>
        </div></div>
      </div>}
      {!isPreviewMode() && (
        <div className="security-card">
          <div className="security-card-header">
            <div className="security-card-title-group">
              <h3 className="security-card-title">{t('security_sessions_title')}</h3>
              <p className="security-card-desc">{t('security_sessions_desc')}</p>
            </div>

            <div className="security-card-actions">
              <button
                type="button"
                className="btn btn-outline btn-sm btn-refresh-sessions"
                onClick={() => loadSessions(true)}
                disabled={isActionBusy || isRefreshing}
                aria-label={isRefreshing ? t('security_btn_refreshing') : t('security_btn_refresh')}
              >
                <RefreshIcon isSpinning={isRefreshing} />
                <span>{isRefreshing ? t('security_btn_refreshing') : t('security_btn_refresh')}</span>
              </button>

              <button
                ref={logoutAllTriggerRef}
                type="button"
                className="btn btn-outline btn-sm btn-logout-all"
                onClick={handleOpenLogoutAllDialog}
                disabled={isActionBusy || sessions.length === 0}
              >
                <span>{t('security_btn_logout_all')}</span>
              </button>
            </div>
          </div>

          {/* Thông báo thao tác hoặc cảnh báo (tự động cập nhật theo ngôn ngữ hiện tại) */}
          {notice && (
            <div
              className={`security-alert security-alert-${notice.type}`}
              role={notice.type === 'danger' ? 'alert' : 'status'}
              aria-live="polite"
            >
              <span>{notice.key ? t(notice.key) : notice.text}</span>
              <button
                type="button"
                className="alert-close-btn"
                onClick={() => setNotice(null)}
                aria-label={t('close_notice') || 'Đóng'}
              >
                ×
              </button>
            </div>
          )}

          {/* Trạng thái 1: Đang tải danh sách lần đầu */}
          {isLoading && (
            <div className="security-state-box security-loading" role="status" aria-live="polite">
              <span className="spinner-mini" aria-hidden="true"></span>
              <span>{t('security_loading_sessions')}</span>
            </div>
          )}

          {/* Trạng thái 2: Lỗi tải danh sách */}
          {!isLoading && loadError && (
            <div className="security-state-box security-error-box" role="alert">
              <p className="security-error-text">⚠️ {typeof loadError === 'object' && loadError.key ? t(loadError.key) : getErrorMessage(loadError, t)}</p>
              <button
                type="button"
                className="btn btn-outline btn-sm btn-retry-security"
                onClick={() => loadSessions(false)}
              >
                {t('security_btn_retry')}
              </button>
            </div>
          )}

          {/* Trạng thái 3: Danh sách rỗng */}
          {!isLoading && !loadError && sessions.length === 0 && (
            <div className="security-state-box security-empty-box">
              <p className="security-empty-text">{t('security_empty_sessions')}</p>
            </div>
          )}

          {/* Trạng thái 4: Danh sách các phiên đăng nhập thật */}
          {!isLoading && !loadError && sessions.length > 0 && (
            <div className="security-session-list" role="list" aria-label={t('security_sessions_title')}>
              {sessions.map((s) => {
                const deviceName = s.deviceLabel || t('security_unknown_device');
                const browserName = s.browserLabel || t('security_unknown_browser');
                const formattedLastActive = formatDateTimeSafe(s.lastActiveAt);
                const formattedCreatedAt = s.createdAt ? formatDateTimeSafe(s.createdAt) : null;

                return (
                  <div
                    key={s.id}
                    className={`security-session-item ${s.isCurrent ? 'session-item-current' : ''}`}
                    role="listitem"
                  >
                    <div className="session-icon-box" aria-hidden="true">
                      <DeviceIcon deviceLabel={s.deviceLabel} />
                    </div>

                    <div className="session-info-box">
                      <div className="session-title-row">
                        <span className="session-device-name">{deviceName}</span>
                        <span className="session-browser-name">• {browserName}</span>
                        {s.isCurrent && (
                          <span className="session-current-badge">
                            ✓ {t('security_badge_current')}
                          </span>
                        )}
                      </div>

                      <div className="session-meta-row">
                        <span className="session-meta-item">
                          <span className="meta-label">{t('security_last_active')}</span>{' '}
                          <span className="meta-value">{formattedLastActive}</span>
                        </span>

                        <span className="session-meta-separator" aria-hidden="true">|</span>

                        <span className="session-meta-item">
                          <span className="meta-label">{t('security_created_at')}</span>{' '}
                          <span className="meta-value">{formattedCreatedAt || t('security_no_created_at')}</span>
                        </span>
                      </div>
                    </div>

                    <div className="session-action-box">
                      <button
                        type="button"
                        className="btn btn-outline btn-xs btn-revoke-session"
                        onClick={(e) => handleOpenRevokeDialog(s, e)}
                        disabled={isActionBusy}
                        aria-label={`${t('security_btn_revoke')} - ${deviceName} (${browserName})`}
                      >
                        {t('security_btn_revoke')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Hộp thoại xác nhận thu hồi một phiên */}
      {revokingSession && (
        <div className="dialog-overlay" onClick={handleCloseRevokeDialog}>
          <div
            ref={revokeModalRef}
            className="dialog-container security-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-header">
              <h3 id="revoke-dialog-title" className="dialog-title">
                {t('security_revoke_dialog_title')}
              </h3>
              <button
                type="button"
                className="dialog-close-btn"
                onClick={handleCloseRevokeDialog}
                disabled={isSubmittingRevoke}
                aria-label={t('dialog_close') || 'Đóng'}
              >
                <CloseIcon />
              </button>
            </div>

            <div className="dialog-body">
              {revokingSession.isCurrent ? (
                <div className="security-dialog-warning-box" role="alert">
                  <span className="warning-icon" aria-hidden="true">
                    <AlertCircleIcon />
                  </span>
                  <span>{t('security_revoke_dialog_current_warning')}</span>
                </div>
              ) : (
                <p className="security-dialog-desc">
                  {t('security_revoke_dialog_desc')}{' '}
                  <strong>
                    {revokingSession.deviceLabel || t('security_unknown_device')} ({revokingSession.browserLabel || t('security_unknown_browser')})
                  </strong>
                </p>
              )}
            </div>

            <div className="dialog-footer">
              <button
                ref={revokeCancelBtnRef}
                type="button"
                className="btn btn-outline dialog-btn-cancel"
                onClick={handleCloseRevokeDialog}
                disabled={isSubmittingRevoke}
              >
                {t('btn_cancel')}
              </button>

              <button
                type="button"
                className="btn btn-primary dialog-btn-confirm"
                onClick={handleConfirmRevoke}
                disabled={isSubmittingRevoke}
              >
                {isSubmittingRevoke ? (
                  <>
                    <span className="spinner-mini" aria-hidden="true"></span>
                    <span>{t('security_btn_revoking')}</span>
                  </>
                ) : (
                  <span>{t('security_revoke_dialog_btn_confirm')}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hộp thoại xác nhận đăng xuất mọi nơi */}
      {isLogoutAllDialogOpen && (
        <div className="dialog-overlay" onClick={handleCloseLogoutAllDialog}>
          <div
            ref={logoutAllModalRef}
            className="dialog-container security-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-all-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-header">
              <h3 id="logout-all-dialog-title" className="dialog-title">
                {t('security_logout_all_dialog_title')}
              </h3>
              <button
                type="button"
                className="dialog-close-btn"
                onClick={handleCloseLogoutAllDialog}
                disabled={isSubmittingLogoutAll}
                aria-label={t('dialog_close') || 'Đóng'}
              >
                <CloseIcon />
              </button>
            </div>

            <div className="dialog-body">
              <div className="security-dialog-warning-box" role="alert">
                <span className="warning-icon" aria-hidden="true">
                  <AlertCircleIcon />
                </span>
                <span>{t('security_logout_all_dialog_desc')}</span>
              </div>
            </div>

            <div className="dialog-footer">
              <button
                ref={logoutAllCancelBtnRef}
                type="button"
                className="btn btn-outline dialog-btn-cancel"
                onClick={handleCloseLogoutAllDialog}
                disabled={isSubmittingLogoutAll}
              >
                {t('btn_cancel')}
              </button>

              <button
                type="button"
                className="btn btn-primary dialog-btn-confirm btn-danger-confirm"
                onClick={handleConfirmLogoutAll}
                disabled={isSubmittingLogoutAll}
              >
                {isSubmittingLogoutAll ? (
                  <>
                    <span className="spinner-mini" aria-hidden="true"></span>
                    <span>{t('security_btn_revoking')}</span>
                  </>
                ) : (
                  <span>{t('security_logout_all_dialog_btn_confirm')}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
