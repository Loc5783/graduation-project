import { useLanguage } from '../../context/LanguageContext.jsx';

/**
 * Component hiển thị đồ họa trực quan Cửa sổ, Cảm biến chuyển động và Cảnh báo.
 * - Sử dụng hoàn toàn SVG/CSS nội bộ, không phụ thuộc tài nguyên bên ngoài.
 * - Hỗ trợ đầy đủ trạng thái Live, Offline (làm dịu) và Chưa có dữ liệu.
 * - Accessible: Các SVG trang trí đánh dấu aria-hidden="true", trạng thái văn bản rõ ràng.
 */
export default function WindowVisualizer({ isLive, data, ageSeconds }) {
  const { lang } = useLanguage();
  const en = lang === 'en';

  const hasData = data !== null && typeof data === 'object';
  const doorOpen = hasData && typeof data.doorOpen === 'boolean' ? data.doorOpen : null;
  const motion = hasData && typeof data.motion === 'boolean' ? data.motion : null;
  const alarm = hasData && typeof data.alarm === 'boolean' ? data.alarm : false;
  const alarmReason = hasData ? data.alarmReason : null;

  // Nhãn trạng thái cửa sổ
  const getDoorStatusLabel = () => {
    if (!hasData || doorOpen === null) {
      return en ? 'State Unknown' : 'Chưa có dữ liệu';
    }
    if (!isLive) {
      const lastState = doorOpen ? (en ? 'Open' : 'Đang mở') : (en ? 'Closed' : 'Đang đóng');
      return en ? `Last State: ${lastState}` : `Trạng thái cuối: ${lastState}`;
    }
    return doorOpen ? (en ? 'Window Open' : 'Đang mở') : (en ? 'Window Closed' : 'Đang đóng');
  };

  return (
    <div className={`window-visualizer-container ${!isLive ? 'is-offline' : ''}`}>
      {/* 1. Khu vực minh họa Cửa sổ lớn */}
      <div className="window-graphic-card">
        <div className="window-graphic-header">
          <h3 className="graphic-title">{en ? 'Window State' : 'Trạng thái Cửa sổ'}</h3>
          <span className={`status-pill ${!isLive ? 'pill-offline' : doorOpen ? 'pill-open' : 'pill-closed'}`}>
            <span className="pill-dot"></span>
            {getDoorStatusLabel()}
          </span>
        </div>

        <div className="window-frame-wrapper" aria-hidden="true">
          <svg
            className={`window-svg ${doorOpen ? 'is-open' : 'is-closed'} ${!isLive ? 'is-muted' : ''}`}
            viewBox="0 0 280 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Khung tường ngoài */}
            <rect x="10" y="10" width="260" height="180" rx="12" className="svg-wall-frame" />
            
            {/* Khung cửa sổ chính */}
            <rect x="24" y="24" width="232" height="152" rx="6" className="svg-outer-frame" />
            <rect x="32" y="32" width="216" height="136" rx="4" className="svg-inner-sill" />

            {/* Bậu cửa sổ phía dưới */}
            <path d="M16 182 L264 182 L256 192 L24 192 Z" className="svg-window-ledge" />

            {/* Khung nền phía sau cánh cửa (ánh sáng lọt vào khi mở) */}
            <rect x="38" y="38" width="204" height="124" className="svg-back-opening" />

            {/* Cánh cửa bên trái */}
            <g className={`sash-group sash-left ${doorOpen ? 'open-transform-left' : ''}`}>
              <rect x="42" y="42" width="96" height="116" rx="3" className="sash-frame" />
              {/* Kính trên bên trái */}
              <rect x="50" y="50" width="80" height="46" rx="2" className="glass-pane" />
              <line x1="56" y1="56" x2="110" y2="86" className="glass-glare" />
              {/* Kính dưới bên trái */}
              <rect x="50" y="104" width="80" height="46" rx="2" className="glass-pane" />
              <line x1="56" y1="110" x2="110" y2="140" className="glass-glare" />
              {/* Tay nắm / Chốt bên trái */}
              <rect x="130" y="94" width="5" height="16" rx="2.5" className="sash-handle" />
            </g>

            {/* Cánh cửa bên phải */}
            <g className={`sash-group sash-right ${doorOpen ? 'open-transform-right' : ''}`}>
              <rect x="142" y="42" width="96" height="116" rx="3" className="sash-frame" />
              {/* Kính trên bên phải */}
              <rect x="150" y="50" width="80" height="46" rx="2" className="glass-pane" />
              <line x1="156" y1="56" x2="210" y2="86" className="glass-glare" />
              {/* Kính dưới bên phải */}
              <rect x="150" y="104" width="80" height="46" rx="2" className="glass-pane" />
              <line x1="156" y1="110" x2="210" y2="140" className="glass-glare" />
              {/* Tay nắm / Chốt bên phải */}
              <rect x="145" y="94" width="5" height="16" rx="2.5" className="sash-handle" />
            </g>

            {/* Điểm tiếp xúc cảm biến MC-38 (Reed Switch) */}
            <g className="reed-switch-indicator">
              <rect x="134" y="34" width="12" height="6" rx="2" className="sensor-base" />
              <circle cx="140" cy="37" r="2.5" className={`sensor-light ${doorOpen ? 'light-open' : 'light-closed'}`} />
            </g>
          </svg>
        </div>

        <div className="window-graphic-footer">
          <div className="footer-detail-item">
            <span className="detail-label">{en ? 'Sensor Hardware' : 'Cảm biến tiếp điểm'}:</span>
            <span className="detail-val">MC-38 (Magnetic Reed Switch)</span>
          </div>
          <div className="footer-detail-item">
            <span className="detail-label">{en ? 'Freshness' : 'Độ tươi'}:</span>
            <span className="detail-val">
              {isLive ? (
                <span className="text-emerald">{en ? 'Live Realtime' : 'Trực tiếp'}</span>
              ) : (
                <span className="text-muted">{en ? 'Offline' : 'Ngoại tuyến'}</span>
              )}
              {ageSeconds !== null && ageSeconds !== undefined ? ` (${Math.floor(ageSeconds)}s)` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Khu vực Cảm biến chuyển động PIR & Cảnh báo an ninh */}
      <div className="sensor-sub-cards">
        {/* Card PIR Motion */}
        <div className={`motion-card ${motion && isLive ? 'motion-active' : ''}`}>
          <div className="card-top-row">
            <div className="indicator-icon-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="pir-icon" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="7" r="4" />
                <path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2" />
                {motion && isLive && (
                  <>
                    <path d="M2 10a10 10 0 0 1 2.5-4" strokeDasharray="2 2" />
                    <path d="M22 10a10 10 0 0 0-2.5-4" strokeDasharray="2 2" />
                  </>
                )}
              </svg>
            </div>
            <div className="card-text-block">
              <h4 className="sub-card-title">{en ? 'PIR Motion Detection' : 'Phát hiện chuyển động PIR'}</h4>
              <p className="sub-card-status">
                {motion === null ? (
                  en ? 'Unknown' : 'Chưa có dữ liệu'
                ) : !isLive ? (
                  en ? (motion ? 'Last: Motion Detected' : 'Last: Quiet') : (motion ? 'Lần cuối: Có chuyển động' : 'Lần cuối: Yên tĩnh')
                ) : motion ? (
                  <span className="text-emerald">{en ? 'Motion Detected' : 'Có chuyển động trong phòng'}</span>
                ) : (
                  <span className="text-muted">{en ? 'No Motion' : 'Không ghi nhận chuyển động'}</span>
                )}
              </p>
            </div>
          </div>
          <small className="sensor-disclaimer">
            {en ? 'Passive Infrared Sensor; does not capture video or count persons.' : 'Cảm biến hồng ngoại thụ động; không phải camera và không đếm người.'}
          </small>
        </div>

        {/* Card Alarm Status */}
        <div className={`alarm-card ${alarm && isLive ? 'alarm-active' : ''}`}>
          <div className="card-top-row">
            <div className="indicator-icon-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="alarm-icon" fill="none" stroke="currentColor" strokeWidth="2">
                {alarm && isLive ? (
                  <>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </>
                ) : (
                  <>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </>
                )}
              </svg>
            </div>
            <div className="card-text-block">
              <h4 className="sub-card-title">{en ? 'Security Status' : 'Tình trạng an ninh'}</h4>
              <p className="sub-card-status">
                {alarm && isLive ? (
                  <span className="text-danger">
                    {en ? 'ALARM TRIGGERED' : 'CẢNH BÁO KÍCH HOẠT'}
                    {alarmReason ? ` (${alarmReason})` : ''}
                  </span>
                ) : (
                  <span className="text-emerald">{en ? 'Normal / Secure' : 'Bình thường / An toàn'}</span>
                )}
              </p>
            </div>
          </div>
          <small className="sensor-disclaimer">
            {alarm && isLive
              ? (en ? 'Buzzer active on hardware.' : 'Còi báo động đang kêu trên ESP32.')
              : (en ? 'Door and motion monitored securely.' : 'Tiếp điểm cửa và chuyển động được giám sát an toàn.')}
          </small>
        </div>
      </div>
    </div>
  );
}
