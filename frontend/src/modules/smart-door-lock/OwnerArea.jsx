import { useLanguage } from '../../context/LanguageContext.jsx';
import './SmartDoorLock.css';

const words = {
  vi: {
    eyebrow: 'Khu vực phát triển · Smart Door Lock', title: 'An toàn bắt đầu từ cánh cửa',
    intro: 'Theo dõi cửa, chốt khóa và những lần ra vào tại một nơi. Phần cứng đã chạy độc lập; dữ liệu trực tuyến sẽ xuất hiện sau khi kết nối Hub.',
    offline: 'Chưa kết nối Hub', local: 'Thiết bị hoạt động cục bộ',
    door: 'Cửa', bolt: 'Chốt khóa', alarm: 'Cảnh báo',
    mc38: 'Cảm biến MC38', servo: 'Servo MG90S', alertSource: 'Mở trái phép / mở lâu',
    unavailable: 'Chưa có dữ liệu', unconfirmed: 'Chưa xác nhận',
    dataNotice: 'Dữ liệu trực tuyến chưa đối chiếu backend/firmware. Các trạng thái ở đây không phản ánh cửa theo thời gian thực.',
    access: 'Các cách mở cửa đã có trên thiết bị', accessSub: 'Xác thực và điều khiển khóa vẫn diễn ra trực tiếp trên ESP32-S3.',
    methods: [
      ['⌗', 'Mã PIN', 'Nhập trên keypad; khóa tạm sau 5 lần sai.'],
      ['▣', 'Thẻ RFID', 'RC522 chỉ chấp nhận thẻ đã đăng ký.'],
      ['◉', 'Vân tay', 'AS608 chỉ chấp nhận ID được cấp quyền.'],
      ['↗', 'Nút bên trong', 'Mở cục bộ, kể cả khi PIN bị khóa tạm.']
    ],
    verified: 'Đã chạy cục bộ', history: 'Lịch sử ra vào', historyEmpty: 'Chưa có nhật ký đồng bộ lên web',
    historyText: 'Firmware lưu sự kiện trong LittleFS. Quản trị viên có thể đọc log qua Serial Monitor; web chưa nhận được các sự kiện này.',
    protection: 'Bảo vệ đang có',
    protections: [
      ['!', 'Mở cửa không xác thực', 'MC38 phát hiện cửa mở ngoài chu kỳ được cấp quyền.'],
      ['◷', 'Cửa mở quá lâu', 'Báo động khi cửa mở liên tục hơn 30 giây.'],
      ['↻', 'Tự khóa lại', 'Khóa sau khi cửa đóng ổn định; hoặc sau 10 giây nếu chưa mở cửa.']
    ],
    remote: 'Điều khiển từ xa', remoteText: 'Chưa khả dụng. Chỉ thêm thao tác mở từ web sau khi hoàn tất MQTT, phân quyền và kiểm tra an toàn trên cửa thật.',
    planned: 'Sắp tích hợp', owner: 'Phụ trách: Thành'
  },
  en: {
    eyebrow: 'Module workspace · Smart Door Lock', title: 'Security starts at the door',
    intro: 'Door, bolt and access activity in one place. The device works locally; live data will appear after Hub integration.',
    offline: 'Hub not connected', local: 'Device works locally',
    door: 'Door', bolt: 'Bolt', alarm: 'Alerts',
    mc38: 'MC38 contact sensor', servo: 'MG90S servo', alertSource: 'Forced / held-open alerts',
    unavailable: 'No live data', unconfirmed: 'Unconfirmed',
    dataNotice: 'Live data has not been matched to the backend/firmware. These states do not represent the door in real time.',
    access: 'Local ways to unlock', accessSub: 'Authentication and lock control still run directly on the ESP32-S3.',
    methods: [
      ['⌗', 'PIN code', 'Keypad entry; temporary lockout after five failures.'],
      ['▣', 'RFID card', 'RC522 accepts registered cards only.'],
      ['◉', 'Fingerprint', 'AS608 accepts explicitly authorized IDs only.'],
      ['↗', 'Inside button', 'Local exit remains available during PIN lockout.']
    ],
    verified: 'Working locally', history: 'Access history', historyEmpty: 'No web-synced events yet',
    historyText: 'The firmware stores events in LittleFS. An administrator can read the log through Serial Monitor; the web app has not received these events yet.',
    protection: 'Protection on device',
    protections: [
      ['!', 'Unauthorized opening', 'MC38 detects opening outside an authorized access cycle.'],
      ['◷', 'Door left open', 'Alarm after the door stays open for over 30 seconds.'],
      ['↻', 'Automatic relock', 'Locks after the door settles closed, or after 10 seconds without opening.']
    ],
    remote: 'Remote control', remoteText: 'Unavailable for now. Web unlocking requires MQTT, access control and safety testing on the physical door.',
    planned: 'Planned', owner: 'Owner: Thành'
  }
};

