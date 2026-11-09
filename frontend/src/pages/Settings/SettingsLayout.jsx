import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { SETTINGS_SECTIONS, useIsDesktop } from './SettingsIndex.jsx';

export default function SettingsLayout() {
  const { t } = useLanguage();
  const { currentUser } = useAuthContext();
  const { saveStatus, retrySave, isPreview, reloadSettings, loadStatus } = useSettings();
  const location = useLocation();
  const isDesktop = useIsDesktop(920);

  const isAdmin = currentUser?.role === 'admin';
  const visibleSections = SETTINGS_SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  const isIndex = location.pathname === '/settings' || location.pathname === '/settings/';
  const isAppearanceActive = location.pathname === '/settings/appearance' || (isIndex && isDesktop);

  return (
    <div className="settings-container">
      {/* Nút quay lại trên Mobile khi đang ở các trang con */}
      {!isDesktop && !isIndex && (
        <div className="settings-mobile-header">
          <Link to="/settings" className="settings-back-link">
            {t('settings_back_to_index')}
          </Link>
        </div>
      )}

      {/* Thanh trạng thái lưu cài đặt an toàn: chỉ hiển thị cho mục Giao diện */}
      {isAppearanceActive && (
        <div className="settings-status-bar" role="status" aria-live="polite">
          {isPreview && (
            <div className="status-badge status-preview">
              ℹ️ {t('settings_preview_notice')}
            </div>
          )}

          {!isPreview && loadStatus === 'loading' && (
            <div className="status-badge status-loading">
              <span className="spinner-mini" aria-hidden="true"></span>
              {t('settings_status_loading')}
            </div>
          )}

          {!isPreview && loadStatus === 'error' && (
            <div className="status-badge status-error" role="alert">
              <span>⚠️ {t('settings_status_load_error')}</span>
              <button
                type="button"
                className="btn btn-outline btn-xs"
                onClick={reloadSettings}
              >
                {t('settings_btn_retry')}
              </button>
            </div>
          )}

          {!isPreview && loadStatus !== 'loading' && loadStatus !== 'error' && saveStatus === 'saving' && (
            <div className="status-badge status-saving">
              <span className="spinner-mini" aria-hidden="true"></span>
              {t('settings_status_saving')}
            </div>
          )}

          {!isPreview && loadStatus !== 'loading' && loadStatus !== 'error' && saveStatus === 'saved' && (
            <div className="status-badge status-saved">
              ✓ {t('settings_status_saved')}
            </div>
          )}

          {!isPreview && loadStatus !== 'loading' && loadStatus !== 'error' && saveStatus === 'error' && (
            <div className="status-badge status-error" role="alert">
              <span>⚠️ {t('settings_status_error')}</span>
              <button
                type="button"
                className="btn btn-outline btn-xs"
                onClick={retrySave}
              >
                {t('settings_btn_retry')}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="settings-main-grid">
        {/* Sidebar nội bộ cài đặt trên Desktop */}
        {isDesktop && (
          <nav className="settings-sidebar" aria-label={t('settings_categories')}>
            <div className="settings-nav-list">
              {visibleSections.map((sec) => {
                const targetPath = `/settings/${sec.id}`;
                // Trên desktop, khi ở /settings thì mục appearance được coi là active
                const isActive = location.pathname === targetPath || (isIndex && sec.id === 'appearance');

                return (
                  <NavLink
                    key={sec.id}
                    to={targetPath}
                    className={`settings-nav-item ${isActive ? 'active' : ''}`}
                  >
                    <span className="nav-item-icon" aria-hidden="true">{sec.icon}</span>
                    <span className="nav-item-title">{t(sec.titleKey)}</span>
                  </NavLink>
                );
              })}
            </div>
          </nav>
        )}

        {/* Vùng nội dung chi tiết */}
        <section className="settings-content-pane">
          <Outlet />
        </section>
      </div>
    </div>
  );
}
