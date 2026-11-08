#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "config.h"

/* ==========================================================================
   BIẾN TRẠNG THÁI HỆ THỐNG
   ========================================================================== */

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Trạng thái Rơ-le 1 (Bóng LED 5mm / Đèn)
bool isRelayOn = false;
bool isRelayActiveLow = DEFAULT_RELAY_ACTIVE_LOW;

// Trạng thái Rơ-le 2 (Quạt làm mát 5V 0.2A)
bool isFanOn = false;

// Trạng thái cảm biến ánh sáng (Chân DO trên D34)
bool isRoomDark = false;
int lightPercent = 75;
bool invertLightLogic = false;

// Bộ tích phân chống nhiễu động cơ quạt & lọc xung đa số
int darkIntegrator = 0;
unsigned long lastAutoActionTime = 0;
const unsigned long AUTO_ACTION_COOLDOWN_MS = 1000; // 1 giây giãn cách chống lặp quang học

// Chế độ "Tự động khi tối" (khớp với Web Dashboard)
bool isAutoMode = DEFAULT_AUTO_MODE;

// Đèn LED xanh tích hợp trên thân kit ESP32
const int ONBOARD_LED = 2;

// Quản lý thời gian không chặn (Non-blocking Timers)
unsigned long lastTelemetryTime = 0;
unsigned long lastMqttRetryTime = 0;
unsigned long lastSensorReadTime = 0;
unsigned long lastWiFiRetryTime = 0;

// Chống rung nút bấm vật lý (GPIO 13)
int lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

/* ==========================================================================
   KHAI BÁO NGUYÊN MẪU HÀM
   ========================================================================== */
void setupHardware();
void setupWiFi();
void connectMQTT();
void setRelayState(bool on, const char* source = "MANUAL");
void setFanState(bool on, const char* source = "MANUAL");
bool sampleLightSensorRaw();
void readLightSensor();
void handleAutoLighting();
void handleButton();
void onMqttMessage(char* topic, byte* payload, unsigned int length);
void publishStatus();
void publishTelemetry();
void processSerialCommands();
void printSystemStatus();

/* ==========================================================================
   HÀM SETUP (CHẠY 1 LẦN KHI KHỞI ĐỘNG)
   ========================================================================== */
void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  delay(1000);

  Serial.println("\n========================================================");
  Serial.println("  SMART PLUG FIRMWARE - ESP32 NODE MCU");
  Serial.println("  Nguoi phu trach: Nhat Anh (smart-plug)");
  Serial.println("  - Relay (LED 5mm) : GPIO D27");
  Serial.println("  - Cam bien quang tro : GPIO D34 (Chan DO)");
  Serial.println("  - Nut bam vat ly  : GPIO D13");
  Serial.printf("  - Wi-Fi Hotspot   : %s\n", WIFI_SSID);
  Serial.printf("  - MQTT Broker     : %s:%d\n", MQTT_SERVER, MQTT_PORT);
  Serial.println("========================================================\n");

  // 1. Cấu hình chân phần cứng
  setupHardware();

  // 2. Kết nối Wi-Fi Hotspot của Laptop
  setupWiFi();

  // 3. Cấu hình MQTT Broker
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);

  Serial.println("[SYSTEM] He thong da khoi tao san sang!");
  Serial.printf("[AUTO] Tinh nang 'Tu dong khi toi' mac dinh: %s\n", isAutoMode ? "BAT (Che tay den se tu sang)" : "TAT");
  Serial.println("[TIP] Lenh test qua Serial Monitor:");
  Serial.println("      - 'ON'     : Bat nguon (Den LED Sang)");
  Serial.println("      - 'OFF'    : Tat nguon (Den LED Tat)");
  Serial.println("      - 'AUTO'   : Bat/Tat tu dong khi toi");
  Serial.println("      - 'INVERT' : Doi muc kich Relay (LOW <-> HIGH)");
  Serial.println("      - 'STAT'   : Xem trang thai toan bo he thong\n");
}

/* ==========================================================================
   HÀM LOOP (CHẠY LẶP LIÊN TỤC)
   ========================================================================== */
