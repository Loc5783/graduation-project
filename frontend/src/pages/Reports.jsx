import { useState, useMemo, useEffect } from 'react';
import { deviceConfigs } from '../modules/configs.js';
import { useDeviceContext } from '../context/DeviceContext.jsx';
import { useAuthContext } from '../context/AuthContext.jsx';
import { useLanguage, getDeviceDisplayName } from '../context/LanguageContext.jsx';
import {
  generateLogs,
  enrichLogsWithPreferences,
  calculateShareScore,
  DEMO_DATE
} from '../shared/mockData.js';
import { canExportReport, canEditDevice } from '../shared/roles.js';
import {
  getDeviceIcon,
  ShieldBrandIcon,
  CloseIcon,
  LockIcon
} from '../shared/components/AuthIcons.jsx';

const RETENTION_STORAGE_KEY = 'shp_retention_days';

export default function Reports() {
  const { preferences, setDataTypeEnabled, setAllDataTypes, resetToDefaults } = useDeviceContext();
  const { currentUser } = useAuthContext();
  const { t, language } = useLanguage();

  const userCanExport = canExportReport(currentUser);

  // 1. Quản lý chính sách lưu trữ (7 / 30 / 90 ngày)
  const [retentionDays, setRetentionDays] = useState(() => {
    try {
      const saved = localStorage.getItem(RETENTION_STORAGE_KEY);
      if (saved === '7' || saved === '30' || saved === '90') {
        return Number(saved);
      }
    } catch {}
    return 30;
  });

  const [activeTab, setActiveTab] = useState('transparency'); // 'transparency' | 'consent' | 'logs' | 'retention'
  const [selectedDeviceFilter, setSelectedDeviceFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all'); // 'all' | 'allowed' | 'blocked'
  const [toastMessage, setToastMessage] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [lastPrunedCount, setLastPrunedCount] = useState(0);

  // Tự động lưu retentionDays vào localStorage
  const handleRetentionChange = (days) => {
    const val = Number(days);
    setRetentionDays(val);
    try {
      localStorage.setItem(RETENTION_STORAGE_KEY, String(val));
    } catch {}
    setToastMessage({
      type: 'info',
      text: language === 'vi'
        ? `Đã cập nhật chính sách lưu trữ: Tối đa ${val} ngày. Hệ thống tự động dọn dẹp các thông báo cũ hơn ${val} ngày.`
        : `Updated retention policy: Max ${val} days. Notifications older than ${val} days will be automatically pruned.`
    });
  };

  // 2. Thu thập toàn bộ logs của cả 5 thiết bị và áp dụng preferences + retention policy
  const allEnrichedLogs = useMemo(() => {
    let combined = [];
    for (const config of deviceConfigs) {
      const devLogs = generateLogs(config, 40);
      const devPrefs = preferences[config.id] || {};
      const enriched = enrichLogsWithPreferences(devLogs, devPrefs);
      combined = combined.concat(enriched);
    }
    // Sắp xếp thời gian giảm dần
    combined.sort((a, b) => (b.time > a.time ? 1 : -1));
    return combined;
  }, [preferences]);

  // Áp dụng bộ lọc dọn dẹp tự động theo số ngày lưu trữ (7/30/90 ngày)
  const { filteredLogs, prunedCount } = useMemo(() => {
    // Demo date chuẩn là 2026-10-20
    const refDate = new Date(`${DEMO_DATE}T23:59:59+07:00`).getTime();
    const cutoffTime = refDate - retentionDays * 24 * 60 * 60 * 1000;

    let kept = [];
    let pruned = 0;

    for (const log of allEnrichedLogs) {
      const logTime = new Date(log.isoTime).getTime();
      // Nếu log quá hạn lưu trữ thì tính là bị dọn
      if (logTime < cutoffTime) {
        pruned++;
      } else {
        kept.push(log);
      }
    }

    // Lọc theo thiết bị nếu chọn
    if (selectedDeviceFilter !== 'all') {
      kept = kept.filter(l => l.deviceId === selectedDeviceFilter);
    }

    // Lọc theo trạng thái allowed / blocked nếu chọn
    if (selectedStatusFilter !== 'all') {
      kept = kept.filter(l => l.status === selectedStatusFilter);
    }

    return { filteredLogs: kept, prunedCount: pruned };
  }, [allEnrichedLogs, retentionDays, selectedDeviceFilter, selectedStatusFilter]);

  // Nút dọn dẹp thông báo thủ công
  const handleManualCleanup = () => {
    setLastPrunedCount(prunedCount);
    setToastMessage({
      type: 'success',
      text: language === 'vi'
        ? `Đã hoàn tất dọn dẹp thông báo! Đã loại bỏ các bản ghi cũ hơn ${retentionDays} ngày.`
        : `Notification cleanup completed! Pruned all records older than ${retentionDays} days.`
    });
  };

  // 3. Quản lý sự đồng ý có tác dụng thực tế (Consent Toggle)
  const handleToggleConsent = (deviceId, dataKey, currentStatus) => {
    const userCanEdit = canEditDevice(currentUser, deviceId);
    if (!userCanEdit) {
      alert(language === 'vi' ? 'Bạn không có quyền chỉnh sửa thiết lập của thiết bị này.' : 'You do not have permission to edit this device.');
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
          ? `Consent granted for [${dtLabel}] on ${devName}. Status: ALLOWED.`
          : `Consent revoked for [${dtLabel}] on ${devName}. All access to this data is now BLOCKED in real-time.`
    });
  };

  const handleToggleDeviceAll = (deviceId, enable) => {
    const userCanEdit = canEditDevice(currentUser, deviceId);
    if (!userCanEdit) {
      alert(language === 'vi' ? 'Bạn không có quyền chỉnh sửa thiết bị này.' : 'No permission to modify this device.');
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

  // 4. Xóa dữ liệu có xác nhận (Confirmation Modal)
  const handleConfirmDeleteAll = () => {
    resetToDefaults();
    try {
      localStorage.removeItem(RETENTION_STORAGE_KEY);
      localStorage.removeItem('shp_recent_alerts');
    } catch {}
    setShowDeleteModal(false);
    setToastMessage({
      type: 'danger',
      text: language === 'vi'
        ? 'Đã xóa toàn bộ nhật ký truy cập và đặt lại toàn bộ quyền riêng tư về mặc định an toàn.'
        : 'Purged all logs and reset all privacy consent preferences to safe defaults.'
    });
  };

  // 5. Xuất CSV với UTF-8 BOM chuẩn cho Excel
  const handleExportCSV = () => {
    if (!userCanExport) {
      alert(t('viewer_no_export'));
      return;
    }

    const rows = [];
    rows.push(['BÁO CÁO MINH BẠCH QUYỀN RIÊNG TƯ & DỮ LIỆU NHÀ THÔNG MINH']);
    rows.push(['Thời gian xuất:', new Date().toLocaleString('vi-VN')]);
    rows.push(['Người lập báo cáo:', `${currentUser?.name || 'Khách'} (${currentUser?.role || 'viewer'})`]);
    rows.push(['Mốc thời gian dữ liệu mô phỏng:', `${DEMO_DATE} (Asia/Ho_Chi_Minh)`]);
    rows.push(['Chính sách lưu trữ áp dụng:', `${retentionDays} ngày`]);
    rows.push([]);

    // Bảng 1: Tổng hợp thiết bị
    rows.push(['--- PHẦN 1: TỔNG QUAN ĐIỂM CHIA SẺ & THIẾT BỊ ---']);
    rows.push(['Mã thiết bị', 'Tên thiết bị', 'Người phụ trách', 'Điểm chia sẻ (/100)', 'Số quyền đang bật', 'Số quyền đã chặn (Bảo vệ)']);

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

    // Bảng 2: Chi tiết quyền riêng tư từng loại dữ liệu
    rows.push(['--- PHẦN 2: CHI TIẾT SỰ ĐỒNG Ý & HIỆU LỰC THỰC TẾ ---']);
    rows.push(['Thiết bị', 'Mã quyền', 'Tên dữ liệu', 'Độ nhạy cảm', 'Trạng thái đồng ý', 'Tác dụng kiểm soát thực tế']);

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
          isEn ? 'Dữ liệu được chuyển tiếp cho phép đọc' : 'Chặn truy cập thời gian thực (Zero-Trust)'
        ]);
      }
    }
    rows.push([]);

    // Bảng 3: Nhật ký truy cập thực tế
    rows.push(['--- PHẦN 3: NHẬT KÝ TRUY CẬP & THI HÀNH BẢO MẬT ---']);
    rows.push(['Thời gian', 'Thiết bị', 'Bên truy cập', 'Bên ngoài?', 'Loại dữ liệu', 'Hành động', 'Bất thường?', 'Trạng thái hệ thống']);

    for (const log of filteredLogs.slice(0, 100)) {
      const dev = deviceConfigs.find(d => d.id === log.deviceId);
      rows.push([
        log.time,
        dev?.name || log.deviceId,
        log.accessor,
        log.external ? 'Có (External)' : 'Không (Nội bộ)',
        log.dataLabel,
        log.action,
        log.anomalous ? `Có (${log.reason})` : 'Không',
        log.status === 'allowed' ? 'ĐƯỢC PHÉP' : 'BỊ CHẶN BỞI QUYỀN RIÊNG TƯ'
      ]);
    }

    // Chuyển mảng thành định dạng CSV và đính kèm UTF-8 BOM
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

  // 6. In / Xuất PDF
  const handlePrint = () => {
    if (!userCanExport) {
      alert(t('viewer_no_export'));
      return;
    }
    window.print();
  };

  return (
    <div className="privacy-page">
      {/* Toast thông báo nhanh */}
      {toastMessage && (
        <div className={`privacy-toast alert alert-${toastMessage.type} no-print`} role="alert">
          <span>{toastMessage.text}</span>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setToastMessage(null)}
            aria-label="Đóng"
          >
            ×
          </button>
        </div>
      )}

      {/* Header trang & Nút xuất báo cáo */}
      <div className="privacy-header-row no-print">
        <div className="privacy-title-area">
          <div className="privacy-title-wrap">
            <span className="privacy-title-icon" aria-hidden="true">
              <ShieldBrandIcon />
            </span>
            <h1 className="privacy-title">{t('privacy_title')}</h1>
          </div>
          <p className="privacy-subtitle">
            {t('privacy_subtitle')} — Mốc dữ liệu: <strong>{DEMO_DATE}</strong>
          </p>
        </div>

        <div className="privacy-actions-bar">
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleExportCSV}
            disabled={!userCanExport}
            title={!userCanExport ? t('viewer_no_export') : 'Tải về bảng tính CSV minh bạch'}
          >
            📄 {t('btn_export_csv')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePrint}
            disabled={!userCanExport}
            title={!userCanExport ? t('viewer_no_export') : 'In hoặc lưu báo cáo PDF'}
          >
            🖨️ {t('btn_export_pdf')}
          </button>
        </div>
      </div>

      {!userCanExport && (
        <div className="alert alert-warning no-print">
          🔒 {t('viewer_no_export')}
        </div>
      )}

      {/* Tabs chuyển khu vực tính năng */}
      <div className="privacy-tabs no-print" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'transparency'}
          className={`privacy-tab-btn ${activeTab === 'transparency' ? 'active' : ''}`}
          onClick={() => setActiveTab('transparency')}
        >
          📊 {t('privacy_tab_transparency')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'consent'}
          className={`privacy-tab-btn ${activeTab === 'consent' ? 'active' : ''}`}
          onClick={() => setActiveTab('consent')}
        >
          🛡️ {t('privacy_tab_consent')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'logs'}
          className={`privacy-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          📜 {t('privacy_tab_logs')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'retention'}
          className={`privacy-tab-btn ${activeTab === 'retention' ? 'active' : ''}`}
          onClick={() => setActiveTab('retention')}
        >
          ⚙️ {t('privacy_tab_retention')}
        </button>
      </div>

      {/* =========================================================================
          TAB 1: BÁO CÁO MINH BẠCH & TỔNG QUAN (VỪA XEM VỪA PHỤC VỤ IN / LƯU PDF)
          ========================================================================= */}
      {(activeTab === 'transparency' || typeof window === 'undefined') && (
        <div className="print-report-container">
          <div className="print-report-header">
            <h2>BÁO CÁO MINH BẠCH QUYỀN RIÊNG TƯ DỮ LIỆU NHÀ THÔNG MINH</h2>
            <div className="print-meta-grid">
              <div><strong>Hệ thống:</strong> Smart Home Privacy Dashboard</div>
              <div><strong>Ngày báo cáo:</strong> {DEMO_DATE}</div>
              <div><strong>Người xem:</strong> {currentUser?.name || 'Khách xem'} ({currentUser?.role || 'viewer'})</div>
              <div><strong>Thời hạn lưu trữ:</strong> {retentionDays} ngày</div>
            </div>
          </div>

          {/* Bảng tổng kết 5 thiết bị */}
          <div className="table-responsive-wrapper">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Thiết bị</th>
                  <th>Chủ sở hữu</th>
                  <th>Điểm chia sẻ</th>
                  <th>Dữ liệu đang cho phép</th>
                  <th>Dữ liệu đã chặn (Bảo vệ)</th>
                </tr>
              </thead>
              <tbody>
                {deviceConfigs.map(config => {
                  const devPrefs = preferences[config.id] || {};
                  const score = calculateShareScore(config.dataTypes, devPrefs);
                  const enabledList = [];
                  const disabledList = [];

                  for (const dt of config.dataTypes || []) {
                    const isEnabled = devPrefs[dt.key] !== undefined ? devPrefs[dt.key] : dt.enabled;
                    if (isEnabled) {
                      enabledList.push(dt.label);
                    } else {
                      disabledList.push(dt.label);
                    }
                  }

                  return (
                    <tr key={config.id}>
                      <td>
                        <strong>{getDeviceDisplayName(config.id, t, config.name)}</strong>
                        <div className="device-id-sub"><code>{config.id}</code></div>
                      </td>
                      <td>{config.owner}</td>
                      <td>
                        <span className={`score-badge ${score > 70 ? 'high-share' : score > 30 ? 'mid-share' : 'low-share'}`}>
                          {score}/100
                        </span>
                      </td>
                      <td>
                        {enabledList.length > 0 ? (
                          <div className="tags-wrap">
                            {enabledList.map(item => (
                              <span key={item} className="tag tag-allowed">{item}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted">Đã chặn toàn bộ</span>
                        )}
                      </td>
                      <td>
                        {disabledList.length > 0 ? (
                          <div className="tags-wrap">
                            {disabledList.map(item => (
                              <span key={item} className="tag tag-blocked">🛡️ {item}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted">Không có (Đang mở tất cả)</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: QUẢN LÝ SỰ ĐỒNG Ý CÓ TÁC DỤNG THỰC TẾ (CONSENT MANAGEMENT)
          ========================================================================= */}
      {activeTab === 'consent' && (
        <div className="privacy-consent-section no-print">
          <div className="consent-intro-card">
            <div className="consent-intro-title">
              🛡️ Quản lý sự đồng ý & Kiểm soát thu thập thực tế
            </div>
            <p className="consent-intro-desc">
              {t('consent_active_desc')}
            </p>
          </div>

          <div className="consent-device-grid">
            {deviceConfigs.map(config => {
              const devPrefs = preferences[config.id] || {};
              const score = calculateShareScore(config.dataTypes, devPrefs);
              const userCanEdit = canEditDevice(currentUser, config.id);

              return (
                <div key={config.id} className="consent-card">
                  <div className="consent-card-header">
                    <div className="consent-device-info">
                      <span className="consent-dev-icon">{getDeviceIcon(config.id)}</span>
                      <div>
                        <h3 className="consent-dev-name">{getDeviceDisplayName(config.id, t, config.name)}</h3>
                        <span className="consent-dev-owner">Phụ trách: <strong>{config.owner}</strong></span>
                      </div>
                    </div>
                    <div className="consent-score-box">
                      <span className="score-num">{score}/100</span>
                      <span className="score-lbl">Điểm chia sẻ</span>
                    </div>
                  </div>

                  <div className="consent-quick-buttons">
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
                      className="btn btn-outline btn-xs btn-outline-danger"
                    >
                      Chặn tất cả
                    </button>
                  </div>

                  <div className="consent-types-list">
                    {config.dataTypes.map(dt => {
                      const isEnabled = devPrefs[dt.key] !== undefined ? devPrefs[dt.key] : dt.enabled;
                      return (
                        <div key={dt.key} className="consent-item-row">
                          <div className="consent-item-info">
                            <span className="consent-item-label">{dt.label}</span>
                            <div className="consent-item-sub">
                              <span className={`sensitivity-tag sensitivity-${dt.sensitivity}`}>
                                {dt.sensitivity === 'high' ? 'Độ nhạy cao' : dt.sensitivity === 'medium' ? 'Độ nhạy vừa' : 'Độ nhạy thấp'}
                              </span>
                              <code>{dt.key}</code>
                            </div>
                          </div>

                          <div className="consent-toggle-wrapper">
                            <label className="privacy-switch">
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                disabled={!userCanEdit}
                                onChange={() => handleToggleConsent(config.id, dt.key, isEnabled)}
                              />
                              <span className="privacy-slider"></span>
                            </label>
                            <span className={`status-pill ${isEnabled ? 'status-allowed' : 'status-blocked'}`}>
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
        </div>
      )}

      {/* =========================================================================
          TAB 3: NHẬT KÝ TRUY CẬP VÀ BỘ LỌC (ACCESS LOGS & AUDIT TRAIL)
          ========================================================================= */}
      {activeTab === 'logs' && (
        <div className="privacy-logs-section no-print">
          <div className="logs-filter-bar">
            <div className="filter-group">
              <label htmlFor="dev-filter">Lọc theo thiết bị:</label>
              <select
                id="dev-filter"
                value={selectedDeviceFilter}
                onChange={(e) => setSelectedDeviceFilter(e.target.value)}
                className="form-select-filter"
              >
                <option value="all">Tất cả thiết bị (5)</option>
                {deviceConfigs.map(d => (
                  <option key={d.id} value={d.id}>{getDeviceDisplayName(d.id, t, d.name)}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="status-filter">Lọc theo kết quả kiểm soát:</label>
              <select
                id="status-filter"
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="form-select-filter"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="allowed">Được phép (Allowed)</option>
                <option value="blocked">Đã chặn bởi quyền riêng tư (Blocked)</option>
              </select>
            </div>

            <div className="logs-count-badge">
              Hiển thị: <strong>{filteredLogs.length}</strong> bản ghi (trong hạn {retentionDays} ngày)
            </div>
          </div>

          <div className="table-responsive-wrapper">
            <table className="report-table logs-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Thiết bị</th>
                  <th>Bên yêu cầu</th>
                  <th>Loại dữ liệu</th>
                  <th>Hành động</th>
                  <th>Cảnh báo bất thường</th>
                  <th>Kiểm soát thực tế</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.slice(0, 50).map(log => {
                  const dev = deviceConfigs.find(d => d.id === log.deviceId);
                  return (
                    <tr key={log.id} className={log.status === 'blocked' ? 'row-blocked' : ''}>
                      <td className="log-time-cell"><code>{log.time.split(' ')[1]}</code></td>
                      <td><strong>{dev?.name || log.deviceId}</strong></td>
                      <td>
                        <span className={`accessor-pill ${log.external ? 'external' : 'internal'}`}>
                          {log.accessor} {log.external ? '(Ngoài)' : '(Nội bộ)'}
                        </span>
                      </td>
                      <td>{log.dataLabel}</td>
                      <td><span className="action-tag">{log.action}</span></td>
                      <td>
                        {log.anomalous ? (
                          <span className="anomaly-warning" title={log.reason}>
                            ⚠️ Bất thường ({log.reason})
                          </span>
                        ) : (
                          <span className="text-muted">Bình thường</span>
                        )}
                      </td>
                      <td>
                        {log.status === 'allowed' ? (
                          <span className="status-pill status-allowed">ĐƯỢC PHÉP</span>
                        ) : (
                          <span className="status-pill status-blocked">🛡️ ĐÃ CHẶN</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: CHÍNH SÁCH LƯU TRỮ (7/30/90 NGÀY) & KHU VỰC NGUY HIỂM XÓA DỮ LIỆU
          ========================================================================= */}
      {activeTab === 'retention' && (
        <div className="privacy-retention-section no-print">
          {/* Cấu hình thời hạn lưu trữ */}
          <div className="settings-card">
            <div className="settings-card-header">
              <h3>Chính sách tự động dọn dẹp thông báo & nhật ký</h3>
              <p className="settings-card-desc">{t('retention_desc')}</p>
            </div>

            <div className="retention-options-row">
              <div className="retention-select-wrap">
                <label htmlFor="retention-select">Thời hạn lưu trữ:</label>
                <select
                  id="retention-select"
                  value={retentionDays}
                  onChange={(e) => handleRetentionChange(e.target.value)}
                  className="form-select-retention"
                >
                  <option value={7}>{t('retention_7_days')}</option>
                  <option value={30}>{t('retention_30_days')}</option>
                  <option value={90}>{t('retention_90_days')}</option>
                </select>
              </div>

              <button
                type="button"
                className="btn btn-outline"
                onClick={handleManualCleanup}
              >
                🧹 {t('btn_cleanup_now')}
              </button>
            </div>

            <div className="retention-status-box">
              <div className="status-icon">ℹ️</div>
              <div>
                <strong>Cơ chế bảo vệ dữ liệu tự động:</strong> Mọi thông báo và bản ghi nhật ký vượt quá <strong>{retentionDays} ngày</strong> sẽ được dọn dẹp tự động để bảo vệ quyền riêng tư người dùng theo tiêu chuẩn GDPR.
              </div>
            </div>
          </div>

          {/* Khu vực nguy hiểm: Xóa dữ liệu có xác nhận */}
          <div className="settings-card danger-zone-card">
            <div className="settings-card-header">
              <h3 className="danger-zone-title">⚠️ Khu vực nguy hiểm: Xóa dữ liệu & Đặt lại</h3>
              <p className="settings-card-desc">
                Đặt lại toàn bộ quyền riêng tư về mặc định ban đầu và dọn sạch bộ nhớ cache trình duyệt.
              </p>
            </div>

            <div className="danger-zone-action">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setShowDeleteModal(true)}
              >
                🗑️ {t('btn_delete_data')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL XÁC NHẬN XÓA DỮ LIỆU (DATA DELETION CONFIRMATION MODAL)
          ========================================================================= */}
      {showDeleteModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h3 id="modal-title" className="modal-title">
                ⚠️ {t('delete_modal_title')}
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
              <p className="modal-warning-text">
                {t('delete_modal_warning')}
              </p>
              <div className="modal-item-list">
                <div>✓ Đặt lại quyền riêng tư của cả 5 thiết bị về trạng thái an toàn ban đầu.</div>
                <div>✓ Dọn dẹp bộ nhớ tạm lưu trữ preferences trên thiết bị này.</div>
                <div>✓ Xóa lịch sử thông báo cảnh báo đã tích lũy.</div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowDeleteModal(false)}
              >
                {t('delete_modal_cancel')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDeleteAll}
              >
                {t('delete_modal_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
