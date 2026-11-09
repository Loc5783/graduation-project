import { useId } from 'react';
import { useLanguage, getErrorMessage } from '../../context/LanguageContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useNotificationSettings } from './useNotificationSettings.js';

export default function NotificationSettings({ onHookReady } = {}) {
  const { t } = useLanguage();
  const { currentSettings } = useSettings();
  const userTimeZone = currentSettings?.timeZone || 'Asia/Ho_Chi_Minh';

  const hook = useNotificationSettings();
  if (typeof onHookReady === 'function') {
    onHookReady(hook);
  }

  const {
    draft,
    timeInputs,
    timeErrors,
    isLoaded,
    loadStatus,
    saveStatus,
    saveError,
    isPreview,
    updateLeafField,
    handleTimeInputChange,
    retrySave,
    reloadSettings
  } = hook;

  const isBlocked = !isLoaded && !isPreview;

  // IDs liên kết label và input cho trợ năng A11y
  const unusualAccessId = useId();
  const deviceDisconnectedId = useId();
  const permissionChangesId = useId();
  const monthlyReportId = useId();

  const severityGroupLabelId = useId();

  const quietHoursToggleId = useId();
  const startTimeInputId = useId();
  const endTimeInputId = useId();

  const channelWebId = useId();
  const channelEmailId = useId();

  // Kiểm tra giờ bắt đầu trùng giờ kết thúc
  const isSameTime = Boolean(
    draft.quietHours?.startTime &&
    draft.quietHours?.endTime &&
    draft.quietHours.startTime === draft.quietHours.endTime
  );

  return (
    <div className="notification-settings-page">
      <div className="settings-page-header">
        <h2 className="settings-page-title">{t('notif_title')}</h2>
        <p className="settings-page-desc">{t('notif_subtitle')}</p>
      </div>

      {/* Thanh trạng thái lưu và thông báo lỗi tải */}
      <div className="settings-status-bar" role="status" aria-live="polite" style={{ marginBottom: '1.25rem' }}>
        {isPreview && (
          <div className="status-badge status-preview">
            ℹ️ {t('notif_preview_notice')}
          </div>
        )}

        {!isPreview && loadStatus === 'loading' && (
          <div className="status-badge status-loading">
            <span className="spinner-mini" aria-hidden="true"></span>
            {t('notif_status_loading')}
          </div>
        )}

        {!isPreview && loadStatus === 'error' && (
          <div className="status-badge status-error" role="alert">
            <span>⚠️ {t('notif_load_error_desc')}</span>
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={reloadSettings}
            >
              {t('notif_status_retry')}
            </button>
          </div>
        )}

        {!isPreview && loadStatus !== 'loading' && loadStatus !== 'error' && saveStatus === 'saving' && (
          <div className="status-badge status-saving">
            <span className="spinner-mini" aria-hidden="true"></span>
            {t('notif_status_saving')}
          </div>
        )}

        {!isPreview && loadStatus !== 'loading' && loadStatus !== 'error' && saveStatus === 'saved' && (
          <div className="status-badge status-saved">
            ✓ {t('notif_status_saved')}
          </div>
        )}

        {!isPreview && loadStatus !== 'loading' && loadStatus !== 'error' && saveStatus === 'error' && (
          <div className="status-badge status-error" role="alert">
            <span>⚠️ {t('notif_status_error')} {saveError && `(${getErrorMessage(saveError, t)})`}</span>
            <button
              type="button"
              className="btn btn-outline btn-xs btn-retry-save"
              onClick={retrySave}
            >
              {t('notif_status_retry')}
            </button>
          </div>
        )}
      </div>

      <div className="settings-card notification-main-card">
        {/* Nhóm A: Loại thông báo */}
        <section className="settings-section-group" aria-labelledby="group-types-heading">
          <h3 id="group-types-heading" className="settings-group-heading">
            {t('notif_group_types')}
          </h3>

          <div className="settings-field-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* 1. Truy cập bất thường */}
            <div className="settings-switch-card">
              <div className="switch-content">
                <label htmlFor={unusualAccessId} className="switch-label">
                  {t('notif_type_unusual_access')}
                </label>
                <p className="switch-desc">{t('notif_type_unusual_access_desc')}</p>
              </div>
              <label className="switch-control" htmlFor={unusualAccessId}>
                <input
                  type="checkbox"
                  id={unusualAccessId}
                  className="switch-input"
                  disabled={isBlocked}
                  checked={draft.types?.unusualAccess ?? true}
                  onChange={(e) => updateLeafField('types.unusualAccess', e.target.checked)}
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </label>
            </div>

            {/* 2. Thiết bị mất kết nối */}
            <div className="settings-switch-card">
              <div className="switch-content">
                <label htmlFor={deviceDisconnectedId} className="switch-label">
                  {t('notif_type_device_disconnected')}
                </label>
                <p className="switch-desc">{t('notif_type_device_disconnected_desc')}</p>
              </div>
              <label className="switch-control" htmlFor={deviceDisconnectedId}>
                <input
                  type="checkbox"
                  id={deviceDisconnectedId}
                  className="switch-input"
                  disabled={isBlocked}
                  checked={draft.types?.deviceDisconnected ?? true}
                  onChange={(e) => updateLeafField('types.deviceDisconnected', e.target.checked)}
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </label>
            </div>

            {/* 3. Thay đổi quyền */}
            <div className="settings-switch-card">
              <div className="switch-content">
                <label htmlFor={permissionChangesId} className="switch-label">
                  {t('notif_type_permission_changes')}
                </label>
                <p className="switch-desc">{t('notif_type_permission_changes_desc')}</p>
              </div>
              <label className="switch-control" htmlFor={permissionChangesId}>
                <input
                  type="checkbox"
                  id={permissionChangesId}
                  className="switch-input"
                  disabled={isBlocked}
                  checked={draft.types?.permissionChanges ?? true}
                  onChange={(e) => updateLeafField('types.permissionChanges', e.target.checked)}
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </label>
            </div>

            {/* 4. Báo cáo hàng tháng */}
            <div className="settings-switch-card">
              <div className="switch-content">
                <label htmlFor={monthlyReportId} className="switch-label">
                  {t('notif_type_monthly_report')}
                </label>
                <p className="switch-desc">{t('notif_type_monthly_report_desc')}</p>
              </div>
              <label className="switch-control" htmlFor={monthlyReportId}>
                <input
                  type="checkbox"
                  id={monthlyReportId}
                  className="switch-input"
                  disabled={isBlocked}
                  checked={draft.types?.monthlyReport ?? false}
                  onChange={(e) => updateLeafField('types.monthlyReport', e.target.checked)}
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </label>
            </div>
          </div>
        </section>

        {/* Nhóm B: Mức độ nhận */}
        <section className="settings-section-group" aria-labelledby="group-severity-heading">
          <h3 id="group-severity-heading" className="settings-group-heading">
            {t('notif_group_severity')}
          </h3>

          <div className="settings-field-group">
            <span id={severityGroupLabelId} className="field-group-label" style={{ display: 'none' }}>
              {t('notif_group_severity')}
            </span>
            <div className="btn-toggle-row" role="radiogroup" aria-labelledby={severityGroupLabelId}>
              {[
                { val: 'urgent', label: t('notif_severity_urgent') },
                { val: 'warning', label: t('notif_severity_warning') },
                { val: 'all', label: t('notif_severity_all') }
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  role="radio"
                  disabled={isBlocked}
                  aria-checked={draft.minSeverity === opt.val}
                  className={`btn-choice ${draft.minSeverity === opt.val ? 'active' : ''}`}
                  onClick={() => updateLeafField('minSeverity', opt.val)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Nhóm C: Giờ không làm phiền */}
        <section className="settings-section-group" aria-labelledby="group-quiet-hours-heading">
          <h3 id="group-quiet-hours-heading" className="settings-group-heading">
            {t('notif_group_quiet_hours')}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Công tắc Bật/Tắt giờ không làm phiền */}
            <div className="settings-switch-card">
              <div className="switch-content">
                <label htmlFor={quietHoursToggleId} className="switch-label">
                  {t('notif_quiet_hours_enable')}
                </label>
                <p className="switch-desc">
                  {t('notif_quiet_hours_enable_desc')} — <span className="quiet-hours-tz-badge">{t('notif_quiet_hours_timezone')}: <strong>{userTimeZone}</strong></span>
                </p>
              </div>
              <label className="switch-control" htmlFor={quietHoursToggleId}>
                <input
                  type="checkbox"
                  id={quietHoursToggleId}
                  className="switch-input"
                  disabled={isBlocked}
                  checked={draft.quietHours?.enabled ?? false}
                  onChange={(e) => updateLeafField('quietHours.enabled', e.target.checked)}
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </label>
            </div>

            {/* Khung nhập giờ bắt đầu và kết thúc */}
            <div
              className={`quiet-hours-inputs-row ${!draft.quietHours?.enabled ? 'inputs-disabled' : ''}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem'
              }}
            >
              {/* Giờ bắt đầu */}
              <div className="form-group">
                <label htmlFor={startTimeInputId} className="form-label">
                  {t('notif_quiet_hours_start')} (HH:mm)
                </label>
                <input
                  type="text"
                  id={startTimeInputId}
                  className={`form-control ${timeErrors.startTime ? 'is-invalid' : ''}`}
                  disabled={isBlocked || !draft.quietHours?.enabled}
                  value={timeInputs.startTime}
                  onChange={(e) => handleTimeInputChange('startTime', e.target.value)}
                  placeholder="22:00"
                  maxLength={5}
                />
                {timeErrors.startTime && (
                  <span className="field-error-text" role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
                    {t('notif_time_invalid')}
                  </span>
                )}
              </div>

              {/* Giờ kết thúc */}
              <div className="form-group">
                <label htmlFor={endTimeInputId} className="form-label">
                  {t('notif_quiet_hours_end')} (HH:mm)
                </label>
                <input
                  type="text"
                  id={endTimeInputId}
                  className={`form-control ${timeErrors.endTime ? 'is-invalid' : ''}`}
                  disabled={isBlocked || !draft.quietHours?.enabled}
                  value={timeInputs.endTime}
                  onChange={(e) => handleTimeInputChange('endTime', e.target.value)}
                  placeholder="07:00"
                  maxLength={5}
                />
                {timeErrors.endTime && (
                  <span className="field-error-text" role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
                    {t('notif_time_invalid')}
                  </span>
                )}
              </div>
            </div>

            {/* Gợi ý khi giờ bắt đầu trùng giờ kết thúc */}
            {isSameTime && draft.quietHours?.enabled && (
              <div className="alert alert-warning" role="alert" style={{ fontSize: '0.85rem', padding: '0.6rem 0.85rem' }}>
                ℹ️ {t('notif_quiet_hours_same_time_hint')}
              </div>
            )}

            {/* Dòng hiển thị cố định: Cảnh báo khẩn cấp luôn được phép */}
            <div className="quiet-hours-bypass-note" style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              ✓ <strong>{t('notif_quiet_hours_urgent_bypass')}</strong>
            </div>
          </div>
        </section>

        {/* Nhóm D: Kênh nhận */}
        <section className="settings-section-group" aria-labelledby="group-channels-heading">
          <h3 id="group-channels-heading" className="settings-group-heading">
            {t('notif_group_channels')}
          </h3>

          <div className="settings-field-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Trên Web */}
            <div className="settings-switch-card">
              <div className="switch-content">
                <label htmlFor={channelWebId} className="switch-label">
                  {t('notif_channel_web')}
                </label>
                <p className="switch-desc">{t('notif_channel_web_desc')}</p>
              </div>
              <label className="switch-control" htmlFor={channelWebId}>
                <input
                  type="checkbox"
                  id={channelWebId}
                  className="switch-input"
                  disabled={isBlocked}
                  checked={draft.channels?.inAppWeb ?? true}
                  onChange={(e) => updateLeafField('channels.inAppWeb', e.target.checked)}
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </label>
            </div>

            {/* Qua Email (Tắt & Disabled, Chưa khả dụng) */}
            <div className="settings-switch-card" style={{ opacity: 0.75 }}>
              <div className="switch-content">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label htmlFor={channelEmailId} className="switch-label">
                    {t('notif_channel_email')}
                  </label>
                  <span
                    className="badge-unavailable"
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: 'var(--color-bg-tertiary, #333)',
                      color: 'var(--color-text-muted)'
                    }}
                  >
                    {t('notif_channel_unavailable')}
                  </span>
                </div>
                <p className="switch-desc">{t('notif_channel_email_desc')}</p>
              </div>
              <label className="switch-control" htmlFor={channelEmailId}>
                <input
                  type="checkbox"
                  id={channelEmailId}
                  className="switch-input"
                  disabled={true}
                  checked={false}
                  onChange={() => {}}
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </label>
            </div>
          </div>
        </section>
      </div>

      {/* Ghi chú minh bạch ngắn gọn */}
      <div className="notif-disclaimer-card alert alert-info" style={{ marginTop: '1.25rem', fontSize: '0.875rem' }}>
        ℹ️ {t('notif_disclaimer_note')}
      </div>
    </div>
  );
}
