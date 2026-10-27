#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include "wifi_secrets.h"

/* ====================================================================
   CẤU HÌNH PHẦN CỨNG (GIỮ NGUYÊN TỪ PHẦN CỨNG THẬT CỦA BẠN)
   ==================================================================== */
#define DOOR_PIN 27       // Cảm biến từ MC-38
#define PIR_PIN 26        // Cảm biến chuyển động PIR
#define BUZZER_PIN 25     // Còi còi chíp báo động
#define LED_PIN 2         // Đèn LED báo trạng thái
#define RELAY_PIN 23      // Rơ-le điều khiển thiết bị / đèn

// Màn hình TFT ST7735
#define TFT_SCLK 18
#define TFT_MOSI 19
#define TFT_DC 16
#define TFT_RST 4
#define TFT_CS 5

const int DOOR_OPEN_LEVEL = HIGH;
const int RELAY_ON = LOW;
const int RELAY_OFF = HIGH;

const unsigned long DOOR_REMINDER_TIME = 10000;
const unsigned long DISPLAY_UPDATE_TIME = 300;
const unsigned long BUZZER_INTERVAL = 300;

Adafruit_ST7735 tft(TFT_CS, TFT_DC, TFT_MOSI, TFT_SCLK, TFT_RST);

/* ====================================================================
   CẤU HÌNH WI-FI & WEB SERVER TRUYỀN DỮ LIỆU LÊN WEB LOCAL
   ==================================================================== */
// Chế độ: Kết nối trực tiếp vào mạng Wi-Fi phòng của bạn
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

/* ====================================================================
   TRẠNG THÁI HỆ THỐNG
   ==================================================================== */
bool doorOpen = false;
bool lastDoorState = false;
bool motionDetected = false;
bool lastMotionState = false;
bool alarmActive = false;
String lastAlarmReason = "NORMAL";

unsigned long doorOpenedTime = 0;
unsigned long lastDisplayUpdate = 0;
unsigned long lastBuzzerTime = 0;
unsigned long lastTelemetrySent = 0;

void showStartupScreen();
void readSensors();
void controlSystem();
void updateAlarm();
void updateDisplay();
void broadcastWsState(const char* eventType, const char* message);

// Xử lý sự kiện WebSocket khi có trình duyệt kết nối
void onWsEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
    if (type == WS_EVT_CONNECT) {
        Serial.printf("[WS] Client #%u ket noi tu IP %s\n", client->id(), client->remoteIP().toString().c_str());
        // Gửi toàn bộ trạng thái hiện tại ngay khi vừa mở web
        broadcastWsState("INIT", "Khoi tao ket noi Web");
    } else if (type == WS_EVT_DISCONNECT) {
        Serial.printf("[WS] Client #%u da ngat ket noi\n", client->id());
    } else if (type == WS_EVT_DATA) {
        DynamicJsonDocument doc(256);
        deserializeJson(doc, data, len);
        if (doc.containsKey("cmd") && doc["cmd"] == "getStatus") {
            broadcastWsState("SYNC", "Dong bo trang thai");
        }
    }
}

// Hàm gửi dữ liệu JSON lên giao diện Web Local qua WebSocket
void broadcastWsState(const char* eventType, const char* message) {
    DynamicJsonDocument doc(384);
    doc["event"] = eventType;
    doc["state"] = doorOpen ? "open" : "closed";
    doc["motion"] = motionDetected;
    doc["alarm"] = alarmActive;
    doc["alarmReason"] = lastAlarmReason;
    doc["relay"] = doorOpen ? "ON" : "OFF";
    doc["light"] = doorOpen ? "ON" : "OFF";
    doc["battery"] = 98; // Có thể đo từ ADC
    doc["rssi"] = WiFi.RSSI();
    doc["uptime"] = millis() / 1000;
    doc["openDuration"] = (doorOpen && doorOpenedTime > 0) ? (millis() - doorOpenedTime) / 1000 : 0;
    doc["message"] = message;

    String jsonStr;
    serializeJson(doc, jsonStr);
    ws.textAll(jsonStr);
}