void loop() {
  unsigned long currentMillis = millis();

  // 1. Duy trì kết nối Wi-Fi & MQTT (Non-blocking)
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      if (currentMillis - lastMqttRetryTime > 5000) {
        lastMqttRetryTime = currentMillis;
        connectMQTT();
      }
    } else {
      mqttClient.loop();
    }
  } else {
    // Tự động kích hoạt kết nối lại Wi-Fi mỗi 10 giây khi mất mạng
    if (currentMillis - lastWiFiRetryTime > 10000) {
      lastWiFiRetryTime = currentMillis;
      Serial.println("[WIFI] Mat ket noi Wi-Fi. Dang thu ket noi lai...");
      WiFi.reconnect();
    }
  }

  // 2. Đọc cảm biến ánh sáng mỗi 300ms
  if (currentMillis - lastSensorReadTime >= 300) {
    lastSensorReadTime = currentMillis;
    readLightSensor();
    handleAutoLighting();
  }

  // 3. Báo cáo Telemetry lên Web mỗi 2 giây
  if (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;
    publishTelemetry();
  }

  // 4. Lắng nghe lệnh điều khiển từ USB Serial
  processSerialCommands();
}

/* ==========================================================================
   CÁC HÀM XỬ LÝ PHẦN CỨNG
   ========================================================================== */

bool sampleLightSensorRaw() {
  // Lọc nhiễu động cơ quạt: lấy 15 mẫu cực nhanh trong 3ms và dùng cơ chế đa số (Majority Vote)
  int darkVotes = 0;
  for (int i = 0; i < 15; i++) {
    if (digitalRead(PIN_CDS_DO) == SENSOR_DARK_LEVEL) {
      darkVotes++;
    }
    delayMicroseconds(200);
  }
  bool rawDark = (darkVotes >= 8);
  if (invertLightLogic) {
    rawDark = !rawDark;
  }
  return rawDark;
}

void setupHardware() {
  // Cấu hình chân Rơ-le 1 (D27 - Đèn)
  pinMode(PIN_RELAY, OUTPUT);

  // Cấu hình chân Rơ-le 2 (D26 - Quạt làm mát 5V)
  pinMode(PIN_RELAY_FAN, OUTPUT);

  // Đèn LED trên thân ESP32 (GPIO 2)
  pinMode(ONBOARD_LED, OUTPUT);

  // Cấu hình chân cảm biến DO (D34 là Input-only trên ESP32)
  pinMode(PIN_CDS_DO, INPUT);

  // Đọc cảm biến ban đầu bằng bộ lọc đa số (Majority vote)
  isRoomDark = sampleLightSensorRaw();
  lightPercent = isRoomDark ? 20 : 75;
  darkIntegrator = isRoomDark ? 6 : 0;

  // Khởi tạo Rơ-le ở trạng thái ban đầu an toàn
  setFanState(false, "INIT");
  if (isAutoMode && isRoomDark) {
    setRelayState(true, "INIT_AUTO");
  } else {
    setRelayState(false, "INIT");
  }

  Serial.println("[HARDWARE] Da cau hinh Relay 1 (D27), Relay 2 (D26), Sensor (D34) thanh cong.");
}

void setRelayState(bool on, const char* source) {
  isRelayOn = on;

  pinMode(PIN_RELAY, OUTPUT);
  int pinLevel;
  if (isRelayActiveLow) {
    pinLevel = isRelayOn ? LOW : HIGH;
  } else {
    pinLevel = isRelayOn ? HIGH : LOW;
  }
  digitalWrite(PIN_RELAY, pinLevel);

  // Đồng bộ đèn LED xanh trên thân ESP32 để người dùng nhìn thấy trực tiếp
  digitalWrite(ONBOARD_LED, isRelayOn ? HIGH : LOW);

  Serial.printf("[RELAY] [%s] -> %s (D27: %s, Kich: %s)\n",
                source,
                isRelayOn ? "BAT NGUON (Den LED Sang)" : "TAT NGUON (Den LED Tat)",
                pinLevel == HIGH ? "HIGH (3.3V)" : "LOW (0V)",
                isRelayActiveLow ? "Active-LOW" : "Active-HIGH");

  if (mqttClient.connected()) {
    publishStatus();
  }
}

void setFanState(bool on, const char* source) {
  isFanOn = on;

  if (isFanOn) {
    pinMode(PIN_RELAY_FAN, OUTPUT);
    digitalWrite(PIN_RELAY_FAN, LOW); // Kéo xuống 0V để đóng rơ-le bật quạt
  } else {
    pinMode(PIN_RELAY_FAN, INPUT);    // Chuyển sang ngõ vào Hi-Z để triệt tiêu dòng rò 1.7V, ngắt relay dứt khoát
  }

  Serial.printf("[FAN] [%s] -> %s (D26: %s)\n",
                source,
                isFanOn ? "BAT QUAT 5V (Quat Dang Quay)" : "TAT QUAT 5V (Quat Da Dung)",
                isFanOn ? "OUTPUT LOW (0V)" : "INPUT Hi-Z (Triet dong ro)");

  if (mqttClient.connected()) {
    publishStatus();
  }
}

