#pragma once
// Copy to network_config.h in this directory. The local file is Git-ignored.
// ESP32 uses 2.4 GHz Wi-Fi. Use the broker PC's LAN IP, never 127.0.0.1.
#define SDL_WIFI_SSID "YOUR_2G4_WIFI"
#define SDL_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define SDL_MQTT_URI "mqtt://192.168.1.10:1883"
#define SDL_MQTT_USERNAME "smart-door-lock"
#define SDL_MQTT_PASSWORD "YOUR_DEVICE_MQTT_PASSWORD"
// For mqtts://... supply the broker CA; certificate verification stays enabled.
#define SDL_MQTT_CA_CERT ""
// SW-420 DO is physically connected to GPIO4 (confirmed 24 Oct 2026).
#define SDL_VIBRATION_ENABLED 1
// First observe HIGH/LOW at rest and while tapping. Set 0 or 1 to the level
// observed during vibration. -1 streams raw readings without claiming an alarm.
#define SDL_VIBRATION_ACTIVE_LEVEL -1
