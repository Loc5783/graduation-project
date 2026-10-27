#include <Arduino.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <esp_now.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include "protocol.h"
#include "config_display.h"

// ====================================================================
// KHỞI TẠO ĐỐI TƯỢNG PHẦN CỨNG MÀN HÌNH
// ====================================================================
// Sử dụng SPI phần cứng của ESP32 (VSPI)
static Adafruit_ST7735 tft = Adafruit_ST7735(&SPI, TFT_CS, TFT_DC, TFT_RST);

// Bộ nhớ đệm gói tin nhận được qua ESP-NOW
static GasAlertPacket receivedPacket;
static volatile bool newPacketArrived = false;
static unsigned long lastPacketTime   = 0;
static bool          isConnected      = false;

// Tự động quét và khóa kênh ESP-NOW chống lệch kênh
static uint8_t       currentEspNowChannel = ESPNOW_WIFI_CHANNEL;
static unsigned long lastChannelHopTime   = 0;
static bool          channelLocked        = false;

void setWiFiChannel(uint8_t ch) {
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);
}

// Lưu trữ trạng thái giao diện để tránh vẽ lại không cần thiết
static AlertLevel lastRenderedLevel = (AlertLevel)255;
static bool       lastConnState     = false;
static unsigned long lastUiRefresh  = 0;

// ====================================================================
// BẢNG MÀU SẮC GIAO DIỆN (16-bit RGB565)
// ====================================================================
#define COLOR_BG        0x0821  // Xanh đen đậm
#define COLOR_CARD_BG   0x18C3  // Xám xanh đậm
#define COLOR_TEXT_DIM  0x8410  // Xám nhạt
#define COLOR_WHITE     0xFFFF  // Trắng
#define COLOR_SAFE      0x07E0  // Xanh lá (Safe)
#define COLOR_WARN      0xFDA0  // Vàng cam (Warning)
#define COLOR_DANGER    0xF800  // Đỏ rực (Danger)
#define COLOR_WARMUP    0x04FF  // Xanh dương nhạt
#define COLOR_DISCONN   0x7BEF  // Xám tro (Mất kết nối)

// ====================================================================
// ESP-NOW CALLBACK NHẬN DỮ LIỆU
// ====================================================================
void onDataRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
    if (len == sizeof(GasAlertPacket)) {
        GasAlertPacket pkt;
        memcpy(&pkt, incomingData, sizeof(GasAlertPacket));
        lastPacketTime = millis();
        isConnected = true;

        if (!channelLocked) {
            channelLocked = true;
            Serial.printf("[ESPNOW] [LOCKED] Da bat song Sensor Node va KHOA KENH %d!\n", currentEspNowChannel);
        }

        // Khử trùng lặp: Nếu là gói burst gửi bù cùng packet_id thì không cần vẽ lại UI
        if (pkt.packet_id != receivedPacket.packet_id) {
            receivedPacket = pkt;
            newPacketArrived = true;
        }
    }
}

// ====================================================================
// KHỞI TẠO ESP-NOW
// ====================================================================
void setupEspNow() {
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    WiFi.setSleep(false);
    WiFi.setTxPower(WIFI_POWER_19_5dBm); // Công suất phát tối đa chống suy hao qua tường

    setWiFiChannel(currentEspNowChannel);

    if (esp_now_init() != ESP_OK) {
        Serial.println("[ESPNOW] [ERROR] Khoi tao ESP-NOW that bai tren Node Display!");
        return;
    }
    Serial.printf("[ESPNOW] [INFO] Khoi tao ESP-NOW thanh cong tren Kenh %d.\n", currentEspNowChannel);
    esp_now_register_recv_cb(onDataRecv);
}

