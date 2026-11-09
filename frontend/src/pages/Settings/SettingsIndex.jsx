import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useAuthContext } from '../../context/AuthContext.jsx';
import AppearanceSettings from './AppearanceSettings.jsx';

// Danh sách các danh mục cài đặt
export const SETTINGS_SECTIONS = [
  { id: 'appearance', icon: '🎨', titleKey: 'settings_cat_appearance', descKey: 'settings_cat_appearance_desc' },
  { id: 'account', icon: '👤', titleKey: 'settings_cat_account', descKey: 'settings_cat_account_desc' },
  { id: 'security', icon: '🛡️', titleKey: 'settings_cat_security', descKey: 'settings_cat_security_desc' },
  { id: 'notifications', icon: '🔔', titleKey: 'settings_cat_notifications', descKey: 'settings_cat_notifications_desc' },
  { id: 'privacy', icon: '🔒', titleKey: 'settings_cat_privacy', descKey: 'settings_cat_privacy_desc' },
  { id: 'admin', icon: '⚙️', titleKey: 'settings_cat_admin', descKey: 'settings_cat_admin_desc', adminOnly: true },
  { id: 'help', icon: '❓', titleKey: 'settings_cat_help', descKey: 'settings_cat_help_desc' }
];

export function useIsDesktop(breakpoint = 920) {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > breakpoint;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(`(min-width: ${breakpoint + 1}px)`);
    if (!mql) return;
    const handler = (e) => setIsDesktop(Boolean(e?.matches));
    setIsDesktop(Boolean(mql.matches));

    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    } else if (mql.addListener) {
      mql.addListener(handler);
      return () => mql.removeListener(handler);
    }
  }, [breakpoint]);

  return isDesktop;
}

export default function SettingsIndex() {
  const { t } = useLanguage();
  const { currentUser } = useAuthContext();
  const isDesktop = useIsDesktop(920);

  // Lọc danh sách mục: Với user thường thì chỉ có 6 mục, admin có đủ 7 mục
  const isAdmin = currentUser?.role === 'admin';
  const visibleSections = SETTINGS_SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  // Trên desktop: Hiển thị AppearanceSettings ngay tại trang chỉ mục
  if (isDesktop) {
    return <AppearanceSettings />;
  }

  // Trên mobile: Hiển thị danh sách các thẻ danh mục
  return (
    <div className="settings-mobile-index">
      <div className="settings-page-header">
        <h2 className="settings-page-title">{t('settings_title')}</h2>
        <p className="settings-page-desc">{t('settings_categories')}</p>
      </div>

      <div className="settings-categories-grid">
        {visibleSections.map((sec) => (
          <Link
            key={sec.id}
            to={`/settings/${sec.id}`}
            className="settings-cat-card"
          >
            <div className="cat-card-icon" aria-hidden="true">
              {sec.icon}
            </div>
            <div className="cat-card-body">
              <h3 className="cat-card-title">{t(sec.titleKey)}</h3>
              <p className="cat-card-desc">{t(sec.descKey)}</p>
            </div>
            <span className="cat-card-arrow" aria-hidden="true">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