void readLightSensor() {
  bool rawDark = sampleLightSensorRaw();

  // Bộ tích phân chống nhiễu động cơ quạt (Leaky Integrator: dải 0 - 6)
  // Ngay cả khi quạt quay tạo xung nhiễu nguồn, 1 xung lẻ không thể xóa sạch bộ đếm
  if (rawDark) {
    if (darkIntegrator < 6) darkIntegrator++;
  } else {
    if (darkIntegrator > 0) darkIntegrator--;
  }

  bool confirmedDark = isRoomDark;
  if (darkIntegrator >= 4) {
    confirmedDark = true;
  } else if (darkIntegrator <= 2) {
    confirmedDark = false;
  }

  // Khi môi trường ánh sáng thay đổi ổn định
  if (confirmedDark != isRoomDark) {
    isRoomDark = confirmedDark;
    lightPercent = isRoomDark ? 20 : 75; // Đồng bộ phần trăm sáng lên Web
    Serial.printf("[SENSOR] Anh sang thay doi on dinh: %s (DO=%d, %d%%)\n",
                  isRoomDark ? "PHONG TOI" : "PHONG SANG",
                  digitalRead(PIN_CDS_DO), lightPercent);

    if (mqttClient.connected()) {
      publishTelemetry();
    }
  }
}

void handleAutoLighting() {
  if (!isAutoMode) return;

  // Tự động kiểm soát trạng thái đèn khi chế độ Auto đang bật (chống trễ kể cả khi quạt đang quay)
  if (millis() - lastAutoActionTime >= AUTO_ACTION_COOLDOWN_MS) {
    if (isRoomDark && !isRelayOn) {
      Serial.println("[AUTO] Phong toi -> Tu dong BAT den LED.");
      lastAutoActionTime = millis();
      setRelayState(true, "AUTO");
    } else if (!isRoomDark && isRelayOn) {
      Serial.println("[AUTO] Phong da sang -> Tu dong TAT den LED.");
      lastAutoActionTime = millis();
      setRelayState(false, "AUTO");
    }
  }
}

void handleButton() {
  int reading = digitalRead(PIN_BUTTON);
  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    static int buttonState = HIGH;
    if (reading != buttonState) {
      buttonState = reading;
      if (buttonState == LOW) { // Nhấn nút xuống GND
        Serial.println("[BUTTON] Da nhan nut vat ly D13 -> Dao trang thai Relay.");
        isAutoMode = false; // Tạm ngắt Auto để ưu tiên lệnh bấm tay của người dùng
        setRelayState(!isRelayOn, "BUTTON_PHYSICAL");
      }
    }
  }
  lastButtonState = reading;
}

/* ==========================================================================
   CÁC HÀM GIAO TIẾP MẠNG (WI-FI & MQTT)
   ========================================================================== */

void setupWiFi() {
  Serial.printf("[WIFI] Dang ket noi Hotspot: %s ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WIFI] Ket noi thanh cong! IP ESP32: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WIFI] Khong the ket noi Wi-Fi luc nay (ESP32 van chay offline qua USB).");
  }
}

