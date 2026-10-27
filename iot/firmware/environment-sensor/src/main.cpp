#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <DHT.h>
#include "config_sensor.h"
#include "protocol.h"
#include "RealtimeMqtt.h"

// ====================================================================
// BIẾN NGOẠI VI & ĐỐI TƯỢNG CẢM BIẾN
// ====================================================================
static DHT dht(PIN_DHT_DATA, DHT11);

// Bộ lọc trung bình trượt (Moving Average Filter) cho cảm biến MQ-2
static uint16_t adcSamples[FILTER_WINDOW_SIZE];
static uint8_t  sampleIndex = 0;
static uint32_t sampleSum = 0;
static bool     bufferFilled = false;
static uint16_t filteredGasAdc = 0;

// Trạng thái hệ thống & Timers
static AlertLevel currentAlertLevel = LEVEL_WARMUP;
static unsigned long lastDhtReadTime    = 0;
static unsigned long lastAdcSampleTime  = 0;
static unsigned long lastBuzzerToggle   = 0;
static bool          buzzerState        = false;

static float currentTemperature = 25.0f;
static float currentHumidity    = 60.0f;

#if ENABLE_ESPNOW_BROADCAST
static GasAlertPacket espNowPacket;
static esp_now_peer_info_t broadcastPeer;
static const uint8_t BROADCAST_MAC[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
#endif

// ====================================================================
// BỘ LỌC TRUNG BÌNH TRƯỢT MQ-2
// ====================================================================
void updateMq2Filter() {
    unsigned long now = millis();
    if (now - lastAdcSampleTime < MQ2_SAMPLE_INTERVAL) return;
    lastAdcSampleTime = now;

    uint16_t rawAdc = analogRead(PIN_MQ2_AO);

    if (!bufferFilled) {
        adcSamples[sampleIndex] = rawAdc;
        sampleSum += rawAdc;
        sampleIndex++;
        if (sampleIndex >= FILTER_WINDOW_SIZE) {
            bufferFilled = true;
            sampleIndex = 0;
        }
        filteredGasAdc = sampleSum / (bufferFilled ? FILTER_WINDOW_SIZE : sampleIndex);
    } else {
        sampleSum = sampleSum - adcSamples[sampleIndex] + rawAdc;
        adcSamples[sampleIndex] = rawAdc;
        sampleIndex = (sampleIndex + 1) % FILTER_WINDOW_SIZE;
        filteredGasAdc = sampleSum / FILTER_WINDOW_SIZE;
    }
}

// ====================================================================
// ĐỌC CẢM BIẾN NHIỆT ĐỘ / ĐỘ ẨM DHT11
// ====================================================================
void updateDhtSensor() {
    unsigned long now = millis();
    if (now - lastDhtReadTime < DHT_READ_INTERVAL_MS) return;
    lastDhtReadTime = now;

    float t = dht.readTemperature();
    float h = dht.readHumidity();

    if (isnan(t) || isnan(h)) {
        // Nếu lỗi đọc tạm thời, giữ nguyên giá trị hợp lệ trước đó
    } else {
        currentTemperature = t;
        currentHumidity    = h;
    }
}

// ====================================================================
// MÁY TRẠNG THÁI XỬ LÝ CẢNH BÁO (KÈM HYSTERESIS CHỐNG NHIỄU)
// ====================================================================
void updateAlertState() {
    unsigned long uptime = millis();

    // 1. Giai đoạn sấy nóng cảm biến MQ-2
    if (uptime < WARMUP_DURATION_MS) {
        currentAlertLevel = LEVEL_WARMUP;
        return;
    }

    AlertLevel prev = currentAlertLevel;

    // 2. Chuyển trạng thái dựa trên ngưỡng gas và hysteresis
    switch (currentAlertLevel) {
        case LEVEL_WARMUP:
        case LEVEL_SAFE:
            if (filteredGasAdc >= GAS_THRESH_DANGER) {
                currentAlertLevel = LEVEL_DANGER;
            } else if (filteredGasAdc >= GAS_THRESH_WARNING) {
                currentAlertLevel = LEVEL_WARNING;
            } else {
                currentAlertLevel = LEVEL_SAFE;
            }
            break;

        case LEVEL_WARNING:
            if (filteredGasAdc >= GAS_THRESH_DANGER) {
                currentAlertLevel = LEVEL_DANGER;
            } else if (filteredGasAdc < (GAS_THRESH_WARNING - GAS_HYSTERESIS)) {
                currentAlertLevel = LEVEL_SAFE;
            }
            break;

        case LEVEL_DANGER:
            if (filteredGasAdc < (GAS_THRESH_DANGER - GAS_HYSTERESIS)) {
                if (filteredGasAdc < (GAS_THRESH_WARNING - GAS_HYSTERESIS)) {
                    currentAlertLevel = LEVEL_SAFE;
                } else {
                    currentAlertLevel = LEVEL_WARNING;
                }
            }
            break;
    }

    // Nếu trạng thái vừa thay đổi, bắn event cảnh báo khẩn cấp lên topic alert
    if (currentAlertLevel != prev) {
        if (currentAlertLevel == LEVEL_DANGER) {
            realtimeMqttSendAlert("GAS_LEAK_DANGER", filteredGasAdc, LEVEL_DANGER);
        } else if (currentAlertLevel == LEVEL_WARNING) {
            realtimeMqttSendAlert("GAS_LEAK_WARNING", filteredGasAdc, LEVEL_WARNING);
        } else if (prev >= LEVEL_WARNING && currentAlertLevel == LEVEL_SAFE) {
            realtimeMqttSendAlert("GAS_NORMALIZED", filteredGasAdc, LEVEL_SAFE);
        }
    }
}

// ====================================================================
// ĐIỀU KHIỂN CÒI BUZZER PHI CHẶN (NON-BLOCKING)
// ====================================================================
void updateBuzzer() {
    unsigned long now = millis();

    switch (currentAlertLevel) {
        case LEVEL_WARMUP:
        case LEVEL_SAFE:
            if (buzzerState) {
                digitalWrite(PIN_BUZZER, LOW);
                buzzerState = false;
            }
            break;

        case LEVEL_WARNING:
            // Cảnh báo: Kêu ngắt quãng (150ms BẬT, 850ms TẮT)
            if (buzzerState && (now - lastBuzzerToggle >= 150)) {
                buzzerState = false;
                digitalWrite(PIN_BUZZER, LOW);
                lastBuzzerToggle = now;
            } else if (!buzzerState && (now - lastBuzzerToggle >= 850)) {
                buzzerState = true;
                digitalWrite(PIN_BUZZER, HIGH);
                lastBuzzerToggle = now;
            }
            break;

        case LEVEL_DANGER:
            // Nguy hiểm khẩn cấp: Kêu dồn dập (100ms BẬT, 100ms TẮT)
            if (buzzerState && (now - lastBuzzerToggle >= 100)) {
                buzzerState = false;
                digitalWrite(PIN_BUZZER, LOW);
                lastBuzzerToggle = now;
            } else if (!buzzerState && (now - lastBuzzerToggle >= 100)) {
                buzzerState = true;
                digitalWrite(PIN_BUZZER, HIGH);
                lastBuzzerToggle = now;
            }
            break;
    }
}

// ====================================================================
// ĐỒNG BỘ SNAPSHOT SANG NETWORK TASK
// ====================================================================
void syncSnapshotToNetwork() {
    unsigned long now = millis();
    bool warmingUp = (now < WARMUP_DURATION_MS);
    uint32_t warmupRem = warmingUp ? (WARMUP_DURATION_MS - now) : 0;

    EnvironmentSnapshot snapshot{};
    snapshot.temperature       = currentTemperature;
    snapshot.humidity          = currentHumidity;
    snapshot.gasRaw            = filteredGasAdc;
    snapshot.alertLevel        = (uint8_t)currentAlertLevel;
    snapshot.buzzerOn          = buzzerState;
    snapshot.isWarmingUp       = warmingUp;
    snapshot.warmupRemainingMs = warmupRem;
    snapshot.uptimeMs          = now;

    realtimeMqttSendSnapshot(snapshot);
}

// ====================================================================
// KHỞI ĐỘNG ARDUINO
// ====================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n==================================================");
    Serial.println("  GRADUATION PROJECT - ENVIRONMENT SENSOR (ESP32)");
    Serial.println("  Owner: Quynh | Modules: MQ-2, DHT11, Buzzer");
    Serial.println("==================================================");

    // Cấu hình chân Buzzer
    pinMode(PIN_BUZZER, OUTPUT);
    digitalWrite(PIN_BUZZER, LOW);

    // Cấu hình ADC cho cảm biến khí gas MQ-2
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);

    // Bắt đầu cảm biến DHT11
    dht.begin();

    // Khởi tạo FreeRTOS Network Task (Wi-Fi + MQTT)
    realtimeMqttBegin("env-esp32-v1.0");

