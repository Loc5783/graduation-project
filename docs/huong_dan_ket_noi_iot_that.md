# Hướng Dẫn Kết Nối & Nạp Firmware Window Sensor (ESP32 / ESP8266)

Tài liệu này hướng dẫn chi tiết từng bước để nạp code lên board ESP32 thật và truyền dữ liệu lên giao diện Web Local.

---

## 1. Sơ đồ đấu nối phần cứng (Hardware Wiring)

| Thiết bị / Cảm biến | Chân trên ESP32 | Ghi chú |
|---|---|---|
| **Cảm biến từ MC-38** | **GPIO 27** và **GND** | Cấu hình `INPUT_PULLUP`; trạng thái mở/đóng phụ thuộc cách lắp cảm biến. |
| **Cảm biến chuyển động PIR** | **GPIO 26** và nguồn/GND phù hợp module | Tín hiệu OUT được đọc ở mức HIGH. |
| **Còi buzzer** | **GPIO 25** và GND | Còi nhấp nháy khi có cảnh báo. |
| **Đèn LED** | **GPIO 2** và GND (qua điện trở phù hợp) | Sáng khi cửa mở. |
| **Rơ-le** | **GPIO 23** và nguồn/GND phù hợp module | Được kích hoạt khi cửa mở; kiểm tra mức kích hoạt của module trước khi đấu tải. |
| **Màn hình TFT ST7735** | SCLK **18**, MOSI **19**, DC **16**, RST **4**, CS **5** | Dùng chung GND; cấp nguồn theo thông số màn hình. |

---

## 2. Chuẩn bị môi trường nạp code

1. **Phần mềm**: Cài đặt [Arduino IDE](https://www.arduino.cc/en/software) (hoặc VS Code với extension PlatformIO).
2. **Cài đặt thư viện cần thiết** trong Arduino IDE (*Sketch -> Include Library -> Manage Libraries...*):
   - **ArduinoJson** (phiên bản 6.x hoặc 7.x của Benoit Blanchon)
   - **ESPAsyncWebServer**
   - **AsyncTCP** (nếu dùng ESP32) hoặc **ESPAsyncTCP** (nếu dùng ESP8266)
3. Cắm cáp Micro-USB / Type-C nối ESP32 với máy tính. Vào *Tools -> Port* chọn đúng cổng COM.

---

## 3. Kết nối Wi-Fi

Firmware ưu tiên kết nối vào Wi-Fi đã cấu hình trong `window_sensor_esp32.ino`. Nếu không kết nối được sau 10 giây, ESP32 tự phát mạng dự phòng `ESP32-WindowSensor`.

Để mở dashboard trên máy tính và nhận dữ liệu thật, máy tính và ESP32 cần ở cùng mạng Wi-Fi. Mở Serial Monitor ở tốc độ `115200` để xem địa chỉ IP mà ESP32 in ra khi khởi động.

---

## 4. Chạy dashboard và nhận dữ liệu thật

1. Tại thư mục gốc dự án, chạy máy chủ web tĩnh:
   ```powershell
   python -m http.server 8000
   ```
   Nếu Windows chưa nhận lệnh `python`, hãy cài Python hoặc dùng Python đi kèm PlatformIO.
2. Mở `http://localhost:8000/frontend/features/window-sensor/` trên trình duyệt.
3. Mở **IoT Simulator**, nhập `ws://<IP-ESP32>/ws` bằng IP vừa đọc từ Serial Monitor, rồi bấm **Kết nối lại**. Ví dụ: `ws://192.168.1.150/ws`.
4. Chấm kết nối chuyển xanh; trạng thái cửa, PIR, relay, RSSI và cảnh báo sẽ cập nhật từ ESP32. Địa chỉ WebSocket được lưu trên trình duyệt cho lần sau.

ESP32 hiện chỉ trả trang thông báo ở đường dẫn `/`, vì vậy chạy dashboard từ máy tính theo các bước trên, không mở trang ở IP ESP32. Nếu laptop đang kết nối vào Wi-Fi dự phòng của ESP32, dashboard ở `localhost` vẫn chạy nhưng laptop sẽ không còn kết nối Wi-Fi khác.
