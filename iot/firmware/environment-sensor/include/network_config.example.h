#ifndef NETWORK_CONFIG_H
#define NETWORK_CONFIG_H

// ====================================================================
// CẤU HÌNH WI-FI & MQTT CHO NODE CẢM BIẾN (ESP32)
// Thay đổi các thông số bên dưới để kết nối vào Wi-Fi và Broker của bạn.
// ====================================================================

// Tên và mật khẩu Wi-Fi (Băng tần 2.4GHz)
#define ENV_WIFI_SSID       "TEN_WIFI_2G4"
#define ENV_WIFI_PASSWORD   "MAT_KHAU_WIFI"

// Địa chỉ Broker MQTT (Broker EMQX công cộng hoặc Mosquitto trong mạng LAN)
// Ví dụ công cộng: "mqtt://broker.emqx.io:1883"
// Ví dụ mạng LAN: "mqtt://192.168.1.15:1883"
#define ENV_MQTT_URI        "mqtt://broker.emqx.io:1883"

// Thông tin tài khoản MQTT (nếu có, để trống nếu broker không yêu cầu mật khẩu)
#define ENV_MQTT_USERNAME   ""
#define ENV_MQTT_PASSWORD   ""

#endif // NETWORK_CONFIG_H