void connectMQTT() {
  Serial.printf("[MQTT] Dang ket noi Broker: %s:%d ...\n", MQTT_SERVER, MQTT_PORT);

  // Tạo Client ID động từ 4 ký tự cuối MAC Wi-Fi chống trùng lặp kết nối trên broker công cộng
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  String clientId = String(MQTT_CLIENT_PREFIX) + (mac.length() >= 4 ? mac.substring(mac.length() - 4) : "01");
  Serial.printf("[MQTT] Client ID: %s\n", clientId.c_str());

  if (mqttClient.connect(clientId.c_str())) {
    Serial.println("[MQTT] Ket noi Broker thanh cong!");
    mqttClient.subscribe(TOPIC_COMMAND);
    Serial.printf("[MQTT] Da dang ky lang nghe kenh: %s\n", TOPIC_COMMAND);
    publishStatus();
  } else {
    Serial.printf("[MQTT] Ket noi that bai (rc=%d). Se thu lai sau 5s.\n", mqttClient.state());
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  message.trim();

  Serial.printf("[MQTT-IN] Nhan lenh tu Web: %s\n", message.c_str());

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, message);

  if (!error) {
    if (doc["relay"].is<const char*>()) {
      const char* rState = doc["relay"];
      if (strcasecmp(rState, "ON") == 0) setRelayState(true, "WEB_MQTT");
      else if (strcasecmp(rState, "OFF") == 0) setRelayState(false, "WEB_MQTT");
    }
    if (doc["fan"].is<const char*>()) {
      const char* fState = doc["fan"];
      if (strcasecmp(fState, "ON") == 0) setFanState(true, "WEB_MQTT");
      else if (strcasecmp(fState, "OFF") == 0) setFanState(false, "WEB_MQTT");
    }
    if (doc["auto"].is<bool>()) {
      bool newAuto = doc["auto"].as<bool>();
      isAutoMode = newAuto;
      Serial.printf("[MQTT] Che do Tu dong khi toi: %s\n", isAutoMode ? "BAT" : "TAT");
      if (isAutoMode) {
        // Đồng bộ ngay tức thì với trạng thái ánh sáng hiện tại (lọc đa số 15 mẫu)
        isRoomDark = sampleLightSensorRaw();
        lightPercent = isRoomDark ? 20 : 75;
        darkIntegrator = isRoomDark ? 6 : 0;
        lastAutoActionTime = 0; // Bỏ cooldown để thi hành lệnh ngay lập tức
        if (isRoomDark && !isRelayOn) {
          Serial.println("[AUTO] Vua bat Auto & Phong dang toi -> Bat den.");
          setRelayState(true, "AUTO_SYNC");
        } else if (!isRoomDark && isRelayOn) {
          Serial.println("[AUTO] Vua bat Auto & Phong dang sang -> Tat den.");
          setRelayState(false, "AUTO_SYNC");
        }
      }
      publishStatus();
      publishTelemetry();
    }
  } else {
    if (message.equalsIgnoreCase("ON") || message.equalsIgnoreCase("1")) {
      isAutoMode = false;
      setRelayState(true, "WEB_MQTT");
    } else if (message.equalsIgnoreCase("OFF") || message.equalsIgnoreCase("0")) {
      isAutoMode = false;
      setRelayState(false, "WEB_MQTT");
    } else if (message.equalsIgnoreCase("AUTO_ON")) { isAutoMode = true; publishStatus(); }
    else if (message.equalsIgnoreCase("AUTO_OFF")) { isAutoMode = false; publishStatus(); }
  }
}

void publishStatus() {
  if (!mqttClient.connected()) return;

  JsonDocument doc;
  doc["status"] = "ONLINE";
  doc["deviceId"] = "smart-plug";
  doc["relay"] = isRelayOn ? "ON" : "OFF";
  doc["relayState"] = isRelayOn ? "ON" : "OFF";
  doc["fan"] = isFanOn ? "ON" : "OFF";
  doc["fanState"] = isFanOn ? "ON" : "OFF";
  doc["auto"] = isAutoMode;
  doc["ip"] = WiFi.localIP().toString();

  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_STATUS, buffer, true);
}

void publishTelemetry() {
  if (!mqttClient.connected()) return;

  JsonDocument doc;
  doc["deviceId"] = "smart-plug";
  doc["relay"] = isRelayOn ? "ON" : "OFF";
  doc["relayState"] = isRelayOn ? "ON" : "OFF";
  doc["fan"] = isFanOn ? "ON" : "OFF";
  doc["fanState"] = isFanOn ? "ON" : "OFF";
  doc["light_percent"] = lightPercent;
  doc["is_dark"] = isRoomDark;
  doc["auto_mode"] = isAutoMode;

  // Dữ liệu tương thích Dashboard
  doc["voltage"] = 220.0;
  float totalPower = 0.0;
  if (isRelayOn) totalPower += 50.0;
  if (isFanOn) totalPower += 1.0; // Quạt 5V 0.2A tiêu thụ 1W
  doc["powerWatt"] = totalPower;
  doc["lightLux"] = isRoomDark ? 80 : 450;

  char buffer[320];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_TELEMETRY, buffer);
}

/* ==========================================================================
   GIAO DIỆN ĐIỀU KHIỂN & DEBUG QUA CỔNG SERIAL (USB)
   ========================================================================== */

