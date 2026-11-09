#ifndef PROTOCOL_H
#define PROTOCOL_H

#include <Arduino.h>
#include "config_sensor.h"

// Cấu trúc gói tin truyền qua ESP-NOW (tối ưu hóa bộ nhớ, 17 bytes)
struct __attribute__((packed)) GasAlertPacket {
    uint32_t packet_id;    // Số thứ tự gói tin
    float    temperature;  // Nhiệt độ (°C)
    float    humidity;     // Độ ẩm (%RH)
    uint16_t gas_raw;      // Giá trị ADC đọc từ MQ-2 (0 - 4095)
    uint8_t  alert_level;  // Mức cảnh báo (theo enum AlertLevel)
    uint32_t uptime_ms;    // Thời gian node hoạt động (ms)
};

#endif // PROTOCOL_H