export default function SmartDoorLockOwnerArea() {
  const { isEnglish } = useLanguage();
  const c = words[isEnglish ? 'en' : 'vi'];
  const status = [
    ['01', c.door, c.mc38, c.unavailable],
    ['02', c.bolt, c.servo, c.unconfirmed],
    ['03', c.alarm, c.alertSource, c.unavailable]
  ];

  return (
    <div className="owner-area-container sdl" data-module="smart-door-lock" data-owner="thanh">
      <header className="sdl-hero">
        <div className="sdl-hero-copy">
          <span className="sdl-kicker"><i />{c.eyebrow}</span>
          <h2>{c.title}</h2>
          <p>{c.intro}</p>
          <div className="sdl-badges"><span className="sdl-badge sdl-badge-offline"><i />{c.offline}</span><span className="sdl-badge sdl-badge-local">{c.local}</span></div>
        </div>
        <div className="sdl-hero-art" aria-hidden="true"><div className="sdl-ring sdl-ring-outer" /><div className="sdl-ring sdl-ring-inner" /><div className="sdl-door"><div className="sdl-door-inner"><span /></div></div><small>ESP32-S3 · MC38 · AS608</small></div>
      </header>

      <div className="sdl-status-grid" aria-label={isEnglish ? 'Device status' : 'Trạng thái thiết bị'}>
        {status.map(([number, label, detail, value]) => <article className="sdl-status" key={number}><div><span className="sdl-status-number">{number}</span><span className="sdl-status-detail">{detail}</span></div><p>{label}</p><strong>{value}</strong></article>)}
      </div>
      <p className="sdl-notice"><span aria-hidden="true">ⓘ</span>{c.dataNotice}</p>

      <section className="sdl-section" aria-labelledby="sdl-access-title">
        <div className="sdl-section-head"><div><span className="sdl-overline">01 / ACCESS</span><h3 id="sdl-access-title">{c.access}</h3><p>{c.accessSub}</p></div><span className="sdl-head-line" /></div>
        <div className="sdl-method-grid">{c.methods.map(([icon, title, detail]) => <article className="sdl-method" key={title}><span className="sdl-method-icon" aria-hidden="true">{icon}</span><h4>{title}</h4><p>{detail}</p><span className="sdl-local-state"><i />{c.verified}</span></article>)}</div>
      </section>

      <div className="sdl-lower-grid">
        <section className="sdl-panel" aria-labelledby="sdl-history-title"><span className="sdl-overline">02 / ACTIVITY</span><h3 id="sdl-history-title">{c.history}</h3><div className="sdl-empty-mark" aria-hidden="true">◷</div><h4>{c.historyEmpty}</h4><p>{c.historyText}</p></section>
        <section className="sdl-panel" aria-labelledby="sdl-protection-title"><span className="sdl-overline">03 / PROTECTION</span><h3 id="sdl-protection-title">{c.protection}</h3><div className="sdl-protection-list">{c.protections.map(([icon, title, detail]) => <div className="sdl-protection" key={title}><span aria-hidden="true">{icon}</span><div><h4>{title}</h4><p>{detail}</p></div></div>)}</div></section>
      </div>

      <footer className="sdl-remote"><span className="sdl-remote-icon" aria-hidden="true">◇</span><div><strong>{c.remote}</strong><p>{c.remoteText}</p></div><span className="sdl-planned">{c.planned}</span></footer>
      <p className="sdl-owner">{c.owner}</p>
    </div>
  );
}
