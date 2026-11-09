import { useLanguage } from '../../context/LanguageContext.jsx';
import { useAuthContext } from '../../context/AuthContext.jsx';

export default function PlaceholderSection({ sectionKey }) {
  const { t } = useLanguage();
  const { currentUser } = useAuthContext();

  const titleKey = `settings_cat_${sectionKey}`;
  const title = t(titleKey) || sectionKey;

  // Kiểm tra quyền đối với mục Quản trị (Admin)
  const isAdmin = currentUser?.role === 'admin';
  const isForbiddenAdmin = sectionKey === 'admin' && !isAdmin;

  if (isForbiddenAdmin) {
    return (
      <div className="settings-placeholder-card" role="alert">
        <h2 className="settings-page-title">{title}</h2>
        <div className="alert alert-danger" style={{ marginTop: '1rem' }}>
          ⚠️ {t('settings_admin_forbidden')}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-placeholder-card">
      <h2 className="settings-page-title">{title}</h2>
      <p className="settings-placeholder-status">
        {t('settings_placeholder_desc')}
      </p>
    </div>
  );
}
