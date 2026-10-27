#include <Arduino.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <esp_now.h>
#include <DHT.h>
#include <mqtt_client.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include "protocol.h"
#include "config_sensor.h"
#include "network_config.h"

// ====================================================================
// BIẾN TOÀN CỤC & ĐỐI TƯỢNG NGOẠI VI
// ====================================================================
static DHT dht(PIN_DHT_DATA, DHT11);

// Dữ liệu gói tin chuẩn bị gửi qua ESP-NOW
static GasAlertPacket outPacket;
static esp_now_peer_info_t peerInfo;

// Bộ đệm cho bộ lọc trung bình trượt (Moving Average Filter)
static uint16_t adcSamples[FILTER_WINDOW_SIZE];
static uint8_t  sampleIndex = 0;
static uint32_t sampleSum = 0;
static bool     bufferFilled = false;
static uint16_t filteredGasAdc = 0;

// Trạng thái hệ thống & Timers
static AlertLevel currentAlertLevel = LEVEL_WARMUP;
static unsigned long lastDhtReadTime    = 0;
static unsigned long lastAdcSampleTime  = 0;
static unsigned long lastPacketSendTime = 0;
static unsigned long lastBuzzerToggle   = 0;
static bool          buzzerState        = false;

// Cờ báo gửi thành công từ callback ESP-NOW
static volatile bool lastSendSuccess = false;

// ====================================================================
// CẤU TRÚC & HÀNG ĐỢI ĐỒNG BỘ MQTT FREERTOS
// ====================================================================
struct MqttSnapshot {
    float    temperature;
    float    humidity;
    uint16_t gasRaw;
    uint8_t  alertLevel;
    bool     buzzerOn;
    bool     isWarmingUp;
    uint32_t warmupRemainingMs;
    uint32_t uptimeMs;
};

struct MqttAlert {
    char     code[32];
    uint16_t gasRaw;
    uint8_t  alertLevel;
    uint32_t uptimeMs;
};

