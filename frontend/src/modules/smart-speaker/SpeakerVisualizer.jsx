import { useLanguage } from '../../context/LanguageContext.jsx';

export default function SpeakerVisualizer({ latestCommand = null }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const tftDisplay = latestCommand?.result?.display || latestCommand?.command || (isEn ? 'No commands recorded' : 'Chưa có lệnh được ghi nhận');

  return (
    <div
      className="speaker-visualizer-card"
      role="region"
      aria-label={isEn ? 'Smart Speaker Visualizer' : 'Minh họa trực quan loa thông minh'}
    >
      <div className="speaker-viz-header">
        <div className="speaker-viz-badge-group">
          {/* Huy hiệu kết nối: Không giả định online */}
          <span className="speaker-pill pill-event-driven">
            <span className="speaker-pill-dot" />
            {isEn ? 'Event-driven (No continuous heartbeat)' : 'Hoạt động theo lệnh (Chưa có heartbeat)'}
          </span>

          {latestCommand && (
            <span className="speaker-pill pill-seq">
              #{latestCommand.sequence} · {latestCommand.command}
            </span>
          )}
        </div>

        {latestCommand?.time && (
          <span className="speaker-viz-time">
            {latestCommand.time}
          </span>
        )}
      </div>

      {/* Minh họa SVG */}
      <div className="speaker-svg-container">
        <svg
          className="speaker-svg"
          viewBox="0 0 400 320"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="speakerGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="50%" stopColor="#334155" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="tftGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#0369a1" />
            </linearGradient>
          </defs>

          {/* Mặt bàn */}
          <line x1="40" y1="285" x2="360" y2="285" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />

          {/* Thân loa thông minh hình trụ */}
          <rect x="130" y="80" width="140" height="195" rx="20" fill="url(#speakerGrad)" stroke="#475569" strokeWidth="2.5" />

          {/* Lưới micrô đỉnh đầu */}
          <ellipse cx="200" cy="80" rx="70" ry="16" fill="#0f172a" stroke="#64748b" strokeWidth="2" />
          <circle cx="200" cy="80" r="5" fill="#38bdf8" />
          <circle cx="170" cy="80" r="3" fill="#64748b" />
          <circle cx="230" cy="80" r="3" fill="#64748b" />

          {/* Màn hình TFT SPI 240x320 theo firmware */}
          <rect x="145" y="115" width="110" height="90" rx="8" fill="#020617" stroke="#38bdf8" strokeWidth="2" />
          <rect x="150" y="120" width="100" height="80" rx="4" fill="url(#tftGrad)" />

          {/* Chữ hiển thị trên màn hình TFT */}
          <text x="200" y="145" textAnchor="middle" fill="#f8fafc" fontSize="10" fontWeight="700">
            {isEn ? 'TFT DISPLAY' : 'MÀN HÌNH TFT'}
          </text>
          <text x="200" y="168" textAnchor="middle" fill="#fef08a" fontSize={tftDisplay.length > 20 ? '7.5' : (tftDisplay.length > 14 ? '9' : '11')} fontWeight="800">
            {tftDisplay}
          </text>
          <text x="200" y="188" textAnchor="middle" fill="#bae6fd" fontSize="8" fontWeight="600">
            {isEn ? 'OFFLINE MULTINET' : 'LỆNH OFFLINE'}
          </text>

          {/* Lưới loa bên dưới thân */}
          <g fill="#475569" opacity="0.6">
            <circle cx="160" cy="225" r="2" />
            <circle cx="175" cy="225" r="2" />
            <circle cx="190" cy="225" r="2" />
            <circle cx="205" cy="225" r="2" />
            <circle cx="220" cy="225" r="2" />
            <circle cx="235" cy="225" r="2" />

            <circle cx="165" cy="235" r="2" />
            <circle cx="180" cy="235" r="2" />
            <circle cx="195" cy="235" r="2" />
            <circle cx="210" cy="235" r="2" />
            <circle cx="225" cy="235" r="2" />

            <circle cx="160" cy="245" r="2" />
            <circle cx="175" cy="245" r="2" />
            <circle cx="190" cy="245" r="2" />
            <circle cx="205" cy="245" r="2" />
            <circle cx="220" cy="245" r="2" />
            <circle cx="235" cy="245" r="2" />
          </g>

          {/* Nhãn bo mạch */}
          <text x="200" y="298" textAnchor="middle" fill="#94a3b8" fontSize="10">
            ESP32-S3 VOICE HUB (I2S MIC & SPEAKER)
          </text>
        </svg>
      </div>

      {/* Lưu ý minh bạch trung thực */}
      <div className="speaker-viz-disclaimer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          {isEn
            ? 'Connection Status: Smart Speaker does not transmit an MQTT heartbeat. It communicates directly with the Gateway via HTTP POST upon detecting voice commands. No simulated waveform or fake microphone state.'
            : 'Tình trạng kết nối: Loa thông minh không gửi heartbeat MQTT liên tục mà phát lệnh trực tiếp tới Gateway qua HTTP POST khi nhận diện giọng nói. Hệ thống không tạo sóng âm hay trạng thái mic ảo.'}
        </span>
      </div>
    </div>
  );
}
