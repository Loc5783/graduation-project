/**
 * Khu vực phát triển độc lập: Cảm biến cửa sổ
 * Người phụ trách: Minh (minh)
 * Thành viên tự do phát triển các tính năng mở rộng trong file này.
 */
export default function WindowSensorOwnerArea() {
  return (
    <div className="owner-area-container" data-module="window-sensor" data-owner="minh">
      <div className="owner-area-header">
        <span className="owner-badge">Khu vực phát triển riêng</span>
        <h3 className="owner-title">Cảm biến cửa sổ</h3>
        <p className="owner-assignee">Người phụ trách: <strong>Minh</strong></p>
      </div>

      <div className="owner-area-body">
        <div className="owner-status-box pending">
          <span className="status-dot"></span>
          <span>Trạng thái: Đang chờ Minh phát triển nội dung chi tiết</span>
        </div>
        <p className="owner-desc">
          Gợi ý tính năng có thể triển khai: Mô phỏng trạng thái cửa đang đóng/mở trực quan, cảnh báo khi cửa mở quá 30 phút, nhật ký sự kiện mở đóng và tình trạng pin.
        </p>
      </div>
    </div>
  );
}