namespace {
constexpr char DEVICE_ID[]        = "environment-sensor";
constexpr char STATUS_TOPIC[]     = "home/environment-sensor/status";
constexpr char TELEMETRY_TOPIC[]  = "home/environment-sensor/telemetry";
constexpr char ALERT_TOPIC[]      = "home/environment-sensor/alert";
constexpr size_t MAX_OUTBOX_BYTES = 8192;

QueueHandle_t snapshotsQueue = nullptr;
QueueHandle_t alertsQueue    = nullptr;
esp_mqtt_client_handle_t mqttClient = nullptr;
portMUX_TYPE stateGuard = portMUX_INITIALIZER_UNLOCKED;

bool isMqttConnected = false;
uint32_t messageSequence = 0;
char bootId[9];
char clientId[40];
char lwtPayload[160];

const char* alertLevelToString(uint8_t level) {
    switch (level) {
        case LEVEL_WARMUP:  return "WARMUP";
        case LEVEL_SAFE:    return "SAFE";
        case LEVEL_WARNING: return "WARNING";
        case LEVEL_DANGER:  return "DANGER";
        default:            return "UNKNOWN";
    }
}

void setConnected(bool val) {
    portENTER_CRITICAL(&stateGuard);
    isMqttConnected = val;
    portEXIT_CRITICAL(&stateGuard);
}

bool getConnected() {
    portENTER_CRITICAL(&stateGuard);
    bool val = isMqttConnected;
    portEXIT_CRITICAL(&stateGuard);
    return val;
}

void mqttEventHandler(void *, esp_event_base_t, int32_t eventId, void *) {
    switch (eventId) {
        case MQTT_EVENT_CONNECTED:
            setConnected(true);
            Serial.println("[MQTT] [INFO] Da ket noi Broker thanh cong!");
            break;
        case MQTT_EVENT_DISCONNECTED:
            setConnected(false);
            Serial.println("[MQTT] [WARN] Mat ket noi Broker. Dang thu ket noi lai...");
            break;
        case MQTT_EVENT_ERROR:
            setConnected(false);
            Serial.println("[MQTT] [ERROR] Loi giao tiep MQTT.");
            break;
        default:
            break;
    }
}

bool publishRaw(const char *topic, const char *payload, int qos, bool retain) {
    if (!getConnected() || !mqttClient) return false;
    if (esp_mqtt_client_get_outbox_size(mqttClient) > MAX_OUTBOX_BYTES) return false;

    size_t len = strlen(payload);
    return esp_mqtt_client_enqueue(mqttClient, topic, payload, len, qos, retain, true) >= 0;
}

bool publishState(const MqttSnapshot &s) {
    char payload[768];
    int rssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0;

    int n = snprintf(payload, sizeof(payload),
        "{\"schemaVersion\":1,\"deviceId\":\"%s\",\"bootId\":\"%s\",\"kind\":\"state\","
        "\"sequence\":%u,\"uptimeMs\":%u,\"data\":{"
        "\"temperature\":%.1f,\"humidity\":%.1f,\"gasRaw\":%u,"
        "\"alertLevel\":%u,\"alertLevelText\":\"%s\","
        "\"buzzerOn\":%s,\"isWarmingUp\":%s,\"warmupRemainingMs\":%u,"
        "\"wifiRssi\":%d}}",
        DEVICE_ID, bootId, ++messageSequence, s.uptimeMs,
        s.temperature, s.humidity, s.gasRaw,
        s.alertLevel, alertLevelToString(s.alertLevel),
        s.buzzerOn ? "true" : "false",
        s.isWarmingUp ? "true" : "false",
        s.warmupRemainingMs,
        rssi);

    if (n <= 0 || (size_t)n >= sizeof(payload)) return false;
    return publishRaw(TELEMETRY_TOPIC, payload, 0, false);
}

void networkTask(void *) {
    Serial.printf("[NETWORK] Bat dau ket noi Wi-Fi: %s ...\n", ENV_WIFI_SSID);
    WiFi.setAutoReconnect(true);
    WiFi.setSleep(false); // Tat Modem Sleep de giu ket noi on dinh, khong rot goi
    WiFi.begin(ENV_WIFI_SSID, ENV_WIFI_PASSWORD);

    // Cho Wi-Fi ket noi va nhan IP truoc khi khoi tao MQTT client
    uint32_t startAttempt = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startAttempt < 15000)) {
        vTaskDelay(pdMS_TO_TICKS(500));
        Serial.print(".");
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[NETWORK] Wi-Fi da ket noi! IP: %s | RSSI: %d dBm | Channel: %d\n",
                      WiFi.localIP().toString().c_str(), WiFi.RSSI(), WiFi.channel());
    } else {
        Serial.println("\n[NETWORK] [WARN] Chua nhan duoc IP Wi-Fi, MQTT se tu dong ket noi lai khi co mang...");
    }

    esp_mqtt_client_config_t mqttCfg{};
    mqttCfg.uri = ENV_MQTT_URI;
    mqttCfg.client_id = clientId;
    if (strlen(ENV_MQTT_USERNAME) > 0) mqttCfg.username = ENV_MQTT_USERNAME;
    if (strlen(ENV_MQTT_PASSWORD) > 0) mqttCfg.password = ENV_MQTT_PASSWORD;
    mqttCfg.lwt_topic = STATUS_TOPIC;
    mqttCfg.lwt_msg = lwtPayload;
    mqttCfg.lwt_qos = 1;
    mqttCfg.lwt_retain = 1;
    mqttCfg.keepalive = 30;              // Tang tu 15s len 30s de chong timeout gia
    mqttCfg.reconnect_timeout_ms = 5000; // Thoi gian thu ket noi lai
    mqttCfg.network_timeout_ms = 10000;  // Tang tu 2.5s len 10s de tranh select() timeout
    mqttCfg.task_stack = 6144;

    mqttClient = esp_mqtt_client_init(&mqttCfg);
    if (!mqttClient ||
        esp_mqtt_client_register_event(mqttClient, MQTT_EVENT_ANY, mqttEventHandler, nullptr) != ESP_OK ||
        esp_mqtt_client_start(mqttClient) != ESP_OK) {
        Serial.println("[NETWORK] [FATAL] Khoi tao MQTT that bai!");
        if (mqttClient) {
            esp_mqtt_client_destroy(mqttClient);
            mqttClient = nullptr;
        }
        vTaskDelete(nullptr);
        return;
    }

    MqttSnapshot latest{}, previous{};
    bool hasSnapshot = false;
    bool wasOnline = false;
    bool statusPublished = false;
    uint32_t lastPublishTime = 0;
    uint32_t lastWiFiRetry = millis();

    for (;;) {
        MqttSnapshot incoming;
        if (xQueueReceive(snapshotsQueue, &incoming, 0) == pdTRUE) {
            latest = incoming;
            hasSnapshot = true;
        }

        uint32_t now = millis();
        bool online = getConnected();

        if (WiFi.status() != WL_CONNECTED && (now - lastWiFiRetry >= 20000)) {
            lastWiFiRetry = now;
            WiFi.reconnect();
        }

        if (!online) {
            wasOnline = false;
            statusPublished = false;
        } else {
            if (!statusPublished) {
                char statusPayload[256];
                snprintf(statusPayload, sizeof(statusPayload),
                    "{\"schemaVersion\":1,\"deviceId\":\"%s\",\"bootId\":\"%s\",\"online\":true}",
                    DEVICE_ID, bootId);
                statusPublished = publishRaw(STATUS_TOPIC, statusPayload, 1, true);
                if (statusPublished) {
                    Serial.println("[MQTT] [INFO] Da gui trang thai ONLINE (Retained).");
                }
            }

            bool levelChanged = (latest.alertLevel != previous.alertLevel);
            bool timeToPublish = (now - lastPublishTime >= 1500);

            if (hasSnapshot && (levelChanged || timeToPublish)) {
                if (publishState(latest)) {
                    previous = latest;
                    lastPublishTime = now;
                }
            }

            MqttAlert alert;
            while (xQueueReceive(alertsQueue, &alert, 0) == pdTRUE) {
                char alertPayload[384];
                snprintf(alertPayload, sizeof(alertPayload),
                    "{\"schemaVersion\":1,\"deviceId\":\"%s\",\"bootId\":\"%s\",\"kind\":\"alert\","
                    "\"sequence\":%u,\"uptimeMs\":%u,\"code\":\"%s\",\"gasRaw\":%u,"
                    "\"alertLevel\":%u,\"alertLevelText\":\"%s\"}",
                    DEVICE_ID, bootId, ++messageSequence, alert.uptimeMs,
                    alert.code, alert.gasRaw, alert.alertLevel, alertLevelToString(alert.alertLevel));

                publishRaw(ALERT_TOPIC, alertPayload, 1, false);
                Serial.printf("[ALERT] Da publish su kien %s len MQTT.\n", alert.code);
            }
        }

        vTaskDelay(pdMS_TO_TICKS(20));
    }
}
} // namespace

