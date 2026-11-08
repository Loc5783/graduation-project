#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

/* ==========================================================================
   1. CẤU HÌNH WI-FI & MQTT BROKER
   ========================================================================== */

// Nạp thông tin bảo mật Wi-Fi từ secrets.h (nếu có)
#if __has_include("secrets.h")
#include "secrets.h"
#endif

// Wi-Fi dự phòng an toàn nếu chưa tạo file secrets.h
#ifndef WIFI_SSID
#define WIFI_SSID       "YOUR_WIFI_SSID"
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"
#endif

// MQTT Broker công cộng miễn phí (kết nối trực tiếp qua mạng internet hotspot)
#define MQTT_SERVER     "broker.emqx.io"
#define MQTT_PORT       1883
#define MQTT_USER       ""
#define MQTT_PASSWORD   ""
#define MQTT_CLIENT_PREFIX "ESP32_SmartPlug_"
#define MQTT_CLIENT_ID     "ESP32_SmartPlug_NhatAnh"

// Các kênh MQTT an toàn (tiền tố định danh thiết bị tránh can thiệp chéo)
#define TOPIC_COMMAND   "shp/device-smart-plug-01/command"
#define TOPIC_STATUS    "shp/device-smart-plug-01/status"
#define TOPIC_TELEMETRY "shp/device-smart-plug-01/telemetry"

/* ==========================================================================
   2. SƠ ĐỒ CHÂN PHẦN CỨNG THỰC TẾ (KHỚP VỚI MẠCH CỦA BẠN)
   ========================================================================== */

// Chân điều khiển Rơ-le 1 (Đèn): Cắm vào D27 trên ESP32
#define PIN_RELAY       27

// Chân điều khiển Rơ-le 2 (Quạt): Cắm vào D26 trên ESP32
#define PIN_RELAY_FAN   26

// Chân đọc cảm biến ánh sáng DO: Cắm vào D34 trên ESP32
#define PIN_CDS_DO      34

// Chân nút bấm cơ học: Cắm vào D13 trên ESP32
#define PIN_BUTTON      13

// Mức kích Rơ-le 1 (Đèn): Active-HIGH (HIGH = ĐÓNG RƠ-LE BẬT ĐÈN, LOW = NGẮT RƠ-LE TẮT ĐÈN)
#define DEFAULT_RELAY_ACTIVE_LOW false

// Mức tín hiệu chân DO khi phòng tối: HIGH (Khi trời sáng DO=0V / LOW, khi che tay/trời tối DO=HIGH)
#define SENSOR_DARK_LEVEL       HIGH

// Mặc định BẬT sẵn tính năng "Tự động khi tối" (Che tay -> Đèn tự sáng, Bỏ tay -> Đèn tự tắt)
#define DEFAULT_AUTO_MODE       true

// Chu kỳ gửi dữ liệu Telemetry lên Web (2 giây)
#define TELEMETRY_INTERVAL_MS   2000

// Tốc độ Serial Monitor
#define SERIAL_BAUD_RATE        115200

#endif // CONFIG_H
