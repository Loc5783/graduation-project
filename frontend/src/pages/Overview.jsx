import { Link } from 'react-router-dom';
import { deviceConfigs } from '../modules/configs.js';
import { useLanguage, getDeviceDisplayName } from '../context/LanguageContext.jsx';
import { getDeviceIcon, SignalIcon } from '../shared/components/AuthIcons.jsx';

export default function Overview() {
  const { t } = useLanguage();

  return (
    <div className="overview-page">
      <header className="overview-header">
        <h1 className="overview-title">{t('overview_title')}</h1>
        <p className="overview-subtitle">
          {t('overview_subtitle')}
        </p>
      </header>

      {/* Danh sách 5 module thiết bị độc lập */}
      <section className="overview-modules-section" aria-label={t('overview_section_title')}>
        <h2 className="section-title">{t('overview_section_title')}</h2>
        <div className="overview-device-grid overview-grid">
          {deviceConfigs.map((config) => (
            <div key={config.id} className="overview-card module-card">
              <div className="module-card-header">
                <span className="module-icon-wrap" aria-hidden="true">
                  {getDeviceIcon(config.id)}
                </span>
                <span className="module-id-badge"><code>{config.id}</code></span>
              </div>
              <h3 className="module-name">{getDeviceDisplayName(config.id, t, config.name)}</h3>
              <p className="module-owner-info">
                {t('overview_owner_prefix')} <strong>{config.owner}</strong>
              </p>
              <div className="card-status-badge">
                <span className="status-indicator-icon" aria-hidden="true">
                  <SignalIcon />
                </span>
                <span>{t('overview_status_no_data')}</span>
              </div>
              <div className="module-card-footer">
                <Link to={`/devices/${config.id}`} className="btn btn-outline btn-sm">
                  {t('overview_btn_details')}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trạng thái rỗng: Rút gọn súc tích */}
      <section className="overview-empty-state" aria-label={t('empty_state_title')}>
        <div className="empty-state-card">
          <div className="empty-state-icon" aria-hidden="true">
            <SignalIcon />
          </div>
          <h3 className="empty-state-title">{t('empty_state_title')}</h3>
          <p className="empty-state-desc">
            {t('empty_state_desc')}
          </p>
        </div>
      </section>
    </div>
  );
}
