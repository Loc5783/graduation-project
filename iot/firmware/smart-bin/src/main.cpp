// Smart bin level monitor: ESP32 + HC-SR04 + SG90 + 3 LEDs + ST7735 TFT
// See README.md for complete wiring. Never connect HC-SR04 ECHO directly to ESP32.

#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <WiFi.h>
#include <WebServer.h>
#include <PubSubClient.h>
#include "wifi_config.h"
#if __has_include("mqtt_config.h")
#include "mqtt_config.h"
#else
#define MQTT_HOST ""
#define MQTT_PORT 1883
#define MQTT_USERNAME ""
#define MQTT_PASSWORD ""
#endif

// SG90
constexpr uint8_t SERVO_PIN = 25;
constexpr uint8_t SERVO_CHANNEL = 0;
constexpr uint32_t SERVO_FREQUENCY = 50;
constexpr uint8_t SERVO_RESOLUTION = 16;
constexpr uint16_t SERVO_PERIOD_US = 20000;
constexpr uint16_t SERVO_MIN_US = 500;
constexpr uint16_t SERVO_MAX_US = 2400;
constexpr uint8_t CLOSED_ANGLE = 10;
constexpr uint8_t OPEN_ANGLE = 90;

// HC-SR04
constexpr uint8_t TRIG_PIN = 26;
constexpr uint8_t ECHO_PIN = 34;
constexpr uint32_t ECHO_TIMEOUT_US = 30000;

// Calibrate these two values after mounting the sensor inside the bin.
// EMPTY_DISTANCE_CM: distance from sensor to the bottom when the bin is empty.
// FULL_DISTANCE_CM: distance from sensor to the chosen maximum trash level.
constexpr float EMPTY_DISTANCE_CM = 30.0F;
constexpr float FULL_DISTANCE_CM = 5.0F;
constexpr float LOW_LIMIT_PERCENT = 40.0F;
constexpr float FULL_LIMIT_PERCENT = 80.0F;
constexpr float FULL_RESET_PERCENT = 75.0F;

// LEDs: GPIO -> 220-330 ohm resistor -> LED anode; LED cathode -> GND.
constexpr uint8_t LED_LOW_PIN = 27;     // green: little trash
constexpr uint8_t LED_MEDIUM_PIN = 32;  // yellow: medium trash
constexpr uint8_t LED_FULL_PIN = 33;    // red: full bin

// TFT 1.44 inch 128x128 ST7735
constexpr uint8_t TFT_SCLK = 18;
constexpr uint8_t TFT_MOSI = 23;
constexpr uint8_t TFT_CS = 5;
constexpr uint8_t TFT_DC = 16;     // TFT pin A0
constexpr uint8_t TFT_RST = 17;
Adafruit_ST7735 tft(TFT_CS, TFT_DC, TFT_RST);

bool fullAlertActive = false;
uint32_t lastScreenUpdateAt = 0;
float latestDistanceCm = -1.0F;
float latestFillPercent = 0.0F;
WebServer server(80);
WiFiClient mqttNetwork;
PubSubClient mqtt(mqttNetwork);
uint32_t lastMqttAttemptAt = 0;
uint32_t lastMqttStateAt = 0;
bool mqttStateDirty = true;
void setServoAngle(uint8_t angle);

enum class LidMode : uint8_t { Auto, Open, Closed };
LidMode lidMode = LidMode::Auto;

