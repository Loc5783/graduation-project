#ifndef CONFIG_DISPLAY_H
#define CONFIG_DISPLAY_H

#include <Arduino.h>

// ====================================================================
// 1. CẤU HÌNH CHÂN SPI CHO MÀN HÌNH TFT 1.8 ST7735 (ESP32 DEVKIT V1)
// ====================================================================
#define TFT_CS       5     // D5  (VSPI SS)
#define TFT_DC       19    // D19 (A0 / Data-Command)
#define TFT_RST      21    // D21 (RES / Reset)
#define TFT_MOSI     23    // D23 (SDA / VSPI MOSI)
#define TFT_SCLK     18    // D18 (SCK / VSPI SCK)

// ====================================================================
// 2. CẤU HÌNH THỜI GIAN & TIMEOUT
// ====================================================================
#define HEARTBEAT_TIMEOUT_MS  8000   // Tăng lên 8 giây (tránh báo mất kết nối giả khi rớt vài gói tin)
#define TFT_REFRESH_INTERVAL  250    // Tần suất làm mới giao diện (ms)

// ====================================================================
// 3. CẤU HÌNH MẠNG ESP-NOW
// ====================================================================
#define ESPNOW_WIFI_CHANNEL   2      // Kênh WiFi đồng bộ với Router & Node Cảm biến (Kênh 2)

#endif // CONFIG_DISPLAY_H

