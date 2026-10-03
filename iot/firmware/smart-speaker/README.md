# Smart Speaker

**Owner:** Lộc

## Purpose
Firmware for the Smart Speaker / central voice-control device.

## Hardware
- TBD

## Pin mapping
- TBD

## Current status
- Offline/local device code: ready to be added
- Wi-Fi: not integrated yet
- MQTT: not integrated yet

## Planned MQTT topics
- Command publish target: device-specific command topics
- Status: `home/smart-speaker/status`
- Telemetry: `home/smart-speaker/telemetry`

## Testing
- Local hardware test: TBD
- Wi-Fi test: Pending
- MQTT test: Pending
- End-to-end integration: Pending

## Notes
This device is expected to act as the central controller for other IoT devices.
Do not commit Wi-Fi passwords, MQTT credentials, API keys, or other secrets.
