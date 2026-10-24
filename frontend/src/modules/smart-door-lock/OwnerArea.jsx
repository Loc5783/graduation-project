import { useLanguage } from '../../context/LanguageContext.jsx';
import './SmartDoorLock.css';

const copy = {
  vi: {
    eyebrow: 'Khu vực phát triển · SMART DOOR LOCK',
    title: 'Khóa cửa thông minh',
    intro: 'Xem tình trạng cửa, phương thức ra vào và các cảnh báo tại một nơi.',
    connection: 'Web chưa kết nối với khóa',
    local: 'Khóa vẫn hoạt động tại cửa',
    overview: 'Tình trạng hiện tại',
    overviewHint: 'Trạng thái sẽ cập nhật khi dữ liệu từ thiết bị được đồng bộ.',
    door: 'Cửa', doorValue: 'Chưa có dữ liệu', doorHint: 'Cảm biến cửa MC38 chưa gửi trạng thái lên web.',
    bolt: 'Chốt khóa', boltValue: 'Chưa xác nhận', boltHint: 'Chưa thể biết chốt đang khóa hay mở từ web.',
    alerts: 'Cảnh báo', alertsValue: 'Chưa có dữ liệu', alertsHint: 'Cảnh báo trên thiết bị chưa được đồng bộ.',
    dataNotice: 'Dữ liệu trực tuyến chưa đối chiếu backend/firmware. Đừng dùng màn hình này để xác nhận cửa đã khóa.',
    access: 'Mở cửa bằng cách nào?',
    accessHint: 'Những cách mở này đã hoạt động trực tiếp trên khóa.',
    methods: [
      { glyph: '⌗', label: 'Mã PIN', description: 'Nhập mã trên bàn phím ở cửa.' },
      { glyph: '▤', label: 'Thẻ RFID', description: 'Chạm thẻ đã đăng ký vào đầu đọc.' },
      { glyph: '◎', label: 'Vân tay', description: 'Đặt ngón tay đã được cấp quyền.' },
      { glyph: '↗', label: 'Nút bên trong', description: 'Nhấn nút để mở từ phía trong.' }
    ],
    localTag: 'Tại cửa',
    activity: 'Hoạt động gần đây',
    activityTag: 'Chưa đồng bộ',
    activityEmpty: 'Chưa có lịch sử trên web',
    activityHint: 'Sự kiện hiện được lưu trên thiết bị. Khi kết nối hoàn tất, nhật ký sẽ hiển thị hành động, cách mở và thời điểm.',
    protection: 'Bảo vệ tại cửa',
    protectionHint: 'Các tính năng này chạy trên thiết bị ngay cả khi web chưa kết nối.',
    protections: [
      { glyph: '!', title: 'Mở cửa trái phép', detail: 'Phát hiện cửa mở khi chưa có lượt xác thực hợp lệ.' },
      { glyph: '◷', title: 'Cửa mở quá lâu', detail: 'Báo động nếu cửa mở hơn 30 giây.' },
      { glyph: '↻', title: 'Tự khóa lại', detail: 'Tự khóa khi cửa đóng, hoặc sau 10 giây nếu không mở cửa.' }
    ],
    remote: 'Mở cửa từ web',
    remoteTag: 'Chưa khả dụng',
    remoteHint: 'Sẽ chỉ bật sau khi đồng bộ MQTT, phân quyền người dùng và kiểm tra trên cửa thật.',
    owner: 'Phụ trách: Thành'
  },
  en: {
    eyebrow: 'MODULE WORKSPACE · SMART DOOR LOCK',
    title: 'Smart door lock',
    intro: 'See door status, ways to enter and security alerts in one place.',
    connection: 'Web is not connected to the lock',
    local: 'The lock still works at the door',
    overview: 'Current status',
    overviewHint: 'Status will update when device data is synchronized.',
    door: 'Door', doorValue: 'No data yet', doorHint: 'The MC38 door sensor has not sent its state to the web.',
    bolt: 'Lock bolt', boltValue: 'Unconfirmed', boltHint: 'The web cannot yet tell whether the bolt is locked or unlocked.',
    alerts: 'Alerts', alertsValue: 'No data yet', alertsHint: 'Device alerts have not been synchronized.',
    dataNotice: 'Live data has not been matched to the backend/firmware. Do not use this screen to confirm that the door is locked.',
    access: 'How can I unlock the door?',
    accessHint: 'These methods already work directly on the lock.',
    methods: [
      { glyph: '⌗', label: 'PIN code', description: 'Enter the code on the door keypad.' },
      { glyph: '▤', label: 'RFID card', description: 'Tap a registered card on the reader.' },
      { glyph: '◎', label: 'Fingerprint', description: 'Use an authorized fingerprint.' },
      { glyph: '↗', label: 'Inside button', description: 'Press the button to open from inside.' }
    ],
    localTag: 'At the door',
    activity: 'Recent activity',
    activityTag: 'Not synced',
    activityEmpty: 'No web history yet',
    activityHint: 'Events are currently stored on the device. Once connected, the log will show the action, access method and time.',
    protection: 'On-device protection',
    protectionHint: 'These features run on the device even without a web connection.',
    protections: [
      { glyph: '!', title: 'Unauthorized opening', detail: 'Detects a door opening without valid authorization.' },
      { glyph: '◷', title: 'Door left open', detail: 'Sounds an alarm after the door stays open for over 30 seconds.' },
      { glyph: '↻', title: 'Automatic relock', detail: 'Relocks when the door closes, or after 10 seconds if it is not opened.' }
    ],
    remote: 'Unlock from the web',
    remoteTag: 'Unavailable',
    remoteHint: 'This requires MQTT synchronization, user permissions and testing on the physical door.',
    owner: 'Owner: Thành'
  }
};

