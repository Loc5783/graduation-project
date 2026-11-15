import { useLanguage } from '../../context/LanguageContext.jsx';
import { useEnvironmentSensorHistory } from './useEnvironmentSensorHistory.js';
import EnvironmentVisualizer from './EnvironmentVisualizer.jsx';
import EnvironmentCharts from './EnvironmentCharts.jsx';
import EnvironmentDurationDoughnut from './EnvironmentDurationDoughnut.jsx';
import EnvironmentActivityLog from './EnvironmentActivityLog.jsx';
import './EnvironmentSensorDashboard.css';

export default function EnvironmentSensorDashboard() {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const {
    device,
    isLive,
    data,
    error,
    temperature,
    humidity,
    gasRaw,
    alertLevel,
    alertLevelText,
    isWarmingUp,
    buzzerOn,
    timeline,
    durations,
    events
  } = useEnvironmentSensorHistory();

  const ageSeconds = device?.ageSeconds ?? null;

  return (
    <div
      className="env-dashboard-root live-device-panel"
      data-testid="environment-sensor-dashboard"
      role="region"
      aria-label={isEn ? 'Environment Sensor Dashboard' : 'Bảng điều khiển Cảm biến môi trường'}
    >
      {/* 1. Header tinh gọn */}
      <header className="env-dash-header">
        <div className="env-dash-title-group">
          <div className="env-title-row">
            <h2 className="env-dash-title">
              {isEn ? 'Environment & Gas Sensor' : 'Cảm biến môi trường & Khí gas'}
            </h2>
            <span
              className={`env-status-badge ${isLive ? 'badge-live' : 'badge-offline'}`}
              role="status"
            >
              <span className="env-badge-dot" />
              {isLive ? (isEn ? 'ONLINE' : 'TRỰC TUYẾN') : (isEn ? 'OFFLINE' : 'NGOẠI TUYẾN')}
            </span>
          </div>
          <p className="env-dash-subtitle">
            {isEn
              ? 'Real-time kitchen gas detection (MQ-2) and climate monitoring (DHT22) via internal MQTT.'
              : 'Giám sát khí gas nhà bếp (MQ-2) và vi khí hậu (DHT22) qua broker MQTT nội bộ.'}
          </p>
        </div>

        <div className="env-dash-meta">
          <div className="env-meta-item">
            <span className="env-meta-label">{isEn ? 'Telemetry Age' : 'Độ tuổi bản tin'}</span>
            <span className="env-meta-val">
              {ageSeconds !== null ? `${ageSeconds}s` : '--'}
            </span>
          </div>
          <div className="env-meta-item">
            <span className="env-meta-label">{isEn ? 'Status' : 'Tình trạng'}</span>
            <span className="env-meta-val">
              {isLive
                ? (isEn ? 'Fresh (<15s)' : 'Tươi mới (<15s)')
                : (isEn ? 'Stale / Offline' : 'Cũ / Ngoại tuyến')}
            </span>
          </div>
        </div>
      </header>

      {error && (
        <div className="env-dash-banner banner-error" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* 2. Hàng KPI Cards (Tương thích ngược .live-device-card) */}
      <section className="env-kpi-grid" aria-label={isEn ? 'Environmental Metrics' : 'Chỉ số môi trường'}>
        {/* KPI 1: Nồng độ Gas (ADC) */}
        <div className="env-kpi-card live-device-card">
          <div className="env-kpi-header">
            <span className="env-kpi-label">{isEn ? 'Gas Reading (ADC)' : 'Nồng độ Gas (MQ-2)'}</span>
            <span className={`env-kpi-icon ${alertLevel === 3 ? 'icon-danger' : (alertLevel === 2 ? 'icon-warning' : 'icon-success')}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2z" />
                <path d="M12 6v6l4 2" />
              </svg>
            </span>
          </div>
          <div className="env-kpi-body">
            <div className="env-kpi-value" style={{ color: alertLevel === 3 ? '#ef4444' : (alertLevel === 2 ? '#f59e0b' : (alertLevel === 1 ? '#10b981' : '#94a3b8')) }}>
              {gasRaw !== null ? `${gasRaw} ADC` : '-- ADC'}
            </div>
            <p className="env-kpi-hint">
              {isLive
                ? (isEn ? `Firmware Level: ${alertLevelText || 'Unknown'}` : `Mức cảnh báo: ${alertLevelText || 'Chưa xác định'}`)
                : (isEn ? `Last known level: ${alertLevelText || 'Unknown'} (Offline)` : `Mức cảnh báo cuối: ${alertLevelText || 'Chưa xác định'} (Ngoại tuyến)`)}
            </p>
          </div>
        </div>

        {/* KPI 2: Nhiệt độ (°C) */}
        <div className="env-kpi-card live-device-card">
          <div className="env-kpi-header">
            <span className="env-kpi-label">{isEn ? 'Temperature' : 'Nhiệt độ phòng'}</span>
            <span className="env-kpi-icon icon-warning">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
              </svg>
            </span>
          </div>
          <div className="env-kpi-body">
            <div className="env-kpi-value">
              {temperature !== null ? `${temperature.toFixed(1)}°C` : '-- °C'}
            </div>
            <p className="env-kpi-hint">
              {isLive
                ? (isEn ? 'DHT22 Digital Sensor' : 'Cảm biến nhiệt số DHT22')
                : (isEn ? 'Last known temperature (Offline)' : 'Nhiệt độ cuối (Ngoại tuyến)')}
            </p>
          </div>
        </div>

        {/* KPI 3: Độ ẩm (%) */}
        <div className="env-kpi-card live-device-card">
          <div className="env-kpi-header">
            <span className="env-kpi-label">{isEn ? 'Humidity' : 'Độ ẩm không khí'}</span>
            <span className="env-kpi-icon icon-info">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
              </svg>
            </span>
          </div>
          <div className="env-kpi-body">
            <div className="env-kpi-value">
              {humidity !== null ? `${humidity.toFixed(1)}%` : '-- %'}
            </div>
            <p className="env-kpi-hint">
              {isLive
                ? (isEn ? 'Relative Humidity (RH)' : 'Độ ẩm tương đối (RH)')
                : (isEn ? 'Last known humidity (Offline)' : 'Độ ẩm cuối (Ngoại tuyến)')}
            </p>
          </div>
        </div>

        {/* KPI 4: Trạng thái còi Buzzer */}
        <div className="env-kpi-card live-device-card">
          <div className="env-kpi-header">
            <span className="env-kpi-label">{isEn ? 'Hardware Buzzer' : 'Còi báo động'}</span>
            <span className={`env-kpi-icon ${buzzerOn ? 'icon-danger' : 'icon-neutral'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            </span>
          </div>
          <div className="env-kpi-body">
            <div className="env-kpi-value" style={{ color: buzzerOn === true ? '#ef4444' : '#94a3b8' }}>
              {buzzerOn === true
                ? (isEn ? 'Active (Buzzing)' : 'Đang kêu')
                : (buzzerOn === false ? (isEn ? 'Silent' : 'Yên tĩnh') : (isEn ? 'Unknown' : 'Chưa xác định'))}
            </div>
            <p className="env-kpi-hint">
              {!isLive
                ? (isEn ? 'Last known state (Offline)' : 'Trạng thái cuối (Ngoại tuyến)')
                : (buzzerOn === null
                    ? (isEn ? 'Buzzer state missing in telemetry' : 'Bản tin thiếu trạng thái còi')
                    : (isWarmingUp ? (isEn ? 'Silenced during warm-up' : 'Khóa còi khi sấy nóng') : (isEn ? 'Auto-triggered by gas' : 'Tự kích hoạt theo gas')))}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Visualizer + Hướng dẫn vận hành */}
      <section className="env-main-section">
        <div className="env-visualizer-col">
          <EnvironmentVisualizer
            isLive={isLive}
            temperature={temperature}
            humidity={humidity}
            gasRaw={gasRaw}
            alertLevel={alertLevel}
            alertLevelText={alertLevelText}
            isWarmingUp={isWarmingUp}
            buzzerOn={buzzerOn}
            ageSeconds={ageSeconds}
          />
        </div>

        <div className="env-side-col">
          <div className="env-side-card">
            <h3 className="env-side-title">
              {isEn ? 'Gas Safety & Sensor Logic' : 'Nguyên lý Cảm biến & An toàn'}
            </h3>
            <ul className="env-feature-list">
              <li>
                <strong>{isEn ? 'Sensor Warm-up Period:' : 'Giai đoạn Sấy nóng MQ-2:'}</strong>
                <span>
                  {isEn
                    ? ' During the first 20 seconds after boot, the heater coil stabilizes. Buzzer is locked to prevent false alarms.'
                    : ' Trong 20 giây đầu sau khởi động, cuộn sấy gia nhiệt ổn định. Còi buzzer tạm khóa chống báo giả.'}
                </span>
              </li>
              <li>
                <strong>{isEn ? 'Hysteresis Thresholds:' : 'Ngưỡng kích hoạt có Hysteresis:'}</strong>
                <span>
                  {isEn
                    ? ' Warning triggers at 1200 ADC; Danger at 2200 ADC. A 100-ADC hysteresis buffer prevents rapid flapping.'
                    : ' Cảnh báo tại 1200 ADC, Nguy hiểm tại 2200 ADC. Vùng đệm 100 ADC ngăn còi bật/tắt liên tục do nhiễu.'}
                </span>
              </li>
              <li>
                <strong>{isEn ? 'Raw ADC vs Calibrated PPM:' : 'Chỉ số ADC và nồng độ PPM:'}</strong>
                <span>
                  {isEn
                    ? ' Gas reading is an uncalibrated 12-bit ADC value. Low ADC readings do not constitute absolute proof of zero gas.'
                    : ' Số đo là giá trị ADC 12-bit chưa qua hiệu chuẩn phòng thí nghiệm. Không suy diễn ADC thấp là tuyệt đối không rò gas.'}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 4. Hàng biểu đồ: Climate / Gas Tabs (2/3) + Ratio Doughnut (1/3) */}
      <section className="env-charts-row">
        <div className="env-chart-col-main">
          <EnvironmentCharts timeline={timeline} />
        </div>
        <div className="env-chart-col-sub">
          <EnvironmentDurationDoughnut durations={durations} />
        </div>
      </section>

      {/* 5. Nhật ký hoạt động */}
      <section className="env-log-section">
        <EnvironmentActivityLog events={events} />
      </section>

      {/* 6. Chi tiết kỹ thuật */}
      <details className="env-tech-details">
        <summary className="env-tech-summary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>{isEn ? 'Technical Details & Raw Telemetry' : 'Thông số kỹ thuật & Bản tin Telemetry thô'}</span>
        </summary>
        <div className="env-tech-body">
          <div className="env-tech-grid">
            <div className="env-tech-field">
              <span className="env-tech-label">Device ID</span>
              <span className="env-tech-value">environment-sensor</span>
            </div>
            <div className="env-tech-field">
              <span className="env-tech-label">MQTT Telemetry Topic</span>
              <span className="env-tech-value">home/environment-sensor/telemetry</span>
            </div>
            <div className="env-tech-field">
              <span className="env-tech-label">MQTT Alert Topic</span>
              <span className="env-tech-value">home/environment-sensor/alert</span>
            </div>
            <div className="env-tech-field">
              <span className="env-tech-label">Firmware</span>
              <span className="env-tech-value">{data?.firmware ?? 'env-esp32-v1.0'}</span>
            </div>
          </div>
          <pre className="env-tech-json">{JSON.stringify(data ?? {}, null, 2)}</pre>
        </div>
      </details>
    </div>
  );
}

