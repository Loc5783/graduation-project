# Smart Plug (Ổ cắm thông minh)

**Người phụ trách:** Nhật Anh (nhatanh)

## 1. Phần cứng thực tế (Hardware Specification)

- **Vi điều khiển chính:** KIT WiFi NodeMCU ESP32S (ESP-WROOM-32).
- **Cơ cấu chấp hành:** Module 1 Relay 5V có cách ly quang (Optocoupler).
- **Cảm biến đầu vào:** Cảm biến ánh sáng quang trở CDS (LDR).
- **Linh kiện phụ trợ:** Trở vạch phân áp 200Ω, Breadboard MB102, Cáp MicroUSB, Cọc nối KF128 5.08mm 2P.

## 2. Sơ đồ nối chân (Pin Mapping)

| Thiết bị / Module | Chân trên Module | Chân nối trên ESP32 NodeMCU | Ghi chú |
|---|---|---|---|
| **Module 1 Relay 5V** | VCC | **VIN (5V)** | Cấp nguồn 5V cho cuộn hút rơ-le |
| | GND | **GND** | Nối đất chung |
| | IN | **GPIO 26** | Chân kích tín hiệu đóng/ngắt rơ-le |
| **Quang trở CDS** | Chân 1 | **3V3** | Nguồn tham chiếu cảm biến |
| | Chân 2 | **GPIO 34** (ADC1) | Đọc tín hiệu Analog điện áp phân áp |
| **Điện trở phân áp** | Chân 1 | **GPIO 34** | Nối chung với chân 2 quang trở |
| | Chân 2 | **GND** | Kéo xuống đất tạo cầu phân áp |

## 3. MQTT Topics chuẩn

| Hướng dữ liệu | Topic | Định dạng Payload (JSON) | Mô tả |
|---|---|---|---|
| Dashboard $\rightarrow$ Device | `home/smart-plug/command` | `{"relay": "ON"}` hoặc `{"relay": "OFF"}` | Nhận lệnh điều khiển đóng/ngắt rơ-le |
| Device $\rightarrow$ Dashboard | `home/smart-plug/status` | `{"status": "ONLINE", "relay": "ON"}` | Báo trạng thái kết nối & phản hồi lệnh |
| Device $\rightarrow$ Dashboard | `home/smart-plug/telemetry` | `{"relay": "ON", "voltage": 220.2, "power_w": 52.4, "energy_kwh": 0.045, "light_lux": 340}` | Báo cáo chu kỳ đo lường mỗi 2s |

## 4. Trạng thái phát triển (Status)

- [x] Sơ đồ mạch & đấu nối chân phần cứng hoàn tất.
- [x] Giao diện Web Dashboard ([`frontend/src/modules/smart-plug/OwnerArea.jsx`](../../frontend/src/modules/smart-plug/OwnerArea.jsx)) hoàn tất.
- [x] Backend Controller & Routes ([`backend/modules/smart-plug/`](../../backend/modules/smart-plug/)) sẵn sàng.
- [x] Mã nguồn Firmware PlatformIO ([`IOT/src/main.cpp`](./IOT/src/main.cpp)) đã biên dịch thành công 100%.
- [ ] Nạp code thử nghiệm lên bo mạch ESP32 thật và kiểm tra kết nối Wi-Fi/MQTT.

## 5. Hướng dẫn nạp code (Upload Firmware)

1. Cắm cáp MicroUSB từ kit NodeMCU ESP32-S vào máy tính.
2. Mở dự án trong thư mục `iot/firmware/smart-plug/IOT`.
3. Bấm biểu tượng **PlatformIO: Upload** (hình mũi tên `→`) ở thanh trạng thái dưới cùng của VS Code (hoặc phím tắt `Ctrl + Alt + U`).
4. Mở **Serial Monitor** (hình phích cắm hoặc phím tắt `Ctrl + Alt + S`) với tốc độ **115200 baud** để xem thông số và điều khiển thử bằng lệnh gõ trực tiếp (`ON`, `OFF`, `AUTO`, `STAT`).