export default function SmartDoorLockOwnerArea() {
  const { isEnglish } = useLanguage();
  const c = copy[isEnglish ? 'en' : 'vi'];

  return (
    <div className="owner-area-container sdl" data-module="smart-door-lock" data-owner="thanh">
      <header className="sdl-hero">
        <div className="sdl-hero-content">
          <span className="sdl-eyebrow">{c.eyebrow}</span>
          <h2>{c.title}</h2>
          <p>{c.intro}</p>
          <div className="sdl-connection"><span className="sdl-connection-dot" aria-hidden="true" /><strong>{c.connection}</strong><span className="sdl-connection-divider" aria-hidden="true" /><span>{c.local}</span></div>
        </div>
        <div className="sdl-hero-visual" aria-hidden="true"><span className="sdl-visual-orbit" /><span className="sdl-visual-door"><i /></span><span className="sdl-visual-caption">SMART DOOR · 01</span></div>
      </header>

      <section className="sdl-section sdl-overview" aria-labelledby="sdl-overview-title">
        <div className="sdl-section-heading"><div><span className="sdl-section-index">01 / OVERVIEW</span><h3 id="sdl-overview-title">{c.overview}</h3><p>{c.overviewHint}</p></div></div>
        <div className="sdl-status-grid">
          <article className="sdl-status sdl-status-primary"><span className="sdl-status-label"><span className="sdl-status-symbol" aria-hidden="true">◫</span>{c.door}</span><strong>{c.doorValue}</strong><p>{c.doorHint}</p></article>
          <article className="sdl-status"><span className="sdl-status-label"><span className="sdl-status-symbol" aria-hidden="true">⌑</span>{c.bolt}</span><strong>{c.boltValue}</strong><p>{c.boltHint}</p></article>
          <article className="sdl-status"><span className="sdl-status-label"><span className="sdl-status-symbol" aria-hidden="true">!</span>{c.alerts}</span><strong>{c.alertsValue}</strong><p>{c.alertsHint}</p></article>
        </div>
        <p className="sdl-notice"><span aria-hidden="true">ⓘ</span>{c.dataNotice}</p>
      </section>

      <section className="sdl-section" aria-labelledby="sdl-access-title">
        <div className="sdl-section-heading"><div><span className="sdl-section-index">02 / ACCESS</span><h3 id="sdl-access-title">{c.access}</h3><p>{c.accessHint}</p></div><span className="sdl-heading-line" aria-hidden="true" /></div>
        <div className="sdl-method-grid">{c.methods.map((method) => <article className="sdl-method" key={method.label}><span className="sdl-method-glyph" aria-hidden="true">{method.glyph}</span><h4>{method.label}</h4><p>{method.description}</p><span className="sdl-method-tag">{c.localTag}</span></article>)}</div>
      </section>

      <div className="sdl-two-column">
        <section className="sdl-panel" aria-labelledby="sdl-activity-title"><div className="sdl-panel-heading"><div><span className="sdl-section-index">03 / ACTIVITY</span><h3 id="sdl-activity-title">{c.activity}</h3></div><span className="sdl-panel-tag">{c.activityTag}</span></div><div className="sdl-empty-state"><span className="sdl-empty-glyph" aria-hidden="true">◷</span><strong>{c.activityEmpty}</strong><p>{c.activityHint}</p></div></section>
        <section className="sdl-panel" aria-labelledby="sdl-protection-title"><div className="sdl-panel-heading"><div><span className="sdl-section-index">04 / SAFETY</span><h3 id="sdl-protection-title">{c.protection}</h3></div></div><p className="sdl-panel-intro">{c.protectionHint}</p><div className="sdl-protection-list">{c.protections.map((item) => <div className="sdl-protection" key={item.title}><span className="sdl-protection-glyph" aria-hidden="true">{item.glyph}</span><div><h4>{item.title}</h4><p>{item.detail}</p></div></div>)}</div></section>
      </div>

      <footer className="sdl-footer"><div className="sdl-remote"><div><strong>{c.remote}</strong><p>{c.remoteHint}</p></div><span className="sdl-remote-tag">{c.remoteTag}</span></div><span className="sdl-owner">{c.owner}</span></footer>
    </div>
  );
}
