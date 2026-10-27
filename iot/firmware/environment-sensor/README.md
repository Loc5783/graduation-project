+# Smoke / Gas / Temperature Sensor Firmware (ESP32)

**Phụ trách:** Quỳnh (quynh)  
**Board:** ESP32 Doit DevKit V1 (hoặc ESP32 WROOM / ESP32-S3)  
**Giao thức:** Wi-Fi 802.11 b/g/n + MQTT (kèm tùy chọn ESP-NOW cho màn hình TFT)

---

## 1. Sơ đồ nối chân (Pinout)

| Tên linh kiện | Chân trên Module | Chân kết nối ESP32 | Ghi chú |
|---|---|---|---|
| **Cảm biến khí Gas / Khói MQ-2** | AO (Analog Out) | `GPIO 35` (ADC1_CH7) | Đo điện áp biến thiên nồng độ khí gas (0 - 4095) |
| | VCC / GND | 5V / GND | Lưu ý cấp nguồn 5V ổn định để sấy cảm biến |
| **Cảm biến Nhiệt ẩm DHT11** | DATA / OUT | `GPIO 4` | Trở kéo lên 4.7k - 10k nếu dùng cảm biến rời |
| | VCC / GND | 3.3V hoặc 5V / GND | Đọc nhiệt độ (°C) và độ ẩm (%RH) |
| **Còi báo động Buzzer** | I/O / SIG | `GPIO 18` | Kích qua Transistor NPN / Module còi chủ động |
| | VCC / GND | 5V hoặc 3.3V / GND | Tự động phát âm thanh theo mức độ nguy hiểm |

---

## 2. Các mức cảnh báo của hệ thống

- **LEVEL_WARMUP (0):** 20 giây đầu sấy nóng cảm biến MQ-2 sau khi cắm nguồn.
- **LEVEL_SAFE (1):** Môi trường an toàn (`gas_raw < 1200`). Còi tắt.
- **LEVEL_WARNING (2):** Phát hiện chớm có khí gas hoặc khói (`gas_raw >= 1200`). Còi kêu ngắt quãng (bíp bíp).
- **LEVEL_DANGER (3):** Nồng độ gas nguy hiểm vượt ngưỡng (`gas_raw >= 2200`). Còi báo động dồn dập liên tục.

---

## 3. Cấu hình Wi-Fi & MQTT trước khi nạp

Mở file `include/network_config.h` (được tạo từ `include/network_config.example.h`):

```cpp
// 1. Tên và mật khẩu Wi-Fi (Băng tần 2.4GHz)
#define ENV_WIFI_SSID       "TEN_WIFI_NHA_BAN"
#define ENV_WIFI_PASSWORD   "MAT_KHAU_WIFI"

// 2. Địa chỉ Broker MQTT (IP của máy tính chạy backend/broker trong mạng LAN)
// Xem IP máy tính bằng lệnh "ipconfig" trong CMD/PowerShell (ví dụ 192.168.1.15)
#define ENV_MQTT_URI        "mqtt://192.168.1.15:1883"

// 3. Tài khoản MQTT (nếu có, để trống nếu broker không yêu cầu mật khẩu)
#define ENV_MQTT_USERNAME   ""
#define ENV_MQTT_PASSWORD   ""
```

---

## 4. Các Topic MQTT xuất bản

| Topic | QoS | Retain | Tần suất | Mục đích |
|---|---|---|---|---|
| `home/environment-sensor/status` | 1 | true | LWT & khi khởi động | Báo trạng thái online/offline của ESP32 |
| `home/environment-sensor/telemetry` | 0 | false | Mỗi 1.5s (hoặc khi đổi trạng thái) | Dữ liệu nhiệt độ, độ ẩm, gas raw, còi, uptime |
| `home/environment-sensor/alert` | 1 | false | Bắn ngay khi có sự kiện | Báo động rò rỉ gas: `GAS_LEAK_WARNING`, `GAS_LEAK_DANGER`, `GAS_NORMALIZED` |

---

## 5. Hướng dẫn nạp code bằng PlatformIO

1. Mở thư mục `iot/firmware/environment-sensor/` trong Visual Studio Code (đã cài extension **PlatformIO IDE**).
2. Kiểm tra và chỉnh sửa file `include/network_config.h`.
3. Cắm cáp Micro-USB / Type-C nối ESP32 với máy tính.
4. Bấm nút **Build (Dấu tick)** để biên dịch.
5. Bấm nút **Upload (Mũi tên sang phải)** để nạp vào ESP32.
6. Bấm nút **Serial Monitor (Biểu tượng phích cắm)** để xem log ở tốc độ `115200` baud.

---

## 6. Ghi chú bảo mật
Không commit thông tin nhạy cảm như mật khẩu Wi-Fi thực tế hoặc private key lên repository công khai.