// ====================================================================
// VẼ KHUNG GIAO DIỆN TĨNH (VẼ 1 LẦN)
// ====================================================================
void drawStaticLayout() {
    tft.fillScreen(COLOR_BG);

    // Header thanh tiêu đề
    tft.fillRect(0, 0, 160, 18, 0x0000);
    tft.setTextColor(COLOR_WHITE);
    tft.setTextSize(1);
    tft.setCursor(6, 5);
    tft.print("SMART KITCHEN V1");

    // Khung thông số Môi trường (Nhiệt độ & Độ ẩm)
    tft.drawRoundRect(4, 76, 73, 48, 4, COLOR_CARD_BG);
    tft.setCursor(8, 80);
    tft.setTextColor(COLOR_TEXT_DIM);
    tft.print("NHIET DO");

    tft.drawRoundRect(83, 76, 73, 48, 4, COLOR_CARD_BG);
    tft.setCursor(87, 80);
    tft.setTextColor(COLOR_TEXT_DIM);
    tft.print("DO AM");
}

// ====================================================================
// VẼ THANH TRẠNG THÁI CHÍNH (SAFE / WARN / DANGER / DISCONNECTED)
// ====================================================================
void renderStatusBanner(AlertLevel level, bool connected) {
    uint16_t bannerColor;
    const char *statusText;

    if (!connected) {
        bannerColor = COLOR_DISCONN;
        statusText  = "MAT KET NOI !";
    } else {
        switch (level) {
            case LEVEL_WARMUP:
                bannerColor = COLOR_WARMUP;
                statusText  = "DANG SAY MQ-2";
                break;
            case LEVEL_SAFE:
                bannerColor = COLOR_SAFE;
                statusText  = "AN TOAN (SAFE)";
                break;
            case LEVEL_WARNING:
                bannerColor = COLOR_WARN;
                statusText  = "CANH BAO GAS!";
                break;
            case LEVEL_DANGER:
                bannerColor = COLOR_DANGER;
                statusText  = "NGUY HIEM GAS!";
                break;
            default:
                bannerColor = COLOR_DISCONN;
                statusText  = "CHUA RO";
                break;
        }
    }

    // Vẽ hộp trạng thái lớn
    tft.fillRoundRect(4, 22, 152, 28, 4, bannerColor);
    tft.setTextColor(COLOR_WHITE);
    tft.setTextSize(1);
    
    // Căn giữa dòng chữ
    int textLen = strlen(statusText);
    int xOffset = (160 - (textLen * 6)) / 2;
    tft.setCursor(xOffset, 32);
    tft.print(statusText);

    // Cập nhật biểu tượng kết nối góc trên phải
    tft.fillRect(115, 4, 42, 10, 0x0000);
    tft.setCursor(115, 5);
    if (connected) {
        tft.setTextColor(COLOR_SAFE);
        tft.print("[ONLINE]");
    } else {
        tft.setTextColor(COLOR_DANGER);
        tft.print("[LOST]");
    }
}

// ====================================================================
// CẬP NHẬT CHỈ SỐ GAS, NHIỆT ĐỘ, ĐỘ ẨM LÊN MÀN HÌNH (KHÔNG NHẤP NHÁY)
// ====================================================================
void renderMetrics(const GasAlertPacket &pkt, bool connected) {
    // 1. Vùng hiển thị nồng độ Gas ADC
    tft.fillRect(4, 53, 152, 20, COLOR_BG);
    tft.setCursor(8, 56);
    tft.setTextColor(COLOR_WHITE);
    tft.setTextSize(1);
    tft.print("Gas ADC: ");
    
    tft.setTextSize(2);
    if (connected) {
        uint16_t gasColor = (pkt.alert_level == LEVEL_DANGER) ? COLOR_DANGER : 
                            (pkt.alert_level == LEVEL_WARNING ? COLOR_WARN : COLOR_SAFE);
        tft.setTextColor(gasColor);
        tft.printf("%4u", pkt.gas_raw);
    } else {
        tft.setTextColor(COLOR_TEXT_DIM);
        tft.print("----");
    }

    // 2. Vùng hiển thị Nhiệt độ
    tft.fillRect(8, 93, 65, 26, COLOR_BG);
    tft.setCursor(10, 96);
    tft.setTextSize(2);
    if (connected) {
        tft.setTextColor(COLOR_WHITE);
        tft.printf("%.1f", pkt.temperature);
        tft.setTextSize(1);
        tft.print("C");
    } else {
        tft.setTextColor(COLOR_TEXT_DIM);
        tft.print("--.-C");
    }

    // 3. Vùng hiển thị Độ ẩm
    tft.fillRect(87, 93, 65, 26, COLOR_BG);
    tft.setCursor(90, 96);
    tft.setTextSize(2);
    if (connected) {
        tft.setTextColor(COLOR_WHITE);
        tft.printf("%.0f", pkt.humidity);
        tft.setTextSize(1);
        tft.print("%");
    } else {
        tft.setTextColor(COLOR_TEXT_DIM);
        tft.print("--%");
    }
}

