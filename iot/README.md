# Voice and device integration

The integration is split into three parts:

1. The ESP32-S3 smart speaker recognizes an English command offline and sends the command code to the gateway HTTP endpoint on the PC.
2. The gateway publishes smart-bin commands to a local MQTT broker and listens for device telemetry.
3. Device ESP32 boards subscribe only to their own command topic and publish state. Door lock, window sensor, and environment sensor are monitoring-only.

## Commands after saying "Hi ESP"

| Spoken phrase | Code | Destination |
| --- | --- | --- |
| Turn on the light / Turn off the light | LIGHT_ON / LIGHT_OFF | Speaker GPIO15 |
| Open the bin / Close the bin / Automatic bin | BIN_OPEN / BIN_CLOSE / BIN_AUTO | Smart bin lid |
| Bin status | BIN_STATUS | Latest MQTT state on TFT and web |
| Door status / Window status / Gas status | DOOR_STATUS / WINDOW_STATUS / ENV_STATUS | Latest MQTT state on TFT and web |

Status is currently displayed as English text on the TFT and web. The speaker's existing prerecorded audio still confirms only LIGHT_ON/LIGHT_OFF. Spoken replies for dynamic values are not implemented yet.

## MQTT topics

`home/smart-bin/command` carries exact plain-text actions `open`, `close`, or `auto` with QoS 1 and retain=false. Each device publishes `home/<device>/status` and `home/<device>/telemetry`. Status requests never publish an actuator command. The door-lock firmware has no remote unlock subscription. The curtain source remains in the project but is outside this integration stage.

The broker PC, gateway, and devices must share a reachable 2.4 GHz Wi-Fi network. Use the broker PC's LAN IPv4 address in device configs, not `127.0.0.1`. The broker must stay running. Use the local config example files and keep passwords out of Git.

Before flashing, test the gateway with a broker and check the specific device topic using MQTT subscriber tools. Then flash one device at a time. The firmware source in this folder has not been validated on the physical boards yet.