const char WEB_PAGE[] PROGMEM = R"HTML(
<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thùng rác thông minh</title>
<style>body{margin:0;background:#07111f;color:#eafaff;font:16px system-ui;padding:24px}
main{max-width:520px;margin:auto;background:#102237;border:1px solid #267699;border-radius:18px;padding:24px}
h1{color:#69dbff;font-size:25px}#level{font-size:50px;font-weight:700;color:#76efa0}
.bar{height:18px;background:#263b50;border-radius:12px;overflow:hidden}#fill{height:100%;width:0;background:#70eaa0}
button{border:0;border-radius:10px;padding:14px 18px;margin:7px 5px 0 0;font-weight:700;cursor:pointer}
.open{background:#62edab}.close{background:#ff8890}.auto{background:#70ceff}
#message{color:#b2c8d8;min-height:24px}</style></head><body><main>
<h1>THÙNG RÁC THÔNG MINH</h1><div id="level">--%</div><div class="bar"><div id="fill"></div></div>
<p id="sensor">Đang đọc cảm biến...</p><p id="lid">Nắp: --</p>
<button class="open" onclick="control('open')">MỞ NẮP</button>
<button class="close" onclick="control('close')">ĐÓNG NẮP</button>
<button class="auto" onclick="control('auto')">TỰ ĐỘNG</button>
<p id="message"></p></main><script>
async function refresh(){try{const r=await fetch('/api/status');const s=await r.json();
document.getElementById('level').textContent=s.sensor_ok?Math.round(s.fill_percent)+'%':'--%';
document.getElementById('fill').style.width=s.sensor_ok?s.fill_percent+'%':'0%';
document.getElementById('sensor').textContent=s.sensor_ok?'Khoảng cách: '+s.distance_cm.toFixed(1)+' cm':'Cảm biến không có tín hiệu';
document.getElementById('lid').textContent='Nắp: '+(s.lid_open?'ĐANG MỞ':'ĐANG ĐÓNG')+' | Chế độ: '+s.mode.toUpperCase();
}catch(e){document.getElementById('message').textContent='Mất kết nối với thùng rác';}}
async function control(action){try{const r=await fetch('/api/control',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'action='+encodeURIComponent(action)});
document.getElementById('message').textContent=r.ok?'Đã gửi lệnh '+action:'Không thực hiện được lệnh';refresh();
}catch(e){document.getElementById('message').textContent='Không gửi được lệnh';}}
refresh();setInterval(refresh,1500);
</script></body></html>
)HTML";

const char* modeName() {
  switch (lidMode) {
    case LidMode::Open: return "manual-open";
    case LidMode::Closed: return "manual-closed";
    default: return "auto";
  }
}

bool lidIsOpen() {
  return lidMode == LidMode::Open ||
         (lidMode == LidMode::Auto && latestDistanceCm >= 0 && fullAlertActive);
}

void applyLid() {
  setServoAngle(lidIsOpen() ? OPEN_ANGLE : CLOSED_ANGLE);
}

void onMqttCommand(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, "home/smart-bin/command") != 0 || length == 0 || length > 8) return;
  char action[9] = {0};
  memcpy(action, payload, length);
  if (strcmp(action, "open") == 0) lidMode = LidMode::Open;
  else if (strcmp(action, "close") == 0) lidMode = LidMode::Closed;
  else if (strcmp(action, "auto") == 0) lidMode = LidMode::Auto;
  else return;
  applyLid();
  mqttStateDirty = true;
  Serial.printf("MQTT bin command: %s\n", action);
}

void serviceMqtt(uint32_t now) {
  if (MQTT_HOST[0] == '\0' || WiFi.status() != WL_CONNECTED) return;
  if (!mqtt.connected()) {
    if (now - lastMqttAttemptAt < 5000) return;
    lastMqttAttemptAt = now;
    String id = "smart-bin-" + WiFi.macAddress();
    id.replace(":", "");
    const bool ok = MQTT_USERNAME[0] != '\0'
        ? mqtt.connect(id.c_str(), MQTT_USERNAME, MQTT_PASSWORD,
                       "home/smart-bin/status", 1, true, "{\"online\":false}")
        : mqtt.connect(id.c_str(), "home/smart-bin/status", 1, true, "{\"online\":false}");
    if (!ok) return;
    mqtt.subscribe("home/smart-bin/command", 1);
    mqtt.publish("home/smart-bin/status", "{\"online\":true}", true);
    mqttStateDirty = true;
  }
  mqtt.loop();
  if (mqttStateDirty || now - lastMqttStateAt >= 5000) {
    char state[192];
    snprintf(state, sizeof(state),
             "{\"sensorOk\":%s,\"distanceCm\":%.1f,\"fillPercent\":%.1f,\"lidOpen\":%s,\"mode\":\"%s\",\"uptimeMs\":%lu}",
             latestDistanceCm >= 0 ? "true" : "false", latestDistanceCm, latestFillPercent,
             lidIsOpen() ? "true" : "false", modeName(), (unsigned long)now);
    if (mqtt.publish("home/smart-bin/telemetry", state)) {
      lastMqttStateAt = now;
      mqttStateDirty = false;
    }
  }
}

void setupWeb() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(BIN_AP_SSID, BIN_AP_PASSWORD);
  WiFi.begin(BIN_WIFI_SSID, BIN_WIFI_PASSWORD);
  Serial.printf("Local web: http://%s (join %s)\n",
                WiFi.softAPIP().toString().c_str(), BIN_AP_SSID);

  server.on("/", HTTP_GET, []() {
    server.send_P(200, "text/html; charset=utf-8", WEB_PAGE);
  });
  server.on("/api/status", HTTP_GET, []() {
    const bool sensorOk = latestDistanceCm >= 0;
    String json = "{\"sensor_ok\":" + String(sensorOk ? "true" : "false") +
                  ",\"distance_cm\":" + String(latestDistanceCm, 1) +
                  ",\"fill_percent\":" + String(latestFillPercent, 1) +
                  ",\"lid_open\":" + String(lidIsOpen() ? "true" : "false") +
                  ",\"mode\":\"" + modeName() + "\"}";
    server.send(200, "application/json", json);
  });
  server.on("/api/control", HTTP_POST, []() {
    const String action = server.arg("action");
    if (action == "open") lidMode = LidMode::Open;
    else if (action == "close") lidMode = LidMode::Closed;
    else if (action == "auto") lidMode = LidMode::Auto;
    else {
      server.send(400, "application/json", "{\"error\":\"unknown action\"}");
      return;
    }
    applyLid();
    Serial.printf("Web control: %s\n", action.c_str());
    server.send(200, "application/json", "{\"ok\":true}");
  });
  server.begin();
}

