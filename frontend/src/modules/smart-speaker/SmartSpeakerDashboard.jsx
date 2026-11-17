import { useLanguage } from '../../context/LanguageContext.jsx';
import { useSmartSpeakerHistory } from './useSmartSpeakerHistory.js';
import SpeakerVisualizer from './SpeakerVisualizer.jsx';
import SpeakerCommandGuide from './SpeakerCommandGuide.jsx';
import SpeakerCommandCharts from './SpeakerCommandCharts.jsx';
import SpeakerCommandList from './SpeakerCommandList.jsx';
import './SmartSpeakerDashboard.css';

export default function SmartSpeakerDashboard() {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const {
    history,
    stats,
    error
  } = useSmartSpeakerHistory();

  const latest = stats.latest;

  return (
    <div
      className="owner-area-container speaker-dashboard live-device-panel"
      data-testid="smart-speaker-dashboard"
      role="region"
      aria-label={isEn ? 'Smart Speaker Dashboard' : 'Bảng điều khiển Loa thông minh'}
    >
      {/* 1. Header tinh gọn */}
      <header className="speaker-dash-header">
        <div className="speaker-dash-title-group">
          <div className="speaker-title-row">
            <h2 className="speaker-dash-title">
              {isEn ? 'Smart Voice Speaker (ESP32-S3)' : 'Loa thông minh điều khiển giọng nói (ESP32-S3)'}
            </h2>
            <span className="speaker-status-badge badge-event" role="status">
              <span className="speaker-badge-dot" />
              {isEn ? 'EVENT-DRIVEN' : 'HOẠT ĐỘNG THEO LỆNH'}
            </span>
          </div>
          <p className="speaker-dash-subtitle">
            {isEn
              ? 'Offline voice recognition via ESP-SR Multinet. Commands dispatched via local Gateway.'
              : 'Nhận diện giọng nói ngoại tuyến qua ESP-SR Multinet. Lệnh chuyển tiếp qua Gateway nội bộ.'}
          </p>
        </div>

        <div className="speaker-dash-meta">
          <div className="speaker-meta-item">
            <span className="speaker-meta-label">{isEn ? 'Last Command Time' : 'Lệnh gần nhất lúc'}</span>
            <span className="speaker-meta-val">
              {latest?.time ? latest.time.split(' ')[1] || latest.time : '--'}
            </span>
          </div>
          <div className="speaker-meta-item">
            <span className="speaker-meta-label">{isEn ? 'Connection Status' : 'Tình trạng kết nối'}</span>
            <span className="speaker-meta-val" style={{ color: '#06b6d4' }}>
              {isEn ? 'No Heartbeat' : 'Chưa có heartbeat'}
            </span>
          </div>
        </div>
      </header>

      {error && (
        <div className="speaker-dash-banner banner-warn" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{isEn ? 'Could not load speaker command history.' : error}</span>
        </div>
      )}

      {/* 2. KPI Grid (Tương thích ngược .live-device-card) */}
      <section className="speaker-kpi-grid" aria-label={isEn ? 'Speaker Metrics' : 'Chỉ số loa'}>
        {/* KPI 1: Lệnh gần nhất */}
        <div className="speaker-kpi-card live-device-card">
          <div className="speaker-kpi-header">
            <span className="speaker-kpi-label">{isEn ? 'Latest Command' : 'Lệnh thoại gần nhất'}</span>
            <span className="speaker-kpi-icon icon-info">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </span>
          </div>
          <div className="speaker-kpi-body">
            <div className="speaker-kpi-value" style={{ fontSize: '1.15rem' }}>
              {latest?.command || (isEn ? 'None recorded' : 'Chưa có lệnh')}
            </div>
            <p className="speaker-kpi-hint">
              {latest ? `#${latest.sequence} · ${latest.time}` : (isEn ? 'Awaiting voice input' : 'Đang đợi người dùng gọi')}
            </p>
          </div>
        </div>

        {/* KPI 2: Tổng số lệnh ghi nhận */}
        <div className="speaker-kpi-card live-device-card">
          <div className="speaker-kpi-header">
            <span className="speaker-kpi-label">{isEn ? 'Total Commands Logged' : 'Tổng lệnh đã nhận'}</span>
            <span className="speaker-kpi-icon icon-success">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </span>
          </div>
          <div className="speaker-kpi-body">
            <div className="speaker-kpi-value">
              {stats.total}
            </div>
            <p className="speaker-kpi-hint">
              {isEn ? 'Real gateway command logs' : 'Bản ghi thật từ Gateway'}
            </p>
          </div>
        </div>

        {/* KPI 3: Thùng rác & Cửa */}
        <div className="speaker-kpi-card live-device-card">
          <div className="speaker-kpi-header">
            <span className="speaker-kpi-label">{isEn ? 'Actuator Commands' : 'Lệnh Thùng rác & Cửa'}</span>
            <span className="speaker-kpi-icon icon-warning">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
          </div>
          <div className="speaker-kpi-body">
            <div className="speaker-kpi-value">
              {stats.binCount + stats.doorCount}
            </div>
            <p className="speaker-kpi-hint">
              {`Bin: ${stats.binCount} · Door: ${stats.doorCount}`}
            </p>
          </div>
        </div>

        {/* KPI 4: Kết nối */}
        <div className="speaker-kpi-card live-device-card">
          <div className="speaker-kpi-header">
            <span className="speaker-kpi-label">{isEn ? 'Connection' : 'Kết nối thiết bị'}</span>
            <span className="speaker-kpi-icon icon-neutral">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </span>
          </div>
          <div className="speaker-kpi-body">
            <div className="speaker-kpi-value" style={{ fontSize: '1.05rem', color: '#94a3b8' }}>
              {isEn ? 'No Heartbeat' : 'Chưa có kết nối'}
            </div>
            <p className="speaker-kpi-hint">
              {isEn ? 'Sends log via HTTP on voice trigger' : 'Gửi HTTP khi có người nói'}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Visualizer + Vận hành */}
      <section className="speaker-main-section">
        <div className="speaker-visualizer-col">
          <SpeakerVisualizer latestCommand={latest} />
        </div>

        <div className="speaker-side-col">
          <div className="speaker-side-card">
            <h3 className="speaker-side-title">
              {isEn ? 'Smart Speaker Architecture' : 'Kiến trúc Loa ESP32-S3'}
            </h3>
            <ul className="speaker-feature-list">
              <li>
                <strong>{isEn ? 'On-Device ASR (Offline):' : 'Xử lý Giọng nói Cục bộ (Offline):'}</strong>
                <span>
                  {isEn
                    ? ' WakeNet & Multinet neural models run entirely inside ESP32-S3 SRAM. No voice audio is streamed to the cloud.'
                    : ' Mô hình học sâu WakeNet & Multinet chạy hoàn toàn trên RAM ESP32-S3. Không truyền âm thanh lên đám mây.'}
                </span>
              </li>
              <li>
                <strong>{isEn ? 'Gateway Dispatch:' : 'Cơ chế Giao tiếp Gateway:'}</strong>
                <span>
                  {isEn
                    ? ' When a command is recognized, the speaker posts JSON to the gateway, which forwards it to internal MQTT.'
                    : ' Khi nhận diện xong, loa POST JSON lên Gateway và hiển thị phản hồi trên màn hình TFT SPI 240x320.'}
                </span>
              </li>
              <li>
                <strong>{isEn ? 'Honest Status Representation:' : 'Tính Minh bạch của Trạng thái:'}</strong>
                <span>
                  {isEn
                    ? ' The speaker does not maintain a persistent MQTT session or heartbeat. We display "No Heartbeat" honestly without faking online state.'
                    : ' Loa không duy trì session MQTT liên tục. Hệ thống hiển thị đúng thực tế "Chưa có heartbeat", không giả lập online.'}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 4. Hàng biểu đồ: Phân bố câu lệnh (1/2) + Hướng dẫn cú pháp (1/2) */}
      <section className="speaker-charts-row">
        <div className="speaker-chart-col-sub">
          <SpeakerCommandCharts stats={stats} />
        </div>
        <div className="speaker-chart-col-main">
          <SpeakerCommandGuide />
        </div>
      </section>

      {/* 5. Danh sách lịch sử lệnh gần nhất */}
      <section className="speaker-log-section">
        <SpeakerCommandList history={history} />
      </section>

      {/* 6. Chi tiết kỹ thuật */}
      <details className="speaker-tech-details">
        <summary className="speaker-tech-summary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>{isEn ? 'Technical Details & Gateway Endpoint' : 'Thông số kỹ thuật & Cấu hình Gateway'}</span>
        </summary>
        <div className="speaker-tech-body">
          <div className="speaker-tech-grid">
            <div className="speaker-tech-field">
              <span className="speaker-tech-label">Device ID</span>
              <span className="speaker-tech-value">smart-speaker</span>
            </div>
            <div className="speaker-tech-field">
              <span className="speaker-tech-label">Gateway Endpoint</span>
              <span className="speaker-tech-value">POST http://127.0.0.1:8001/log</span>
            </div>
            <div className="speaker-tech-field">
              <span className="speaker-tech-label">History Source</span>
              <span className="speaker-tech-value">GET /api/live-devices/speaker-history</span>
            </div>
            <div className="speaker-tech-field">
              <span className="speaker-tech-label">Voice Engine</span>
              <span className="speaker-tech-value">ESP-SR Multinet (Offline English)</span>
            </div>
          </div>
          <pre className="speaker-tech-json">{JSON.stringify(history.slice(0, 5), null, 2)}</pre>
        </div>
      </details>
    </div>
  );
}

