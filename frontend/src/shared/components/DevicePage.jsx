import { Link } from 'react-router-dom';
import { useLanguage, getDeviceDisplayName } from '../../context/LanguageContext.jsx';
import { getDeviceIcon } from './AuthIcons.jsx';

/**
 * Khung trang chi tiết thiết bị (Giai đoạn 2 - Cấu trúc làm việc nhóm)
 * Cung cấp thông tin nhận diện cơ bản của thiết bị và vị trí chèn OwnerArea
 * để từng thành viên phát triển tính năng độc lập.
 */
export default function DevicePage({ config, ownerArea }) {
  const { t } = useLanguage();

  if (!config) {
    return (
      <div className="device-page-error">
        <h2>{t('device_not_found_title')}</h2>
        <Link to="/overview" className="btn btn-primary btn-sm">
          {t('btn_back_overview')}
        </Link>
      </div>
    );
  }

  const displayName = getDeviceDisplayName(config.id, t, config.name);

  return (
    <div className="device-page-container">
      {/* Header thiết bị */}
      <header className="device-page-header">
        <div className="device-header-main">
          <div className="device-title-wrap">
            <span className="device-title-icon" aria-hidden="true">
              {getDeviceIcon(config.id)}
            </span>
            <h1 className="device-title">{displayName}</h1>
          </div>
          <div className="device-meta-tags">
            <span className="device-id-badge">
              {t('device_id_prefix')} <code>{config.id}</code>
            </span>
            <span className="device-owner-badge">
              {t('device_owner_prefix')} <strong>{config.owner}</strong>
            </span>
          </div>
        </div>

        <p className="device-description">
          {t('device_desc_template', { name: displayName, owner: config.owner })}
        </p>

        {/* Thông tin kỹ thuật dạng khối thu gọn theo yêu cầu */}
        <details className="device-tech-details">
          <summary className="device-tech-summary">
            <span>{t('device_tech_details_summary')}</span>
          </summary>
          <div className="device-tech-content">
            <span className="mqtt-title">{t('device_mqtt_notice')}</span>
            <div className="mqtt-topic-list">
              <code>{config.mqtt?.command || `home/${config.id}/command`}</code>
              <code>{config.mqtt?.status || `home/${config.id}/status`}</code>
              <code>{config.mqtt?.telemetry || `home/${config.id}/telemetry`}</code>
            </div>
          </div>
        </details>
      </header>

      {/* Khu vực phát triển riêng của thành viên phụ trách (giữ nguyên vẹn) */}
      <section
        className="device-owner-section"
        aria-label={t('device_owner_section_aria', { owner: config.owner })}
      >
        {ownerArea}
      </section>
    </div>
  );
}
