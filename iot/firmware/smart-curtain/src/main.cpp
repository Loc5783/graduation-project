#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WebServer.h>
#include "wifi_config.h"

constexpr uint8_t LIGHT_PIN = 34, LED_PIN = 27;
constexpr float CLOSE_PERCENT = 70, OPEN_PERCENT = 45;
constexpr uint32_t HOLD_MS = 2000;
Adafruit_ST7735 tft(5, 16, 17);
Preferences settings;
int darkRaw = 4095, brightRaw = 0;
float filteredRaw;
bool closed = false, pending = false;
uint32_t pendingSince = 0, lastSample = 0, lastDraw = 0;
uint32_t lastWifiAttempt = 0;
bool wifiReported = false;
WebServer server(80);
enum class CurtainMode : uint8_t { Auto, Open, Closed };
CurtainMode curtainMode = CurtainMode::Auto;
float lightPercent();

const char WEB_PAGE[] PROGMEM = R"HTML(
<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rem thong minh</title><style>
body{margin:0;padding:24px;background:#07111f;color:#eafaff;font:16px system-ui}
main{max-width:520px;margin:auto;padding:24px;background:#102237;border:1px solid #267699;border-radius:18px}
h1{color:#69dbff;font-size:25px}.value{font-size:42px;font-weight:700;color:#76efa0}
.bar{height:18px;background:#263b50;border-radius:12px;overflow:hidden}
#fill{height:100%;width:0;background:#fbd36d}button{border:0;border-radius:10px;padding:14px 18px;margin:7px 5px 0 0;font-weight:700;cursor:pointer}
.open{background:#62edab}.close{background:#ff8890}.auto{background:#70ceff}
#message{color:#b2c8d8;min-height:24px}</style></head><body><main>
<h1>REM THONG MINH</h1><div id="light" class="value">--%</div>
<div class="bar"><div id="fill"></div></div>
<p id="state">Dang doc trang thai...</p>
<button class="open" onclick="control('open')">MO REM</button>
<button class="close" onclick="control('close')">DONG REM</button>
<button class="auto" onclick="control('auto')">TU DONG</button>
<p id="message"></p></main><script>
async function refresh(){try{const r=await fetch('/api/status');if(!r.ok)throw Error();const s=await r.json();
document.getElementById('light').textContent=Math.round(s.light_percent)+'%';
document.getElementById('fill').style.width=s.light_percent+'%';
document.getElementById('state').textContent='Rem: '+(s.closed?'DANG DONG':'DANG MO')+' | Che do: '+s.mode.toUpperCase()+' | LED: '+(s.led_on?'ON':'OFF');
}catch(e){document.getElementById('message').textContent='Mat ket noi voi rem';}}
async function control(action){try{const r=await fetch('/api/control',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'action='+encodeURIComponent(action)});
document.getElementById('message').textContent=r.ok?'Da gui lenh '+action:'Lenh khong hop le';refresh();
}catch(e){document.getElementById('message').textContent='Khong gui duoc lenh';}}
refresh();setInterval(refresh,1500);
</script></body></html>
)HTML";

const char* modeName() {
  switch (curtainMode) {
    case CurtainMode::Open: return "manual-open";
    case CurtainMode::Closed: return "manual-closed";
    default: return "auto";
  }
}

void setCurtain(bool closeCurtain) {
  closed = closeCurtain;
  pending = closed;
  pendingSince = millis();
  digitalWrite(LED_PIN, closed ? HIGH : LOW);
}

void setupWeb() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(CURTAIN_WIFI_SSID, CURTAIN_WIFI_PASSWORD);
  lastWifiAttempt = millis();
  server.on("/", HTTP_GET, []() { server.send_P(200, "text/html; charset=utf-8", WEB_PAGE); });
  server.on("/api/status", HTTP_GET, []() {
    String json = "{\"light_percent\":" + String(lightPercent(), 1) +
                  ",\"closed\":" + String(closed ? "true" : "false") +
                  ",\"led_on\":" + String(closed ? "true" : "false") +
                  ",\"mode\":\"" + modeName() + "\"}";
    server.send(200, "application/json", json);
  });
  server.on("/api/control", HTTP_POST, []() {
    const String action = server.arg("action");
    if (action == "open") { curtainMode = CurtainMode::Open; setCurtain(false); }
    else if (action == "close") { curtainMode = CurtainMode::Closed; setCurtain(true); }
    else if (action == "auto") { curtainMode = CurtainMode::Auto; pending = closed; pendingSince = millis(); }
    else { server.send(400, "application/json", "{\"error\":\"unknown action\"}"); return; }
    Serial.printf("Web control: %s\n", action.c_str());
    server.send(200, "application/json", "{\"ok\":true}");
  });
  server.begin();
}

float lightPercent() {
  return constrain(100.0F * (filteredRaw - darkRaw) / (brightRaw - darkRaw), 0.0F, 100.0F);
}

void calibrate(char command) {
  if (command != 'd' && command != 'b' && command != 'r') return;
  if (command == 'r') { darkRaw = 4095; brightRaw = 0; }
  else {
    const int value = static_cast<int>(filteredRaw);
    const int other = command == 'd' ? brightRaw : darkRaw;
    if (abs(value - other) < 100) {
      Serial.println("Rejected: dark and bright must differ by at least 100 ADC units.");
      return;
    }
    if (command == 'd') darkRaw = value;
    else brightRaw = value;
  }
  settings.putInt("dark", darkRaw);
  settings.putInt("bright", brightRaw);
  pending = closed;
  Serial.printf("Saved: dark=%d bright=%d\n", darkRaw, brightRaw);
}

void drawScreen(float percent) {
  // Redraw only changing regions to reduce flicker.
  tft.setTextSize(1);
  tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
  tft.setCursor(6, 20);
  tft.printf("Light: %3.0f%%  ", percent);
  tft.fillRect(8, 34, 112, 4, ST77XX_BLACK);
  tft.fillRect(8, 34, static_cast<int>(112 * percent / 100), 4, ST77XX_YELLOW);
  tft.fillRect(26, 47, 76, 45, ST77XX_CYAN);
  tft.drawFastVLine(64, 47, 45, ST77XX_WHITE);
  tft.drawFastHLine(26, 69, 76, ST77XX_WHITE);
  const int width = closed ? 38 : 12;
  tft.fillRect(26, 47, width, 45, ST77XX_MAGENTA);
  tft.fillRect(102 - width, 47, width, 45, ST77XX_MAGENTA);
  tft.fillRect(6, 99, 116, 18, ST77XX_BLACK);
  tft.setTextSize(2);
  tft.setTextColor(closed ? ST77XX_YELLOW : ST77XX_GREEN);
  tft.setCursor(closed ? 28 : 40, 99);
  tft.print(closed ? "CLOSED" : "OPEN");
  tft.setTextSize(1);
  tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
  tft.setCursor(6, 120);
  tft.print(curtainMode == CurtainMode::Auto ? "AUTO " : "MANUAL ");
  tft.print(closed ? "LED: ON " : "LED: OFF");
}

void setup() {
  Serial.begin(115200);
  pinMode(LIGHT_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  analogReadResolution(12);
  analogSetPinAttenuation(LIGHT_PIN, ADC_11db);
  settings.begin("curtain", false);
  darkRaw = settings.getInt("dark", 4095);
  brightRaw = settings.getInt("bright", 0);
  if (abs(brightRaw - darkRaw) < 100) { darkRaw = 4095; brightRaw = 0; }
  filteredRaw = analogRead(LIGHT_PIN);
  SPI.begin(18, -1, 23, 5);
  tft.initR(INITR_144GREENTAB);
  tft.setRotation(2);
  tft.fillScreen(ST77XX_BLACK);
  tft.setTextWrap(false);
  tft.setTextSize(1);
  tft.setTextColor(ST77XX_CYAN);
  tft.setCursor(16, 5);
  tft.print("SMART CURTAIN");
  tft.drawRect(6, 32, 116, 8, ST77XX_WHITE);
  tft.drawRect(24, 45, 80, 49, ST77XX_WHITE);
  drawScreen(lightPercent());
  setupWeb();
  Serial.println("Cover sensor, wait 2 seconds, send d. Illuminate, wait 2 seconds, send b. Send r to reset calibration.");
}

void loop() {
  const uint32_t now = millis();
  server.handleClient();
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wifiReported) {
    wifiReported = true;
    Serial.printf("Curtain web: http://%s\n", WiFi.localIP().toString().c_str());
  } else if (!connected && wifiReported) {
    wifiReported = false;
    Serial.println("Wi-Fi disconnected; reconnecting...");
  }
  if (!connected && now - lastWifiAttempt >= 15000) {
    lastWifiAttempt = now;
    WiFi.reconnect();
  }
  if (now - lastSample >= 50) {
    lastSample = now;
    filteredRaw += 0.15F * (analogRead(LIGHT_PIN) - filteredRaw);
  }
  while (Serial.available()) calibrate(static_cast<char>(Serial.read()));
  const float percent = lightPercent();
  if (curtainMode == CurtainMode::Auto) {
    const bool desired = closed ? percent > OPEN_PERCENT : percent >= CLOSE_PERCENT;
    if (desired != pending) { pending = desired; pendingSince = now; }
    if (pending != closed && now - pendingSince >= HOLD_MS) setCurtain(pending);
  }
  if (now - lastDraw >= 500) {
    lastDraw = now;
    drawScreen(percent);
    Serial.printf("ADC=%d Light=%.0f%% Curtain=%s Mode=%s dark=%d bright=%d\n",
      static_cast<int>(filteredRaw), percent, closed ? "CLOSED" : "OPEN", modeName(), darkRaw, brightRaw);
  }
}
