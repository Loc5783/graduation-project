import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { useDeviceContext } from '../../context/DeviceContext.jsx';
import { useLanguage, getDeviceDisplayName, getErrorMessage } from '../../context/LanguageContext.jsx';
import { deviceRegistry } from '../../modules/registry.js';
import { isPreviewMode } from '../../services/authService.js';
import HubStatusIndicator from './HubStatusIndicator.jsx';
import LanguageToggle from './LanguageToggle.jsx';
import {
  BrandHeader,
  OverviewChartIcon,
  getDeviceIcon,
  CloseIcon,
  LogoutIcon,
  UserIcon
} from './AuthIcons.jsx';

export default function Layout() {
  const { currentUser, logout, storageNotice: authStorageNotice } = useAuthContext();
  const { storageNotice: deviceStorageNotice } = useDeviceContext();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [logoutNotice, setLogoutNotice] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const preview = isPreviewMode();

  // Refs quản lý focus cho tính tiếp cận (Accessibility - a11y)
  const menuToggleRef = useRef(null);
  const closeBtnRef = useRef(null);
  const wasOpenedRef = useRef(false);

  // Xử lý chuyển focus khi mở/đóng sidebar trên mobile
  useEffect(() => {
    if (isMobileMenuOpen) {
      wasOpenedRef.current = true;
      closeBtnRef.current?.focus();
    } else if (wasOpenedRef.current) {
      menuToggleRef.current?.focus();
      wasOpenedRef.current = false;
    }
  }, [isMobileMenuOpen]);

  // Đóng sidebar khi chuyển trang trên thiết bị di động
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Đóng bằng phím Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  const handleLogout = async () => {
    setLogoutNotice(null);
    setIsLoggingOut(true);
    try {
      const res = await logout();
      if (res && res.success) {
        navigate('/login', { replace: true });
      } else {
        setLogoutNotice(res?.code || { code: 'LOGOUT_FAILED', message: res?.message });
      }
    } catch (err) {
      setLogoutNotice({ code: 'LOGOUT_FAILED', message: err.message });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'admin':
        return t('user_role_admin');
      case 'member':
        return t('user_role_member');
      default:
        return t('user_role_viewer');
    }
  };

  /**
   * Tính toán tiêu đề trang hiện tại linh hoạt theo route cho Topbar
   */
  const getCurrentPageTitle = () => {
    const pathname = location.pathname;
    if (pathname === '/overview' || pathname === '/') {
      return t('nav_overview');
    }
    if (pathname.startsWith('/devices/')) {
      const devId = pathname.replace('/devices/', '').split('/')[0];
      const dev = deviceRegistry.find((d) => d.id === devId);
      if (dev) {
        return getDeviceDisplayName(dev.id, t, dev.name);
      }
    }
    return t('system_name');
  };

  return (
    <div className="app-layout">
      {/* Nền mờ che phủ khi mở sidebar trên màn hình nhỏ */}
      {isMobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar điều hướng */}
      <aside
        id="app-sidebar"
        className={`app-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}
        aria-label={t('nav_main_aria')}
      >
        <div className="sidebar-brand">
          <BrandHeader subtitle={t('brand_subtitle')} />
          <button
            ref={closeBtnRef}
            type="button"
            className="mobile-close-btn"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label={t('nav_close_aria')}
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/overview"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            end
          >
            <span className="nav-icon" aria-hidden="true">
              <OverviewChartIcon />
            </span>
            <span className="nav-title">{t('nav_overview')}</span>
          </NavLink>

          <div className="nav-section-title">{t('nav_smart_devices')}</div>
          {deviceRegistry.map((dev) => (
            <NavLink
              key={dev.id}
              to={dev.path}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span className="nav-dev-icon" aria-hidden="true">
                {getDeviceIcon(dev.id)}
              </span>
              <span className="nav-dev-name">{getDeviceDisplayName(dev.id, t, dev.name)}</span>
              <span className="nav-owner-pill">{dev.owner}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Khu vực nội dung chính */}
      <div className="app-main-area">
        <header className="app-topbar">
          <div className="topbar-left">
            <button
              ref={menuToggleRef}
              type="button"
              className="mobile-menu-toggle"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-expanded={isMobileMenuOpen}
              aria-controls="app-sidebar"
              aria-label={t('nav_open_aria')}
            >
              <span className="hamburger-bar"></span>
              <span className="hamburger-bar"></span>
              <span className="hamburger-bar"></span>
            </button>
            <span className="topbar-system-name">{getCurrentPageTitle()}</span>
          </div>

          <div className="topbar-right">
            {/* Chỉ báo trạng thái kết nối Hub (Chưa kết nối trong luồng chính vì chưa có MQTT thật) */}
            <HubStatusIndicator status="not_connected" />

            {/* Bộ chuyển đổi ngôn ngữ VI / EN */}
            <LanguageToggle />

            {/* Nếu đang ở chế độ xem trước nội bộ (chỉ trong dev) */}
            {preview && !currentUser && (
              <span className="preview-mode-badge" title="Chế độ xem trước giao diện nội bộ">
                {t('preview_mode')}
              </span>
            )}

            {/* Nếu có phiên đăng nhập thật */}
            {currentUser && (
              <div className="topbar-user-area">
                <span className="user-name">
                  <span className="user-icon" aria-hidden="true">
                    <UserIcon />
                  </span>
                  <span>{currentUser.name}</span>
                </span>
                <span className="user-role-badge">
                  {getRoleLabel(currentUser.role)}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="btn btn-outline btn-sm logout-btn"
                >
                  <span className="logout-icon" aria-hidden="true">
                    <LogoutIcon />
                  </span>
                  <span>{isLoggingOut ? t('btn_logging_out') : t('btn_logout')}</span>
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="app-content">
          {logoutNotice && (
            <div className="alert alert-danger logout-error-notice" role="alert">
              ⚠️ <strong>{t('err_logout_title')}</strong> {getErrorMessage(logoutNotice, t)}
            </div>
          )}

          {authStorageNotice && (
            <div className="alert alert-warning auth-storage-notice" role="alert">
              ⚠️ <strong>{t('notice_storage_title')}</strong> {getErrorMessage(authStorageNotice, t)}
            </div>
          )}

          {deviceStorageNotice && (
            <div className="alert alert-warning device-storage-notice" role="alert">
              ⚠️ <strong>{t('notice_device_config_title')}</strong> {getErrorMessage(deviceStorageNotice, t)}
            </div>
          )}

          <Outlet />
        </main>
      </div>
    </div>
  );
}
