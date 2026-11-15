import { useLanguage } from '../../context/LanguageContext.jsx';

export default function BinVisualizer({
  isLive = false,
  fillPercent = null,
  isMeasurementValid = false,
  lidOpen = false,
  mode = 'auto',
  ageSeconds = null
}) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const isFull = fillPercent !== null && fillPercent >= 80;
  const isMedium = fillPercent !== null && fillPercent >= 40 && fillPercent < 80;
  const isLow = fillPercent !== null && fillPercent < 40;

  // Clamp chiều cao cột rác trong SVG 0 - 100 (độ cao tối đa 160px)
  const clampedFill = isMeasurementValid && fillPercent !== null ? Math.max(0, Math.min(100, fillPercent)) : 0;
  const trashHeight = Math.round((clampedFill / 100) * 160);

  // Nhãn trạng thái hiển thị
  let fillDisplay = isEn ? 'Unreadable' : 'Không đọc được';
  if (isMeasurementValid && fillPercent !== null) {
    fillDisplay = `${Math.round(fillPercent)}%`;
    if (fillPercent > 100) fillDisplay = `${Math.round(fillPercent)}% (${isEn ? 'Overfill' : 'Tràn mức'})`;
    if (fillPercent < 0) fillDisplay = `${Math.round(fillPercent)}% (${isEn ? 'Abnormal' : 'Bất thường'})`;
  }

  return (
    <div
      className={`bin-visualizer-card ${!isLive ? 'is-offline' : ''} ${isFull ? 'is-full-alert' : ''}`}
      role="region"
      aria-label={isEn ? 'Smart Bin Visualizer' : 'Minh họa trực quan thùng rác'}
    >
      <div className="bin-viz-header">
        <div className="bin-viz-badge-group">
          <span className={`bin-pill ${isLive ? (isMeasurementValid ? (isFull ? 'pill-danger' : 'pill-ok') : 'pill-warning') : 'pill-offline'}`}>
            <span className="bin-pill-dot" />
            {isLive
              ? (isMeasurementValid ? `${isEn ? 'Fill Level' : 'Mức đầy'}: ${fillDisplay}` : (isEn ? 'Sensor Error' : 'Không đọc được mức đầy'))
              : (isEn ? `Last known: ${fillDisplay}` : `Trạng thái cuối: ${fillDisplay}`)}
          </span>

          <span className="bin-pill pill-lid">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>{lidOpen ? (isEn ? 'LID OPEN' : 'NẮP MỞ') : (isEn ? 'LID CLOSED' : 'NẮP ĐÓNG')}</span>
          </span>

          <span className="bin-pill pill-mode">
            {isEn ? `MODE: ${mode.toUpperCase()}` : `CHẾ ĐỘ: ${mode.toUpperCase()}`}
          </span>
        </div>

        {isLive && ageSeconds !== null && (
          <span className="bin-viz-age">
            {isEn ? `${ageSeconds}s ago` : `${ageSeconds}s trước`}
          </span>
        )}
      </div>

      {/* Cảnh báo lỗi cảm biến hoặc thùng đầy */}
      {!isMeasurementValid && isLive && (
        <div className="bin-alert-banner banner-sensor-err" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            {isEn
              ? 'HC-SR04 Echo Timeout: Cannot read distance or fill percentage. Check wiring!'
              : 'Mất tín hiệu xung siêu âm HC-SR04: Không thể đọc khoảng cách hoặc mức đầy rác.'}
          </span>
        </div>
      )}

      {isFull && isLive && isMeasurementValid && (
        <div className="bin-alert-banner banner-full" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            {isEn
              ? `BIN CAPACITY FULL (${Math.round(fillPercent)}% >= 80%) — PLEASE EMPTY TRASH!`
              : `THÙNG RÁC ĐÃ ĐẦY (${Math.round(fillPercent)}% >= 80%) — VUI LÒNG ĐỔ RÁC!`}
          </span>
        </div>
      )}

      {/* Minh họa SVG */}
      <div className="bin-svg-container">
        <svg
          className="bin-svg"
          viewBox="0 0 400 320"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="binBodyGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="50%" stopColor="#334155" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <linearGradient id="trashGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isFull ? '#ef4444' : (isMedium ? '#f59e0b' : '#10b981')} />
              <stop offset="100%" stopColor={isFull ? '#991b1b' : (isMedium ? '#b45309' : '#047857')} />
            </linearGradient>
            <pattern id="diagonalHatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(239, 68, 68, 0.4)" strokeWidth="2" />
            </pattern>
          </defs>

          {/* Mặt đất */}
          <line x1="40" y1="290" x2="360" y2="290" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />

          {/* Thân thùng rác */}
          <path
            d="M 120 100 L 135 285 L 265 285 L 280 100 Z"
            fill="url(#binBodyGrad)"
            stroke="#475569"
            strokeWidth="3"
          />

          {/* Khung trong suốt thể hiện mức rác */}
          <path
            d="M 140 115 L 148 275 L 252 275 L 260 115 Z"
            fill="rgba(15, 23, 42, 0.7)"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="1.5"
          />

          {/* Cột rác chất đầy (chỉ vẽ khi sensorOk và có dữ liệu hợp lệ) */}
          {isMeasurementValid && trashHeight > 0 ? (
            <rect
              x="146"
              y={275 - trashHeight}
              width="108"
              height={trashHeight}
              rx="4"
              fill="url(#trashGrad)"
              opacity="0.9"
            />
          ) : (
            /* Không đọc được mức đầy: hiển thị họa tiết chéo cảnh báo */
            !isMeasurementValid && isLive && (
              <g>
                <rect x="146" y="115" width="108" height="160" fill="url(#diagonalHatch)" rx="4" />
                <rect x="148" y="180" width="104" height="30" rx="4" fill="#0f172a" />
                <text x="200" y="200" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="700">
                  {isEn ? 'NO ECHO / ERR' : 'KHÔNG ĐỌC ĐƯỢC'}
                </text>
              </g>
            )
          )}

          {/* Vạch chia phần trăm rác trên thân thùng */}
          <line x1="135" y1="147" x2="148" y2="147" stroke="#64748b" strokeWidth="1.5" />
          <text x="128" y="150" textAnchor="end" fill="#64748b" fontSize="9">80%</text>

          <line x1="138" y1="211" x2="148" y2="211" stroke="#64748b" strokeWidth="1.5" />
          <text x="131" y="214" textAnchor="end" fill="#64748b" fontSize="9">40%</text>

          {/* Đèn LED 3 trạng thái trên thùng theo firmware: LOW (Green), MEDIUM (Yellow), FULL (Red) */}
          <g transform="translate(165, 85)">
            <circle cx="10" cy="0" r="5" fill={isMeasurementValid && isLow ? '#10b981' : '#334155'} />
            <circle cx="35" cy="0" r="5" fill={isMeasurementValid && isMedium ? '#f59e0b' : '#334155'} />
            <circle cx="60" cy="0" r="5" fill={isMeasurementValid && isFull ? '#ef4444' : '#334155'} />
          </g>

          {/* Nắp thùng rác và cảm biến siêu âm HC-SR04 */}
          {lidOpen ? (
            /* Nắp mở góc nghiêng */
            <g className="bin-lid-open" transform="translate(110, 95) rotate(-45)">
              <rect x="0" y="-12" width="180" height="12" rx="4" fill="#64748b" stroke="#94a3b8" strokeWidth="1.5" />
              {/* Hai mắt siêu âm HC-SR04 */}
              <circle cx="50" cy="-6" r="4" fill="#0284c7" />
              <circle cx="70" cy="-6" r="4" fill="#0284c7" />
              {/* Bản lề */}
              <circle cx="0" cy="-6" r="5" fill="#38bdf8" />
            </g>
          ) : (
            /* Nắp đóng kín nằm ngang */
            <g className="bin-lid-closed">
              <rect x="110" y="88" width="180" height="12" rx="4" fill="#64748b" stroke="#94a3b8" strokeWidth="1.5" />
              {/* Hai mắt siêu âm HC-SR04 hướng xuống */}
              <circle cx="185" cy="94" r="4" fill="#0284c7" />
              <circle cx="215" cy="94" r="4" fill="#0284c7" />
              {/* Sóng siêu âm phát ra khi sensorOk */}
              {isMeasurementValid && (
                <g stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 2" fill="none" opacity="0.6">
                  <path d="M 180 105 Q 200 115 220 105" />
                  <path d="M 170 118 Q 200 130 230 118" />
                </g>
              )}
            </g>
          )}
        </svg>
      </div>

      {/* Chú thích kỹ thuật */}
      <div className="bin-viz-disclaimer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          {isEn
            ? 'Ultrasonic Sensor HC-SR04: Empty bin calibrated at 30cm, Full bin at 5cm. When no echo returns, system flags unreadable state without assuming 0%.'
            : 'Cảm biến siêu âm HC-SR04: Thùng rác trống chuẩn 30cm, đầy ở 5cm. Khi mất xung echo, hệ thống báo không đọc được thay vì biến thành 0%.'}
        </span>
      </div>
    </div>
  );
}

