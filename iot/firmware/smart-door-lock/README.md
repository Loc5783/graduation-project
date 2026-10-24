# Smart Door Lock — ESP32-S3 N16R8 + web thời gian thực

Firmware `SDL-REALTIME-20261024-A`, dành cho VS Code + PlatformIO. Bản này dựa trên firmware `SDL-FP-RETRY-20261022-C` đã được người dùng xác nhận chạy được, giữ nguyên GPIO, servo và luồng mở tại cửa. Cảm biến rung GPIO4 đã được xác nhận lắp ngày 24/10/2026.

Luồng dữ liệu: **ESP32 → Mosquitto MQTT → backend có đăng nhập → SSE → trang Smart Door Lock**. Mạng chạy trong task riêng; việc kết nối lại không nằm trong vòng điều khiển cửa. Web chỉ theo dõi, chưa điều khiển mở khóa từ xa.

## 1. Nạp bằng VS Code + PlatformIO

1. Mở đúng thư mục có `platformio.ini` này trong VS Code bằng **PlatformIO: Open Project**.
2. Sao chép `include/network_config.example.h` thành `include/network_config.h`.
3. Điền Wi-Fi **2.4 GHz**, mật khẩu Wi-Fi, địa chỉ broker và tài khoản MQTT của ESP32. Không điền PIN cửa vào phần MQTT.
4. `SDL_MQTT_URI` dùng IP LAN của máy chạy Mosquitto, ví dụ `mqtt://192.168.1.10:1883`. ESP32 không dùng `127.0.0.1` vì đó là chính ESP32.
5. Chọn environment **smartdoor_s3_n16r8**, chạy **Build**, rồi **Upload**, sau đó **Monitor** ở 115200 baud. PlatformIO tự dò COM; nếu có nhiều cổng, chọn cổng CH343 của board như COM5 trong `platformio.ini` của bản local.
6. Khi chưa có cấu hình mạng, firmware vẫn chạy tại cửa và báo `NETWORK UNCONFIGURED`.

`network_config.h`, `.local/` và `.pio/` được bỏ qua bởi Git. Không gửi file chứa mật khẩu. Firmware nguồn mở mạng với URI `mqtt://` trong LAN; nếu dùng `mqtts://`, phải cung cấp CA PEM, không tắt kiểm tra chứng chỉ. Các timestamp trên web vẫn là lúc backend nhận dữ liệu, không giả định ESP32 đã có giờ UTC.

## 2. Thiết lập PIN → RFID → vân tay mới khi nạp lần đầu

**Bản firmware này tạo bộ quyền mới** trong namespace NVS `doorlock_rt1`, không sử dụng lại PIN/thẻ/quyền vân tay của bản `doorlock` cũ. Khi AS608 kết nối, mẫu vân tay cũ trong AS608 được xóa **một lần**, rồi ghi lại kết quả. Đây là hành vi thiết lập mới theo yêu cầu của chủ thiết bị. Các lần khởi động hoặc nạp lại bình thường giữ nguyên bộ quyền mới. Không chạy Erase Flash khi chỉ muốn cập nhật code.

Trên keypad/OLED:

1. **PIN:** màn hình hiện `FIRST SETUP`. Giữ nút mở bên trong rồi bấm `#`; thả nút. Nhập PIN riêng **6–8 chữ số**, bấm `#`, nhập lại cùng PIN rồi bấm `#`. Không có PIN mặc định. `*` xóa phần đang nhập; khi trống, `*` hủy.
2. **RFID:** màn hình chuyển sang `SETUP 2/3: RFID`. Chạm thẻ mới vào RC522. Chỉ thẻ đăng ký sau khi PIN đã được tạo mới được tin cậy.
3. **Vân tay:** màn hình chuyển sang `SETUP 3/3: FINGER`. Đặt ngón tay, nhấc ra khi được yêu cầu, rồi đặt lại chính ngón đó. Chờ `FINGER ENROLLED` và `SETUP COMPLETE`.

Nếu cảm biến vân tay chưa sẵn sàng, kiểm tra nguồn/dây; firmware tự thử kết nối lại. Khi màn hình hiện sẵn sàng, bấm `#` để thử đăng ký. Nếu hết phiên 60 giây hoặc khởi động lại giữa các bước, bấm `#` khi ô PIN trống, nhập PIN vừa tạo rồi bấm `#`; luồng tiếp tục ở bước còn thiếu. Không cần xóa lại PIN.

Để thêm thẻ/vân tay sau này: `#` khi trống → PIN quản trị → `#`; menu `1` thêm thẻ, `2` thêm vân tay, `3` đổi PIN, `4` xem thông tin, `5` khởi tạo/xóa log. `0`/`*` thoát. Nút mở bên trong vẫn được ưu tiên trong quá trình thiết lập và khi PIN bị khóa tạm.

PIN được lưu dưới dạng SHA-256 kèm salt trên thiết bị. Không đưa PIN, hash, salt, UID thẻ hoặc mẫu vân tay vào MQTT/web. RC522 whitelist UID phù hợp mô hình thực hành; UID thẻ không có tính chống sao chép như khóa mật mã chuyên dụng.

## 3. GPIO được giữ nguyên