void setup() {
    Serial.begin(115200);

    pinMode(DOOR_PIN, INPUT_PULLUP);
    pinMode(PIR_PIN, INPUT);

    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(LED_PIN, OUTPUT);
    pinMode(RELAY_PIN, OUTPUT);

    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(LED_PIN, LOW);
    digitalWrite(RELAY_PIN, RELAY_OFF);

    // Khởi động màn hình TFT
    tft.initR(INITR_BLACKTAB);
    tft.setRotation(1);
    tft.fillScreen(ST77XX_BLACK);
    tft.setTextWrap(false);

    showStartupScreen();
    delay(1500);

    // Cấu hình Wi-Fi
    if (strlen(sta_ssid) > 0) {
        WiFi.mode(WIFI_STA);
        WiFi.begin(sta_ssid, sta_pass);
        Serial.print("Dang ket noi WiFi ");
        while (WiFi.status() != WL_CONNECTED && millis() < 10000) {
            delay(300);
            Serial.print(".");
        }
    }

    // Nếu không kết nối Station được hoặc để trống, tự động chuyển sang phát Wi-Fi AP
    if (WiFi.status() != WL_CONNECTED) {
        WiFi.mode(WIFI_AP);
        WiFi.softAP(ap_ssid, ap_pass);
        Serial.println("\n[WiFi] Da phat WiFi AP: " + String(ap_ssid));
        Serial.print("[WiFi] Dia chi Web Local: http://");
        Serial.println(WiFi.softAPIP());
    } else {
        Serial.println("\n[WiFi] Da ket noi WiFi!");
        Serial.print("[WiFi] Dia chi Web Local: http://");
        Serial.println(WiFi.localIP());
    }

    // Đăng ký WebSocket và khởi chạy Web Server
    ws.onEvent(onWsEvent);
    server.addHandler(&ws);

    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(200, "text/html", "<h2>ESP32 Window Sensor Web Server Active! Mo giao dien Web Local de ket noi ws:///ws</h2>");
    });

    server.begin();
    Serial.println("[HTTP] Web Server va WebSocket tren cong 80 da san sang!");

    readSensors();
    lastDoorState = doorOpen;
    lastMotionState = motionDetected;

    if (doorOpen) {
        doorOpenedTime = millis();
    }

    Serial.println();
    Serial.println("================================");
    Serial.println("   SMART WINDOW / DOOR SYSTEM   ");
    Serial.println("       ESP32 DEVKIT V1          ");
    Serial.println("================================");
    Serial.println("MC-38 Sensor, PIR, TFT & Local Web Ready.");
}

void loop() {
    ws.cleanupClients();
    readSensors();

    // Phát hiện trạng thái Cửa Mở / Đóng thay đổi
    if (doorOpen != lastDoorState) {
        controlSystem();
        lastDoorState = doorOpen;
        broadcastWsState("DOOR_CHANGE", doorOpen ? "Cửa vừa được mở" : "Cửa vừa được đóng");
    }

    // Phát hiện chuyển động PIR thay đổi khi cửa đang mở
    if (motionDetected != lastMotionState) {
        lastMotionState = motionDetected;
        if (motionDetected && doorOpen) {
            broadcastWsState("MOTION_DETECTED", "Phát hiện chuyển động qua cảm biến PIR!");
        }
    }

    updateAlarm();

    // Cập nhật màn hình TFT ST7735 theo chu kỳ
    if (millis() - lastDisplayUpdate >= DISPLAY_UPDATE_TIME) {
        updateDisplay();
        lastDisplayUpdate = millis();
    }

    // Gửi telemetry định kỳ lên Web mỗi 5 giây
    if (millis() - lastTelemetrySent >= 5000) {
        lastTelemetrySent = millis();
        if (ws.count() > 0) {
            broadcastWsState("TELEMETRY", "Cập nhật nhịp tim thiết bị");
        }
    }
}

void readSensors() {
    int doorState = digitalRead(DOOR_PIN);

    if (doorState == DOOR_OPEN_LEVEL) {
        doorOpen = true;
    } else {
        doorOpen = false;
    }

    motionDetected = (digitalRead(PIR_PIN) == HIGH);
}

void controlSystem() {
    if (doorOpen) {
        digitalWrite(LED_PIN, HIGH);
        digitalWrite(RELAY_PIN, RELAY_ON);

        doorOpenedTime = millis();

        Serial.println("Door: OPEN | Light: ON | Relay: ON");
    } else {
        digitalWrite(LED_PIN, LOW);
        digitalWrite(RELAY_PIN, RELAY_OFF);
        digitalWrite(BUZZER_PIN, LOW);

        doorOpenedTime = 0;
        alarmActive = false;
        lastAlarmReason = "NORMAL";

        Serial.println("Door: CLOSED | Light: OFF | Relay: OFF");
    }
}

