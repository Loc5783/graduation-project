# Window Sensor

**Owner:** Minh

## Purpose
Firmware và Local Web Server cho thiết bị Cảm biến Cửa sổ (Window Sensor).

## Hardware & Pin Mapping
- **Vi điều khiển**: ESP32 DevKit V1
- **GPIO 27**: Cảm biến từ MC-38
- **GPIO 26**: Cảm biến chuyển động PIR
- **GPIO 25**: Còi buzzer
- **GPIO 23**: Rơ-le
- **GPIO 2**: Đèn LED báo trạng thái
- **GPIO 18/19/16/4/5**: Màn hình TFT ST7735 (SCLK/MOSI/DC/RST/CS)

## Wi-Fi Configuration
- Copy `wifi_secrets.example.h` to `wifi_secrets.h` in this folder.
- Set the local Wi-Fi SSID/password and a private AP password in `wifi_secrets.h`.
- `wifi_secrets.h` is ignored by Git; do not commit network credentials.
- The device starts its fallback access point if station Wi-Fi is not configured or unavailable.

## Build and Upload
From the repository root, use PlatformIO:

```powershell
pio run
pio run --target upload --upload-port COM3
pio device monitor --port COM3 --baud 115200
```

## Kiến trúc truyền dữ liệu Local Web
1. **ESPAsyncWebServer**: Chạy trực tiếp web server trên vi điều khiển cổng 80.
2. **WebSocket (`/ws`)**: Truyền dữ liệu hai chiều real-time:
   - Trạng thái đóng/mở tức thì
   - Telemetry (mức pin, RSSI sóng Wi-Fi, Uptime)
   - Cảnh báo an ninh: Cạy phá vỏ (`tamper`), Rung kính (`vibration`), Mở cửa quá lâu (`timeout`).

## Giao diện Web
- File giao diện đặt tại: `frontend/features/window-sensor/` (`index.html`, `style.css`, `app.js`).
- Giao diện hiện chạy trên máy tính; ESP32 cung cấp dữ liệu trạng thái qua WebSocket `/ws`.
- Đã tích hợp **IoT Hardware Simulator** để kiểm thử giao diện khi chưa kết nối thiết bị.
