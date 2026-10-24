#pragma once
#if __has_include("network_config.h")
#include "network_config.h"
#endif
#ifndef SDL_WIFI_SSID
#define SDL_WIFI_SSID ""
#endif
#ifndef SDL_WIFI_PASSWORD
#define SDL_WIFI_PASSWORD ""
#endif
#ifndef SDL_MQTT_URI
#define SDL_MQTT_URI ""
#endif
#ifndef SDL_MQTT_USERNAME
#define SDL_MQTT_USERNAME ""
#endif
#ifndef SDL_MQTT_PASSWORD
#define SDL_MQTT_PASSWORD ""
#endif
#ifndef SDL_MQTT_CA_CERT
#define SDL_MQTT_CA_CERT ""
#endif
#ifndef SDL_VIBRATION_ENABLED
#define SDL_VIBRATION_ENABLED 1
#endif
#ifndef SDL_VIBRATION_ACTIVE_LEVEL
#define SDL_VIBRATION_ACTIVE_LEVEL -1
#endif
static_assert(SDL_VIBRATION_ACTIVE_LEVEL >= -1 && SDL_VIBRATION_ACTIVE_LEVEL <= 1,
              "Vibration active level must be -1, 0 or 1");
