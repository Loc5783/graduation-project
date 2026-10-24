# Kết quả kiểm tra — 24/10/2026

Bản source: SDL-REALTIME-20261024-A. Đã kiểm tra phần mềm, chưa nạp lên board thật.

| Kiểm tra | Kết quả |
|---|---|
| PlatformIO espressif32 7.1.3, environment smartdoor_s3_n16r8, chưa cấu hình mạng | Build thành công |
| PlatformIO cùng environment, network_config.h dùng giá trị mẫu không bí mật để liên kết toàn bộ Wi-Fi/MQTT | Build thành công |
| Firmware cấu hình mạng sau rà soát cuối | RAM tĩnh 48,632/327,680 byte; flash 976,461/6,553,600 byte |
| Frontend npm run lint | Đạt, không có cảnh báo ESLint |
| Frontend npm test | 4 file, 106 kiểm thử đạt |
| Frontend npm run build | Đạt |
| Backend npm test -- modules/smart-door-lock/tests, MOSQUITTO_BIN trỏ tới Mosquitto thật | 4 file, 33 kiểm thử đạt |
| Phân tích cú pháp tools/start-broker.ps1 | Đạt; chưa chạy luồng nhập mật khẩu thật |

Kiểm thử module bao gồm schema, loại trường bí mật không cho phép, replay/sequence/boot mới, dữ liệu hết hạn7giây, MQTT mất kết nối, API có xác thực, SSE/cleanup/session hết hạn. Kiểm thử frontend bao gồm đăng nhập bắt buộc, cập nhật trực tiếp, disconnect/reconnect, không dùng dữ liệu quá hạn, HTTP trả chậm không đè dữ liệu mới, dọn kết nối khi thoát, session-expired và không render thông tin xác thực thô.

Kiểm thử tích hợp tạo broker Mosquitto thật tạm thời trên loopback/cổng ngẫu nhiên, gửi dữ liệu từ client MQTT mô phỏng ESP32, kiểm tra bridge → HTTP/SSE, thay đổi cảm biến và mất broker. Broker/test config được dọn sau khi chạy. Không đổi service/firewall và không gửi lệnh tới khóa thật.

Bản có mạng được build với cấu hình mẫu vì compiler có thể loại bỏ task mạng khi SSID/URI để trống. Build cấu hình mẫu vì vậy kiểm tra cả các symbol/link của MQTT, không chỉ phần offline.

Chưa chạy toàn bộ suite xác thực MongoDB của backend vì chưa có mongod hoạt động trong phiên này; API module được kiểm thử riêng với guard thật401 và guard giả chỉ trong test để kiểm tra dữ liệu/SSE. Bản production vẫn dùng requireAuth hiện có, không có bypass.

Chưa đo trên phần cứng thật: nguồn servo/Wi-Fi, cảm biến và polarity SW-420, độ trễ thực tế, nạp/upload, độ bền flash hoặc hành trình chốt khóa. Làm bảng kiểm ở CONNECT_WEB.md trước khi dùng trên cửa. Không khẳng định 7giây là thời gian Last Will tức thì; đây là ngưỡng hết hạn state trên web, LWT có thêm thời gian TCP/keepalive.

Không chứa mật khẩu thật trong source/artifact. Không sửa code module Smart Speaker, Smart Plug, Window hay Environment. Hai file backend app/server chỉ bổ sung mount/lifecycle cho Smart Door Lock; package/env bổ sung MQTT. Trang Overview và shared frontend không đổi.
