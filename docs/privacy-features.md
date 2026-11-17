# Quyền riêng tư và báo cáo dữ liệu

## Sử dụng

1. Đăng nhập, nhận thiết bị bằng mã thiết bị và mã ghép nối bí mật.
2. Mở trang thiết bị, mục **Quản lý & Chia sẻ thiết bị**. Chủ sở hữu có thể bật/tắt **Thu thập dữ liệu**. Người được chia sẻ chỉ được xem, không đổi quyền.
3. Mở **Nhật ký & phiên hoạt động** ở thanh điều hướng để xem đăng ký, đăng nhập và phiên còn hiệu lực. Nhật ký ở trang thiết bị cho chủ sở hữu biết ai được chia sẻ và ai đã đọc dữ liệu.
4. Mở **Cài đặt → Quyền riêng tư và dữ liệu** để xem biểu đồ lượt đọc của người được chia sẻ trong 14 ngày, tải CSV, hoặc mở báo cáo rồi chọn **In / Lưu PDF** trong hộp thoại in của trình duyệt.

## Quy tắc dữ liệu

- Khi tắt thu thập, Express không trả số đo trực tiếp/lịch sử và tiến trình quan sát không ghi số đo mới. Dữ liệu đã ghi trước đó vẫn ở MongoDB theo hạn lưu riêng nhưng bị ẩn khi quyền tắt.
- Chỉ lưu lịch sử khi thiết bị có chủ. Sau khi đổi chủ, máy chủ chờ bản tin mới có thời điểm sau lần nhận thiết bị; dữ liệu gateway cũ không được gắn với chủ mới.
- Lượt đọc dữ liệu được ghi tối đa một dòng cho mỗi tài khoản/thiết bị/nguồn đọc/phút để tránh log trùng do web tự cập nhật. Nếu ghi log thất bại, API không trả số đo.
- Lượt đọc bị từ chối được ghi và gửi cảnh báo trong web cho chủ sở hữu; sự kiện trùng được giới hạn theo khoảng 15 phút.
- Báo cáo và CSV chỉ lấy thiết bị đang thuộc tài khoản cùng nhật ký của lần sở hữu hiện tại. Báo cáo hiển thị tối đa 50 hoạt động gần nhất; biểu đồ tổng hợp toàn bộ nhật ký của 14 ngày.

## Giới hạn phần cứng

- Công tắc này điều khiển dữ liệu tại Express và giao diện web, không gửi lệnh dừng cảm biến đến firmware ESP. Gateway nội bộ vẫn có thể nhận bản tin.
- Module ổ cắm cũ sử dụng broker MQTT công khai. Web và API ẩn module sau khi đổi chủ, nhưng không thể ngăn ứng dụng khác đọc topic công khai. Cần chuyển firmware và web sang broker nội bộ có xác thực cùng topic riêng cho mỗi thiết bị trước khi coi kênh đó là riêng tư.
- **In / Lưu PDF** sử dụng khả năng lưu PDF của trình duyệt; máy chủ không tạo tệp PDF độc lập.
