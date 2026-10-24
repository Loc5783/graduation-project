import { useLanguage } from '../../context/LanguageContext.jsx';
import useSmartDoorLock from './useSmartDoorLock.js';
import './SmartDoorLock.css';

const copy = {
  vi: {
    eyebrow: 'Khu vực phát triển · SMART DOOR LOCK', title: 'Khóa cửa thông minh',
    intro: 'Theo dõi cửa, các cảm biến và từng lượt ra vào ngay khi thiết bị cập nhật.',
    live: 'Đang cập nhật trực tiếp', connecting: 'Đang kết nối với khóa', offline: 'Thiết bị chưa trực tuyến',
    streamLost: 'Mất kết nối cập nhật', stale: 'Dữ liệu đã quá hạn', brokerLost: 'Máy chủ chưa kết nối MQTT',
    unauthorized: 'Đăng nhập để xem dữ liệu thiết bị.', forbidden: 'Tài khoản chưa được cấp quyền xem khóa cửa.',
    unavailable: 'Chưa kết nối được máy chủ. Hệ thống sẽ tự thử kết nối lại.',
    invalid: 'Dữ liệu nhận được chưa hợp lệ. Đang chờ bản cập nhật mới.',
    unsupported: 'Trình duyệt chưa hỗ trợ luồng cập nhật trực tiếp.',
    lastUpdate: 'Cập nhật gần nhất', noUpdate: 'Chưa nhận dữ liệu', lastKnown: 'Lần nhận cuối',
    overview: 'Tình trạng tại cửa', overviewHint: 'Cửa và lệnh điều khiển servo được hiển thị riêng để dễ kiểm tra.',
    door: 'Cửa · MC38', doorOpen: 'Cửa đang mở', doorClosed: 'Cửa đang đóng',
    doorHint: 'Trạng thái tiếp điểm cảm biến cửa.',
    bolt: 'Servo khóa', boltHint: 'Lệnh đã gửi tới servo; chưa có cảm biến xác nhận chốt khóa thực tế.',
    boltDone: 'Servo đã hoàn tất lệnh', boltMoving: 'Servo đang thực hiện lệnh',
    boltStates: { unknown: 'Chưa xác định lệnh', locked: 'Lệnh khóa', unlocked: 'Lệnh mở khóa', locking: 'Đang khóa', unlocking: 'Đang mở khóa' },
    alerts: 'Cảnh báo hiện tại', noAlerts: 'Chưa ghi nhận cảnh báo', alertsHint: 'Theo dõi cửa, rung và khóa tạm thời do nhập sai PIN.',
    forced: 'Mở cửa trái phép', held: 'Cửa mở quá lâu', vibrationAlert: 'Phát hiện rung', pinLocked: 'PIN đang bị khóa tạm thời',
    noData: 'Chưa có dữ liệu', noLive: 'Chờ dữ liệu trực tiếp',
    initialNotice: 'Kết nối trực tuyến chưa đối chiếu backend/firmware: đang chờ dữ liệu thật từ thiết bị.',
    offlineNotice: 'Giá trị cảm biến được ẩn khi mất kết nối hoặc dữ liệu quá hạn. Khóa vẫn xử lý tại cửa; hãy kiểm tra trực tiếp nếu cần xác nhận an toàn.',
    liveNotice: 'Dữ liệu cảm biến đang cập nhật. Trạng thái servo là lệnh điều khiển, không xác nhận vị trí chốt khóa thực tế.',
    sensors: 'Các cảm biến & cách mở cửa', sensorsHint: 'Mỗi thẻ hiển thị tín hiệu thật từ thiết bị. Không gửi mã PIN hoặc mẫu vân tay lên web.',
    vibration: 'Cảm biến rung', vibrationIdle: 'Chưa phát hiện rung', vibrationOn: 'Có rung', notInstalled: 'Chưa lắp',
    triggers: 'Lượt phát hiện từ lúc khởi động', uncalibrated: 'Chưa hiệu chuẩn', vibrationCalibration: 'Cần xác định mức kích hoạt trước khi nhận diện rung.', light: 'Cảm biến ánh sáng', lightHint: 'Tín hiệu CDS chưa hiệu chuẩn sáng/tối và không phải số đo lux.',
    rfid: 'Thẻ RFID', ready: 'Sẵn sàng', notDetected: 'Không nhận đầu đọc', cards: 'Thẻ đã đăng ký',
    fingerprint: 'Vân tay', busy: 'Đang xử lý', fpOffline: 'Cảm biến mất kết nối', fingerprints: 'Vân tay đã cấp quyền',
    keypad: 'Bàn phím & PIN', configured: 'Đã đặt mã PIN', notConfigured: 'Chưa đặt mã PIN', failures: 'Lần nhập sai', remaining: 'Còn', seconds: 'giây',
    inside: 'Nút mở bên trong', pressed: 'Đang nhấn', released: 'Đang thả', insideHint: 'Nhấn nút tại cửa để mở từ phía trong.',
    setup: 'Hoàn tất thiết lập tại cửa', setupHint: 'Thực hiện trên bàn phím và màn hình OLED của khóa.', setupDone: 'Đã hoàn tất', setupNext: 'Bước tiếp theo', setupWaiting: 'Chưa hoàn tất',
    setupSteps: [
      { title: 'Đặt mã PIN', detail: 'Giữ nút mở bên trong rồi nhấn #. Thả nút, nhập PIN mới 6–8 số → #; nhập lại PIN → #.' },
      { title: 'Đăng ký thẻ RFID', detail: 'Màn hình sẽ tự chuyển sang thêm thẻ. Chạm một thẻ RFID vào đầu đọc để đăng ký.' },
      { title: 'Đăng ký vân tay', detail: 'Tiếp tục theo hướng dẫn trên OLED: đặt, nhấc rồi đặt lại ngón tay để hoàn tất.' }
    ],
    setupResume: 'Nếu hết thời gian: khi chưa nhập ký tự nào, nhấn # → nhập PIN quản trị → # để tiếp tục thiết lập.',
    activity: 'Hoạt động gần đây', activityEmpty: 'Chưa nhận sự kiện',
    activityHint: 'Nhật ký sẽ xuất hiện khi thiết bị gửi sự kiện. Thời điểm hiển thị là lúc máy chủ nhận, không phải đồng hồ trên ESP32.',
    eventTime: 'Máy chủ nhận', eventUptime: 'Sau khởi động', noTime: 'Chưa có thời điểm nhận', eventGeneric: 'Sự kiện thiết bị',
    protection: 'Bảo vệ tại cửa', protectionHint: 'Tự xử lý trên thiết bị, ngay cả khi mất mạng.',
    protections: [
      { glyph: '!', title: 'Phát hiện mở trái phép', detail: 'Theo dõi tiếp điểm cửa khi chưa được cho phép mở.' },
      { glyph: '◷', title: 'Cửa mở quá lâu', detail: 'Báo động nếu cửa mở hơn 30 giây.' },
      { glyph: '↻', title: 'Tự khóa lại', detail: 'Tự khóa sau khi cửa đóng, hoặc sau 10 giây nếu chưa mở cửa.' }
    ],
    technical: 'Chi tiết thiết bị', sensorRaw: 'Tín hiệu', device: 'Thiết bị', signal: 'Wi-Fi', oled: 'Màn hình OLED', buzzer: 'Còi',
    on: 'Đang bật', off: 'Đang tắt', storage: 'Lưu trữ', fs: 'Nhật ký', nvs: 'Cấu hình', firmware: 'Firmware',
    admin: 'Phiên quản trị tại cửa', active: 'Đang mở', inactive: 'Chưa mở', dropped: 'Sự kiện chưa gửi',
    remote: 'Điều khiển từ xa', remoteTag: 'Chỉ theo dõi', remoteHint: 'Mở cửa bằng PIN, RFID, vân tay hoặc nút bên trong. Trang này chưa gửi lệnh mở khóa.', owner: 'Phụ trách: Thành'
  },
  en: {
    eyebrow: 'MODULE WORKSPACE · SMART DOOR LOCK', title: 'Smart door lock',
    intro: 'Follow the door, sensors and access activity as the device reports them.',
    live: 'Updating live', connecting: 'Connecting to the lock', offline: 'Device is not online',
    streamLost: 'Live connection lost', stale: 'Data has expired', brokerLost: 'Server is not connected to MQTT',
    unauthorized: 'Sign in to view device data.', forbidden: 'This account does not have access to the lock.',
    unavailable: 'The server is unavailable. The connection will retry automatically.',
    invalid: 'The received data is invalid. Waiting for the next update.',
    unsupported: 'This browser does not support the live event stream.',
    lastUpdate: 'Last updated', noUpdate: 'No data received', lastKnown: 'Last received',
    overview: 'At the door', overviewHint: 'The door contact and servo command appear separately for clarity.',
    door: 'Door · MC38', doorOpen: 'Door is open', doorClosed: 'Door is closed', doorHint: 'Reading from the door contact sensor.',
    bolt: 'Lock servo', boltHint: 'Command sent to the servo; there is no sensor confirming the physical bolt position.',
    boltDone: 'Servo command completed', boltMoving: 'Servo is executing the command',
    boltStates: { unknown: 'Command unknown', locked: 'Lock command', unlocked: 'Unlock command', locking: 'Locking', unlocking: 'Unlocking' },
    alerts: 'Current alerts', noAlerts: 'No alerts reported', alertsHint: 'Door, vibration and temporary PIN lockout monitoring.',
    forced: 'Unauthorized door opening', held: 'Door held open', vibrationAlert: 'Vibration detected', pinLocked: 'PIN temporarily locked',
    noData: 'No data yet', noLive: 'Waiting for live data',
    initialNotice: 'Live data has not yet been verified against the backend/firmware: waiting for real device data.',
    offlineNotice: 'Readings are hidden when disconnected or expired. The lock continues operating locally; check the physical door when confirmation is needed.',
    liveNotice: 'Sensor data is updating. Servo status describes a command, not a confirmation of the physical bolt position.',
    sensors: 'Sensors & access methods', sensorsHint: 'Each card shows readings from the device. PIN digits and fingerprint templates are never sent to the web.',
    vibration: 'Vibration sensor', vibrationIdle: 'No vibration detected', vibrationOn: 'Vibration detected', notInstalled: 'Not installed',
    triggers: 'Detections since boot', uncalibrated: 'Not calibrated', vibrationCalibration: 'Set the active signal level before detecting vibration.', light: 'Light sensor', lightHint: 'The CDS signal is not calibrated for light/dark and is not a lux measurement.',
    rfid: 'RFID reader', ready: 'Ready', notDetected: 'Reader not detected', cards: 'Registered cards',
    fingerprint: 'Fingerprint', busy: 'Processing', fpOffline: 'Sensor offline', fingerprints: 'Authorized fingerprints',
    keypad: 'Keypad & PIN', configured: 'PIN configured', notConfigured: 'PIN not configured', failures: 'Failed attempts', remaining: 'Remaining', seconds: 'seconds',
    inside: 'Inside button', pressed: 'Pressed', released: 'Released', insideHint: 'Press the button at the door to open from inside.',
    setup: 'Complete setup at the door', setupHint: 'Use the lock keypad and OLED display.', setupDone: 'Complete', setupNext: 'Next step', setupWaiting: 'Pending',
    setupSteps: [
      { title: 'Create a PIN', detail: 'Hold the inside button, then press #. Release the button, enter a new 6–8 digit PIN → #; repeat the PIN → #.' },
      { title: 'Register an RFID card', detail: 'The display automatically moves to card setup. Tap one RFID card on the reader to register it.' },
      { title: 'Register a fingerprint', detail: 'Follow the OLED prompts: place, lift, then place your finger again to complete setup.' }
    ],
    setupResume: 'If setup times out: with no characters entered, press # → enter the admin PIN → # to continue setup.',
    activity: 'Recent activity', activityEmpty: 'No events received yet',
    activityHint: 'Activity appears when the device sends an event. Times show when the server received it, not the ESP32 clock.',
    eventTime: 'Server received', eventUptime: 'After boot', noTime: 'Receipt time unavailable', eventGeneric: 'Device event',
    protection: 'On-device protection', protectionHint: 'Handled locally, including when the network is unavailable.',
    protections: [
      { glyph: '!', title: 'Unauthorized opening', detail: 'Monitors the door contact without an authorized opening.' },
      { glyph: '◷', title: 'Door held open', detail: 'Sounds an alarm after the door stays open for over 30 seconds.' },
      { glyph: '↻', title: 'Automatic relock', detail: 'Relocks after the door closes, or after 10 seconds if it is not opened.' }
    ],
    technical: 'Device details', sensorRaw: 'Signal', device: 'Device', signal: 'Wi-Fi', oled: 'OLED display', buzzer: 'Buzzer',
    on: 'On', off: 'Off', storage: 'Storage', fs: 'Activity log', nvs: 'Configuration', firmware: 'Firmware',
    admin: 'Local admin session', active: 'Active', inactive: 'Inactive', dropped: 'Unsent events',
    remote: 'Remote control', remoteTag: 'Monitoring only', remoteHint: 'Unlock using PIN, RFID, fingerprint or the inside button. This page does not send unlock commands.', owner: 'Owner: Thành'
  }
};