void sendAlertEvent(const char *code, uint16_t gasRaw, uint8_t alertLevel) {
    if (!alertsQueue || !code) return;
    MqttAlert alert{};
    strlcpy(alert.code, code, sizeof(alert.code));
    alert.gasRaw = gasRaw;
    alert.alertLevel = alertLevel;
    alert.uptimeMs = millis();
    xQueueSend(alertsQueue, &alert, 0);
}

// ====================================================================
// ESP-NOW CALLBACKS
// ====================================================================
void onDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    lastSendSuccess = (status == ESP_NOW_SEND_SUCCESS);
}

void setupEspNow() {
    if (esp_now_init() != ESP_OK) {
        Serial.println("[ESPNOW] [WARN] Khoi tao ESP-NOW khong thanh cong.");
        return;
    }
    Serial.println("[ESPNOW] [INFO] Khoi tao ESP-NOW thanh cong.");
    esp_now_register_send_cb(onDataSent);

    memset(&peerInfo, 0, sizeof(peerInfo));
    memcpy(peerInfo.peer_addr, RECEIVER_MAC, 6);
    peerInfo.channel = 0; // 0 = Tự động đồng bộ theo kênh Wi-Fi hiện tại của chip
    peerInfo.encrypt = false;

    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("[ESPNOW] [WARN] Khong the dang ky Peer ESP-NOW!");
    } else {
        Serial.printf("[ESPNOW] [INFO] Da dang ky Peer: %02X:%02X:%02X:%02X:%02X:%02X\n",
                      RECEIVER_MAC[0], RECEIVER_MAC[1], RECEIVER_MAC[2],
                      RECEIVER_MAC[3], RECEIVER_MAC[4], RECEIVER_MAC[5]);
    }
}

