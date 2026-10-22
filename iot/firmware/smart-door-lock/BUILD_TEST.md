# Kết quả kiểm tra firmware

Cập nhật 2026-10-22: người dùng xác nhận bản firmware hiện tại đã nạp và chạy được trên bo. Xác nhận này không thay thế kết quả riêng cho từng mục trong checklist phần cứng. Các đoạn “chưa thử trên mạch” bên dưới ghi lại trạng thái tại thời điểm từng bản sửa được tạo; chúng không mô tả trạng thái mới nhất của toàn bộ project.

## Sửa firmware ngày 2026-10-22

Đã bỏ cơ chế xóa PIN/thẻ/quyền vân tay và xóa mẫu AS608 tự động lúc boot. Bản sửa cũng từ chối đăng ký đè ID vân tay đang được cấp quyền, đồng thời không cấp quyền nếu ID bị thu hồi trong lúc đăng ký. Tài liệu thao tác keypad và checklist đã cập nhật trong README.

Theo yêu cầu khởi tạo lại từ đầu, đã thêm `RESET AUTH` rồi `CONFIRM RESET AUTH` trong 15 giây, cả hai bước đều cần giữ nút inside. Chỉ xác nhận thành công mới xóa NVS xác thực và đặt cờ xóa mẫu AS608 ở lần boot tiếp theo. Nếu AS608 xóa lỗi, cờ vẫn giữ để thử lại ở lần khởi động sau; vân tay chưa được phép đăng ký khi cờ còn hiệu lực. LittleFS/log được giữ riêng; người dùng có thể format có chủ đích sau khi tạo PIN mới.

**Trạng thái xác minh bản sửa này:** `platformio run` trên đúng source hiện tại đã **SUCCESS** ngày 2026-10-22. RAM tĩnh 21.788/327.680 byte (6,6%); flash 393.405/6.553.600 byte (6,0%). Chưa nạp hoặc thử bản `RESET AUTH` trên mạch; chỉ thao tác khôi phục trên bàn thử, theo đúng hai bước trong README.

## Build thực tế: PASS

Lệnh: `platformio run`, môi trường `smartdoor_s3_n16r8`.

- Espressif32: 7.1.3.
- Arduino framework package: `4.20017.260907+sha.dcc1105b` (Arduino 2.0.17).
- Xtensa ESP32-S3 GCC: 8.4.0+2021r2-patch5.
- U8g2 2.36.5; Adafruit Fingerprint Sensor Library 2.1.3; MFRC522 1.4.12.
- HARDWARE: ESP32S3 240MHz, 320KB RAM, 16MB Flash.
- RAM tĩnh bản OLED: 21,748 / 327,680 bytes (6.6%); chưa tính heap, task stack và buffer cấp phát khi chạy.
- Chương trình bản sửa OLED + PWM14: 385,321 / 6,553,600 bytes (5.9% app partition).
- Compile, link, kiểm tra kích thước và tạo firmware.bin thành công.
- Kết quả cuối bản sửa OLED + PWM14: `[SUCCESS] Took 8.32 seconds`.

Lần build đầu phát hiện lỗi aggregate initialization C++11 ở struct Debounce; đã sửa bằng constructor rõ ràng và build lại thành công. Đây là kết quả compiler thật, không phải kiểm tra chỉ bằng tìm chuỗi.

## Sửa theo log chạy thật người dùng gửi

Log người dùng xác nhận upload và hash verification thành công, sau đó LEDC báo giới hạn 14 bit. Bản cũ dùng 16 bit nên build được nhưng PWM không khởi tạo được trên ESP32-S3. Đã sửa resolution thành 14 và đổi công thức duty đồng bộ sang 16384 bước/chu kỳ; không đổi GPIO8, 50Hz, LOCK 570µs hoặc UNLOCK 2425µs.

