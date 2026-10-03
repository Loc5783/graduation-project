# Firmware

Create one folder per physical IoT device.

Recommended pattern:

```text
firmware/
├── smart-speaker/
├── device-a/
├── device-b/
├── device-c/
└── device-d/
```

Each device folder should contain its source code and a README describing:
- hardware/components
- pin mapping
- current features
- Wi-Fi status
- MQTT topics
- test status