// ====================================================================
// ARDUINO SETUP & LOOP
// ====================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n==================================================");
    Serial.println("  SMART KITCHEN - NODE HIEN THI TFT 1.8 (ESP32)  ");
    Serial.println("==================================================");

    // Cấu hình chân CS và Hard-reset phần cứng màn hình TFT
    pinMode(TFT_CS, OUTPUT);
    digitalWrite(TFT_CS, HIGH);

    if (TFT_RST >= 0) {
        pinMode(TFT_RST, OUTPUT);
        digitalWrite(TFT_RST, HIGH);
        delay(20);
        digitalWrite(TFT_RST, LOW);
        delay(50);
        digitalWrite(TFT_RST, HIGH);
        delay(100);
    }

    // Khởi tạo phần cứng SPI cho ESP32 (SCK, MISO = -1, MOSI, SS = -1 để Adafruit quản lý CS qua GPIO)
    SPI.begin(TFT_SCLK, -1, TFT_MOSI, -1);
    
    // Khởi tạo IC điều khiển ST7735
    tft.initR(INITR_BLACKTAB);
    tft.setSPISpeed(20000000); // 20MHz đảm bảo tín hiệu sắc nét và ổn định trên dây cắm breadboard
    tft.setRotation(1); // Xoay ngang màn hình (160x128)
    
    // Vẽ nền giao diện ban đầu
    drawStaticLayout();
    renderStatusBanner(LEVEL_WARMUP, false);

    // Khởi tạo ESP-NOW
    setupEspNow();
    String macStr = WiFi.macAddress();
    Serial.println("\n==================================================");
    Serial.printf(">> DIA CHI MAC CUA NODE HIEN THI: %s\n", macStr.c_str());
    Serial.println(">> (De on dinh 100%, copy MAC nay vao config_sensor.h)");
    Serial.println("==================================================\n");
}

void loop() {
    unsigned long now = millis();

    // 1. Kiểm tra Heartbeat Timeout & Tự động quét kênh nếu mất kết nối
    if (lastPacketTime > 0 && (now - lastPacketTime <= HEARTBEAT_TIMEOUT_MS)) {
        isConnected = true;
    } else {
        isConnected = false;
        channelLocked = false;

        // Nếu mất kết nối, tự động quét kênh 1-13 (mỗi 1200ms đổi 1 kênh) để tìm và khóa kênh của Sensor
        if (now - lastChannelHopTime >= 1200) {
            lastChannelHopTime = now;
            currentEspNowChannel++;
            if (currentEspNowChannel > 13) currentEspNowChannel = 1;
            setWiFiChannel(currentEspNowChannel);
            Serial.printf("[ESPNOW] Dang quet kenh %d tim Sensor Node...\n", currentEspNowChannel);
        }
    }

    // 2. Cập nhật giao diện nếu có tin mới hoặc quá chu kỳ làm mới
    if (newPacketArrived || (now - lastUiRefresh >= TFT_REFRESH_INTERVAL)) {
        newPacketArrived = false;
        lastUiRefresh = now;

        AlertLevel activeLevel = isConnected ? (AlertLevel)receivedPacket.alert_level : LEVEL_WARMUP;

        // Nếu trạng thái cảnh báo hoặc kết nối thay đổi -> Vẽ lại banner
        if (activeLevel != lastRenderedLevel || isConnected != lastConnState) {
            lastRenderedLevel = activeLevel;
            lastConnState = isConnected;
            renderStatusBanner(activeLevel, isConnected);
        }

        // Cập nhật các con số động
        renderMetrics(receivedPacket, isConnected);
    }
}