#if ENABLE_ESPNOW_BROADCAST
    // Khởi tạo ESP-NOW broadcast nếu muốn hỗ trợ thêm màn hình TFT song song
    if (esp_now_init() == ESP_OK) {
        memset(&broadcastPeer, 0, sizeof(broadcastPeer));
        memcpy(broadcastPeer.peer_addr, BROADCAST_MAC, 6);
        broadcastPeer.channel = 0; // Dùng channel hiện tại của Wi-Fi
        broadcastPeer.encrypt = false;
        esp_now_add_peer(&broadcastPeer);
        Serial.println("[ESPNOW] Da khoi tao ESP-NOW broadcast.");
    }
#endif

    Serial.printf("[WARMUP] Bat dau say cam bien MQ-2 trong %u giay...\n",
                  WARMUP_DURATION_MS / 1000);
}

// ====================================================================
// VÒNG LẶP CHÍNH (CHẠY TRÊN CORE 1 - KHÔNG BỊ CHẶN BỞI MẠNG)
// ====================================================================
void loop() {
    // 1. Cập nhật lọc trung bình trượt MQ-2
    updateMq2Filter();

    // 2. Đọc cảm biến nhiệt độ / độ ẩm DHT11
    updateDhtSensor();

    // 3. Cập nhật máy trạng thái cảnh báo gas
    updateAlertState();

    // 4. Điều khiển còi buzzer phi chặn
    updateBuzzer();

    // 5. Đồng bộ snapshot dữ liệu sang Task Mạng MQTT
    syncSnapshotToNetwork();

    // 6. In debug ra Serial
    static unsigned long lastSerialPrint = 0;
    if (millis() - lastSerialPrint >= 1000) {
        lastSerialPrint = millis();
        Serial.printf("[SENSOR] GasADC: %4u | T: %.1fC | H: %.1f%% | Level: %u | MQTT: %s\n",
                      filteredGasAdc,
                      currentTemperature,
                      currentHumidity,
                      currentAlertLevel,
                      realtimeMqttIsConnected() ? "ONLINE" : "OFFLINE");
    }

    delay(20);
}