void updateAlarm() {
    if (!doorOpen) {
        if (alarmActive) {
            alarmActive = false;
            lastAlarmReason = "NORMAL";
            digitalWrite(BUZZER_PIN, LOW);
            broadcastWsState("ALARM_CLEARED", "Đã tắt chuông cảnh báo");
        }
        return;
    }

    bool doorLeftOpen = (doorOpenedTime > 0 && millis() - doorOpenedTime >= DOOR_REMINDER_TIME);
    bool intrusion = (doorOpen && motionDetected);

    if (doorLeftOpen || intrusion) {
        bool wasAlarmActive = alarmActive;
        alarmActive = true;

        if (intrusion) {
            lastAlarmReason = "INTRUSION_PIR";
        } else if (doorLeftOpen) {
            lastAlarmReason = "DOOR_LEFT_OPEN";
        }

        // Báo qua WebSocket khi bắt đầu kích hoạt còi
        if (!wasAlarmActive) {
            broadcastWsState("ALARM_TRIGGERED", intrusion ? "Cảnh báo: Cửa mở và có người di chuyển!" : "Cảnh báo: Cửa mở quá lâu!");
        }

        // Nhấp nháy còi Buzzer
        if (millis() - lastBuzzerTime >= BUZZER_INTERVAL) {
            lastBuzzerTime = millis();
            digitalWrite(BUZZER_PIN, !digitalRead(BUZZER_PIN));
        }
    } else {
        alarmActive = false;
        digitalWrite(BUZZER_PIN, LOW);
    }
}

void updateDisplay() {
    tft.fillScreen(ST77XX_BLACK);

    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(2);

    tft.setCursor(8, 5);
    tft.println("SMART HOME");

    tft.drawLine(0, 27, 159, 27, ST77XX_WHITE);

    tft.setTextSize(1);

    tft.setCursor(8, 38);
    tft.setTextColor(ST77XX_WHITE);
    tft.print("DOOR: ");
    if (doorOpen) {
        tft.setTextColor(ST77XX_RED);
        tft.println("OPEN");
    } else {
        tft.setTextColor(ST77XX_GREEN);
        tft.println("CLOSED");
    }

    tft.setCursor(8, 58);
    tft.setTextColor(ST77XX_WHITE);
    tft.print("MOTION: ");
    if (motionDetected) {
        tft.setTextColor(ST77XX_YELLOW);
        tft.println("DETECTED");
    } else {
        tft.setTextColor(ST77XX_GREEN);
        tft.println("NONE");
    }

    tft.setCursor(8, 78);
    tft.setTextColor(ST77XX_WHITE);
    tft.print("LIGHT: ");
    if (doorOpen) {
        tft.setTextColor(ST77XX_YELLOW);
        tft.println("ON");
    } else {
        tft.setTextColor(ST77XX_WHITE);
        tft.println("OFF");
    }

    tft.setCursor(8, 98);
    tft.setTextColor(ST77XX_WHITE);
    tft.print("RELAY: ");
    if (doorOpen) {
        tft.setTextColor(ST77XX_GREEN);
        tft.println("ON");
    } else {
        tft.setTextColor(ST77XX_WHITE);
        tft.println("OFF");
    }

    tft.setCursor(8, 118);
    tft.setTextColor(ST77XX_WHITE);
    tft.print("STATUS: ");
    if (alarmActive) {
        tft.setTextColor(ST77XX_RED);
        tft.println("ALARM");
    } else {
        tft.setTextColor(ST77XX_GREEN);
        tft.println("NORMAL");
    }

    // Hiển thị địa chỉ IP kết nối để tiện xem trên trình duyệt
    tft.setCursor(8, 135);
    tft.setTextColor(ST77XX_CYAN);
    tft.print("IP: ");
    if (WiFi.status() == WL_CONNECTED) {
        tft.println(WiFi.localIP().toString());
    } else {
        tft.println(WiFi.softAPIP().toString());
    }
}

void showStartupScreen() {
    tft.fillScreen(ST77XX_BLACK);

    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(2);

    tft.setCursor(15, 30);
    tft.println("SMART");

    tft.setCursor(15, 55);
    tft.println("DOOR");

    tft.setCursor(15, 80);
    tft.println("SYSTEM");

    tft.setTextSize(1);

    tft.setCursor(15, 110);
    tft.println("ESP32 DEVKIT V1");
}
