import { useState, useEffect } from 'react';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { formatDateTime } from '../../shared/dateTimeFormatter.js';
import { EyeIcon } from '../../shared/components/AuthIcons.jsx';

export default function AppearancePreview() {
  const { currentSettings } = useSettings();
  const { t, lang } = useLanguage();
  const [now, setNow] = useState(() => new Date());

  // Cập nhật đồng hồ mẫu mỗi giây
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const sampleDateTime = formatDateTime(now, {
    timeZone: currentSettings.timeZone,
    dateFormat: currentSettings.dateFormat,
    hourFormat: currentSettings.hourFormat,
    locale: lang
  });

  return (
    <aside className="settings-preview-panel" aria-label={t('appearance_preview_title')}>
      <div className="preview-header">
        <span className="preview-header-icon" aria-hidden="true">
          <EyeIcon />
        </span>
        <h3 className="preview-title">{t('appearance_preview_title')}</h3>
      </div>

      <div className="preview-card-container">
        {/* Thẻ mẫu hiển thị các token màu, chữ và độ tương phản */}
        <div className="preview-sample-card">
          <div className="preview-card-top">
            <span className="preview-badge" aria-label={t('appearance_preview_sample_badge')}>
              <span className="preview-badge-dot" aria-hidden="true"></span>
              {t('appearance_preview_sample_badge')}
            </span>
            <span className="preview-clock" title={currentSettings.timeZone}>
              {sampleDateTime}
            </span>
          </div>

          <h4 className="preview-card-heading">{t('appearance_preview_sample_card')}</h4>
          <p className="preview-card-desc">{t('appearance_preview_sample_desc')}</p>

          <div className="preview-card-actions">
            <span className="preview-sample-btn" aria-hidden="true">
              {t('appearance_preview_sample_btn')}
            </span>
            <span className="preview-timezone-pill" title={currentSettings.timeZone}>
              🌐 {currentSettings.timeZone}
            </span>
          </div>
        </div>
      </div>

      <p className="preview-disclaimer">{t('appearance_preview_disclaimer')}</p>
    </aside>
  );
}
