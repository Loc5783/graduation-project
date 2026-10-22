/**
 * Khu vực phát triển độc lập: Cảm biến môi trường
 * Người phụ trách: Quỳnh (quynh)
 * Thành viên tự do phát triển các tính năng mở rộng trong file này.
 */
export default function EnvironmentSensorOwnerArea() {
  return (
    <div className="owner-area-container" data-module="environment-sensor" data-owner="quynh">
      <div className="owner-area-header">
        <span className="owner-badge">Khu vực phát triển riêng</span>
        <h3 className="owner-title">Cảm biến môi trường</h3>
        <p className="owner-assignee">Người phụ trách: <strong>Quỳnh</strong></p>
      </div>

      <div className="owner-area-body">
        <div className="owner-status-box pending">
          <span className="status-dot"></span>
          <span>Trạng thái: Đang chờ Quỳnh phát triển nội dung chi tiết</span>
        </div>
        <p className="owner-desc">
          Gợi ý tính năng có thể triển khai: Đo nhiệt độ phòng, độ ẩm không khí, cường độ ánh sáng (Lux), chỉ số chất lượng không khí VOC và suy luận có người trong phòng.
        </p>
      </div>
    </div>
  );
}
