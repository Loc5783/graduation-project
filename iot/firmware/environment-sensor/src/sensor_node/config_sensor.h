#ifndef CONFIG_SENSOR_H
#define CONFIG_SENSOR_H

#include <Arduino.h>

// ====================================================================
// 1. CẤU HÌNH CHÂN GPIO (ESP32 GOOUUU / CLASSIC)
// ====================================================================
#define PIN_MQ2_AO       35    // Chân ADC1_CH7 đọc áp MQ-2 (qua mạch chia áp)
#define PIN_DHT_DATA     4     // Chân Data cảm biến nhiệt độ/độ ẩm DHT11
#define PIN_BUZZER       18    // Chân kích còi Buzzer (qua Transistor NPN)

// ====================================================================
// 2. CẤU HÌNH THỜI GIAN & LỌC NHIỄU SENSOR
// ====================================================================
#define WARMUP_DURATION_MS   20000   // Thời gian ủ nóng ban đầu: 20 giây (test nhanh)
#define DHT_READ_INTERVAL_MS 2000    // Đọc DHT11 mỗi 2 giây (DHT11 đáp ứng chậm)
#define MQ2_SAMPLE_INTERVAL  50      // Lấy mẫu ADC MQ-2 mỗi 50ms
#define FILTER_WINDOW_SIZE   16      // Kích thước cửa sổ lọc trung bình trượt (16 mẫu)

// ====================================================================
// 3. NGƯỠNG CẢNH BÁO GAS & HYSTERESIS (ĐỘ TRỄ CHỐNG NHẤP NHÁY)
// Dải ADC 12-bit của ESP32: 0 - 4095
// ====================================================================
#define GAS_THRESH_WARNING   1100    // Dưới 1100: An toàn (SAFE - Xanh), Từ 1100: Chớm rò rỉ (WARNING - Vàng)
#define GAS_THRESH_DANGER    2200    // Từ 2200 trở lên: Nguy hiểm (DANGER - Đỏ)
#define GAS_HYSTERESIS       100     // Độ trễ chống rung lắc trạng thái khi dao động quanh ngưỡng

// ====================================================================
// 4. CẤU HÌNH GIAO TIẾP ESP-NOW
// ====================================================================
#define ESPNOW_WIFI_CHANNEL  2       // Kênh WiFi đồng bộ với Router "Siêu nhân sợ gián" (Kênh 2)
#define PACKET_SEND_INTERVAL 1000    // Tần suất gửi dữ liệu (ms)

// Địa chỉ MAC của Node Hiển thị (Display Node) - Đã cấu hình Unicast chuẩn xác thực ACK phần cứng
static const uint8_t RECEIVER_MAC[6] = {0x00, 0x70, 0x07, 0x83, 0x86, 0x48}; 

#endif // CONFIG_SENSOR_H