uint32_t microsecondsToDuty(uint16_t pulseUs) {
  const uint32_t maxDuty = (1UL << SERVO_RESOLUTION) - 1UL;
  return (static_cast<uint64_t>(pulseUs) * maxDuty) / SERVO_PERIOD_US;
}

void setServoAngle(uint8_t angle) {
  const uint16_t pulseUs = SERVO_MIN_US +
      (static_cast<uint32_t>(angle) * (SERVO_MAX_US - SERVO_MIN_US)) / 180;
  ledcWrite(SERVO_CHANNEL, microsecondsToDuty(pulseUs));
}

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  const uint32_t durationUs = pulseIn(ECHO_PIN, HIGH, ECHO_TIMEOUT_US);
  if (durationUs == 0) return -1.0F;
  return (durationUs * 0.0343F) / 2.0F;
}

float readAverageDistanceCm() {
  float total = 0.0F;
  uint8_t validSamples = 0;

  for (uint8_t i = 0; i < 5; ++i) {
    const float distance = readDistanceCm();
    if (distance >= 2.0F && distance <= 400.0F) {
      total += distance;
      ++validSamples;
    }
    delay(25);
  }

  return validSamples == 0 ? -1.0F : total / validSamples;
}

float distanceToFillPercent(float distanceCm) {
  if (distanceCm <= FULL_DISTANCE_CM) return 100.0F;
  if (distanceCm >= EMPTY_DISTANCE_CM) return 0.0F;

  const float percent =
      (EMPTY_DISTANCE_CM - distanceCm) * 100.0F /
      (EMPTY_DISTANCE_CM - FULL_DISTANCE_CM);
  return constrain(percent, 0.0F, 100.0F);
}

