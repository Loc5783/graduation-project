#include "RealtimeMqtt.h"
#include "network_config.h"
#include <WiFi.h>
#include <mqtt_client.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

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
char firmwareStr[64];
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

bool publishState(const EnvironmentSnapshot &s) {
    char payload[768];
    int rssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0;

    int n = snprintf(payload, sizeof(payload),
        "{\"schemaVersion\":1,\"deviceId\":\"%s\",\"bootId\":\"%s\",\"kind\":\"state\","
        "\"sequence\":%u,\"uptimeMs\":%u,\"data\":{"
        "\"temperature\":%.1f,\"humidity\":%.1f,\"gasRaw\":%u,"
        "\"alertLevel\":%u,\"alertLevelText\":\"%s\","
        "\"buzzerOn\":%s,\"isWarmingUp\":%s,\"warmupRemainingMs\":%u,"
        "\"wifiRssi\":%d,\"firmware\":\"%s\"}}",
        DEVICE_ID, bootId, ++messageSequence, s.uptimeMs,
        s.temperature, s.humidity, s.gasRaw,
        s.alertLevel, alertLevelToString(s.alertLevel),
        s.buzzerOn ? "true" : "false",
        s.isWarmingUp ? "true" : "false",
        s.warmupRemainingMs,
        rssi, firmwareStr);

    if (n <= 0 || (size_t)n >= sizeof(payload)) return false;
    return publishRaw(TELEMETRY_TOPIC, payload, 0, false);
}

void networkTask(void *) {
    Serial.printf("[NETWORK] Bat dau ket noi Wi-Fi: %s ...\n", ENV_WIFI_SSID);
    WiFi.persistent(false);
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(ENV_WIFI_SSID, ENV_WIFI_PASSWORD);

    esp_mqtt_client_config_t mqttCfg{};
    mqttCfg.uri = ENV_MQTT_URI;
    mqttCfg.client_id = clientId;
    if (strlen(ENV_MQTT_USERNAME) > 0) mqttCfg.username = ENV_MQTT_USERNAME;
    if (strlen(ENV_MQTT_PASSWORD) > 0) mqttCfg.password = ENV_MQTT_PASSWORD;
    mqttCfg.lwt_topic = STATUS_TOPIC;
    mqttCfg.lwt_msg = lwtPayload;
    mqttCfg.lwt_qos = 1;
    mqttCfg.lwt_retain = 1;
    mqttCfg.keepalive = 15;
    mqttCfg.reconnect_timeout_ms = 3000;
    mqttCfg.network_timeout_ms = 2500;
    mqttCfg.task_stack = 6144;

    mqttClient = esp_mqtt_client_init(&mqttCfg);
    if (!mqttClient ||
        esp_mqtt_client_register_event(mqttClient, MQTT_EVENT_ANY, mqttEventHandler, nullptr) != ESP_OK ||
        esp_mqtt_client_start(mqttClient) != ESP_OK) {
        Serial.println("[NETWORK] [FATAL] Khoi tao MQTT that bai! Sensor van tiep tuc chay offline.");
        if (mqttClient) {
            esp_mqtt_client_destroy(mqttClient);
            mqttClient = nullptr;
        }
        vTaskDelete(nullptr);
        return;
    }

    EnvironmentSnapshot latest{}, previous{};
    bool hasSnapshot = false;
    bool wasOnline = false;
    bool statusPublished = false;
    uint32_t lastPublishTime = 0;
    uint32_t lastWiFiRetry = millis();

    for (;;) {
        EnvironmentSnapshot incoming;
        if (xQueueReceive(snapshotsQueue, &incoming, 0) == pdTRUE) {
            latest = incoming;
            hasSnapshot = true;
        }

        uint32_t now = millis();
        bool online = getConnected();

        if (WiFi.status() != WL_CONNECTED && (now - lastWiFiRetry >= 10000)) {
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

            EnvironmentAlert alert;
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

void realtimeMqttBegin(const char *firmwareVersion) {
    snapshotsQueue = xQueueCreate(1, sizeof(EnvironmentSnapshot));
    alertsQueue    = xQueueCreate(16, sizeof(EnvironmentAlert));

    if (!snapshotsQueue || !alertsQueue) {
        Serial.println("[NETWORK] [ERROR] Khong tao duoc Queue FreeRTOS!");
        return;
    }

    snprintf(bootId, sizeof(bootId), "%08lx", (unsigned long)esp_random());
    snprintf(clientId, sizeof(clientId), "env-sensor-%012llx", ESP.getEfuseMac());
    strlcpy(firmwareStr, firmwareVersion ? firmwareVersion : "1.0.0", sizeof(firmwareStr));

    snprintf(lwtPayload, sizeof(lwtPayload),
             "{\"schemaVersion\":1,\"deviceId\":\"%s\",\"bootId\":\"%s\",\"online\":false}",
             DEVICE_ID, bootId);

    xTaskCreatePinnedToCore(
        networkTask,
        "env_network_task",
        8192,
        nullptr,
        1,
        nullptr,
        0
    );
}

void realtimeMqttSendSnapshot(const EnvironmentSnapshot &snapshot) {
    if (snapshotsQueue) {
        xQueueOverwrite(snapshotsQueue, &snapshot);
    }
}

void realtimeMqttSendAlert(const char *code, uint16_t gasRaw, uint8_t alertLevel) {
    if (!alertsQueue || !code) return;

    EnvironmentAlert alert{};
    strlcpy(alert.code, code, sizeof(alert.code));
    alert.gasRaw = gasRaw;
    alert.alertLevel = alertLevel;
    alert.uptimeMs = millis();

    xQueueSend(alertsQueue, &alert, 0);
}

bool realtimeMqttIsConnected() {
    return getConnected();
}

