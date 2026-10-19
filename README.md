# Graduation Project

Graduation project integrating IoT devices, MQTT, backend, and web dashboard.

## Repository structure

```text
graduation-project/
├── iot/
│   ├── firmware/
│   │   ├── smart-door-lock/
│   │   ├── smart-speaker/
│   │   ├── window-sensor/
│   │   ├── smart-plug/
│   │   └── environment-sensor/
│   ├── mqtt/
│   └── config/
├── backend/
│   ├── shared/
│   └── modules/
│       ├── smart-door-lock/
│       ├── smart-speaker/
│       ├── window-sensor/
│       ├── smart-plug/
│       └── environment-sensor/
├── frontend/
│   ├── shared/
│   └── features/
│       ├── smart-door-lock/
│       ├── smart-speaker/
│       ├── window-sensor/
│       ├── smart-plug/
│       └── environment-sensor/
└── docs/
```

## Module ownership

| Member | Module |
|---|---|
| Thành | Smart Door Lock |
| Lộc | Smart Speaker / Central Control |
| Minh | Window Sensor |
| Nhật Anh | Smart Plug |
| Quỳnh | Smoke / Gas / Temperature Sensor |

Each member owns the vertical slice of their module across IoT, backend, and frontend.

## Branch model

```text
main
└── integration
    ├── module/smart-door-lock
    ├── module/smart-speaker
    ├── module/window-sensor
    ├── module/smart-plug
    └── module/environment-sensor
```

Shared or cross-cutting work uses short-lived branches such as:

```text
feature/login
feature/main-dashboard
feature/navbar
feature/mqtt-core
fix/<name>
docs/<name>
```

These merge into `integration`, then stable integrated code is merged into `main`.

See `docs/branch-strategy.md` for the complete workflow.

## Current development flow

1. Keep current working IoT firmware as a baseline.
2. Add Wi-Fi connectivity.
3. Add MQTT communication.
4. Integrate devices with the Smart Speaker / central controller.
5. Implement backend modules and shared services.
6. Implement frontend features and shared UI.
7. Test end-to-end on `integration`.
8. Merge demo-ready code to `main`.

## Security

Never commit:
- Wi-Fi passwords
- MQTT credentials
- API keys
- tokens
- database passwords
- private certificates
