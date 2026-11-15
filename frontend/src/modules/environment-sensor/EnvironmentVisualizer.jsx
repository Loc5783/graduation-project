import { useLanguage } from '../../context/LanguageContext.jsx';

export default function EnvironmentVisualizer({
  isLive = false,
  temperature = null,
  humidity = null,
  gasRaw = null,
  alertLevel = null,
  isWarmingUp = false,
  buzzerOn = null,
  ageSeconds = null
}) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const isDanger = alertLevel === 3;
  const isWarning = alertLevel === 2;
  const isWarm = alertLevel === 0 || isWarmingUp === true;
  const isSafe = alertLevel === 1;
  const isUnknown = !isDanger && !isWarning && !isWarm && !isSafe;

  let levelText = isEn ? 'SAFE' : 'AN TOÀN';
  if (isDanger) levelText = isEn ? 'DANGER (GAS LEAK)' : 'NGUY HIỂM RÒ RỈ GAS';
  else if (isWarning) levelText = isEn ? 'WARNING (ELEVATED GAS)' : 'CẢNH BÁO RÒ RỈ GAS';
  else if (isWarm) levelText = isEn ? 'WARM-UP IN PROGRESS' : 'ĐANG SẤY CẢM BIẾN MQ-2';
  else if (isUnknown) levelText = isEn ? 'UNKNOWN' : 'CHƯA XÁC ĐỊNH';

  const pillClass = isLive
    ? (isDanger ? 'pill-danger' : (isWarning ? 'pill-warning' : (isWarm ? 'pill-warm' : (isSafe ? 'pill-safe' : 'pill-offline'))))
    : 'pill-offline';

  return (
    <div
      className={`env-visualizer-card ${!isLive ? 'is-offline' : ''} ${isDanger ? 'is-danger-alert' : (isWarning ? 'is-warn-alert' : '')}`}
      role="region"
      aria-label={isEn ? 'Environment Sensor Visualizer' : 'Minh họa trực quan cảm biến môi trường'}
    >
      <div className="env-viz-header">
        <div className="env-viz-badge-group">
          <span className={`env-pill ${pillClass}`}>
            <span className="env-pill-dot" />
            {isLive ? levelText : (isEn ? `Last known: ${levelText}` : `Trạng thái cuối: ${levelText}`)}
          </span>

          {temperature !== null && (
            <span className="env-pill pill-metric">
              {temperature.toFixed(1)}°C
            </span>
          )}

          {humidity !== null && (
            <span className="env-pill pill-metric">
              {humidity.toFixed(1)}% RH
            </span>
          )}

          {buzzerOn === true && (
            <span className="env-pill pill-buzzer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              <span>{isEn ? 'BUZZER ON' : 'CÒI KÊU'}</span>
            </span>
          )}

          {buzzerOn === null && (
            <span className="env-pill pill-offline">
              <span>{isEn ? 'BUZZER: UNKNOWN' : 'CÒI: CHƯA RÕ'}</span>
            </span>
          )}
        </div>

        {isLive && ageSeconds !== null && (
          <span className="env-viz-age">
            {isEn ? `${ageSeconds}s ago` : `${ageSeconds}s trước`}
          </span>
        )}
      </div>

      {/* Cảnh báo an toàn Gas */}
      {(isDanger || isWarning) && isLive && (
        <div className={`env-alert-banner ${isDanger ? 'banner-danger' : 'banner-warn'}`} role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            {isDanger
              ? (isEn ? `DANGER: Gas ADC ${gasRaw} exceeded danger threshold (>=2200). Buzzer continuously sounding!` : `BÁO ĐỘNG ĐỎ: Gas ${gasRaw} ADC vượt ngưỡng nguy hiểm (>=2200). Còi đang kêu liên tục!`)
              : (isEn ? `WARNING: Gas ADC ${gasRaw} exceeded warning threshold (>=1200). Buzzer pulsing.` : `CẢNH BÁO: Gas ${gasRaw} ADC vượt ngưỡng cảnh báo (>=1200). Còi ngắt quãng.`)}
          </span>
        </div>
      )}

      {/* Minh họa phòng & cảm biến SVG */}
      <div className="env-svg-container">
        <svg
          className="env-svg"
          viewBox="0 0 400 320"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0b1329" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <radialGradient id="gasGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={isDanger ? '#ef4444' : (isWarning ? '#f59e0b' : '#06b6d4')} stopOpacity="0.4" />
              <stop offset="100%" stopColor={isDanger ? '#ef4444' : (isWarning ? '#f59e0b' : '#06b6d4')} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Gian phòng / Khung cảm biến */}
          <rect x="40" y="30" width="320" height="260" rx="14" fill="url(#wallGrad)" stroke="#334155" strokeWidth="2" />

          {/* Ánh sáng cảnh báo gas lan tỏa khi có nồng độ cao */}
          {(isDanger || isWarning) && (
            <circle cx="200" cy="140" r="110" fill="url(#gasGlow)" />
          )}

          {/* Vỏ thiết bị cảm biến môi trường ESP32 treo tường */}
          <rect x="130" y="70" width="140" height="150" rx="12" fill="#0f172a" stroke="#475569" strokeWidth="2.5" />

          {/* Mặt lưới tản cảm biến MQ-2 */}
          <circle cx="200" cy="125" r="34" fill="#1e293b" stroke={isDanger ? '#ef4444' : (isWarning ? '#f59e0b' : (isWarm ? '#06b6d4' : '#10b981'))} strokeWidth="2.5" />
          <circle cx="200" cy="125" r="24" fill="none" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 3" />
          {/* Lưới kim loại bên trong MQ-2 */}
          <line x1="180" y1="125" x2="220" y2="125" stroke="#64748b" strokeWidth="1" />
          <line x1="200" y1="105" x2="200" y2="145" stroke="#64748b" strokeWidth="1" />
          <line x1="186" y1="111" x2="214" y2="139" stroke="#64748b" strokeWidth="1" />
          <line x1="186" y1="139" x2="214" y2="111" stroke="#64748b" strokeWidth="1" />

          {/* Cảm biến nhiệt ẩm DHT22 màu trắng đục nằm cạnh bên */}
          <rect x="145" y="175" width="28" height="32" rx="4" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
          <line x1="151" y1="182" x2="167" y2="182" stroke="#64748b" strokeWidth="1.2" />
          <line x1="151" y1="188" x2="167" y2="188" stroke="#64748b" strokeWidth="1.2" />
          <line x1="151" y1="194" x2="167" y2="194" stroke="#64748b" strokeWidth="1.2" />
          <line x1="151" y1="200" x2="167" y2="200" stroke="#64748b" strokeWidth="1.2" />

          {/* Còi Buzzer màu đen tròn */}
          <circle cx="240" cy="190" r="12" fill="#020617" stroke="#334155" strokeWidth="1.5" />
          <circle cx="240" cy="190" r="4" fill="#1e293b" />
          {buzzerOn && (
            <g stroke="#ef4444" strokeWidth="1.5" fill="none">
              <path d="M 256 182 Q 262 190 256 198" />
              <path d="M 261 176 Q 270 190 261 204" />
            </g>
          )}

          {/* Đèn báo trạng thái LED trên bo mạch */}
          <circle cx="200" cy="180" r="5" fill={isDanger ? '#ef4444' : (isWarning ? '#f59e0b' : (isWarm ? '#06b6d4' : '#10b981'))} />

          {/* Khói / Khí gas mô phỏng bốc lên khi có cảnh báo */}
          {(isDanger || isWarning) && (
            <g stroke={isDanger ? '#ef4444' : '#f59e0b'} strokeWidth="1.5" fill="none" opacity="0.7">
              <path d="M 185 90 Q 180 70 190 55" strokeDasharray="3 3" />
              <path d="M 200 90 Q 205 70 198 52" strokeDasharray="3 3" />
              <path d="M 215 90 Q 220 72 210 56" strokeDasharray="3 3" />
            </g>
          )}

          {/* Nhãn thiết bị */}
          <text x="200" y="245" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="600">
            {isEn ? 'MQ-2 & DHT22 SENSOR HUB' : 'TRẠM CẢM BIẾN MQ-2 & DHT22'}
          </text>
        </svg>
      </div>

      {/* Chú thích kỹ thuật bắt buộc */}
      <div className="env-viz-disclaimer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          {isEn
            ? 'Calibration Notice: Gas value is raw 12-bit ADC (0–4095), not calibrated ppm. Safe: <1200, Warning: 1200–2200, Danger: >=2200.'
            : 'Chú thích đo lường: Gas là giá trị ADC thô 12-bit (0–4095), chưa phải nồng độ ppm đã hiệu chuẩn. An toàn: <1200, Cảnh báo: 1200–2200, Nguy hiểm: >=2200.'}
        </span>
      </div>
    </div>
  );
}

