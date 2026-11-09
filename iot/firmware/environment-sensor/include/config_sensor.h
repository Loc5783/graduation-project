#ifndef CONFIG_SENSOR_H
#define CONFIG_SENSOR_H

#include <Arduino.h>

// ====================================================================
// 1. CẤU HÌNH CHÂN GPIO (ESP32 DOIT DEVKIT V1 / CLASSIC)
// ====================================================================
#define PIN_MQ2_AO       35    // Chân ADC1_CH7 đọc điện áp MQ-2
#define PIN_DHT_DATA     4     // Chân Data cảm biến nhiệt độ & độ ẩm DHT11
#define PIN_BUZZER       18    // Chân kích còi Buzzer (qua Transistor NPN / Module)

// ====================================================================
// 2. CẤU HÌNH THỜI GIAN & LỌC NHIỄU SENSOR
// ====================================================================
#define WARMUP_DURATION_MS   20000   // Thời gian sấy nóng ban đầu: 20 giây (test nhanh)
#define DHT_READ_INTERVAL_MS 2000    // Đọc DHT11 mỗi 2 giây
#define MQ2_SAMPLE_INTERVAL  50      // Lấy mẫu ADC MQ-2 mỗi 50ms
#define FILTER_WINDOW_SIZE   16      // Cửa sổ lọc trung bình trượt 16 mẫu

// ====================================================================
// 3. NGƯỠNG CẢNH BÁO GAS & HYSTERESIS (ĐỘ TRỄ CHỐNG NHẤP NHÁY)
// Dải ADC 12-bit của ESP32: 0 - 4095
// ====================================================================
#define GAS_THRESH_WARNING   1200    // Ngưỡng chớm rò rỉ gas (Cảnh báo Vàng)
#define GAS_THRESH_DANGER    2200    // Ngưỡng nguy hiểm khí gas cao (Báo động Đỏ)
#define GAS_HYSTERESIS       150     // Độ trễ chống rung lắc trạng thái

// ====================================================================
// 4. MỨC CẢNH BÁO
// ====================================================================
enum AlertLevel : uint8_t {
    LEVEL_WARMUP  = 0, // Đang sấy cảm biến MQ-2
    LEVEL_SAFE    = 1, // An toàn
    LEVEL_WARNING = 2, // Cảnh báo chớm có gas
    LEVEL_DANGER  = 3  // Nguy hiểm, nồng độ gas cao
};

// ====================================================================
// 5. TÙY CHỌN ESP-NOW PHỤ TRỢ (NẾU MUỐN PHÁT ĐỒNG THỜI CHO MÀN HÌNH TFT)
// ====================================================================
#define ENABLE_ESPNOW_BROADCAST 0    // Đặt 1 nếu muốn phát ESP-NOW song song với MQTT
#define ESPNOW_WIFI_CHANNEL     1

#endif // CONFIG_SENSOR_H

