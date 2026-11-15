import { useLanguage } from '../../context/LanguageContext.jsx';

const CONTENT = {
  vi: {
    title: 'Trợ giúp', intro: 'Thông tin cần biết khi xem dữ liệu thiết bị.',
    questions: [
      ['“Trực tuyến” có nghĩa là gì?', 'Ứng dụng vừa nhận dữ liệu mới từ Gateway. Thiết bị không có bản tin mới trong 15 giây sẽ được đánh dấu ngoại tuyến; số đo cuối cùng chỉ là dữ liệu cũ.'],
      ['Dữ liệu khí gas có phải nồng độ ppm?', 'Không. gasRaw là giá trị ADC thô của cảm biến và không phải phép đo ppm đã hiệu chuẩn.'],
      ['Trạng thái rơ-le có chứng minh tải đang chạy?', 'Không. Lệnh hoặc trạng thái rơ-le không chứng minh đèn, quạt hay chốt cơ khí đã hoạt động thực tế.'],
      ['Tôi xem lịch sử ở đâu?', 'Các biểu đồ thiết bị hiện có thể dựa trên dữ liệu quan sát trong phiên mở trang. Nếu chưa có lịch sử lưu trên server, tải lại trang có thể làm mất phần lịch sử đó.'],
      ['Ai có thể đổi quyền thiết bị?', 'Quản trị viên quản lý vai trò và thiết bị phụ trách trong Cài đặt → Quản trị. Người dùng thường không thể tự cấp quyền cho mình.']
    ],
    start: 'Bắt đầu', steps: ['Đăng nhập bằng tài khoản được cấp.', 'Mở Tổng quan để xem trạng thái kết nối.', 'Chọn thiết bị ở menu để xem số đo và thời điểm cập nhật.', 'Vào Cài đặt để đổi ngôn ngữ, giao diện và thông báo.'],
    contact: 'Cần hỗ trợ?', contactBody: 'Liên hệ quản trị viên của nhóm triển khai. Ứng dụng hiện chưa cấu hình địa chỉ hỗ trợ công khai.',
    version: 'Phiên bản ứng dụng', versionValue: 'Bản đồ án đang phát triển'
  },
  en: {
    title: 'Help', intro: 'What to know when reading device data.',
    questions: [
      ['What does “Online” mean?', 'The gateway recently received telemetry. After 15 seconds without a new message, the device is marked offline; the last reading is stale.'],
      ['Is the gas value a ppm concentration?', 'No. gasRaw is a raw sensor ADC value, not a calibrated ppm measurement.'],
      ['Does relay state prove a load is running?', 'No. A relay command or state does not prove that a light, fan or physical lock actually moved.'],
      ['Where can I see history?', 'Device charts may currently rely on observations during this page session. If server history is not available, reloading can erase that local history.'],
      ['Who can change device access?', 'Administrators manage roles and assigned devices under Settings → Administration. Regular users cannot grant themselves access.']
    ],
    start: 'Getting started', steps: ['Sign in with your account.', 'Open Overview to check connectivity.', 'Select a device to see readings and their update time.', 'Open Settings to change language, appearance and notifications.'],
    contact: 'Need help?', contactBody: 'Contact your project administrator. No public support address has been configured yet.',
    version: 'App version', versionValue: 'Graduation project in development'
  }
};

export default function HelpSettings() {
  const { lang } = useLanguage();
  const c = CONTENT[lang] || CONTENT.vi;
  return <div className="help-settings-page">
    <div className="settings-page-header"><h2 className="settings-page-title">{c.title}</h2><p className="settings-page-desc">{c.intro}</p></div>
    <section className="settings-section-group"><h3>{c.start}</h3><ol>{c.steps.map((step) => <li key={step}>{step}</li>)}</ol></section>
    <section className="settings-section-group"><h3>FAQ</h3>{c.questions.map(([question, answer]) => <details key={question} style={{ padding: '0.65rem 0', borderBottom: '1px solid var(--color-border)' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{question}</summary><p>{answer}</p>
    </details>)}</section>
    <section className="settings-section-group"><h3>{c.contact}</h3><p>{c.contactBody}</p><p><strong>{c.version}:</strong> {c.versionValue}</p></section>
  </div>;
}
