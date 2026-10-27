#include <Arduino.h>
#include <WiFi.h>

void setup() {
    Serial.begin(115200);
    delay(1000);
    WiFi.mode(WIFI_STA);
    Serial.println("\n==========================================");
    Serial.println("  CONG CU DOC DIA CHI MAC ESP32 (ESP-NOW) ");
    Serial.println("==========================================");
    Serial.print(">> Dia chi MAC cua board nay: ");
    Serial.println(WiFi.macAddress());
    Serial.println("==========================================");
    Serial.println("Hay copy dia chi MAC tren va dan vao file");
    Serial.println("src/sensor_node/config_sensor.h");
    Serial.println("==========================================\n");
}

void loop() {
    delay(3000);
    Serial.printf("[Heartbeat] MAC: %s\n", WiFi.macAddress().c_str());
}

