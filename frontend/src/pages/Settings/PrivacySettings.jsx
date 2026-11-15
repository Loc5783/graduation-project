import { useId, useRef } from 'react';
import { useLanguage, getErrorMessage } from '../../context/LanguageContext.jsx';
import { usePrivacySettings } from './usePrivacySettings.js';

export default function PrivacySettings({ onHookReady } = {}) {
  const { t } = useLanguage();
  const hook = usePrivacySettings();

  if (typeof onHookReady === 'function') {
    onHookReady(hook);
  }

  const {
    retentionDays,
    loadStatus,
    saveStatus,
    saveError,
    isPreview,
    changeRetentionDays,
    retrySave,
    reloadSettings
  } = hook;

  const isBlocked = loadStatus === 'loading' && !isPreview;

  const retentionGroupLabelId = useId();
  const radioRefs = useRef({});

  const RETENTION_OPTIONS = [
    { val: 7, labelKey: 'privacy_retention_7d' },
    { val: 30, labelKey: 'privacy_retention_30d' },
    { val: 90, labelKey: 'privacy_retention_90d' }
  ];

  // Hỗ trợ điều hướng bằng bàn phím (phím mũi tên Trái / Phải / Lên / Xuống)
  // Khi dùng phím mũi tên: chuyển cả lựa chọn và focus tới radio tương ứng
  const handleKeyDown = (e, currentVal) => {
    if (isBlocked) return;

    const currentIndex = RETENTION_OPTIONS.findIndex((opt) => opt.val === currentVal);
    if (currentIndex === -1) return;

    let targetIndex = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      targetIndex = (currentIndex + 1) % RETENTION_OPTIONS.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      targetIndex = (currentIndex - 1 + RETENTION_OPTIONS.length) % RETENTION_OPTIONS.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIndex = RETENTION_OPTIONS.length - 1;
    }

    if (targetIndex !== -1) {
      const nextVal = RETENTION_OPTIONS[targetIndex].val;
      if (nextVal !== currentVal) {
        changeRetentionDays(nextVal);
      }
      const targetEl = radioRefs.current[nextVal];
      if (targetEl && typeof targetEl.focus === 'function') {
        targetEl.focus();
      }
    }
  };

  return (
    <div className="privacy-settings-page">
      <div className="settings-page-header">
        <h2 className="settings-page-title">{t('privacy_title')}</h2>
        <p className="settings-page-desc">{t('privacy_subtitle')}</p>
      </div>

      {/* Thanh trạng thái lưu và thông báo lỗi tải */}
      <div className="settings-status-bar" role="status" aria-live="polite" style={{ marginBottom: '1.25rem' }}>
        {isPreview && (
          <div className="status-badge status-preview">
            ℹ️ {t('privacy_preview_notice')}
          </div>
        )}

        {!isPreview && loadStatus === 'loading' && (
          <div className="status-badge status-loading">
            <span className="spinner-mini" aria-hidden="true"></span>
            {t('privacy_status_loading')}
          </div>
        )}

        {!isPreview && loadStatus === 'error' && (
          <div className="status-badge status-error" role="alert">
            <span>⚠️ {t('privacy_status_load_error')}</span>
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={reloadSettings}
            >
              {t('privacy_btn_retry')}
            </button>
          </div>
        )}

        {!isPreview && loadStatus !== 'loading' && loadStatus !== 'error' && saveStatus === 'saving' && (
          <div className="status-badge status-saving">
            <span className="spinner-mini" aria-hidden="true"></span>
            {t('privacy_status_saving')}
          </div>
        )}

        {!isPreview && loadStatus !== 'loading' && loadStatus !== 'error' && saveStatus === 'saved' && (
          <div className="status-badge status-saved">
            ✓ {t('privacy_status_saved')}
          </div>
        )}

        {!isPreview && loadStatus !== 'loading' && loadStatus !== 'error' && saveStatus === 'error' && (
          <div className="status-badge status-error" role="alert">
            <span>
              ⚠️ {t('privacy_status_error')}
              {saveError && ` (${getErrorMessage(saveError, t)})`}
            </span>
            <button
              type="button"
              className="btn btn-outline btn-xs btn-retry-save"
              onClick={retrySave}
            >
              {t('privacy_btn_retry')}
            </button>
          </div>
        )}
      </div>

      <div className="settings-card privacy-main-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Thẻ 1: Thời gian lưu giữ */}
        <section className="settings-section-group" aria-labelledby={retentionGroupLabelId}>
          <div style={{ marginBottom: '0.75rem' }}>
            <h3 id={retentionGroupLabelId} className="settings-group-heading" style={{ marginBottom: '0.25rem' }}>
              {t('privacy_retention_card_title')}
            </h3>
            <p className="settings-group-desc" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: 0 }}>
              {t('privacy_retention_card_desc')}
            </p>
          </div>

          <div
            className="btn-toggle-row"
            role="radiogroup"
            aria-labelledby={retentionGroupLabelId}
            style={{ marginTop: '0.75rem' }}
          >
            {RETENTION_OPTIONS.map((opt) => {
              const isSelected = retentionDays === opt.val;
              return (
                <button
                  key={opt.val}
                  ref={(el) => {
                    if (el) {
                      radioRefs.current[opt.val] = el;
                    } else {
                      delete radioRefs.current[opt.val];
                    }
                  }}
                  type="button"
                  role="radio"
                  disabled={isBlocked}
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  className={`btn-choice ${isSelected ? 'active' : ''}`}
                  onClick={() => changeRetentionDays(opt.val)}
                  onKeyDown={(e) => handleKeyDown(e, opt.val)}
                >
                  {t(opt.labelKey)}
                </button>
              );
            })}
          </div>

          {/* Chú thích quan trọng: chỉ lưu lựa chọn, chưa bật chức năng tự dọn */}
          <div
            className="settings-disclaimer-note"
            role="note"
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--color-bg-subtle)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              fontSize: '0.85rem',
              color: 'var(--color-text-muted)'
            }}
          >
            ℹ️ {t('privacy_retention_disclaimer')}
          </div>
        </section>

        {/* Các mục chức năng tương lai: hiển thị trạng thái chưa khả dụng, không có nút thao tác giả */}
        <section
          className="settings-section-group"
          style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}
        >
          {/* Tải dữ liệu của tôi */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--color-bg-subtle)',
              borderRadius: '8px',
              border: '1px solid var(--color-border)'
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.2rem' }}>
                {t('privacy_future_export_title')}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                {t('privacy_future_export_desc')}
              </div>
            </div>
            <span
              className="card-status-badge"
              style={{
                padding: '0.2rem 0.5rem',
                fontSize: '0.75rem',
                whiteSpace: 'nowrap',
                marginLeft: '0.75rem'
              }}
            >
              {t('privacy_future_export_status')}
            </span>
          </div>

          {/* Các sự đồng ý đã cấp */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--color-bg-subtle)',
              borderRadius: '8px',
              border: '1px solid var(--color-border)'
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.2rem' }}>
                {t('privacy_future_consents_title')}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                {t('privacy_future_consents_desc')}
              </div>
            </div>
            <span
              className="card-status-badge"
              style={{
                padding: '0.2rem 0.5rem',
                fontSize: '0.75rem',
                whiteSpace: 'nowrap',
                marginLeft: '0.75rem'
              }}
            >
              {t('privacy_future_consents_status')}
            </span>
          </div>

          {/* Xóa dữ liệu của tôi */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--color-bg-subtle)',
              borderRadius: '8px',
              border: '1px solid var(--color-border)'
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.2rem' }}>
                {t('privacy_future_delete_title')}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                {t('privacy_future_delete_desc')}
              </div>
            </div>
            <span
              className="card-status-badge"
              style={{
                padding: '0.2rem 0.5rem',
                fontSize: '0.75rem',
                whiteSpace: 'nowrap',
                marginLeft: '0.75rem'
              }}
            >
              {t('privacy_future_delete_status')}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
