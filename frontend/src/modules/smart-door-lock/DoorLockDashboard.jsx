import { useLanguage } from '../../context/LanguageContext.jsx';
import { useDoorLockHistory } from './useDoorLockHistory.js';
import DoorVisualizer from './DoorVisualizer.jsx';
import DoorTimelineChart from './DoorTimelineChart.jsx';
import DoorDurationDoughnut from './DoorDurationDoughnut.jsx';
import DoorActivityLog from './DoorActivityLog.jsx';
import './DoorLockDashboard.css';

export default function DoorLockDashboard() {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const {
    device,
    isLive,
    data,
    error,
    timeline,
    durations,
    events
  } = useDoorLockHistory();

  const doorOpen = data && typeof data.doorOpen === 'boolean' ? data.doorOpen : null;
  const boltCommand = data && typeof data.boltCommand === 'string' ? data.boltCommand : 'unknown';
  const forcedOpen = data && typeof data.forcedOpen === 'boolean' ? data.forcedOpen : false;
  const heldOpen = data && typeof data.heldOpen === 'boolean' ? data.heldOpen : false;
  const alarm = data && typeof data.alarm === 'boolean' ? data.alarm : (forcedOpen || heldOpen);
  const ageSeconds = device?.ageSeconds ?? null;

  return (
    <div
      className="door-lock-dashboard live-device-panel"
      data-testid="door-lock-dashboard"
      role="region"
      aria-label={isEn ? 'Smart Door Lock Dashboard' : 'Bảng điều khiển Khóa cửa thông minh'}
    >
      {/* 1. Header tinh gọn */}
      <header className="door-dash-header">
        <div className="door-dash-title-group">
          <div className="door-title-row">
            <h2 className="door-dash-title">
              {isEn ? 'Smart Door Lock' : 'Khóa cửa thông minh'}
            </h2>
            <span
              className={`door-status-badge ${isLive ? 'badge-live' : 'badge-offline'}`}
              role="status"
            >
              <span className="door-badge-dot" />
              {isLive ? (isEn ? 'ONLINE' : 'TRỰC TUYẾN') : (isEn ? 'OFFLINE' : 'NGOẠI TUYẾN')}
            </span>
          </div>
          <p className="door-dash-subtitle">
            {isEn
              ? 'Real-time telemetry from ESP32 door lock via internal MQTT broker & gateway.'
              : 'Dữ liệu thời gian thực từ cảm biến cửa ESP32 qua broker MQTT nội bộ và Gateway.'}
          </p>
        </div>

        <div className="door-dash-meta">
          <div className="door-meta-item">
            <span className="door-meta-label">{isEn ? 'Telemetry Age' : 'Độ tuổi bản tin'}</span>
            <span className="door-meta-val">
              {ageSeconds !== null ? `${ageSeconds}s` : '--'}
            </span>
          </div>
          <div className="door-meta-item">
            <span className="door-meta-label">{isEn ? 'Status' : 'Tình trạng'}</span>
            <span className="door-meta-val">
              {isLive
                ? (isEn ? 'Fresh (<15s)' : 'Tươi mới (<15s)')
                : (isEn ? 'Stale / Offline' : 'Cũ / Ngoại tuyến')}
            </span>
          </div>
        </div>
      </header>

      {/* Thông báo lỗi hoặc kết nối nếu có */}
      {error && (
        <div className="door-dash-banner banner-error" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* 2. Hàng KPI Cards (Tương thích ngược với .live-device-card) */}
      <section className="door-kpi-grid" aria-label={isEn ? 'Key Metrics' : 'Chỉ số quan trọng'}>
        {/* KPI 1: Cảm biến từ cửa */}
        <div className="door-kpi-card live-device-card">
          <div className="door-kpi-header">
            <span className="door-kpi-label">{isEn ? 'Door Sensor' : 'Cảm biến cửa'}</span>
            <span className={`door-kpi-icon ${doorOpen ? 'icon-warning' : 'icon-success'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 21h18M6 21V3h12v18" />
              </svg>
            </span>
          </div>
          <div className="door-kpi-body">
            <div className="door-kpi-value">
              {doorOpen === null
                ? (isEn ? 'Unknown' : 'Chưa rõ')
                : (doorOpen ? (isEn ? 'Open' : 'Đang mở') : (isEn ? 'Closed' : 'Đang đóng'))}
            </div>
            <p className="door-kpi-hint">
              {isLive
                ? (isEn ? 'Contact switch MC-38' : 'Tiếp điểm từ MC-38')
                : (isEn ? 'Last known state (Offline)' : 'Trạng thái cuối (Ngoại tuyến)')}
            </p>
          </div>
        </div>

        {/* KPI 2: Lệnh chốt khóa */}
        <div className="door-kpi-card live-device-card">
          <div className="door-kpi-header">
            <span className="door-kpi-label">{isEn ? 'Bolt Command' : 'Lệnh chốt khóa'}</span>
            <span className="door-kpi-icon icon-info">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
          </div>
          <div className="door-kpi-body">
            <div className="door-kpi-value" style={{ textTransform: 'capitalize' }}>
              {boltCommand === 'locked' ? (isEn ? 'Locked' : 'Đã khóa') :
                (boltCommand === 'unlocked' ? (isEn ? 'Unlocked' : 'Đã mở') : boltCommand)}
            </div>
            <p className="door-kpi-hint" style={{ color: '#f59e0b' }}>
              {isLive
                ? (isEn ? 'Command state · No mechanical sensor' : 'Trạng thái lệnh · Chưa có xác nhận chốt')
                : (isEn ? 'Last known command (Offline)' : 'Lệnh chốt cuối (Ngoại tuyến)')}
            </p>
          </div>
        </div>

        {/* KPI 3: Cảnh báo an ninh */}
        <div className="door-kpi-card live-device-card">
          <div className="door-kpi-header">
            <span className="door-kpi-label">{isEn ? 'Security Status' : 'An ninh & Báo động'}</span>
            <span className={`door-kpi-icon ${alarm ? 'icon-danger' : 'icon-success'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
          </div>
          <div className="door-kpi-body">
            <div className="door-kpi-value" style={{ color: alarm ? '#ef4444' : '#10b981' }}>
              {alarm
                ? (forcedOpen
                    ? (isEn ? 'FORCED OPEN' : 'BỊ CẠY CỬA')
                    : (heldOpen ? (isEn ? 'HELD OPEN' : 'MỞ QUÁ LÂU') : (isEn ? 'ALARM ACTIVE' : 'BÁO ĐỘNG')))
                : (isEn ? 'Normal / Secure' : 'Bình thường')}
            </div>
            <p className="door-kpi-hint">
              {isLive
                ? (alarm
                    ? (isEn ? 'Buzzer & alert triggered' : 'Còi báo động đang kích hoạt')
                    : (isEn ? 'No intrusion detected' : 'Không có sự cố bất thường'))
                : (isEn ? 'Last known security state (Offline)' : 'Trạng thái an ninh cuối (Ngoại tuyến)')}
            </p>
          </div>
        </div>

        {/* KPI 4: Kết nối & Freshness */}
        <div className="door-kpi-card live-device-card">
          <div className="door-kpi-header">
            <span className="door-kpi-label">{isEn ? 'Connection' : 'Kết nối Gateway'}</span>
            <span className={`door-kpi-icon ${isLive ? 'icon-success' : 'icon-neutral'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
            </span>
          </div>
          <div className="door-kpi-body">
            <div className="door-kpi-value">
              {isLive ? (isEn ? 'Live' : 'Đang kết nối') : (isEn ? 'Offline' : 'Mất tín hiệu')}
            </div>
            <p className="door-kpi-hint">
              {isLive
                ? (isEn ? 'Broker: Mosquitto :1884' : 'Broker: Mosquitto :1884')
                : (isEn ? 'Awaiting telemetry packet' : 'Đang đợi bản tin')}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Khu vực Visualizer + Tóm tắt nhanh */}
      <section className="door-main-section">
        <div className="door-visualizer-col">
          <DoorVisualizer
            isLive={isLive}
            doorOpen={doorOpen}
            boltCommand={boltCommand}
            forcedOpen={forcedOpen}
            heldOpen={heldOpen}
            alarm={alarm}
            ageSeconds={ageSeconds}
          />
        </div>

        <div className="door-side-col">
          <div className="door-side-card">
            <h3 className="door-side-title">
              {isEn ? 'Device Operation Notes' : 'Đặc tính vận hành khóa'}
            </h3>
            <ul className="door-feature-list">
              <li>
                <strong>{isEn ? 'Read-only Telemetry:' : 'Telemetry Chỉ đọc:'}</strong>
                <span>
                  {isEn
                    ? ' Firmware sends status updates over MQTT. Remote unlock is not enabled from web interface for security.'
                    : ' Firmware phát bản tin trạng thái lên MQTT. Web không mở khóa từ xa để bảo đảm an toàn.'}
                </span>
              </li>
              <li>
                <strong>{isEn ? 'Bolt Confirmation:' : 'Xác nhận Chốt cơ khí:'}</strong>
                <span>
                  {isEn
                    ? ' Hardware does not have microswitch feedback on the physical bolt. Bolt command reflects software state only.'
                    : ' Khóa chưa có cảm biến hành trình chốt. Trạng thái hiển thị là lệnh phần mềm, không khẳng định servo đang chạy.'}
                </span>
              </li>
              <li>
                <strong>{isEn ? 'Intrusion Detection:' : 'Phát hiện Xâm nhập:'}</strong>
                <span>
                  {isEn
                    ? ' Automatic alarm triggers on door forced open or held open beyond timeout.'
                    : ' Tự động kích hoạt còi khi phát hiện cạy cửa hoặc mở cửa quá thời gian cho phép.'}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 4. Hàng biểu đồ: Timeline (2/3) + Doughnut (1/3) */}
      <section className="door-charts-row">
        <div className="door-chart-col-main">
          <DoorTimelineChart timeline={timeline} />
        </div>
        <div className="door-chart-col-sub">
          <DoorDurationDoughnut durations={durations} />
        </div>
      </section>

      {/* 5. Nhật ký hoạt động chi tiết */}
      <section className="door-log-section">
        <DoorActivityLog events={events} />
      </section>

      {/* 6. Chi tiết kỹ thuật thu gọn */}
      <details className="door-tech-details">
        <summary className="door-tech-summary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>{isEn ? 'Technical Details & Raw Telemetry' : 'Thông số kỹ thuật & Bản tin Telemetry thô'}</span>
        </summary>
        <div className="door-tech-body">
          <div className="door-tech-grid">
            <div className="door-tech-field">
              <span className="door-tech-label">Device ID</span>
              <span className="door-tech-value">smart-door-lock</span>
            </div>
            <div className="door-tech-field">
              <span className="door-tech-label">MQTT Topic</span>
              <span className="door-tech-value">home/smart-door-lock/telemetry</span>
            </div>
            <div className="door-tech-field">
              <span className="door-tech-label">Bolt Feedback Available</span>
              <span className="door-tech-value">false (Firmware specification)</span>
            </div>
            <div className="door-tech-field">
              <span className="door-tech-label">WiFi RSSI</span>
              <span className="door-tech-value">{data?.wifiRssi ?? data?.rssi ?? '--'} dBm</span>
            </div>
          </div>
          <pre className="door-tech-json">{JSON.stringify(data ?? {}, null, 2)}</pre>
        </div>
      </details>
    </div>
  );
}

