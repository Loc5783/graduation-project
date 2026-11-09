import { useState, useId } from 'react';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import AppearancePreview from './AppearancePreview.jsx';

// Danh sách các múi giờ phổ biến
const POPULAR_TIMEZONES = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'UTC'
];

export default function AppearanceSettings() {
  const {
    currentSettings,
    updateAppearanceField,
    validationErrors,
    isLoaded,
    loadStatus,
    isPreview
  } = useSettings();
  const { t } = useLanguage();
  const [detectNotice, setDetectNotice] = useState(null);

  const isBlocked = !isLoaded && !isPreview;

  const themeLabelId = useId();
  const langLabelId = useId();
  const fontSizeLabelId = useId();
  const dateFormatId = useId();
  const hourFormatId = useId();
  const timeZoneId = useId();

  // Đảm bảo múi giờ đã lưu luôn xuất hiện trong danh sách lựa chọn
  const currentTimeZone = currentSettings.timeZone || 'Asia/Ho_Chi_Minh';
  const availableTimeZones = POPULAR_TIMEZONES.includes(currentTimeZone)
    ? POPULAR_TIMEZONES
    : [currentTimeZone, ...POPULAR_TIMEZONES];

  // Nút nhận diện múi giờ từ thiết bị
  const handleDetectTimeZone = () => {
    if (isBlocked) return;
    setDetectNotice(null);
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Kiểm tra an toàn: không nhận chuỗi offset dạng +07:00
      if (detected && !/^[+-]/.test(detected) && detected.length <= 50) {
        updateAppearanceField('timeZone', detected);
        setDetectNotice({ success: true, text: `✓ ${detected}` });
      } else {
        setDetectNotice({ success: false, text: t('appearance_timezone_invalid') });
      }
    } catch {
      setDetectNotice({ success: false, text: t('appearance_timezone_invalid') });
    }
  };

  return (
    <div className="appearance-settings-page">
      <div className="settings-page-header">
        <h2 className="settings-page-title">{t('settings_cat_appearance')}</h2>
        <p className="settings-page-desc">{t('settings_cat_appearance_desc')}</p>
      </div>

      {isBlocked && loadStatus === 'error' && (
        <div className="alert alert-warning settings-load-warning" role="alert" style={{ marginBottom: '1.25rem' }}>
          ⚠️ {t('settings_load_error_desc')}
        </div>
      )}

      <div className="appearance-layout-grid">
        {/* Cột trái: Các biểu mẫu cài đặt */}
        <div className="appearance-controls-column">
          <div className="settings-card appearance-main-card">
            {/* Nhóm A: Hiển thị (Display) */}
            <section className="settings-section-group" aria-labelledby="group-display-heading">
              <h3 id="group-display-heading" className="settings-group-heading">
                {t('appearance_group_display')}
              </h3>

              {/* 1. Chủ đề giao diện (Theme) */}
              <div className="settings-field-group">
                <span id={themeLabelId} className="field-group-label">
                  {t('appearance_theme')}
                </span>
                <div className="btn-toggle-row" role="radiogroup" aria-labelledby={themeLabelId}>
                  {[
                    { val: 'dark', label: t('appearance_theme_dark') },
                    { val: 'light', label: t('appearance_theme_light') },
                    { val: 'system', label: t('appearance_theme_system') }
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      role="radio"
                      disabled={isBlocked}
                      aria-checked={currentSettings.theme === opt.val}
                      className={`btn-choice ${currentSettings.theme === opt.val ? 'active' : ''}`}
                      onClick={() => updateAppearanceField('theme', opt.val)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {validationErrors.theme && (
                  <span className="field-error-text" role="alert">
                    {validationErrors.theme}
                  </span>
                )}
              </div>

              {/* 2. Ngôn ngữ hiển thị (Language) */}
              <div className="settings-field-group">
                <span id={langLabelId} className="field-group-label">
                  {t('appearance_language')}
                </span>
                <div className="btn-toggle-row" role="radiogroup" aria-labelledby={langLabelId}>
                  {[
                    { val: 'vi', label: t('appearance_language_vi') },
                    { val: 'en', label: t('appearance_language_en') }
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      role="radio"
                      disabled={isBlocked}
                      aria-checked={currentSettings.language === opt.val}
                      className={`btn-choice ${currentSettings.language === opt.val ? 'active' : ''}`}
                      onClick={() => updateAppearanceField('language', opt.val)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {validationErrors.language && (
                  <span className="field-error-text" role="alert">
                    {validationErrors.language}
                  </span>
                )}
              </div>

              {/* 3. Cỡ chữ (Font Size) */}
              <div className="settings-field-group">
                <span id={fontSizeLabelId} className="field-group-label">
                  {t('appearance_fontsize')}
                </span>
                <div className="btn-toggle-row" role="radiogroup" aria-labelledby={fontSizeLabelId}>
                  {[
                    { val: 'small', label: t('appearance_fontsize_small') },
                    { val: 'medium', label: t('appearance_fontsize_medium') },
                    { val: 'large', label: t('appearance_fontsize_large') }
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      role="radio"
                      disabled={isBlocked}
                      aria-checked={currentSettings.fontSize === opt.val}
                      className={`btn-choice ${currentSettings.fontSize === opt.val ? 'active' : ''}`}
                      onClick={() => updateAppearanceField('fontSize', opt.val)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {validationErrors.fontSize && (
                  <span className="field-error-text" role="alert">
                    {validationErrors.fontSize}
                  </span>
                )}
              </div>
            </section>

            <div className="settings-group-divider" aria-hidden="true" />

            {/* Nhóm B: Trợ năng (Accessibility) */}
            <section className="settings-section-group" aria-labelledby="group-a11y-heading">
              <h3 id="group-a11y-heading" className="settings-group-heading">
                {t('appearance_group_accessibility')}
              </h3>

              {/* 4. Độ tương phản cao (High Contrast) */}
              <div className="settings-switch-card">
                <div className="switch-content switch-info">
                  <label htmlFor="switch-high-contrast" className="switch-label switch-title">
                    {t('appearance_contrast')}
                  </label>
                  <p className="switch-desc">{t('appearance_contrast_desc')}</p>
                </div>
                <label className="switch-control" htmlFor="switch-high-contrast">
                  <input
                    id="switch-high-contrast"
                    type="checkbox"
                    className="switch-input"
                    disabled={isBlocked}
                    checked={Boolean(currentSettings.highContrast)}
                    onChange={(e) => updateAppearanceField('highContrast', e.target.checked)}
                  />
                  <span className="switch-slider" aria-hidden="true"></span>
                </label>
              </div>
              {validationErrors.highContrast && (
                <span className="field-error-text" role="alert">
                  {validationErrors.highContrast}
                </span>
              )}

              {/* 5. Giảm chuyển động (Reduced Motion) */}
              <div className="settings-switch-card">
                <div className="switch-content switch-info">
                  <label htmlFor="switch-reduced-motion" className="switch-label switch-title">
                    {t('appearance_motion')}
                  </label>
                  <p className="switch-desc">{t('appearance_motion_desc')}</p>
                </div>
                <label className="switch-control" htmlFor="switch-reduced-motion">
                  <input
                    id="switch-reduced-motion"
                    type="checkbox"
                    className="switch-input"
                    disabled={isBlocked}
                    checked={Boolean(currentSettings.reducedMotion)}
                    onChange={(e) => updateAppearanceField('reducedMotion', e.target.checked)}
                  />
                  <span className="switch-slider" aria-hidden="true"></span>
                </label>
              </div>
              {validationErrors.reducedMotion && (
                <span className="field-error-text" role="alert">
                  {validationErrors.reducedMotion}
                </span>
              )}
            </section>

            <div className="settings-group-divider" aria-hidden="true" />

            {/* Nhóm C: Thời gian (Date & Time) */}
            <section className="settings-section-group" aria-labelledby="group-datetime-heading">
              <h3 id="group-datetime-heading" className="settings-group-heading">
                {t('appearance_group_datetime')}
              </h3>

              {/* 6. Múi giờ (TimeZone) */}
              <div className="settings-field-group">
                <div className="field-label-with-action">
                  <label htmlFor={timeZoneId} className="field-group-label">
                    {t('appearance_timezone')}
                  </label>
                  <button
                    type="button"
                    className="btn btn-outline btn-xs btn-detect-tz"
                    disabled={isBlocked}
                    onClick={handleDetectTimeZone}
                  >
                    📍 {t('appearance_timezone_detect')}
                  </button>
                </div>
                <div className="select-wrapper">
                  <select
                    id={timeZoneId}
                    className="settings-select"
                    disabled={isBlocked}
                    value={currentTimeZone}
                    onChange={(e) => updateAppearanceField('timeZone', e.target.value)}
                  >
                    {availableTimeZones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
                {detectNotice && (
                  <span className={`detect-notice ${detectNotice.success ? 'text-success' : 'text-danger'}`}>
                    {detectNotice.text}
                  </span>
                )}
                {validationErrors.timeZone && (
                  <span className="field-error-text" role="alert">
                    {validationErrors.timeZone}
                  </span>
                )}
              </div>

              {/* 7. Định dạng ngày (Date Format) */}
              <div className="settings-field-group">
                <label htmlFor={dateFormatId} className="field-group-label">
                  {t('appearance_dateformat')}
                </label>
                <div className="select-wrapper">
                  <select
                    id={dateFormatId}
                    className="settings-select"
                    disabled={isBlocked}
                    value={currentSettings.dateFormat || 'DD/MM/YYYY'}
                    onChange={(e) => updateAppearanceField('dateFormat', e.target.value)}
                  >
                    <option value="DD/MM/YYYY">{t('appearance_dateformat_dmy')}</option>
                    <option value="YYYY-MM-DD">{t('appearance_dateformat_ymd')}</option>
                    <option value="MM/DD/YYYY">{t('appearance_dateformat_mdy')}</option>
                  </select>
                </div>
                {validationErrors.dateFormat && (
                  <span className="field-error-text" role="alert">
                    {validationErrors.dateFormat}
                  </span>
                )}
              </div>

              {/* 8. Định dạng giờ (Hour Format) */}
              <div className="settings-field-group">
                <label htmlFor={hourFormatId} className="field-group-label">
                  {t('appearance_hourformat')}
                </label>
                <div className="select-wrapper">
                  <select
                    id={hourFormatId}
                    className="settings-select"
                    disabled={isBlocked}
                    value={currentSettings.hourFormat || '24h'}
                    onChange={(e) => updateAppearanceField('hourFormat', e.target.value)}
                  >
                    <option value="24h">{t('appearance_hourformat_24h')}</option>
                    <option value="12h">{t('appearance_hourformat_12h')}</option>
                  </select>
                </div>
                {validationErrors.hourFormat && (
                  <span className="field-error-text" role="alert">
                    {validationErrors.hourFormat}
                  </span>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* Cột phải: Khung xem trước trực tiếp */}
        <div className="appearance-preview-column">
          <AppearancePreview />
        </div>
      </div>
    </div>
  );
}