| Thiết bị | GPIO / giao tiếp | Ghi chú |
|---|---|---|
| Cảm biến ánh sáng CDS | DO 1 | 3V3/GND; gửi HIGH/LOW, chưa hiệu chuẩn sáng/tối, không phải lux |
| Nút mở bên trong | 2 → GND | INPUT_PULLUP; LOW = nhấn |
| Buzzer | 3 | Active LOW |
| SW-420 | DO 4 | Đã lắp; xem mục hiệu chuẩn bên dưới |
| OLED | SDA 5, SCL 6 | I2C 100 kHz, thường 0x3C, mặc định SH1106 |
| MC38 | 7 → GND | INPUT_PULLUP; LOW = cửa đóng, HIGH = cửa mở |
| Servo MG90S | Signal 8 | 5V nguồn riêng, chung GND; 50 Hz, PWM 14-bit |
| RC522 | SS 9, MOSI 11, SCK 12, MISO 13, RST 14 | Nguồn 3V3; IRQ không dùng |
| AS608 | ESP TX 17 → RX module; ESP RX 18 ← TX module | UART 57600 |
| Keypad 3×4 | ROWS 38,39,40,41; COLS 42,47,21 | Dây vật lý 1→21, 2→47, 3→42, 4→41, 5→40, 6→39, 7→38 |
| CH343 UART0 | RX 44, TX 43 | Serial Monitor 115200; giữ USB CDC=0 |

Servo giữ hiệu chuẩn LOCK **570 µs**, UNLOCK **2425 µs**. Chỉ đảo hai giá trị nếu cơ cấu thực tế bị ngược. Không bắt đầu khóa khi cửa mở hoặc nút trong đang giữ. Servo hoàn tất lệnh không có nghĩa có cảm biến xác nhận chốt vật lý; web luôn phân biệt hai điều này.

## 4. Cảm biến rung và ánh sáng

`SDL_VIBRATION_ENABLED=1` vì SW-420 đã cắm GPIO4. Chưa có bằng chứng mức HIGH hay LOW tương ứng với rung của module cụ thể, nên `SDL_VIBRATION_ACTIVE_LEVEL=-1` mặc định gửi mức DO thật và ghi **chưa hiệu chuẩn**, không tự tạo cảnh báo rung.

1. Trong Monitor gửi `STATUS` khi để yên, rồi khi gõ nhẹ vào cảm biến. Có thể xem đồng thời thẻ Rung trên web.
2. Trong `network_config.h`, đổi `SDL_VIBRATION_ACTIVE_LEVEL` thành mức kích hoạt quan sát được: `0` hoặc `1`.
3. Build/upload lại. Không mất PIN/thẻ/vân tay mới. Web bắt đầu hiển thị phát hiện rung và bộ đếm từ lần khởi động hiện tại.

Đếm rung chống lặp 250 ms, trạng thái phát hiện giữ hiển thị 750 ms để dễ thấy. Phần rung hiện gửi sự kiện và cảnh báo trên web, không tự cho phép mở servo. Ánh sáng luôn gửi DO HIGH/LOW, chưa đổi sang lux hoặc sáng/tối.

## 5. Kết nối web

Xem [CONNECT_WEB.md](CONNECT_WEB.md) để chạy broker, backend, web và kiểm tra từng cảm biến. Hai topic giữ nguyên registry:

- `home/smart-door-lock/status`: online/offline retained, Last Will khi mất nguồn/mạng.
- `home/smart-door-lock/telemetry`: state và event, **không retained**.
- `home/smart-door-lock/command`: đã có trong registry nhưng firmware này **không subscribe/không mở từ xa**.

State được gửi khi có thay đổi (tối đa 10 lần/giây) và heartbeat tối đa mỗi 2 giây. Backend/frontend ngừng coi dữ liệu là trực tiếp sau 7 giây không có state mới. Không suy ra thiết bị còn online chỉ từ retained status.

Queue state chỉ giữ bản mới nhất; queue event tối đa 32, outbox có giới hạn; `droppedEvents` hiển thị số sự kiện không giữ/gửi được. Ghi event lên mạng vẫn hoạt động khi LittleFS không mount được. RFID có đọc VersionReg định kỳ; AS608 phát hiện lỗi UART liên tiếp rồi thử kết nối lại trong task riêng.

## 6. Các chức năng tại cửa

- Mở bằng PIN, thẻ đã đăng ký, vân tay đã cấp quyền, nút bên trong.
- Sau 5 PIN sai: tạm khóa PIN 60 giây, vẫn mở được từ trong.
- Tự khóa khi cửa đóng ổn định 600 ms; hoặc sau 10 giây nếu được mở khóa nhưng chưa mở cửa.
- Cảnh báo mở trái phép và cửa mở quá 30 giây.
- Log LittleFS hai file giới hạn khoảng 64 KiB. Không tự format khi mount lỗi. Muốn khởi tạo log: vào admin → menu 5 → giữ nút trong + `#` trên bàn thử; thao tác flash có thể tạm dừng vòng điều khiển nên không thực hiện khi cửa đang sử dụng.

`STATUS`, `VERSION` gửi trong **PlatformIO Serial Monitor**, không gõ vào PowerShell. `RESET AUTH` + `CONFIRM RESET AUTH` trong 15 giây, đều khi giữ nút trong, là thao tác khôi phục có chủ ý; sẽ xóa bộ quyền mới và cho thiết lập lại. Không cần reset này sau lần nạp đầu.

## 7. Kiểm chứng và giới hạn

Xem [TEST_RESULTS.md](TEST_RESULTS.md). Đã build cả bản chưa cấu hình mạng và bản cấu hình mẫu, kiểm thử backend/frontend và luồng qua Mosquitto thật với thiết bị mô phỏng. Chưa upload/chạy thử firmware này trên board thật. Thời gian dưới giây là lịch gửi dự kiến; cần đo trên mạng và nguồn điện thật. Chưa có kiểm chứng vị trí chốt vật lý, số lux, tình trạng điện của keypad, pin nguồn hay danh tính người từ UID/ID.
