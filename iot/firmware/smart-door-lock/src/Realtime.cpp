#include "Realtime.h"
#include "DeviceConfig.h"
#include <WiFi.h>
#include <ArduinoJson.h>
#include <mqtt_client.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

namespace {
constexpr char DEVICE[] = "smart-door-lock";
constexpr char STATUS_TOPIC[] = "home/smart-door-lock/status";
constexpr char TELEMETRY_TOPIC[] = "home/smart-door-lock/telemetry";
constexpr size_t MAX_OUTBOX_BYTES = 8192;
struct Event { char code[48]; uint32_t uptimeMs; };
QueueHandle_t snapshots = nullptr, events = nullptr;
esp_mqtt_client_handle_t client = nullptr;
portMUX_TYPE guard = portMUX_INITIALIZER_UNLOCKED;
bool mqttConnected = false;
uint32_t dropped = 0, sequence = 0;
char bootId[9], clientId[40], firmwareVersion[64], willMessage[160];

void countDrop() { portENTER_CRITICAL(&guard); ++dropped; portEXIT_CRITICAL(&guard); }
bool connected() { portENTER_CRITICAL(&guard); bool value = mqttConnected; portEXIT_CRITICAL(&guard); return value; }
uint32_t dropCount() { portENTER_CRITICAL(&guard); uint32_t value = dropped; portEXIT_CRITICAL(&guard); return value; }

void mqttEvent(void *, esp_event_base_t, int32_t eventId, void *) {
  if(eventId == MQTT_EVENT_CONNECTED || eventId == MQTT_EVENT_DISCONNECTED || eventId == MQTT_EVENT_ERROR) {
    portENTER_CRITICAL(&guard);
    mqttConnected = eventId == MQTT_EVENT_CONNECTED;
    portEXIT_CRITICAL(&guard);
  }
  // Read-only telemetry: no command subscription, no remote actuator callbacks.
}

void envelope(JsonDocument &doc, const char *kind, uint32_t uptimeMs) {
  doc["schemaVersion"] = 1;
  doc["deviceId"] = DEVICE;
  doc["bootId"] = bootId;
  doc["kind"] = kind;
  doc["sequence"] = ++sequence;
  doc["uptimeMs"] = uptimeMs;
}

bool send(JsonDocument &doc, const char *topic, int qos, bool retained) {
  if(!connected() || esp_mqtt_client_get_outbox_size(client) > MAX_OUTBOX_BYTES) return false;
  char payload[3072];
  if(doc.overflowed() || measureJson(doc) >= sizeof(payload)) return false;
  size_t length = serializeJson(doc, payload, sizeof(payload));
  return esp_mqtt_client_enqueue(client, topic, payload, length, qos, retained, true) >= 0;
}

bool publishState(const DoorSnapshot &s) {
  StaticJsonDocument<2560> doc;
  envelope(doc, "state", s.uptimeMs);
  JsonObject d = doc.createNestedObject("data");
  const char *bolts[] = {"unknown", "locking", "locked", "unlocking", "unlocked"};
  d["doorOpen"] = s.doorOpen; d["doorRaw"] = s.doorRaw;
  d["boltCommand"] = bolts[s.boltCommand <= 4 ? s.boltCommand : 0];
  d["boltCommandCompleted"] = s.boltCommandCompleted;
  d["boltFeedbackAvailable"] = false;
  d["servoPwmReady"] = s.servoPwmReady; d["servoPulseUs"] = s.servoPulseUs;
  d["insidePressed"] = s.insidePressed; d["cdsRaw"] = s.cdsRaw;
  JsonObject vibration = d.createNestedObject("vibration");
  vibration["installed"] = s.vibrationInstalled;
  if(s.vibrationInstalled) vibration["raw"] = s.vibrationRaw;
  else vibration["raw"] = nullptr;
  if(s.vibrationInstalled && s.vibrationCalibrated) vibration["active"] = s.vibrationActive;
  else vibration["active"] = nullptr;
  vibration["triggerCount"] = s.vibrationCount;
  d["buzzerOn"] = s.buzzerOn; d["forcedOpen"] = s.forcedOpen; d["heldOpen"] = s.heldOpen;
  d["pinConfigured"] = s.pinConfigured; d["pinLockout"] = s.pinLockout;
  d["pinLockoutRemainingMs"] = s.pinLockoutRemainingMs; d["failedPinAttempts"] = s.failedPinAttempts;
  d["adminActive"] = s.adminActive; d["rfidDetected"] = s.rfidDetected; d["rfidCards"] = s.rfidCards;
  d["fingerprintOnline"] = s.fingerprintOnline; d["fingerprintBusy"] = s.fingerprintBusy;
  d["fingerprintCount"] = s.fingerprintCount; d["keypadConfigured"] = true;
  d["oledDetected"] = s.oledDetected; d["oledAddress"] = s.oledAddress;
  d["oledDriver"] = s.sh1106 ? "SH1106" : "SSD1306";
  d["nvsReady"] = s.nvsReady; d["fsReady"] = s.fsReady;
  d["wifiRssi"] = constrain(WiFi.RSSI(), -127, 0);
  d["droppedEvents"] = dropCount(); d["firmware"] = firmwareVersion;
  return send(doc, TELEMETRY_TOPIC, 0, false);
}

void networkTask(void *) {
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(SDL_WIFI_SSID, SDL_WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org"); // Asynchronous; control loop never waits for UTC.
  esp_mqtt_client_config_t config{};
  config.uri = SDL_MQTT_URI; config.client_id = clientId;
  config.username = strlen(SDL_MQTT_USERNAME) ? SDL_MQTT_USERNAME : nullptr;
  config.password = strlen(SDL_MQTT_PASSWORD) ? SDL_MQTT_PASSWORD : nullptr;
  config.cert_pem = strlen(SDL_MQTT_CA_CERT) ? SDL_MQTT_CA_CERT : nullptr;
  config.lwt_topic = STATUS_TOPIC; config.lwt_msg = willMessage;
  config.lwt_qos = 1; config.lwt_retain = 1;
  config.keepalive = 10; config.reconnect_timeout_ms = 3000;
  config.network_timeout_ms = 2000; config.task_stack = 6144;
  client = esp_mqtt_client_init(&config);
  if(!client || esp_mqtt_client_register_event(client, MQTT_EVENT_ANY, mqttEvent, nullptr) != ESP_OK ||
      esp_mqtt_client_start(client) != ESP_OK) {
    Serial.println("NETWORK INIT FAILED; LOCAL LOCK CONTINUES");
    if(client) { esp_mqtt_client_destroy(client); client = nullptr; }
    vTaskDelete(nullptr); return;
  }
  DoorSnapshot latest{}, previous{};
  bool haveState = false, wasConnected = false, published = false, statusSent = false;
  uint32_t lastPublish = 0, lastWiFiRetry = millis();
  for(;;) {
    DoorSnapshot incoming;
    if(xQueueReceive(snapshots, &incoming, 0) == pdTRUE) { latest = incoming; haveState = true; }
    uint32_t now = millis();
    bool online = connected();
    if(WiFi.status() != WL_CONNECTED && now - lastWiFiRetry >= 10000) {
      lastWiFiRetry = now; WiFi.reconnect();
    }
    if(!online) { wasConnected = false; statusSent = false; }
    else {
      if(!wasConnected) { published = false; wasConnected = true; }
      if(!statusSent) {
        StaticJsonDocument<256> status;
        status["schemaVersion"] = 1; status["deviceId"] = DEVICE;
        status["bootId"] = bootId; status["online"] = true;
        statusSent = send(status, STATUS_TOPIC, 1, true);
      }
      // Ignore uptime for change detection; heartbeat still publishes every 2s.
      DoorSnapshot comparable = latest; comparable.uptimeMs = previous.uptimeMs;
      bool changed = memcmp(&comparable, &previous, sizeof(latest)) != 0;
      // A healthy MQTT task must not keep stale sensor readings alive if the
      // control loop stopped producing snapshots (e.g. deliberate FS maintenance).
      if(haveState && now-latest.uptimeMs<1000 &&
          (!published || now-lastPublish >= 2000 || (changed && now-lastPublish >= 100))) {
        if(publishState(latest)) { previous = latest; lastPublish = now; published = true; }
      }
      // Bounded burst: events never starve state snapshots or consume unbounded heap.
      Event event;
      for(uint8_t i=0; i<4 && esp_mqtt_client_get_outbox_size(client)<=MAX_OUTBOX_BYTES &&
          xQueueReceive(events, &event, 0)==pdTRUE; ++i) {
        StaticJsonDocument<384> doc; envelope(doc, "event", event.uptimeMs); doc["code"] = event.code;
        if(!send(doc, TELEMETRY_TOPIC, 1, false)) countDrop();
      }
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}
}

void realtimeBegin(const char *firmware) {
  snapshots = xQueueCreate(1, sizeof(DoorSnapshot));
  events = xQueueCreate(32, sizeof(Event));
  if(!snapshots || !events) { Serial.println("NETWORK QUEUE FAILED; LOCAL LOCK CONTINUES"); return; }
  if(!strlen(SDL_WIFI_SSID) || !strlen(SDL_MQTT_URI)) {
    Serial.println("NETWORK UNCONFIGURED: COPY include/network_config.example.h TO network_config.h"); return;
  }
  if(strncmp(SDL_MQTT_URI, "mqtts://", 8)==0 && !strlen(SDL_MQTT_CA_CERT)) {
    Serial.println("NETWORK CONFIG ERROR: MQTT TLS REQUIRES CA CERTIFICATE"); return;
  }
  snprintf(bootId, sizeof(bootId), "%08lx", (unsigned long)esp_random());
  snprintf(clientId, sizeof(clientId), "sdl-%012llx", ESP.getEfuseMac());
  strlcpy(firmwareVersion, firmware, sizeof(firmwareVersion));
  snprintf(willMessage, sizeof(willMessage),
      "{\"schemaVersion\":1,\"deviceId\":\"smart-door-lock\",\"bootId\":\"%s\",\"online\":false}", bootId);
  if(xTaskCreatePinnedToCore(networkTask, "door-network", 12288, nullptr, 1, nullptr, 0)!=pdPASS)
    Serial.println("NETWORK TASK FAILED; LOCAL LOCK CONTINUES");
}

void realtimeSnapshot(const DoorSnapshot &snapshot) {
  if(snapshots) xQueueOverwrite(snapshots, &snapshot);
}

void realtimeEvent(const char *code) {
  if(!events || !code) return;
  size_t n = strlen(code);
  if(n==0 || n>=sizeof(Event::code)) return;
  for(size_t i=0; i<n; ++i) if((code[i]<'A'||code[i]>'Z') && code[i]!='_' && (code[i]<'0'||code[i]>'9')) return;
  Event event{}; strlcpy(event.code, code, sizeof(event.code)); event.uptimeMs = millis();
  if(xQueueSend(events, &event, 0)!=pdTRUE) countDrop();
}