void processSerialCommands() {
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();

    if (cmd == "ON" || cmd == "1") {
      setRelayState(true, "SERIAL_USB");
    } else if (cmd == "OFF" || cmd == "0") {
      setRelayState(false, "SERIAL_USB");
    } else if (cmd == "FAN_ON" || cmd == "FAN 1") {
      setFanState(true, "SERIAL_USB");
    } else if (cmd == "FAN_OFF" || cmd == "FAN 0") {
      setFanState(false, "SERIAL_USB");
    } else if (cmd == "AUTO") {
      isAutoMode = !isAutoMode;
      Serial.printf("[SERIAL] Che do Tu dong khi toi: %s\n", isAutoMode ? "BAT (ON)" : "TAT (OFF)");
      if (isAutoMode) {
        isRoomDark = sampleLightSensorRaw();
        lightPercent = isRoomDark ? 20 : 75;
        darkIntegrator = isRoomDark ? 6 : 0;
        lastAutoActionTime = 0;
        if (isRoomDark && !isRelayOn) {
          setRelayState(true, "AUTO_SERIAL");
        } else if (!isRoomDark && isRelayOn) {
          setRelayState(false, "AUTO_SERIAL");
        }
      }
      publishStatus();
      publishTelemetry();
    } else if (cmd == "INVERT") {
      isRelayActiveLow = !isRelayActiveLow;
      Serial.printf("[SERIAL] Da doi muc kich Relay sang: %s\n",
                    isRelayActiveLow ? "Active-LOW (LOW=BAT)" : "Active-HIGH (HIGH=BAT)");
      // Cập nhật lại trạng thái rơ-le ngay
      setRelayState(isRelayOn, "INVERT");
    } else if (cmd == "LIGHT_REV") {
      invertLightLogic = !invertLightLogic;
      Serial.printf("[SERIAL] Da dao chieu doc cam bien anh sang: %s\n",
                    invertLightLogic ? "DAO NGUOC" : "CHUAN");
    } else if (cmd == "STAT" || cmd == "STATUS") {
      printSystemStatus();
    } else if (cmd == "HELP") {
      Serial.println("\n--- DANH SACH LENH SERIAL MONITOR ---");
      Serial.println("  ON        : Bat nguon (Den LED Sang)");
      Serial.println("  OFF       : Tat nguon (Den LED Tat)");
      Serial.println("  FAN_ON    : Bat quat 5V");
      Serial.println("  FAN_OFF   : Tat quat 5V");
      Serial.println("  AUTO      : Bat/Tat che do tu dong khi toi");
      Serial.println("  INVERT    : Doi muc kich Relay (LOW <-> HIGH)");
      Serial.println("  LIGHT_REV : Dao chieu danh gia sang/toi cua cam bien");
      Serial.println("  STAT      : In trang thai chi tiet");
      Serial.println("  HELP      : Xem huong dan nay\n");
    } else if (cmd.length() > 0) {
      Serial.printf("[SERIAL] Khong nhan dien '%s'. Go 'HELP' de xem cac lenh.\n", cmd.c_str());
    }
  }
}

void printSystemStatus() {
  Serial.println("\n----------------- TRANG THAI HE THONG -----------------");
  Serial.printf("  - Relay 1 Pin (GPIO)  : D%d (Den: %s)\n", PIN_RELAY, isRelayOn ? "BAT" : "TAT");
  Serial.printf("  - Relay 2 Pin (GPIO)  : D%d (Quat 5V: %s)\n", PIN_RELAY_FAN, isFanOn ? "DANG QUAY" : "DA DUNG");
  Serial.printf("  - Button Pin (GPIO)   : D%d\n", PIN_BUTTON);
  Serial.printf("  - Relay (LED 5mm)     : %s (Kich: %s)\n",
                isRelayOn ? "BAT (ON)" : "TAT (OFF)",
                isRelayActiveLow ? "Active-LOW" : "Active-HIGH");
  Serial.printf("  - Sensor Pin (GPIO)   : D%d (Chan DO: %d)\n", PIN_CDS_DO, digitalRead(PIN_CDS_DO));
  Serial.printf("  - Tinh trang phong    : %s (%d%%)\n",
                isRoomDark ? "PHONG TOI" : "PHONG SANG", lightPercent);
  Serial.printf("  - Che do tu dong      : %s\n", isAutoMode ? "BAT" : "TAT");
  Serial.printf("  - Wi-Fi Hotspot       : %s (IP: %s)\n",
                WiFi.status() == WL_CONNECTED ? "DA KET NOI" : "CHUA KET NOI",
                WiFi.localIP().toString().c_str());
  Serial.printf("  - MQTT Broker (EMQX)  : %s\n",
                mqttClient.connected() ? "DA KET NOI" : "CHUA KET NOI");
  Serial.println("------------------------------------------------------\n");
}
