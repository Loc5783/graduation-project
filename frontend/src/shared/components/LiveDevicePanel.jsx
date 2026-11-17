import { useLanguage } from '../../context/LanguageContext.jsx';
import { useLiveDevices } from '../../context/LiveDeviceContext.jsx';
import './LiveDevicePanel.css';

const NAMES = {
  'smart-door-lock': ['Khóa cửa', 'Door lock'], 'window-sensor': ['Cửa sổ', 'Window'],
  'smart-bin': ['Thùng rác', 'Smart bin'], 'environment-sensor': ['Môi trường', 'Environment'],
  'smart-plug': ['Ổ cắm', 'Smart plug'], 'smart-speaker': ['Loa thông minh', 'Smart speaker']
};
export const DEVICE_FIELD_LABELS = {
  doorOpen: ['Cửa mở', 'Door open'], locked: ['Đã khóa', 'Locked'], lockState: ['Khóa', 'Lock'],
  tamper: ['Can thiệp', 'Tamper'], alarm: ['Cảnh báo', 'Alarm'], state: ['Trạng thái', 'State'],
  boltCommand: ['Lệnh chốt khóa', 'Bolt command'], boltCommandCompleted: ['Đã chạy lệnh servo', 'Servo command completed'],
  boltFeedbackAvailable: ['Có cảm biến xác nhận chốt', 'Bolt feedback sensor available'],
  fingerprintOnline: ['Đầu đọc vân tay kết nối', 'Fingerprint reader connected'],
  fingerprintBusy: ['Đầu đọc vân tay đang xử lý', 'Fingerprint reader busy'],
  fingerprintCount: ['Số vân tay được cấp quyền', 'Authorized fingerprint count'],
  forcedOpen: ['Cạy cửa', 'Forced open'], heldOpen: ['Cửa mở lâu', 'Held open'],
  motion: ['Chuyển động', 'Motion'], alarmReason: ['Lý do', 'Reason'],
  sensorOk: ['Cảm biến hoạt động', 'Sensor ready'], dhtOk: ['Cảm biến nhiệt/ẩm', 'Temperature sensor'],
  distanceCm: ['Khoảng cách (cm)', 'Distance (cm)'], fillPercent: ['Mức đầy (%)', 'Fill (%)'],
  lidOpen: ['Nắp mở', 'Lid open'], mode: ['Chế độ', 'Mode'], temperature: ['Nhiệt độ (°C)', 'Temperature (°C)'],
  humidity: ['Độ ẩm (%)', 'Humidity (%)'], gasRaw: ['Gas (ADC)', 'Gas (ADC)'],
  alertLevel: ['Mức cảnh báo', 'Alert level'], alertLevelText: ['Cảnh báo gas', 'Gas alert'],
  isWarmingUp: ['Đang sấy cảm biến', 'Sensor warming up'], buzzerOn: ['Còi báo', 'Buzzer'],
  rssi: ['Wi-Fi (dBm)', 'Wi-Fi (dBm)'], wifiRssi: ['Wi-Fi (dBm)', 'Wi-Fi (dBm)'],
  relay: ['Rơ-le đèn', 'Light relay'], fan: ['Rơ-le quạt', 'Fan relay'],
  auto: ['Tự động', 'Automatic'], auto_mode: ['Tự động', 'Automatic'],
  light: ['Ánh sáng', 'Light'], overload: ['Quá tải', 'Overload'],
  command: ['Lệnh giọng nói', 'Voice command'], result: ['Kết quả lệnh', 'Command result'], time: ['Thời gian', 'Time']
};

export default function LiveDevicePanel({ deviceId, allowedDeviceIds, title }) {
  const { lang } = useLanguage();
  const en = lang === 'en';
  const { devices, loading, error } = useLiveDevices();

  // Xác định danh sách ID thiết bị được phép hiển thị:
  // 1. Nếu có deviceId cụ thể: dùng [deviceId]
  // 2. Nếu có allowedDeviceIds (từ Overview): lọc đúng danh sách quyền thật
  // 3. Nếu không truyền: fallback về Object.keys(NAMES)
  let ids;
  if (deviceId) {
    ids = [deviceId];
  } else if (Array.isArray(allowedDeviceIds)) {
    ids = allowedDeviceIds;
  } else {
    ids = Object.keys(NAMES);
  }

  // Không hiển thị khối LiveDevicePanel nếu không có thiết bị nào
  if (!ids || ids.length === 0) {
    return null;
  }
  const word = (vi, english) => en ? english : vi;
  return <section className="live-device-panel" aria-label={word('Dữ liệu thiết bị thật', 'Live device data')}>
    <header className="live-panel-heading"><h2>{title || word('Thiết bị trực tiếp', 'Live devices')}</h2>
      <span>{loading ? word('Đang kết nối…', 'Connecting…') : word('Tự cập nhật mỗi 3 giây', 'Updates every 3 seconds')}</span></header>
    {error && <p role="status" className="live-warning">{word('Chưa đọc được gateway. Dữ liệu cũ không còn được coi là trực tuyến.', 'Gateway unavailable. Previous readings are not live.')}</p>}
    <div className="live-device-grid">{ids.map(id => {
      const device = devices.find(d => d.id === id);
      const hasData = device?.data && Object.keys(device.data).length > 0;
      return <article key={id} className="live-device-card">
        <div className="live-device-heading"><h3>{NAMES[id]?.[en ? 1 : 0] || id}</h3>
          <span className={`live-device-badge ${device?.fresh ? 'is-live' : ''}`}>{device?.fresh ? word('Trực tuyến', 'Online') : word('Ngoại tuyến', 'Offline')}</span></div>
        {device?.collectionEnabled === false ? <p>{word('Chủ sở hữu đã tắt thu thập dữ liệu trên máy chủ.', 'The owner paused server-side data collection.')}</p>
          : device?.awaitingNewReading ? <p>{word('Đang chờ bản tin mới sau khi nhận thiết bị.', 'Waiting for a new reading after device pairing.')}</p>
          : hasData ? <dl>{Object.entries(device.data).map(([key, value]) => <div key={key}>
          <dt>{DEVICE_FIELD_LABELS[key]?.[en ? 1 : 0] || key}</dt><dd>{typeof value === 'boolean' ? (value ? word('Có', 'Yes') : word('Không', 'No')) : String(value)}</dd>
        </div>)}</dl> : <p>{word('Chưa nhận được dữ liệu từ thiết bị.', 'No device readings received.')}</p>}
        {device?.ageSeconds !== null && device?.ageSeconds !== undefined && <small>{word('Cập nhật cách đây', 'Last update')} {Math.floor(device.ageSeconds)} {word('giây', 'seconds')}{!device.fresh && hasData ? word(' · Dữ liệu cũ', ' · Stale data') : ''}</small>}
        {id === 'environment-sensor' && <small>{word('Gas là giá trị ADC, chưa phải ppm đã hiệu chuẩn.', 'Gas is an ADC reading, not calibrated ppm.')}</small>}
        {id === 'smart-door-lock' && <small>{word('Lệnh servo không xác nhận chốt khóa đã chuyển động thực tế.', 'Servo commands do not confirm physical bolt movement.')}</small>}
        {id === 'smart-plug' && <small>{word('Trạng thái rơ-le không xác nhận tải hoặc thiết bị đang chạy thực tế.', 'Relay status does not confirm physical load or running appliance.')}</small>}
      </article>;
    })}</div>
  </section>;
}