Thêm kiểm tra kết quả ledcSetup: nếu thất bại, không attach/write LEDC và không đánh dấu servoKnown; OLED/STATUS báo lỗi. NVS kiểm tra key tồn tại trước khi lấy độ dài blob để thiếu credentials lần đầu không sinh log NOT_FOUND. Không xóa hay reset PIN, salt, thẻ, quyền vân tay đã lưu.

Kiểm tra số học: duty LOCK=467, UNLOCK=1987; độ rộng xung danh định 570.068µs và 2425.537µs ở 50Hz, sai số lượng tử <0.611µs. Đây là tính toán, chưa đo oscilloscope. Build sửa đã PASS, chưa upload bản sửa lên thiết bị của người dùng.

## Rà tĩnh

Bản OLED: khai báo rõ constructor SCL6/SDA5; I2C 100kHz; thử 0x3C/0x3D và retry mỗi 2 giây; thêm OLEDINIT và thông tin probe trong STATUS. Người dùng xác nhận màn đã chạy với code cũ, SDA5 và SCK6. Chưa có kết quả probe hoặc thử bản sửa trên mạch nên chưa kết luận nguyên nhân phần cứng, controller hay ACK lúc boot. Xác nhận build bản sửa thành công không đồng nghĩa đã xác nhận màn lên.

- main.cpp là C++, dòng đầu đúng `#include <Arduino.h>`.
- Giữ nguyên tất cả GPIO và thứ tự keypad đã thử.
- SPI.begin(12,13,11,9), UART RX18/TX17, I2C SDA5/SCL6.
- SW-420 không có đường kích hoạt alarm.
- Không gọi thư viện vân tay trên vòng lặp chính; task riêng gửi queue.
- Servo dùng LEDC 50Hz tương thích Arduino 2.0.17, tiến từng bước bằng millis.
- UNKNOWN startup; guard cửa và inside trước mỗi lệnh LOCK; đảo hướng nếu đang LOCK mà cửa mở.
- MC38 debounce; timeout 10s; open→close chờ 600ms; cửa mở không tự khóa.
- PIN có salt ngẫu nhiên theo thiết bị, SHA256 và constant-time compare phần digest; 5 lần sai khóa PIN 60s, bộ đếm lưu NVS.
- Thẻ và ID vân tay phải được quản trị cấp quyền; không tự tin cậy dữ liệu sẵn trong sensor.
- Hai file log xoay giới hạn kích thước; không tự format khi mount lỗi.
- Parser Serial giới hạn 80 ký tự, xử lý tối đa 32 ký tự/vòng, không echo PIN.

## Chưa xác minh trên phần cứng

Không có ESP32-S3/servo/MC38/AS608/RC522 được nối vào phiên này. Chưa kiểm tra điện áp, PSRAM vật lý, tín hiệu PWM bằng oscilloscope, hành trình servo, độ trễ nút thực tế, đọc thẻ/vân tay, ghi flash khi cắt nguồn hoặc soak test. Các trường hợp trong README là checklist cần chạy, không phải kết quả đã đạt.

## Bản Serial CH343

CDC_ON_BOOT=0; UART0 RX44/TX43 cho CH343, monitor echo/send_on_enter, DTR/RTS=0. Giữ cấu hình N16R8 và toàn bộ chân cảm biến. Build PASS; chưa thử phản hồi COM5 trên bo người dùng. Các mô tả USB timeout 0 phía trên chỉ áp dụng nhánh CDC; bản UART dùng HardwareSerial.

## Bản OLED dual-driver — build PASS

Khởi tạo lại Wire sau pinMode của U8g2; hỗ trợ SH1106 và SSD1306. Build thực tế SUCCESS 8.32 seconds; RAM 21748 bytes, Flash 385321 bytes. Log người dùng có READY, FP READY, PWM=1 và probe3C=0, nhưng OLED=0 sau init. Chưa có xác nhận hardware sau bản sửa này; không coi ACK là bằng chứng panel sáng.
