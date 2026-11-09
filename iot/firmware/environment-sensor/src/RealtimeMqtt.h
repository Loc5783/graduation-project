#ifndef REALTIME_MQTT_H
#define REALTIME_MQTT_H

#include <Arduino.h>
#include "config_sensor.h"

struct EnvironmentSnapshot {
    float    temperature;
    float    humidity;
    uint16_t gasRaw;
    uint8_t  alertLevel;
    bool     buzzerOn;
    bool     isWarmingUp;
    uint32_t warmupRemainingMs;
    uint32_t uptimeMs;
};

struct EnvironmentAlert {
    char     code[32];
    uint16_t gasRaw;
    uint8_t  alertLevel;
    uint32_t uptimeMs;
};

// Khởi tạo FreeRTOS Network Task kết nối Wi-Fi và MQTT
void realtimeMqttBegin(const char *firmwareVersion);

// Đẩy dữ liệu snapshot mới nhất vào hàng đợi để gửi MQTT (non-blocking)
void realtimeMqttSendSnapshot(const EnvironmentSnapshot &snapshot);

// Gửi ngay một sự kiện cảnh báo khẩn cấp lên topic alert (non-blocking)
void realtimeMqttSendAlert(const char *code, uint16_t gasRaw, uint8_t alertLevel);

// Kiểm tra trạng thái kết nối MQTT
bool realtimeMqttIsConnected();

#endif // REALTIME_MQTT_H

