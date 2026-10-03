# Graduation Project

Graduation project integrating IoT devices, MQTT, backend, and web dashboard.

## Repository structure

```text
graduation-project/
├── iot/
│   ├── firmware/
│   ├── mqtt/
│   └── config/
├── backend/
├── frontend/
└── docs/
```

## Current phase

The IoT devices already work locally/offline. The next milestones are:

1. Push the current working firmware as the baseline.
2. Add Wi-Fi connectivity.
3. Add MQTT communication.
4. Integrate devices with the smart speaker / central controller.
5. Add backend and web dashboard.
6. Run end-to-end integration testing.

## Team workflow

- `main`: stable, reviewed code.
- Each member works on a feature/device branch.
- Changes should be merged through Pull Requests.
- Never commit passwords, tokens, API keys, or Wi-Fi credentials.

## Commit examples

```text
feat(light): add working offline firmware
feat(light): add wifi connectivity
feat(light): add mqtt control
fix(trash): fix servo rotation
docs(mqtt): update topic registry
```
