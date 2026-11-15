import { useLanguage } from '../../context/LanguageContext.jsx';

/**
 * Minh họa trực quan cửa và khóa cửa bằng vector SVG:
 * - Khung cửa và cánh cửa đóng / mở dựa trên `doorOpen`.
 * - Tách bạch rõ rệt giữa "Cửa đóng" và "Chốt khóa".
 * - Ghi chú rõ "Chưa có xác nhận chốt khóa" do phần cứng không có cảm biến phản hồi chốt.
 * - Hiệu ứng offline chuyển xám (desaturated) và ghi nhận "Trạng thái cuối".
 */
export default function DoorVisualizer({
  isLive = false,
  doorOpen = null,
  boltCommand = 'unknown',
  forcedOpen = false,
  heldOpen = false,
  alarm = false,
  ageSeconds = null
}) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const isOpen = doorOpen === true;
  const isClosed = doorOpen === false;
  const isAlarm = Boolean(alarm || forcedOpen || heldOpen);

  // Nhãn trạng thái cửa
  let doorStatusText = isEn ? 'Unknown' : 'Chưa xác định';
  if (isOpen) doorStatusText = isEn ? 'DOOR OPEN' : 'CỬA ĐANG MỞ';
  if (isClosed) doorStatusText = isEn ? 'DOOR CLOSED' : 'CỬA ĐANG ĐÓNG';

  // Nhãn lệnh chốt
  const boltCmdMap = {
    locked: isEn ? 'LOCKED (COMMAND)' : 'ĐÃ RA LỆNH KHÓA',
    unlocked: isEn ? 'UNLOCKED (COMMAND)' : 'ĐÃ RA LỆNH MỞ',
    locking: isEn ? 'LOCKING...' : 'ĐANG RA LỆNH KHÓA...',
    unlocking: isEn ? 'UNLOCKING...' : 'ĐANG RA LỆNH MỞ...',
    unknown: isEn ? 'UNKNOWN' : 'CHƯA RÕ'
  };
  const boltStatusText = boltCmdMap[boltCommand] || boltCommand.toUpperCase();

  return (
    <div
      className={`door-visualizer-card ${!isLive ? 'is-offline' : ''} ${isAlarm ? 'is-alarm' : ''}`}
      role="region"
      aria-label={isEn ? 'Door Lock Visualizer' : 'Minh họa trực quan khóa cửa'}
    >
      {/* Thanh trạng thái phụ trên đầu visualizer */}
      <div className="door-viz-header">
        <div className="door-viz-badge-group">
          <span className={`door-pill ${isLive ? (isOpen ? 'pill-open' : 'pill-closed') : 'pill-offline'}`}>
            <span className="door-pill-dot" />
            {isLive ? doorStatusText : (isEn ? `Last known: ${doorStatusText}` : `Trạng thái cuối: ${doorStatusText}`)}
          </span>

          <span className="door-pill pill-bolt">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{boltStatusText}</span>
          </span>
        </div>

        {isLive && ageSeconds !== null && (
          <span className="door-viz-age">
            {isEn ? `${ageSeconds}s ago` : `${ageSeconds}s trước`}
          </span>
        )}
      </div>

      {/* Cảnh báo an ninh nổi bật nếu có */}
      {isAlarm && (
        <div className="door-alert-banner" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            {forcedOpen
              ? (isEn ? 'SECURITY ALERT: FORCED DOOR OPEN DETECTED!' : 'CẢNH BÁO AN NINH: PHÁT HIỆN CẠY CỬA TRÁI PHÉP!')
              : (heldOpen
                  ? (isEn ? 'SECURITY ALERT: DOOR HELD OPEN TOO LONG!' : 'CẢNH BÁO AN NINH: CỬA BỊ MỞ QUÁ THỜI GIAN QUY ĐỊNH!')
                  : (isEn ? 'SECURITY ALARM ACTIVE' : 'CÒI BÁO ĐỘNG ĐANG KÍCH HOẠT'))}
          </span>
        </div>
      )}

      {/* Hình vẽ minh họa SVG */}
      <div className="door-svg-container">
        <svg
          className="door-svg"
          viewBox="0 0 400 320"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="doorFrameGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--door-frame-top, #334155)" />
              <stop offset="100%" stopColor="var(--door-frame-bot, #1e293b)" />
            </linearGradient>
            <linearGradient id="doorPanelGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--door-panel-left, #047857)" />
              <stop offset="100%" stopColor="var(--door-panel-right, #10b981)" />
            </linearGradient>
            <linearGradient id="doorPanelOpenGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--door-open-panel-left, #b45309)" />
              <stop offset="100%" stopColor="var(--door-open-panel-right, #f59e0b)" />
            </linearGradient>
            <filter id="doorShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Sàn nhà */}
          <line x1="20" y1="290" x2="380" y2="290" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />

          {/* Khung cửa bên ngoài */}
          <rect
            x="90"
            y="30"
            width="220"
            height="260"
            rx="6"
            fill="none"
            stroke="url(#doorFrameGrad)"
            strokeWidth="12"
          />

          {/* Lòng cửa bên trong (nền phía sau khi cửa mở) */}
          <rect
            x="96"
            y="36"
            width="208"
            height="254"
            fill="var(--door-interior-bg, #0b1329)"
            stroke="none"
          />

          {/* Khi cửa mở: Vẽ lối đi sâu vào bên trong */}
          {isOpen && (
            <g className="door-interior-view">
              <polygon points="96,36 130,70 130,260 96,290" fill="rgba(6, 182, 212, 0.08)" />
              <line x1="130" y1="70" x2="270" y2="70" stroke="currentColor" strokeOpacity="0.15" strokeDasharray="4 4" />
              <line x1="130" y1="260" x2="270" y2="260" stroke="currentColor" strokeOpacity="0.15" strokeDasharray="4 4" />
              {/* Làn gió / luồng mở */}
              <path d="M 160 140 Q 200 130 240 140" fill="none" stroke="rgba(245, 158, 11, 0.4)" strokeWidth="2" strokeDasharray="4 4" />
              <path d="M 150 170 Q 200 160 250 170" fill="none" stroke="rgba(245, 158, 11, 0.4)" strokeWidth="2" strokeDasharray="4 4" />
            </g>
          )}

          {/* Cánh cửa */}
          {isClosed ? (
            /* Cửa đóng phẳng hoàn toàn */
            <g className="door-panel-closed">
              <rect
                x="98"
                y="38"
                width="204"
                height="250"
                rx="4"
                fill="url(#doorPanelGrad)"
                filter="url(#doorShadow)"
              />
              {/* Chỉ phào trang trí cánh cửa */}
              <rect x="116" y="56" width="168" height="96" rx="4" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <rect x="116" y="168" width="168" height="100" rx="4" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />

              {/* Tay nắm khóa & Ổ khóa cửa */}
              <g transform="translate(268, 155)">
                {/* Tấm ốp khóa */}
                <rect x="-8" y="-22" width="16" height="44" rx="3" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />
                {/* Tay gạt */}
                <rect x="-18" y="-6" width="22" height="6" rx="2" fill="#e2e8f0" />
                <circle cx="0" cy="-3" r="4" fill="#94a3b8" />
                {/* Khe khóa */}
                <circle cx="0" cy="10" r="2.5" fill="#0f172a" />
                <path d="M -1.5 10 L 1.5 10 L 2 16 L -2 16 Z" fill="#0f172a" />
              </g>

              {/* Tiếp điểm từ MC-38 trên mép cửa */}
              <g transform="translate(296, 60)">
                <rect x="0" y="0" width="4" height="20" rx="1" fill="#38bdf8" />
                <rect x="5" y="0" width="4" height="20" rx="1" fill="#38bdf8" />
              </g>
            </g>
          ) : (
            isOpen ? (
              /* Cửa mở hé / mở nghiêng sang một bên */
              <g className="door-panel-open">
                {/* Phối cảnh 3D cánh cửa mở về bên trái */}
                <polygon
                  points="98,38 180,60 180,270 98,290"
                  fill="url(#doorPanelOpenGrad)"
                  filter="url(#doorShadow)"
                />
                <polygon
                  points="180,60 190,62 190,268 180,270"
                  fill="#78350f"
                />
                {/* Tay nắm trên cánh cửa mở */}
                <circle cx="168" cy="165" r="5" fill="#f8fafc" stroke="#475569" strokeWidth="1.5" />

                {/* Tiếp điểm từ MC-38 bị tách rời */}
                <rect x="186" y="70" width="4" height="16" rx="1" fill="#f59e0b" />
                <rect x="296" y="60" width="4" height="20" rx="1" fill="#64748b" opacity="0.6" />
                <line x1="190" y1="78" x2="296" y2="70" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7" />
              </g>
            ) : (
              /* Chưa xác định */
              <g className="door-panel-unknown">
                <rect
                  x="98"
                  y="38"
                  width="204"
                  height="250"
                  rx="4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  strokeOpacity="0.4"
                />
                <text x="200" y="165" textAnchor="middle" fill="currentColor" fillOpacity="0.5" fontSize="14">
                  {isEn ? 'Awaiting telemetry...' : 'Đang chờ telemetry...'}
                </text>
              </g>
            )
          )}

          {/* Bản lề cửa */}
          <rect x="91" y="60" width="5" height="18" rx="1" fill="#94a3b8" />
          <rect x="91" y="240" width="5" height="18" rx="1" fill="#94a3b8" />
        </svg>
      </div>

      {/* Thông điệp kỹ thuật minh bạch */}
      <div className="door-viz-disclaimer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          {isEn
            ? 'Safety Note: Door closed status does not verify the bolt is securely locked. Hardware has no mechanical bolt feedback sensor.'
            : 'Lưu ý an toàn: Cửa đóng từ cảm biến MC-38 không xác nhận chốt đã khóa cơ học. Phần cứng chưa có cảm biến phản hồi chốt.'}
        </span>
      </div>
    </div>
  );
}