// ====================================================================
// HÀM LẤY MẪU VÀ LỌC TRUNG BÌNH TRƯỢT MQ-2
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
// MÁY TRẠNG THÁI XỬ LÝ CẢNH BÁO (KÈM HYSTERESIS)
// ====================================================================
void updateAlertState() {
    unsigned long uptime = millis();

    // 1. Kiểm tra giai đoạn sấy cảm biến (Warm-up)
    if (uptime < WARMUP_DURATION_MS) {
        currentAlertLevel = LEVEL_WARMUP;
        return;
    }

    AlertLevel previousLevel = currentAlertLevel;

    // 2. Chuyển trạng thái dựa trên ngưỡng kèm Hysteresis
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

    // Bắn sự kiện cảnh báo khẩn cấp lên topic alert
    if (currentAlertLevel != previousLevel) {
        if (currentAlertLevel == LEVEL_DANGER) {
            sendAlertEvent("GAS_LEAK_DANGER", filteredGasAdc, LEVEL_DANGER);
        } else if (currentAlertLevel == LEVEL_WARNING) {
            sendAlertEvent("GAS_LEAK_WARNING", filteredGasAdc, LEVEL_WARNING);
        } else if (previousLevel >= LEVEL_WARNING && currentAlertLevel == LEVEL_SAFE) {
            sendAlertEvent("GAS_NORMALIZED", filteredGasAdc, LEVEL_SAFE);
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
// ĐỌC CẢM BIẾN DHT11 (XỬ LÝ LỖI NAN)
// ====================================================================
void updateDhtSensor() {
    unsigned long now = millis();
    if (now - lastDhtReadTime < DHT_READ_INTERVAL_MS) return;
    lastDhtReadTime = now;

    float t = dht.readTemperature();
    float h = dht.readHumidity();

    if (isnan(t) || isnan(h)) {
        // Giữ nguyên giá trị cũ nếu đọc lỗi tạm thời
    } else {
        outPacket.temperature = t;
        outPacket.humidity    = h;
    }
}

// ====================================================================
// GỬI GÓI TIN ESP-NOW CHO MÀN HÌNH TFT
// ====================================================================
void sendEspNowPacket(bool forceSend = false) {
    unsigned long now = millis();
    if (!forceSend && (now - lastPacketSendTime < PACKET_SEND_INTERVAL)) return;
    lastPacketSendTime = now;

    outPacket.packet_id++;
    outPacket.gas_raw     = filteredGasAdc;
    outPacket.alert_level = (uint8_t)currentAlertLevel;
    outPacket.uptime_ms   = now;

    esp_now_send(RECEIVER_MAC, (uint8_t *)&outPacket, sizeof(outPacket));

    // Nếu đang dùng Broadcast {0xFF..0xFF}, 802.11 không có ACK và retransmit phần cứng.
    // Gửi thêm 1 gói burst cách 15ms để triệt tiêu hoàn toàn tỷ lệ rớt gói do nhiễu môi trường:
    bool isBroadcast = (RECEIVER_MAC[0] == 0xFF && RECEIVER_MAC[1] == 0xFF);
    if (isBroadcast) {
        delay(15);
        esp_now_send(RECEIVER_MAC, (uint8_t *)&outPacket, sizeof(outPacket));
    }
}

// ====================================================================
// ĐỒNG BỘ DỮ LIỆU SANG TASK MẠNG MQTT
// ====================================================================
void syncToMqtt() {
    if (!snapshotsQueue) return;

    unsigned long now = millis();
    bool warmingUp = (now < WARMUP_DURATION_MS);
    uint32_t warmupRem = warmingUp ? (WARMUP_DURATION_MS - now) : 0;

    MqttSnapshot s{};
    s.temperature       = outPacket.temperature;
    s.humidity          = outPacket.humidity;
    s.gasRaw            = filteredGasAdc;
    s.alertLevel        = (uint8_t)currentAlertLevel;
    s.buzzerOn          = buzzerState;
    s.isWarmingUp       = warmingUp;
    s.warmupRemainingMs = warmupRem;
    s.uptimeMs          = now;

    xQueueOverwrite(snapshotsQueue, &s);
}

// ====================================================================
// ARDUINO SETUP & LOOP
// ====================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n==================================================");
    Serial.println("  SMART KITCHEN - NODE CAM BIEN GAS, BUZZER & MQTT");
    Serial.println("==================================================");

    pinMode(PIN_BUZZER, OUTPUT);
    digitalWrite(PIN_BUZZER, LOW);

    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);

    dht.begin();
    outPacket.temperature = 25.0;
    outPacket.humidity    = 60.0;
    outPacket.packet_id   = 0;

    WiFi.persistent(false);
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.setTxPower(WIFI_POWER_19_5dBm); // Công suất sóng phát tối đa

    // Cài đặt kênh ban đầu cho ESP-NOW trước khi Wi-Fi router cấp kênh
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(ESPNOW_WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);

    setupEspNow();

    snapshotsQueue = xQueueCreate(1, sizeof(MqttSnapshot));
    alertsQueue    = xQueueCreate(16, sizeof(MqttAlert));

    snprintf(bootId, sizeof(bootId), "%08lx", (unsigned long)esp_random());
    snprintf(clientId, sizeof(clientId), "kitchen-sensor-%012llx", ESP.getEfuseMac());
    snprintf(lwtPayload, sizeof(lwtPayload),
             "{\"schemaVersion\":1,\"deviceId\":\"%s\",\"bootId\":\"%s\",\"online\":false}",
             DEVICE_ID, bootId);

    xTaskCreatePinnedToCore(networkTask, "kitchen_net", 8192, nullptr, 1, nullptr, 0);

    Serial.printf("[WARMUP] Bat dau giai doan say cam bien MQ-2 trong %u giay...\n",
                  WARMUP_DURATION_MS / 1000);
}

void loop() {
    AlertLevel previousLevel = currentAlertLevel;

    updateMq2Filter();
    updateDhtSensor();
    updateAlertState();
    updateBuzzer();

    bool levelChanged = (currentAlertLevel != previousLevel);
    sendEspNowPacket(levelChanged);

    syncToMqtt();

    static unsigned long lastLog = 0;
    if (millis() - lastLog >= 1000) {
        lastLog = millis();
        Serial.printf("[TX #%u] GasADC: %4u | T: %.1fC | H: %.1f%% | Level: %u | MQTT: %s\n",
                      outPacket.packet_id,
                      filteredGasAdc,
                      outPacket.temperature,
                      outPacket.humidity,
                      currentAlertLevel,
                      getConnected() ? "ONLINE" : "OFFLINE");
    }

    delay(20);
}
