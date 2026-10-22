/**
 * Khu vực phát triển độc lập: Loa thông minh
 * Người phụ trách: Lộc (loc)
 * Thành viên tự do phát triển các tính năng mở rộng trong file này.
 */
export default function SmartSpeakerOwnerArea() {
  return (
    <div className="owner-area-container" data-module="smart-speaker" data-owner="loc">
      <div className="owner-area-header">
        <span className="owner-badge">Khu vực phát triển riêng</span>
        <h3 className="owner-title">Loa thông minh</h3>
        <p className="owner-assignee">Người phụ trách: <strong>Lộc</strong></p>
      </div>

      <div className="owner-area-body">
        <div className="owner-status-box pending">
          <span className="status-dot"></span>
          <span>Trạng thái: Đang chờ Lộc phát triển nội dung chi tiết</span>
        </div>
        <p className="owner-desc">
          Gợi ý tính năng có thể triển khai: Mô phỏng bật/tắt micrô vật lý, hiển thị lịch sử lệnh thoại nhận diện, danh sách bài hát đang phát và âm lượng.
        </p>
      </div>
    </div>
  );
}
