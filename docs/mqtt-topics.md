# MQTT Topic Registry

Use this file as the single source of truth for MQTT topics.

| Device | Owner | Command Topic | Status Topic | Telemetry / Alert Topic | Payload Notes |
|---|---|---|---|---|---|
| Smart Door Lock | Thành | `home/smart-door-lock/command` | `home/smart-door-lock/status` | `home/smart-door-lock/telemetry` | TBD |
| Smart Speaker | Lộc | Publishes to device command topics | `home/smart-speaker/status` | `home/smart-speaker/telemetry` | TBD |
| Window Sensor | Minh | `home/window-sensor/command` | `home/window-sensor/status` | `home/window-sensor/telemetry` | TBD |
| Smart Plug | Nhật Anh | `home/smart-plug/command` | `home/smart-plug/status` | `home/smart-plug/telemetry` | TBD |
| Smoke / Gas / Temperature Sensor | Quỳnh | N/A or TBD | `home/environment-sensor/status` | `home/environment-sensor/telemetry`, `home/environment-sensor/alert` | TBD |

## Rule

Do not introduce or rename an MQTT topic without updating this file.
