#ifndef NETWORK_CONFIG_H
#define NETWORK_CONFIG_H

// ====================================================================
// CẤU HÌNH WI-FI & MQTT CHO MODULE CẢM BIẾN MÔI TRƯỜNG (ESP32)
// Sao chép file này thành "network_config.h" và điền thông tin mạng thật.
// Không commit file network_config.h chứa mật khẩu lên git.
// ====================================================================

// Tên và mật khẩu Wi-Fi (Chỉ hỗ trợ băng tần 2.4GHz)
#define ENV_WIFI_SSID       "TEN_WIFI_2G4"
#define ENV_WIFI_PASSWORD   "MAT_KHAU_WIFI"

// Địa chỉ Broker MQTT (Địa chỉ IP máy tính chạy Mosquitto Broker)
// Ví dụ chạy cùng mạng LAN: "mqtt://192.168.1.15:1883"
#define ENV_MQTT_URI        "mqtt://192.168.1.100:1883"

// Thông tin tài khoản MQTT (nếu broker yêu cầu xác thực)
#define ENV_MQTT_USERNAME   ""
#define ENV_MQTT_PASSWORD   ""

#endif // NETWORK_CONFIG_H