const eventCopy = {
  ACCESS_PIN: ['Mở cửa bằng PIN', 'Unlocked with PIN'], ACCESS_RFID: ['Mở cửa bằng thẻ', 'Unlocked with RFID'],
  ACCESS_FINGERPRINT: ['Mở cửa bằng vân tay', 'Unlocked with fingerprint'], ACCESS_INSIDE: ['Mở cửa từ bên trong', 'Unlocked from inside'],
  PIN_FAIL: ['Mã PIN bị từ chối', 'PIN rejected'], RFID_REJECTED: ['Thẻ chưa được cho phép', 'Card not authorized'],
  FP_REJECTED: ['Vân tay chưa được cho phép', 'Fingerprint not authorized'], DOOR_OPEN: ['Cửa đã mở', 'Door opened'],
  DOOR_CLOSED: ['Cửa đã đóng', 'Door closed'], FORCED_OPEN: ['Cảnh báo mở cửa trái phép', 'Unauthorized opening alert'],
  DOOR_HELD: ['Cảnh báo cửa mở quá lâu', 'Door held-open alert'], VIBRATION_DETECTED: ['Phát hiện rung', 'Vibration detected'],
  LOCK_COMMANDED: ['Đã gửi lệnh khóa servo', 'Servo lock command sent'], UNLOCK_COMMANDED: ['Đã gửi lệnh mở servo', 'Servo unlock command sent'],
  BOOT: ['Thiết bị khởi động', 'Device started'],
  PIN_LOCKOUT: ['PIN bị khóa tạm thời', 'PIN temporarily locked'], PIN_LOCKOUT_ENDED: ['PIN đã hết thời gian khóa', 'PIN lockout ended'],
  RFID_ENROLLED: ['Đã đăng ký thẻ RFID', 'RFID card registered'], RFID_ENROLL_FAILED: ['Đăng ký thẻ RFID chưa thành công', 'RFID registration failed'],
  FP_ENROLLED: ['Đã cấp quyền vân tay', 'Fingerprint authorized'], FP_ENROLL_FAILED: ['Đăng ký vân tay chưa thành công', 'Fingerprint registration failed'],
  FP_REVOKED: ['Đã thu hồi quyền vân tay', 'Fingerprint authorization revoked'], FP_OFFLINE: ['Cảm biến vân tay mất kết nối', 'Fingerprint sensor offline'],
  FP_READY: ['Cảm biến vân tay sẵn sàng', 'Fingerprint sensor ready'], LIGHT_CHANGED: ['Tín hiệu ánh sáng thay đổi', 'Light signal changed'],
  PIN_CONFIGURED: ['Đã tạo mã PIN mới', 'New PIN created'], PIN_CHANGED: ['Đã thay đổi mã PIN', 'PIN changed'],
  AUTH_RESET: ['Đã xóa cấu hình xác thực', 'Authorization settings cleared'], LOG_RESET: ['Đã khởi tạo lại nhật ký tại cửa', 'Local activity log reset']
};
const alertEvents = new Set(['PIN_FAIL', 'PIN_LOCKOUT', 'RFID_REJECTED', 'RFID_ENROLL_FAILED', 'FP_REJECTED', 'FP_ENROLL_FAILED', 'FP_OFFLINE', 'FORCED_OPEN', 'DOOR_HELD', 'VIBRATION_DETECTED']);
const number = (value) => Number.isFinite(value) ? value : '—';
const raw = (value) => value === 1 ? 'HIGH · 1' : value === 0 ? 'LOW · 0' : '—';
function formatTime(value, english) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(english ? 'en-GB' : 'vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function SensorCard({ glyph, title, value, detail, hint, tone = '' }) {
  return <article className={`sdl-sensor ${tone}`}><div className="sdl-sensor-top"><span className="sdl-method-glyph" aria-hidden="true">{glyph}</span><h4>{title}</h4></div><strong className="sdl-sensor-value">{value}</strong><p className="sdl-sensor-detail">{detail}</p>{hint && <p className="sdl-sensor-hint">{hint}</p>}</article>;
}