void updateOutputs(float fillPercent) {
  if (fillPercent >= FULL_LIMIT_PERCENT) {
    fullAlertActive = true;
  } else if (fillPercent <= FULL_RESET_PERCENT) {
    fullAlertActive = false;
  }

  const bool lowLevel = !fullAlertActive && fillPercent < LOW_LIMIT_PERCENT;
  const bool mediumLevel = !fullAlertActive && !lowLevel;

  digitalWrite(LED_LOW_PIN, lowLevel ? HIGH : LOW);
  digitalWrite(LED_MEDIUM_PIN, mediumLevel ? HIGH : LOW);
  digitalWrite(LED_FULL_PIN, fullAlertActive ? HIGH : LOW);

  // Full: servo rotates to 90 degrees and stays there.
  // Not full: servo returns to 10 degrees.
  applyLid();
}

void drawScreen(float distanceCm, float fillPercent) {
  const uint16_t background = tft.color565(3, 10, 20);
  const uint16_t panel = tft.color565(9, 25, 42);
  const uint16_t panelShadow = tft.color565(1, 5, 12);
  const uint16_t cyan = tft.color565(0, 220, 255);
  const uint16_t cyanDark = tft.color565(0, 75, 100);
  const uint16_t green = tft.color565(15, 235, 125);
  const uint16_t yellow = tft.color565(255, 190, 25);
  const uint16_t red = tft.color565(255, 45, 65);
  const uint16_t muted = tft.color565(105, 135, 155);

  const bool sensorOk = distanceCm >= 0;
  const uint16_t levelColor = !sensorOk ? red :
      (fullAlertActive ? red : (fillPercent < LOW_LIMIT_PERCENT ? green : yellow));

  tft.fillScreen(background);
  tft.setTextWrap(false);

  // Neon header with a small 3D shadow.
  tft.fillRoundRect(6, 5, 118, 20, 5, panelShadow);
  tft.fillRoundRect(4, 3, 118, 20, 5, panel);
  tft.drawRoundRect(4, 3, 118, 20, 5, cyanDark);
  tft.fillCircle(13, 13, 4, sensorOk ? green : red);
  tft.setTextColor(cyan);
  tft.setTextSize(1);
  tft.setCursor(23, 10);
  tft.print("SMART WASTE BIN");

  // 3D bin shadow and right-side depth face.
  tft.fillRoundRect(10, 35, 52, 81, 6, panelShadow);
  tft.fillTriangle(57, 36, 66, 31, 66, 104, cyanDark);
  tft.fillTriangle(57, 36, 57, 110, 66, 104, cyanDark);

  // Main bin body.
  tft.fillRoundRect(7, 31, 52, 81, 6, panel);
  tft.drawRoundRect(7, 31, 52, 81, 6, cyan);
  tft.fillRoundRect(4, 27, 58, 11, 4, panelShadow);
  tft.fillRoundRect(3, 25, 58, 11, 4, tft.color565(18, 48, 68));
  tft.drawRoundRect(3, 25, 58, 11, 4, cyan);
  tft.drawFastHLine(13, 28, 37, tft.color565(110, 245, 255));

  // Inner chamber and animated fill level.
  tft.fillRect(14, 42, 38, 62, tft.color565(1, 7, 13));
  tft.drawRect(13, 41, 40, 65, cyanDark);
  if (sensorOk) {
    const int fillHeight = static_cast<int>((60.0F * fillPercent) / 100.0F);
    if (fillHeight > 0) {
      const int fillTop = 103 - fillHeight;
      tft.fillRect(15, fillTop, 36, fillHeight, levelColor);
      tft.drawFastHLine(15, fillTop, 36, ST77XX_WHITE);
      tft.drawFastHLine(17, fillTop + 2, 29, tft.color565(180, 255, 230));
    }
  }

  // Percentage and status card.
  tft.setTextColor(muted);
  tft.setTextSize(1);
  tft.setCursor(70, 31);
  tft.print("CAPACITY");
  tft.fillRoundRect(68, 41, 58, 25, 5, panel);
  tft.drawRoundRect(68, 41, 58, 25, 5, levelColor);
  tft.setCursor(sensorOk && fillPercent < 100.0F ? 76 : 71, 47);
  tft.setTextSize(2);
  tft.setTextColor(levelColor);
  if (!sensorOk) {
    tft.setTextSize(1);
    tft.setCursor(75, 50);
    tft.print("NO ECHO");
  } else {
    tft.printf("%.0f%%", fillPercent);
  }

  tft.fillRoundRect(68, 71, 58, 19, 5, levelColor);
  tft.setTextColor(background);
  tft.setTextSize(1);
  tft.setCursor(74, 77);
  if (!sensorOk) {
    tft.print("SENSOR ERR");
  } else if (fullAlertActive) {
    tft.print("BIN FULL!");
  } else if (fillPercent < LOW_LIMIT_PERCENT) {
    tft.print("LEVEL LOW");
  } else {
    tft.print("MEDIUM");
  }

  tft.setTextColor(muted);
  tft.setCursor(70, 95);
  if (sensorOk) {
    tft.printf("DIST %.1fcm", distanceCm);
  } else {
    tft.print("CHECK WIRE");
  }

  // Three dashboard lamps mirror the real LEDs.
  tft.setCursor(72, 108);
  tft.print("L");
  tft.setCursor(94, 108);
  tft.print("M");
  tft.setCursor(116, 108);
  tft.print("F");
  tft.fillCircle(75, 121, 5, sensorOk && !fullAlertActive &&
                 fillPercent < LOW_LIMIT_PERCENT ? green : cyanDark);
  tft.fillCircle(97, 121, 5, sensorOk && !fullAlertActive &&
                 fillPercent >= LOW_LIMIT_PERCENT ? yellow : cyanDark);
  tft.fillCircle(119, 121, 5, sensorOk && fullAlertActive ? red : cyanDark);

  // Flashing alert frame when full.
  if (fullAlertActive && ((millis() / 400) % 2 == 0)) {
    tft.drawRect(0, 0, 128, 128, red);
    tft.drawRect(1, 1, 126, 126, red);
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  pinMode(LED_LOW_PIN, OUTPUT);
  pinMode(LED_MEDIUM_PIN, OUTPUT);
  pinMode(LED_FULL_PIN, OUTPUT);
  digitalWrite(LED_LOW_PIN, LOW);
  digitalWrite(LED_MEDIUM_PIN, LOW);
  digitalWrite(LED_FULL_PIN, LOW);

  ledcSetup(SERVO_CHANNEL, SERVO_FREQUENCY, SERVO_RESOLUTION);
  ledcAttachPin(SERVO_PIN, SERVO_CHANNEL);
  setServoAngle(CLOSED_ANGLE);

  SPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
  tft.initR(INITR_144GREENTAB);
  tft.setRotation(2);
  drawScreen(-1.0F, 0.0F);

  setupWeb();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttCommand);

  Serial.println("Smart bin level monitor started");
}

