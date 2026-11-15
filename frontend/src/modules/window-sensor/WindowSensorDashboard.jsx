import { useLanguage } from '../../context/LanguageContext.jsx';
import { useWindowSensorHistory } from './useWindowSensorHistory.js';
import WindowVisualizer from './WindowVisualizer.jsx';
import WindowTimelineChart from './WindowTimelineChart.jsx';
import WindowDurationDoughnut from './WindowDurationDoughnut.jsx';
import WindowActivityLog from './WindowActivityLog.jsx';
import './WindowSensorDashboard.css';

export default function WindowSensorDashboard() {
  const { lang } = useLanguage();
  const en = lang === 'en';

  const {
    device,
    isLive,
    data,
    error,
    timeline,
    durations,
    events
  } = useWindowSensorHistory();

  const hasData = data !== null && typeof data === 'object';
  const doorOpen = hasData && typeof data.doorOpen === 'boolean' ? data.doorOpen : null;
  const motion = hasData && typeof data.motion === 'boolean' ? data.motion : null;
  const alarm = hasData && typeof data.alarm === 'boolean' ? data.alarm : false;
  const uptimeMs = hasData && typeof data.uptimeMs === 'number' ? data.uptimeMs : null;
  const ageSeconds = device?.ageSeconds ?? null;

  const formatUptime = (ms) => {
    if (!ms || ms <= 0) return '--';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m > 60) {
      const h = Math.floor(m / 60);
      return `${h}h ${m % 60}m`;
    }
    return `${m}m ${s}s`;
  };

  return (
    <div className="window-dashboard-root live-device-panel" aria-label={en ? 'Window Sensor Live Dashboard' : 'Bảng điều khiển cảm biến cửa sổ'}>
      {/* 1. Header gọn gàng của trang */}
      <header className="window-dashboard-header">
        <div className="header-left">
          <div className="device-brand-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="header-icon" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <line x1="12" x2="12" y1="3" y2="21" />
              <line x1="3" x2="21" y1="12" y2="12" />
            </svg>
          </div>
          <div>
            <h2 className="dashboard-title">{en ? 'Window Sensor' : 'Cảm biến Cửa sổ'}</h2>
            <p className="dashboard-subtitle">
              {en ? 'Physical MC-38 Reed Switch & PIR Motion Telemetry' : 'Dữ liệu thực tế từ tiếp điểm từ MC-38 & cảm biến chuyển động PIR'}
            </p>
          </div>
        </div>

        <div className="header-right">
          <span className={`live-device-badge ${isLive ? 'is-live' : ''}`}>
            <span className="live-dot" aria-hidden="true"></span>
            {isLive ? (en ? 'Online / Live' : 'Trực tuyến') : (en ? 'Offline' : 'Ngoại tuyến')}
          </span>
          {ageSeconds !== null && (
            <span className="age-tag">
              {en ? 'Updated' : 'Cập nhật'}: {Math.floor(ageSeconds)}s {en ? 'ago' : 'trước'}
            </span>
          )}
        </div>
      </header>

      {/* Cảnh báo lỗi Gateway nếu có */}
      {error && (
        <div role="status" className="dashboard-warning-banner">
          <span className="banner-icon" aria-hidden="true">⚠️</span>
          <span>{en ? 'Gateway unavailable. Retaining last observed readings as stale.' : 'Chưa đọc được gateway. Giữ lại số đo quan sát cuối cùng dưới dạng dữ liệu cũ.'}</span>
        </div>
      )}

      {/* 2. Hàng thẻ tóm tắt trạng thái (KPI Cards) */}
      <section className="window-kpi-grid" aria-label={en ? 'Summary status cards' : 'Thẻ tóm tắt trạng thái'}>
        {/* KPI Cửa sổ */}
        <div className={`window-kpi-card live-device-card ${doorOpen && isLive ? 'kpi-open' : 'kpi-closed'}`}>
          <div className="kpi-header">
            <span className="kpi-label">{en ? 'Window State' : 'Trạng thái Cửa'}</span>
            <span className="kpi-icon" aria-hidden="true">🪟</span>
          </div>
          <div className="kpi-value">
            {doorOpen === null ? (
              <span className="text-muted">{en ? 'Unknown' : 'Chưa rõ'}</span>
            ) : doorOpen ? (
              <span className="text-cyan">{en ? 'OPEN' : 'ĐANG MỞ'}</span>
            ) : (
              <span className="text-emerald">{en ? 'CLOSED' : 'ĐANG ĐÓNG'}</span>
            )}
          </div>
          <div className="kpi-footer">
            <span className="kpi-subtext">
              {!isLive && hasData ? (en ? 'Last recorded state' : 'Trạng thái ghi nhận cuối') : (en ? 'MC-38 Magnetic contact' : 'Tiếp điểm từ MC-38')}
            </span>
          </div>
        </div>

        {/* KPI Chuyển động */}
        <div className={`window-kpi-card live-device-card ${motion && isLive ? 'kpi-motion-active' : ''}`}>
          <div className="kpi-header">
            <span className="kpi-label">{en ? 'PIR Motion' : 'Chuyển động PIR'}</span>
            <span className="kpi-icon" aria-hidden="true">🏃</span>
          </div>
          <div className="kpi-value">
            {motion === null ? (
              <span className="text-muted">{en ? 'Unknown' : 'Chưa rõ'}</span>
            ) : motion ? (
              <span className="text-emerald">{en ? 'DETECTED' : 'CÓ CHUYỂN ĐỘNG'}</span>
            ) : (
              <span className="text-muted">{en ? 'CLEAR' : 'YÊN TĨNH'}</span>
            )}
          </div>
          <div className="kpi-footer">
            <span className="kpi-subtext">
              {en ? 'Passive Infrared Zone' : 'Vùng quét cảm biến PIR'}
            </span>
          </div>
        </div>

        {/* KPI Cảnh báo */}
        <div className={`window-kpi-card live-device-card ${alarm && isLive ? 'kpi-alarm-active' : ''}`}>
          <div className="kpi-header">
            <span className="kpi-label">{en ? 'Alarm Status' : 'Báo động an ninh'}</span>
            <span className="kpi-icon" aria-hidden="true">🚨</span>
          </div>
          <div className="kpi-value">
            {alarm && isLive ? (
              <span className="text-danger">{en ? 'TRIGGERED' : 'BÁO ĐỘNG'}</span>
            ) : (
              <span className="text-emerald">{en ? 'SECURE' : 'AN TOÀN'}</span>
            )}
          </div>
          <div className="kpi-footer">
            <span className="kpi-subtext">
              {alarm && isLive ? (en ? 'Hardware buzzer active' : 'Còi báo trên mạch kêu') : (en ? 'No security alarms' : 'Không có cảnh báo')}
            </span>
          </div>
        </div>

        {/* KPI Uptime phần cứng */}
        <div className="window-kpi-card live-device-card">
          <div className="kpi-header">
            <span className="kpi-label">{en ? 'ESP32 Uptime' : 'Thời gian chạy ESP32'}</span>
            <span className="kpi-icon" aria-hidden="true">⚡</span>
          </div>
          <div className="kpi-value text-muted">
            {formatUptime(uptimeMs)}
          </div>
          <div className="kpi-footer">
            <span className="kpi-subtext">
              {uptimeMs ? `${uptimeMs} ms (${en ? 'continuous' : 'liên tục'})` : (en ? 'Awaiting telemetry' : 'Chờ telemetry')}
            </span>
          </div>
        </div>
      </section>

      {/* 3. Khu vực Đồ họa Minh họa Trực quan & Thông tin Kỹ thuật */}
      <section className="window-graphic-section">
        <WindowVisualizer isLive={isLive} data={data} ageSeconds={ageSeconds} />
      </section>

      {/* 4. Hàng biểu đồ: Timeline (2/3) + Doughnut thời lượng (1/3) */}
      <section className="window-charts-grid" aria-label={en ? 'Analytics and Charts' : 'Phân tích và Biểu đồ'}>
        <div className="chart-col-timeline">
          <WindowTimelineChart timeline={timeline} />
        </div>
        <div className="chart-col-doughnut">
          <WindowDurationDoughnut durations={durations} />
        </div>
      </section>

      {/* 5. Nhật ký hoạt động chi tiết */}
      <section className="window-log-section" aria-label={en ? 'Event Log' : 'Nhật ký sự kiện'}>
        <WindowActivityLog events={events} />
      </section>
    </div>
  );
}
