/**
 * Khu vực phát triển độc lập: Khóa cửa thông minh
 * Người phụ trách: Thành (thanh)
 * Thành viên tự do phát triển các tính năng mở rộng trong file này.
 */
export default function SmartDoorLockOwnerArea() {
  return (
    <div className="owner-area-container" data-module="smart-door-lock" data-owner="thanh">
      <div className="owner-area-header">
        <span className="owner-badge">Khu vực phát triển riêng</span>
        <h3 className="owner-title">Khóa cửa thông minh</h3>
        <p className="owner-assignee">Người phụ trách: <strong>Thành</strong></p>
      </div>

      <div className="owner-area-body">
        <div className="owner-status-box pending">
          <span className="status-dot"></span>
          <span>Trạng thái: Đang chờ Thành phát triển nội dung chi tiết</span>
        </div>
        <p className="owner-desc">
          Gợi ý tính năng có thể triển khai: Mô phỏng sự kiện mở khóa bằng thẻ/mã PIN, cảnh báo cạy cửa, quản lý thời gian mở cửa và trạng thái pin.
        </p>
      </div>
    </div>
  );
}