void loop() {
  server.handleClient();
  const uint32_t now = millis();
  const float distanceCm = readAverageDistanceCm();
  const float fillPercent = distanceCm < 0 ? 0.0F : distanceToFillPercent(distanceCm);
  latestDistanceCm = distanceCm;
  latestFillPercent = fillPercent;
  serviceMqtt(now);

  if (distanceCm >= 0) {
    updateOutputs(fillPercent);
  } else {
    digitalWrite(LED_LOW_PIN, LOW);
    digitalWrite(LED_MEDIUM_PIN, LOW);
    digitalWrite(LED_FULL_PIN, LOW);
    applyLid();
  }

  if (now - lastScreenUpdateAt >= 500) {
    lastScreenUpdateAt = now;
    drawScreen(distanceCm, fillPercent);
    if (distanceCm >= 0) {
      Serial.printf("Distance: %.1f cm | Fill: %.0f%% | Level: %s\n",
                    distanceCm, fillPercent,
                    fullAlertActive ? "FULL" :
                    (fillPercent < LOW_LIMIT_PERCENT ? "LOW" : "MEDIUM"));
    } else {
      Serial.println("No echo: check HC-SR04 wiring");
    }
  }
  server.handleClient();
  static bool wasConnected = false;
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wasConnected) {
    Serial.printf("Wi-Fi web: http://%s\n", WiFi.localIP().toString().c_str());
  }
  wasConnected = connected;
}
