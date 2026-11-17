import { useLanguage } from '../../context/LanguageContext.jsx';
import { useSmartBinHistory } from './useSmartBinHistory.js';
import BinVisualizer from './BinVisualizer.jsx';
import BinTimelineChart from './BinTimelineChart.jsx';
import BinCapacityDoughnut from './BinCapacityDoughnut.jsx';
import BinActivityLog from './BinActivityLog.jsx';
import './SmartBinDashboard.css';

export default function SmartBinDashboard() {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const {
    device,
    isLive,
    data,
    error,
    sensorOk,
    distanceCm,
    fillPercent,
    isMeasurementValid,
    lidOpen,
    mode,
    timeline,
    events
  } = useSmartBinHistory();

  const ageSeconds = device?.ageSeconds ?? null;

  return (
    <div
      className="bin-dashboard live-device-panel"
      data-testid="smart-bin-dashboard"
      role="region"
      aria-label={isEn ? 'Smart Bin Dashboard' : 'Bảng điều khiển Thùng rác thông minh'}
    >
      {/* 1. Header tinh gọn */}
      <header className="bin-dash-header">
        <div className="bin-dash-title-group">
          <div className="bin-title-row">
            <h2 className="bin-dash-title">
              {isEn ? 'Smart Trash Bin' : 'Thùng rác thông minh'}
            </h2>
            <span
              className={`bin-status-badge ${isLive ? 'badge-live' : 'badge-offline'}`}
              role="status"
            >
              <span className="bin-badge-dot" />
              {isLive ? (isEn ? 'ONLINE' : 'TRỰC TUYẾN') : (isEn ? 'OFFLINE' : 'NGOẠI TUYẾN')}
            </span>
          </div>
          <p className="bin-dash-subtitle">
            {isEn
              ? 'Ultrasonic fill-level monitoring and servo lid tracking via internal MQTT broker.'
              : 'Giám sát mức rác bằng cảm biến siêu âm HC-SR04 và nắp servo qua broker MQTT nội bộ.'}
          </p>
        </div>

        <div className="bin-dash-meta">
          <div className="bin-meta-item">
            <span className="bin-meta-label">{isEn ? 'Telemetry Age' : 'Độ tuổi bản tin'}</span>
            <span className="bin-meta-val">
              {ageSeconds !== null ? `${ageSeconds}s` : '--'}
            </span>
          </div>
          <div className="bin-meta-item">
            <span className="bin-meta-label">{isEn ? 'Status' : 'Tình trạng'}</span>
            <span className="bin-meta-val">
              {isLive
                ? (isEn ? 'Fresh (<15s)' : 'Tươi mới (<15s)')
                : (isEn ? 'Stale / Offline' : 'Cũ / Ngoại tuyến')}
            </span>
          </div>
        </div>
      </header>

      {error && (
        <div className="bin-dash-banner banner-error" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{isEn ? 'Cannot load live device data. The last reading is no longer live.' : 'Không tải được dữ liệu trực tiếp. Số đo cuối không còn là dữ liệu mới.'}</span>
        </div>
      )}

      {/* 2. KPI Grid (Tương thích ngược .live-device-card) */}
      <section className="bin-kpi-grid" aria-label={isEn ? 'Bin Metrics' : 'Chỉ số thùng rác'}>
        {/* KPI 1: Mức đầy (%) */}
        <div className="bin-kpi-card live-device-card">
          <div className="bin-kpi-header">
            <span className="bin-kpi-label">{isEn ? 'Trash Fill Level' : 'Mức đầy rác'}</span>
            <span className={`bin-kpi-icon ${isMeasurementValid ? (fillPercent >= 80 ? 'icon-danger' : 'icon-success') : 'icon-warning'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </span>
          </div>
          <div className="bin-kpi-body">
            <div className="bin-kpi-value">
              {isMeasurementValid && fillPercent !== null
                ? `${Math.round(fillPercent)}%`
                : (isLive ? (isEn ? 'Unreadable' : 'Không đọc được') : (isEn ? 'Offline' : 'Mất tín hiệu'))}
            </div>
            <p className="bin-kpi-hint">
              {!isLive
                ? (isEn ? 'Last known state (Offline)' : 'Trạng thái cuối (Ngoại tuyến)')
                : (isMeasurementValid
                    ? (fillPercent >= 80 ? (isEn ? 'Bin Full (>=80%)' : 'Thùng đầy (>=80%)') : (isEn ? 'Normal capacity' : 'Sức chứa an toàn'))
                    : (isEn ? 'Check HC-SR04 echo wiring' : 'Mất tín hiệu cảm biến siêu âm'))}
            </p>
          </div>
        </div>

        {/* KPI 2: Khoảng cách (cm) */}
        <div className="bin-kpi-card live-device-card">
          <div className="bin-kpi-header">
            <span className="bin-kpi-label">{isEn ? 'Measured Distance' : 'Khoảng cách đo'}</span>
            <span className="bin-kpi-icon icon-info">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M6 8l-4 4 4 4M18 8l4 4-4 4" />
              </svg>
            </span>
          </div>
          <div className="bin-kpi-body">
            <div className="bin-kpi-value">
              {sensorOk && distanceCm !== null && distanceCm >= 0
                ? `${distanceCm.toFixed(1)} cm`
                : '-- cm'}
            </div>
            <p className="bin-kpi-hint">
              {!isLive
                ? (isEn ? 'Last known distance (Offline)' : 'Khoảng cách cuối (Ngoại tuyến)')
                : (sensorOk
                    ? (isEn ? 'Calibrated 5cm..30cm' : 'Hiệu chuẩn 5cm..30cm')
                    : (isEn ? 'No echo returned' : 'Không nhận được xung echo'))}
            </p>
          </div>
        </div>

        {/* KPI 3: Trạng thái nắp */}
        <div className="bin-kpi-card live-device-card">
          <div className="bin-kpi-header">
            <span className="bin-kpi-label">{isEn ? 'Lid State' : 'Trạng thái nắp'}</span>
            <span className={`bin-kpi-icon ${lidOpen ? 'icon-warning' : 'icon-success'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </span>
          </div>
          <div className="bin-kpi-body">
            <div className="bin-kpi-value">
              {lidOpen === null
                ? (isEn ? 'Unknown' : 'Chưa rõ')
                : (lidOpen ? (isEn ? 'Open' : 'Đang mở') : (isEn ? 'Closed' : 'Đang đóng'))}
            </div>
            <p className="bin-kpi-hint">
              {isLive ? (isEn ? 'Servo actuator feedback' : 'Vị trí góc servo nắp thùng') : (isEn ? 'Last known state (Offline)' : 'Trạng thái cuối (Ngoại tuyến)')}
            </p>
          </div>
        </div>

        {/* KPI 4: Chế độ hoạt động */}
        <div className="bin-kpi-card live-device-card">
          <div className="bin-kpi-header">
            <span className="bin-kpi-label">{isEn ? 'Operating Mode' : 'Chế độ hoạt động'}</span>
            <span className="bin-kpi-icon icon-info">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </span>
          </div>
          <div className="bin-kpi-body">
            <div className="bin-kpi-value" style={{ textTransform: 'uppercase' }}>
              {mode}
            </div>
            <p className="bin-kpi-hint">
              {isLive ? (isEn ? 'Auto / Forced Open / Forced Closed' : 'Tự động / Mở cố định / Đóng cố định') : (isEn ? 'Last known mode (Offline)' : 'Chế độ cuối (Ngoại tuyến)')}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Visualizer + Thông tin vận hành */}
      <section className="bin-main-section">
        <div className="bin-visualizer-col">
          <BinVisualizer
            isLive={isLive}
            sensorOk={sensorOk}
            distanceCm={distanceCm}
            fillPercent={fillPercent}
            isMeasurementValid={isMeasurementValid}
            lidOpen={lidOpen}
            mode={mode}
            ageSeconds={ageSeconds}
          />
        </div>

        <div className="bin-side-col">
          <div className="bin-side-card">
            <h3 className="bin-side-title">
              {isEn ? 'Smart Bin Operation' : 'Vận hành Thùng rác'}
            </h3>
            <ul className="bin-feature-list">
              <li>
                <strong>{isEn ? 'Voice Command Control:' : 'Điều khiển bằng Giọng nói:'}</strong>
                <span>
                  {isEn
                    ? ' Voice commands ("OPEN THE BIN", "CLOSE THE BIN", "SET BIN TO AUTOMATIC MODE") are handled via ESP32-S3 Smart Speaker and local Gateway.'
                    : ' Lệnh giọng nói ("OPEN THE BIN", "CLOSE THE BIN", "SET BIN TO AUTOMATIC MODE") được xử lý qua Loa thông minh và Gateway nội bộ.'}
                </span>
              </li>
              <li>
                <strong>{isEn ? 'Fill Calibration (30cm to 5cm):' : 'Hiệu chuẩn Mức rác (30cm - 5cm):'}</strong>
                <span>
                  {isEn
                    ? ' 30cm indicates empty bin (0%), 5cm indicates 100% capacity. When fill level exceeds 80%, hardware triggers full alert.'
                    : ' 30cm tương ứng thùng rác trống (0%), 5cm tương ứng đầy 100%. Khi vượt quá 80%, còi và đèn LED đỏ trên thùng tự kích hoạt.'}
                </span>
              </li>
              <li>
                <strong>{isEn ? 'Sensor Fault Tolerance:' : 'Chống sai lệch Cảm biến:'}</strong>
                <span>
                  {isEn
                    ? ' If ultrasonic echo pulse is lost or returns negative distance, the dashboard explicitly flags "Unreadable" instead of falsely dropping to 0%.'
                    : ' Khi mất xung echo hoặc đo khoảng cách âm, dashboard báo rõ "Không đọc được" chứ không biến thành 0% rác ảo.'}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 4. Hàng biểu đồ: Timeline (2/3) + Capacity Doughnut (1/3) */}
      <section className="bin-charts-row">
        <div className="bin-chart-col-main">
          <BinTimelineChart timeline={timeline} />
        </div>
        <div className="bin-chart-col-sub">
          <BinCapacityDoughnut
            fillPercent={fillPercent}
            isMeasurementValid={isMeasurementValid}
            isLive={isLive}
          />
        </div>
      </section>

      {/* 5. Nhật ký hoạt động */}
      <section className="bin-log-section">
        <BinActivityLog events={events} />
      </section>

      {/* 6. Chi tiết kỹ thuật */}
      <details className="bin-tech-details">
        <summary className="bin-tech-summary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>{isEn ? 'Technical Details & Raw Telemetry' : 'Thông số kỹ thuật & Bản tin Telemetry thô'}</span>
        </summary>
        <div className="bin-tech-body">
          <div className="bin-tech-grid">
            <div className="bin-tech-field">
              <span className="bin-tech-label">Device ID</span>
              <span className="bin-tech-value">smart-bin</span>
            </div>
            <div className="bin-tech-field">
              <span className="bin-tech-label">MQTT Telemetry Topic</span>
              <span className="bin-tech-value">home/smart-bin/telemetry</span>
            </div>
            <div className="bin-tech-field">
              <span className="bin-tech-label">MQTT Command Topic</span>
              <span className="bin-tech-value">home/smart-bin/command</span>
            </div>
            <div className="bin-tech-field">
              <span className="bin-tech-label">Sensor Status</span>
              <span className="bin-tech-value">{sensorOk ? 'OK' : 'NO ECHO / ERROR'}</span>
            </div>
          </div>
          <pre className="bin-tech-json">{JSON.stringify(data ?? {}, null, 2)}</pre>
        </div>
      </details>
    </div>
  );
}