export default function SmartDoorLockOwnerArea() {
  const { isEnglish } = useLanguage();
  const c = copy[isEnglish ? 'en' : 'vi'];
  const { snapshot, live, streamConnected, error } = useSmartDoorLock();
  const data = live ? snapshot.state.data : null;
  const timestamp = formatTime(snapshot?.receivedAt, isEnglish);
  const events = snapshot?.events?.filter((event) => event && typeof event.code === 'string').slice(0, 30) ?? [];
  const reading = (value) => data ? value : c.noData;
  const flag = (value, yes, no) => typeof value === 'boolean' ? (value ? yes : no) : c.noData;
  const alertItems = data ? [data.forcedOpen && c.forced, data.heldOpen && c.held, data.vibration?.active && c.vibrationAlert, data.pinLockout && c.pinLocked].filter(Boolean) : [];
  const setupComplete = data ? [data.pinConfigured, data.rfidCards > 0, data.fingerprintCount > 0] : [];
  const needsSetup = live && (!data.pinConfigured || data.rfidCards === 0 || data.fingerprintCount === 0);
  const nextSetupStep = setupComplete.findIndex((complete) => !complete);
  let connection = c.connecting;
  if (live) connection = c.live;
  else if (error) connection = c[error] || c.unavailable;
  else if (snapshot && !streamConnected) connection = c.streamLost;
  else if (snapshot && !snapshot.brokerConnected) connection = c.brokerLost;
  else if (snapshot?.availability !== 'online' && snapshot) connection = c.offline;
  else if (snapshot?.state) connection = c.stale;

  return (
    <div className="owner-area-container sdl" data-module="smart-door-lock" data-owner="thanh" data-live={live}>
      <header className="sdl-hero">
        <div className="sdl-hero-content"><span className="sdl-eyebrow">{c.eyebrow}</span><h2>{c.title}</h2><p>{c.intro}</p>
          <div className={`sdl-connection ${live ? 'is-live' : ''}`} role="status"><span className="sdl-connection-dot" aria-hidden="true"/><strong>{connection}</strong></div>
          <p className="sdl-updated">{timestamp ? `${live ? c.lastUpdate : c.lastKnown}: ${timestamp}` : c.noUpdate}</p>
        </div>
        <div className={`sdl-hero-visual ${live && data?.doorOpen ? 'is-open' : ''}`} aria-hidden="true"><span className="sdl-visual-orbit"/><span className="sdl-visual-door"><i/></span><span className="sdl-visual-caption">SMART DOOR · 01</span></div>
      </header>
      <section className="sdl-section" aria-labelledby="sdl-overview-title">
        <div className="sdl-section-heading"><div><span className="sdl-section-index">01 / OVERVIEW</span><h3 id="sdl-overview-title">{c.overview}</h3><p>{c.overviewHint}</p></div><span className={`sdl-live-tag ${live ? 'is-live' : ''}`}>{live ? 'LIVE' : 'OFFLINE'}</span></div>
        <div className="sdl-status-grid">
          <article className={`sdl-status sdl-status-primary ${data?.doorOpen ? 'is-warning' : ''}`}><span className="sdl-status-label"><span className="sdl-status-symbol" aria-hidden="true">◫</span>{c.door}</span><strong>{reading(flag(data?.doorOpen, c.doorOpen, c.doorClosed))}</strong><p>{c.doorHint}</p><span className="sdl-raw">{c.sensorRaw}: {data ? raw(data.doorRaw) : '—'}</span></article>
          <article className="sdl-status"><span className="sdl-status-label"><span className="sdl-status-symbol" aria-hidden="true">⌑</span>{c.bolt}</span><strong>{reading(c.boltStates[data?.boltCommand] || c.noData)}</strong><p>{data ? flag(data.boltCommandCompleted, c.boltDone, c.boltMoving) : c.noLive}</p><span className="sdl-status-footnote">{c.boltHint}</span></article>
          <article className={`sdl-status ${alertItems.length ? 'is-warning' : ''}`}><span className="sdl-status-label"><span className="sdl-status-symbol" aria-hidden="true">!</span>{c.alerts}</span><strong>{reading(alertItems.length ? `${alertItems.length} ${isEnglish ? 'active' : 'đang xảy ra'}` : c.noAlerts)}</strong>{alertItems.length ? <ul className="sdl-alert-list">{alertItems.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{c.alertsHint}</p>}</article>
        </div>
        <p className={`sdl-notice ${live ? 'is-live' : ''}`}><span aria-hidden="true">ⓘ</span>{live ? c.liveNotice : snapshot?.state ? c.offlineNotice : c.initialNotice}</p>
      </section>
      {needsSetup && <section className="sdl-section" aria-labelledby="sdl-setup-title"><div className="sdl-setup"><div className="sdl-setup-heading"><div><span className="sdl-section-index">SETUP · AT THE DOOR</span><h3 id="sdl-setup-title">{c.setup}</h3><p>{c.setupHint}</p></div><span className="sdl-panel-tag">{setupComplete.filter(Boolean).length} / 3</span></div><ol className="sdl-setup-steps">{c.setupSteps.map((step, index) => <li key={step.title} className={setupComplete[index] ? 'is-complete' : index === nextSetupStep ? 'is-current' : ''}><span className="sdl-setup-number" aria-hidden="true">{setupComplete[index] ? '✓' : index + 1}</span><div><span className="sdl-setup-state">{setupComplete[index] ? c.setupDone : index === nextSetupStep ? c.setupNext : c.setupWaiting}</span><h4>{step.title}</h4><p>{step.detail}</p></div></li>)}</ol><p className="sdl-setup-resume">{c.setupResume}</p></div></section>}
      <section className="sdl-section" aria-labelledby="sdl-sensors-title">
        <div className="sdl-section-heading"><div><span className="sdl-section-index">02 / SENSORS & ACCESS</span><h3 id="sdl-sensors-title">{c.sensors}</h3><p>{c.sensorsHint}</p></div></div>
        <div className="sdl-sensor-grid">
          <SensorCard glyph="ϟ" title={c.vibration} tone={data?.vibration?.active || (data?.vibration?.installed && data.vibration.active === null) ? 'is-warning' : ''} value={reading(data?.vibration?.installed === false ? c.notInstalled : data?.vibration?.active === null ? `${c.uncalibrated} · ${raw(data.vibration.raw)}` : flag(data?.vibration?.active, c.vibrationOn, c.vibrationIdle))} detail={`${c.triggers}: ${data ? number(data.vibration?.triggerCount) : '—'}`} hint={`${data?.vibration?.installed && data.vibration.active === null ? `${c.vibrationCalibration} ` : ''}SW-420 · GPIO4 · ${c.sensorRaw}: ${data ? raw(data.vibration?.raw) : '—'}`}/>
          <SensorCard glyph="☼" title={c.light} value={data ? raw(data.cdsRaw) : c.noData} detail={c.lightHint} hint="CDS · HIGH / LOW"/>
          <SensorCard glyph="▤" title={c.rfid} tone={data?.rfidDetected === false ? 'is-warning' : ''} value={reading(flag(data?.rfidDetected, c.ready, c.notDetected))} detail={`${c.cards}: ${data ? number(data.rfidCards) : '—'}`} hint="RFID · MFRC522"/>
          <SensorCard glyph="◎" title={c.fingerprint} tone={data?.fingerprintOnline === false ? 'is-warning' : ''} value={reading(data?.fingerprintBusy ? c.busy : flag(data?.fingerprintOnline, c.ready, c.fpOffline))} detail={`${c.fingerprints}: ${data ? number(data.fingerprintCount) : '—'}`} hint={data?.fingerprintBusy ? (isEnglish ? 'Local enrollment / recognition' : 'Đăng ký / nhận dạng tại cửa') : null}/>
          <SensorCard glyph="⌗" title={c.keypad} tone={data?.pinLockout ? 'is-warning' : ''} value={reading(data?.pinLockout ? c.pinLocked : flag(data?.pinConfigured, c.configured, c.notConfigured))} detail={`${c.failures}: ${data ? number(data.failedPinAttempts) : '—'}`} hint={data?.pinLockout ? `${c.remaining} ${Math.ceil((data.pinLockoutRemainingMs || 0) / 1000)} ${c.seconds}` : (isEnglish ? 'Only authentication results are reported.' : 'Chỉ gửi kết quả xác thực.')}/>
          <SensorCard glyph="↗" title={c.inside} value={reading(flag(data?.insidePressed, c.pressed, c.released))} detail={c.insideHint}/>
        </div>
      </section>
      <div className="sdl-two-column">
        <section className="sdl-panel" aria-labelledby="sdl-activity-title"><div className="sdl-panel-heading"><div><span className="sdl-section-index">03 / ACTIVITY</span><h3 id="sdl-activity-title">{c.activity}</h3></div><span className="sdl-panel-tag">{events.length}</span></div>
          {events.length ? <><p className="sdl-panel-intro">{c.activityHint}</p><ol className="sdl-event-list">{events.map((event) => <li key={`${event.bootId}-${event.sequence}`} className={alertEvents.has(event.code) ? 'is-warning' : ''}><span className="sdl-event-dot" aria-hidden="true"/><div><strong>{eventCopy[event.code]?.[isEnglish ? 1 : 0] || c.eventGeneric}</strong><time dateTime={event.receivedAt || undefined} title={c.eventTime}>{formatTime(event.receivedAt, isEnglish) || c.noTime}</time><span className="sdl-event-uptime">{c.eventUptime}: {Number.isFinite(event.uptimeMs) ? `${Math.floor(event.uptimeMs / 1000)}s` : '—'}</span></div></li>)}</ol></> : <div className="sdl-empty-state"><span className="sdl-empty-glyph" aria-hidden="true">◷</span><strong>{c.activityEmpty}</strong><p>{c.activityHint}</p></div>}
        </section>
        <section className="sdl-panel" aria-labelledby="sdl-protection-title"><div className="sdl-panel-heading"><div><span className="sdl-section-index">04 / SAFETY</span><h3 id="sdl-protection-title">{c.protection}</h3></div></div><p className="sdl-panel-intro">{c.protectionHint}</p><div className="sdl-protection-list">{c.protections.map((item) => <div className="sdl-protection" key={item.title}><span className="sdl-protection-glyph" aria-hidden="true">{item.glyph}</span><div><h4>{item.title}</h4><p>{item.detail}</p></div></div>)}</div></section>
      </div>
      <section className="sdl-section sdl-device-section"><details className="sdl-device-details"><summary>{c.technical}<span aria-hidden="true">+</span></summary><dl className="sdl-diagnostics">
        <div><dt>{c.device}</dt><dd>ESP32-S3 · N16R8</dd></div>
        <div><dt>{c.signal}</dt><dd>{data && Number.isFinite(data.wifiRssi) ? `${data.wifiRssi} dBm` : '—'}</dd></div>
        <div><dt>Servo PWM</dt><dd>{data ? `${flag(data.servoPwmReady, c.ready, c.noData)} · ${number(data.servoPulseUs)} μs` : '—'}</dd></div>
        <div><dt>{c.oled}</dt><dd>{data ? `${flag(data.oledDetected, c.ready, c.noData)} · ${data.oledDriver || '—'}` : '—'}</dd></div>
        <div><dt>{c.buzzer}</dt><dd>{reading(flag(data?.buzzerOn, c.on, c.off))}</dd></div>
        <div><dt>{c.fs}</dt><dd>{reading(flag(data?.fsReady, c.ready, c.noData))}</dd></div>
        <div><dt>{c.nvs}</dt><dd>{reading(flag(data?.nvsReady, c.ready, c.noData))}</dd></div>
        <div><dt>{c.admin}</dt><dd>{reading(flag(data?.adminActive, c.active, c.inactive))}</dd></div>
        <div><dt>{c.dropped}</dt><dd>{data ? number(data.droppedEvents) : '—'}</dd></div>
        <div><dt>{c.firmware}</dt><dd>{data?.firmware || '—'}</dd></div>
      </dl></details></section>
      <footer className="sdl-footer"><div className="sdl-remote"><div><strong>{c.remote}</strong><p>{c.remoteHint}</p></div><span className="sdl-remote-tag">{c.remoteTag}</span></div><span className="sdl-owner">{c.owner}</span></footer>
    </div>
  );
}
