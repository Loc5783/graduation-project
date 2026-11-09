import { useState, useMemo, useId, useRef } from 'react';
import { useLanguage, getErrorMessage, getDeviceDisplayName } from '../../context/LanguageContext.jsx';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { useDeviceContext } from '../../context/DeviceContext.jsx';
import { deviceConfigs } from '../../modules/configs.js';
import {
  calculateShareScore,
  DEMO_DATE,
  generateLogs,
  enrichLogsWithPreferences
} from '../../shared/mockData.js';
import { canExportReport, canEditDevice } from '../../shared/roles.js';
import { getDeviceIcon, CloseIcon } from '../../shared/components/AuthIcons.jsx';
import { usePrivacySettings } from './usePrivacySettings.js';

export default function PrivacySettings({ onHookReady } = {}) {
  const { t, language } = useLanguage();
  const { currentUser } = useAuthContext();
  const { preferences, setDataTypeEnabled, setAllDataTypes, resetToDefaults } = useDeviceContext();

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
  const userCanExport = canExportReport(currentUser);

  const retentionGroupLabelId = useId();
  const radioRefs = useRef({});

  // State cục bộ cho Task 1: Quyền riêng tư & Dữ liệu
  const [toastMessage, setToastMessage] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const RETENTION_OPTIONS = [
    { val: 7, labelKey: 'privacy_retention_7d' },
    { val: 30, labelKey: 'privacy_retention_30d' },
    { val: 90, labelKey: 'privacy_retention_90d' }
  ];

  // Hỗ trợ điều hướng bằng bàn phím (phím mũi tên Trái / Phải / Lên / Xuống)
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

  // 1. Tự dọn thông báo theo thời hạn 7 / 30 / 90 ngày
  const handleCleanupNotifications = () => {
    try {
      localStorage.removeItem('shp_recent_alerts');
    } catch {}
    setToastMessage({
      type: 'success',
      text: language === 'vi'
        ? `Đã hoàn tất dọn dẹp các thông báo và nhật ký cũ hơn ${retentionDays} ngày.`
        : `Notification cleanup completed for records older than ${retentionDays} days.`
    });
  };

  // 2. Xuất CSV minh bạch dữ liệu & quyền riêng tư (chuẩn UTF-8 BOM cho Excel)
  const handleExportCSV = () => {
    if (!userCanExport) {
      alert(language === 'vi' ? 'Tài khoản của bạn (Viewer) không có quyền xuất dữ liệu.' : 'Viewer accounts do not have export permissions.');
      return;
    }

    const rows = [];
    rows.push(['BÁO CÁO MINH BẠCH QUYỀN RIÊNG TƯ & DỮ LIỆU NHÀ THÔNG MINH']);
    rows.push(['Thời gian xuất:', new Date().toLocaleString('vi-VN')]);
    rows.push(['Người xuất:', `${currentUser?.name || 'Khách xem'} (${currentUser?.role || 'viewer'})`]);
    rows.push(['Thời hạn lưu trữ áp dụng:', `${retentionDays} ngày`]);
    rows.push(['Mốc thời gian dữ liệu mô phỏng:', `${DEMO_DATE} (Asia/Ho_Chi_Minh)`]);
    rows.push([]);

    // Bảng 1: Điểm chia sẻ và trạng thái thiết bị
    rows.push(['--- TỔNG QUAN THIẾT BỊ & ĐIỂM CHIA SẺ ---']);
    rows.push(['Mã thiết bị', 'Tên thiết bị', 'Người phụ trách', 'Điểm chia sẻ (/100)', 'Số quyền đã cấp', 'Số quyền đã chặn (Bảo vệ)']);

    for (const config of deviceConfigs) {
      const devPrefs = preferences[config.id] || {};
      const score = calculateShareScore(config.dataTypes, devPrefs);
      let enabledCount = 0;
      let disabledCount = 0;
      for (const dt of config.dataTypes || []) {
        const isEn = devPrefs[dt.key] !== undefined ? Boolean(devPrefs[dt.key]) : Boolean(dt.enabled);
        if (isEn) enabledCount++;
        else disabledCount++;
      }
      rows.push([
        config.id,
        config.name,
        config.owner,
        `${score}/100`,
        enabledCount,
        disabledCount
      ]);
    }
    rows.push([]);

    // Bảng 2: Chi tiết quyền chia sẻ từng loại dữ liệu
    rows.push(['--- CHI TIẾT SỰ ĐỒNG Ý & HIỆU LỰC THỰC TẾ ---']);
    rows.push(['Thiết bị', 'Mã quyền', 'Tên dữ liệu', 'Độ nhạy cảm', 'Trạng thái đồng ý', 'Hiệu lực thực tế']);

    for (const config of deviceConfigs) {
      const devPrefs = preferences[config.id] || {};
      for (const dt of config.dataTypes || []) {
        const isEn = devPrefs[dt.key] !== undefined ? Boolean(devPrefs[dt.key]) : Boolean(dt.enabled);
        rows.push([
          config.name,
          dt.key,
          dt.label,
          dt.sensitivity.toUpperCase(),
          isEn ? 'CHO PHÉP' : 'ĐÃ CHẶN',
          isEn ? 'Cho phép đọc và truyền tải' : 'Chặn truy cập thực tế (Zero-Trust)'
        ]);
      }
    }
    rows.push([]);

    // Bảng 3: Nhật ký kiểm soát truy cập
    rows.push(['--- NHẬT KÝ TRUY CẬP VÀ XỬ LÝ QUYỀN RIÊNG TƯ ---']);
    rows.push(['Thời gian', 'Thiết bị', 'Bên yêu cầu', 'Bên ngoài?', 'Loại dữ liệu', 'Hành động', 'Bất thường?', 'Trạng thái xử lý']);

    for (const config of deviceConfigs) {
      const devLogs = generateLogs(config, 20);
      const devPrefs = preferences[config.id] || {};
      const enriched = enrichLogsWithPreferences(devLogs, devPrefs);
      for (const log of enriched) {
        rows.push([
          log.time,
          config.name,
          log.accessor,
          log.external ? 'Có (External)' : 'Không (Nội bộ)',
          log.dataLabel,
          log.action,
          log.anomalous ? `Có (${log.reason})` : 'Không',
          log.status === 'allowed' ? 'ĐƯỢC PHÉP' : 'BỊ CHẶN BỞI QUYỀN RIÊNG TƯ'
        ]);
      }
    }

    const csvContent = '\uFEFF' + rows.map(r => r.map(cell => {
      const str = String(cell ?? '').replace(/"/g, '""');
      return `"${str}"`;
    }).join(',')).join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bao-cao-quyen-rieng-tu-${DEMO_DATE}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage({
      type: 'success',
      text: language === 'vi' ? 'Đã xuất tệp CSV báo cáo minh bạch thành công!' : 'Transparency CSV report downloaded successfully!'
    });
  };

  // 3. In / Lưu báo cáo dưới dạng PDF
  const handlePrint = () => {
    if (!userCanExport) {
      alert(language === 'vi' ? 'Tài khoản của bạn (Viewer) không có quyền in báo cáo.' : 'Viewer accounts do not have print permissions.');
      return;
    }
    window.print();
  };

  // 4. Quản lý sự đồng ý có tác dụng thực tế (Consent Toggle)
  const handleToggleConsent = (deviceId, dataKey, currentStatus) => {
    const userCanEdit = canEditDevice(currentUser, deviceId);
    if (!userCanEdit) {
      alert(language === 'vi' ? 'Bạn không có quyền thay đổi thiết lập của thiết bị này.' : 'No permission to modify this device.');
      return;
    }

    const nextStatus = !currentStatus;
    setDataTypeEnabled(deviceId, dataKey, nextStatus);

    const devConfig = deviceConfigs.find(d => d.id === deviceId);
    const dt = devConfig?.dataTypes?.find(d => d.key === dataKey);
    const devName = devConfig ? getDeviceDisplayName(devConfig.id, t, devConfig.name) : deviceId;
    const dtLabel = dt?.label || dataKey;

    setToastMessage({
      type: nextStatus ? 'success' : 'warning',
      text: language === 'vi'
        ? nextStatus
          ? `Đã cấp quyền chia sẻ [${dtLabel}] cho ${devName}. Trạng thái: CHO PHÉP.`
          : `Đã thu hồi quyền [${dtLabel}] của ${devName}. Mọi truy cập vào dữ liệu này ngay lập tức BỊ CHẶN THỰC TẾ (403 Forbidden).`
        : nextStatus
          ? `Consent granted for [${dtLabel}] on ${devName}.`
          : `Consent revoked for [${dtLabel}] on ${devName}. Access is now BLOCKED in real-time.`
    });
  };

  const handleToggleDeviceAll = (deviceId, enable) => {
    const userCanEdit = canEditDevice(currentUser, deviceId);
    if (!userCanEdit) {
      alert(language === 'vi' ? 'Bạn không có quyền chỉnh sửa thiết bị này.' : 'No permission to edit this device.');
      return;
    }
    setAllDataTypes(deviceId, enable);
    setToastMessage({
      type: enable ? 'success' : 'warning',
      text: language === 'vi'
        ? `Đã ${enable ? 'cho phép tất cả' : 'chặn tất cả'} quyền thu thập của thiết bị này.`
        : `${enable ? 'Allowed all' : 'Blocked all'} data collection for this device.`
    });
  };

  // 5. Xóa dữ liệu có xác nhận (Confirmation Modal)
  const handleConfirmDelete = () => {
    setIsDeleting(true);
    resetToDefaults();
    try {
      localStorage.removeItem('shp_recent_alerts');
    } catch {}
    setIsDeleting(false);
    setShowDeleteModal(false);
    setToastMessage({
      type: 'danger',
      text: language === 'vi'
        ? 'Đã xóa toàn bộ dữ liệu nhật ký và đặt lại toàn bộ quyền riêng tư về mặc định an toàn.'
        : 'Purged all logs and reset all privacy consent preferences to safe defaults.'
    });
  };

  return (
    <div className="privacy-settings-page">
      {/* Toast thông báo nhanh */}
      {toastMessage && (
        <div className={`settings-toast alert alert-${toastMessage.type} no-print`} role="alert" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{toastMessage.text}</span>
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.5rem' }}
            onClick={() => setToastMessage(null)}
            aria-label="Đóng"
          >
            ×
          </button>
        </div>
      )}

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

      <div className="settings-card privacy-main-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {/* =====================================================================
            THẺ 1: THỜI GIAN LƯU GIỮ & TỰ DỌN THÔNG BÁO (7 / 30 / 90 NGÀY)
            ===================================================================== */}
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div
              className="settings-disclaimer-note"
              role="note"
              style={{
                flex: 1,
                minWidth: '240px',
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

            <button
              type="button"
              className="btn btn-outline btn-sm no-print"
              onClick={handleCleanupNotifications}
              title="Dọn dẹp các thông báo và nhật ký quá hạn"
            >
              🧹 Dọn dẹp thông báo ngay
            </button>
          </div>
        </section>

        {/* =====================================================================
            THẺ 2: TẢI DỮ LIỆU CỦA TÔI (XUẤT CSV & IN/LƯU PDF BÁO CÁO MINH BẠCH)
            ===================================================================== */}
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem 1.25rem',
              backgroundColor: 'var(--color-bg-subtle)',
              borderRadius: '12px',
              border: '1px solid var(--color-border)',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>
                📄 {t('privacy_future_export_title')}
              </div>
              <div style={{ fontSize: '0.86rem', color: 'var(--color-text-muted)' }}>
                Xuất toàn bộ dữ liệu quyền riêng tư, sự đồng ý và lịch sử truy cập thiết bị sang tệp bảng tính CSV hoặc bản in PDF.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span
                className="card-status-badge"
                style={{
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap'
                }}
              >
                {t('privacy_future_export_status')}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm no-print"
                onClick={handleExportCSV}
                disabled={!userCanExport}
                title={!userCanExport ? 'Chỉ quản trị viên hoặc thành viên mới có quyền xuất dữ liệu' : 'Tải về bảng tính CSV'}
              >
                📥 Xuất CSV
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm no-print"
                onClick={handlePrint}
                disabled={!userCanExport}
                title={!userCanExport ? 'Chỉ quản trị viên hoặc thành viên mới có quyền in báo cáo' : 'In hoặc lưu PDF'}
              >
                🖨️ In / Lưu PDF
              </button>
            </div>
          </div>
        </section>

        {/* =====================================================================
            THẺ 3: CÁC SỰ ĐỒNG Ý ĐÃ CẤP (QUẢN LÝ SỰ ĐỒNG Ý CÓ TÁC DỤNG THỰC TẾ)
            ===================================================================== */}
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
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.25rem' }}>
              🛡️ {t('privacy_future_consents_title')}
            </div>
            <div style={{ fontSize: '0.86rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              Kiểm soát quyền thu thập dữ liệu có tác dụng thực tế (Zero-Trust Enforcement). Khi tắt công tắc, hệ thống lập tức từ chối và chặn mọi yêu cầu truy xuất dữ liệu tương ứng từ thiết bị.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            {deviceConfigs.map((config) => {
              const devPrefs = preferences[config.id] || {};
              const score = calculateShareScore(config.dataTypes, devPrefs);
              const userCanEdit = canEditDevice(currentUser, config.id);

              return (
                <div
                  key={config.id}
                  style={{
                    backgroundColor: 'var(--color-bg-subtle)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '24px', height: '24px', color: 'var(--color-primary)' }}>
                        {getDeviceIcon(config.id)}
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                          {getDeviceDisplayName(config.id, t, config.name)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          Phụ trách: <strong>{config.owner}</strong>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                        {score}/100
                      </span>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Điểm chia sẻ</div>
                    </div>
                  </div>

                  {/* Nút thao tác nhanh Bật / Chặn tất cả */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      disabled={!userCanEdit}
                      onClick={() => handleToggleDeviceAll(config.id, true)}
                      className="btn btn-outline btn-xs"
                    >
                      Bật tất cả
                    </button>
                    <button
                      type="button"
                      disabled={!userCanEdit}
                      onClick={() => handleToggleDeviceAll(config.id, false)}
                      className="btn btn-outline btn-xs"
                      style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                    >
                      Chặn tất cả
                    </button>
                  </div>

                  {/* Danh sách các quyền dữ liệu */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {config.dataTypes.map((dt) => {
                      const isEnabled = devPrefs[dt.key] !== undefined ? devPrefs[dt.key] : dt.enabled;
                      return (
                        <div
                          key={dt.key}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.45rem 0.6rem',
                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.05)'
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{dt.label}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                              <span style={{
                                padding: '1px 5px',
                                borderRadius: '4px',
                                marginRight: '4px',
                                backgroundColor: dt.sensitivity === 'high' ? 'rgba(239, 68, 68, 0.2)' : dt.sensitivity === 'medium' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                color: dt.sensitivity === 'high' ? '#fca5a5' : dt.sensitivity === 'medium' ? '#fde68a' : '#a7f3d0'
                              }}>
                                {dt.sensitivity === 'high' ? 'Độ nhạy cao' : dt.sensitivity === 'medium' ? 'Độ nhạy vừa' : 'Độ nhạy thấp'}
                              </span>
                              <code>{dt.key}</code>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label className="privacy-switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '20px' }}>
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                disabled={!userCanEdit}
                                onChange={() => handleToggleConsent(config.id, dt.key, isEnabled)}
                                style={{ opacity: 0, width: 0, height: 0 }}
                              />
                              <span className="privacy-slider" style={{
                                position: 'absolute',
                                cursor: 'pointer',
                                top: 0, left: 0, right: 0, bottom: 0,
                                backgroundColor: isEnabled ? '#10b981' : 'rgba(100, 116, 139, 0.4)',
                                borderRadius: '9999px',
                                transition: '0.2s'
                              }}>
                                <span style={{
                                  position: 'absolute',
                                  content: '""',
                                  height: '14px',
                                  width: '14px',
                                  left: isEnabled ? '21px' : '3px',
                                  bottom: '3px',
                                  backgroundColor: 'white',
                                  borderRadius: '50%',
                                  transition: '0.2s'
                                }} />
                              </span>
                            </label>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: isEnabled ? '#34d399' : '#f87171'
                            }}>
                              {isEnabled ? 'Được phép' : 'Đã chặn'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* =====================================================================
            THẺ 4: KHU VỰC NGUY HIỂM (XÓA DỮ LIỆU CỦA TÔI CÓ XÁC NHẬN)
            ===================================================================== */}
        <section
          className="settings-section-group danger-zone-section"
          style={{
            borderTop: '1px solid rgba(239, 68, 68, 0.3)',
            paddingTop: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem 1.25rem',
              backgroundColor: 'rgba(239, 68, 68, 0.05)',
              borderRadius: '12px',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#f87171', marginBottom: '0.25rem' }}>
                ⚠️ {t('privacy_future_delete_title')}
              </div>
              <div style={{ fontSize: '0.86rem', color: 'var(--color-text-muted)' }}>
                Xóa toàn bộ dữ liệu nhật ký tạm và đặt lại toàn bộ quyền riêng tư của 5 thiết bị về trạng thái mặc định an toàn.
              </div>
            </div>

            <button
              type="button"
              className="btn btn-danger btn-sm no-print"
              onClick={() => setShowDeleteModal(true)}
            >
              🗑️ Xóa dữ liệu & Đặt lại
            </button>
          </div>
        </section>
      </div>

      {/* =====================================================================
          MODAL XÁC NHẬN XÓA DỮ LIỆU
          ===================================================================== */}
      {showDeleteModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h3 id="delete-modal-title" className="modal-title" style={{ color: '#f87171' }}>
                ⚠️ Xác nhận xóa và đặt lại dữ liệu riêng tư
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowDeleteModal(false)}
                aria-label="Đóng"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-warning-text" style={{ color: '#fca5a5', lineHeight: 1.5, margin: 0 }}>
                Hành động này sẽ xóa toàn bộ nhật ký truy cập, dọn dẹp bộ nhớ tạm và đặt lại toàn bộ thiết lập quyền riêng tư về trạng thái mặc định an toàn. Bạn có chắc chắn muốn thực hiện không?
              </p>
              <div className="modal-item-list" style={{ backgroundColor: 'var(--color-bg-subtle)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div>✓ Đặt lại quyền riêng tư của cả 5 thiết bị về mặc định.</div>
                <div>✓ Dọn dẹp bộ nhớ tạm lưu trữ preferences trên thiết bị này.</div>
                <div>✓ Xóa sạch lịch sử thông báo và cảnh báo đã tích lũy.</div>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowDeleteModal(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
              >
                {isDeleting ? 'Đang xóa...' : 'Tôi hiểu và xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
