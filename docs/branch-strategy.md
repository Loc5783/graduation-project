# Branch Strategy

## Long-lived branches

- `main`: stable/demo-ready code only.
- `integration`: latest integrated version of the whole system.
- `module/smart-door-lock`: Thành's Smart Door Lock vertical slice.
- `module/smart-speaker`: Lộc's Smart Speaker vertical slice.
- `module/window-sensor`: Minh's Window Sensor vertical slice.
- `module/smart-plug`: Nhật Anh's Smart Plug vertical slice.
- `module/environment-sensor`: Quỳnh's environment sensor vertical slice.

Each module branch may contain changes across:
- `iot/firmware/<module>/`
- `backend/modules/<module>/`
- `frontend/features/<module>/`

## Short-lived branches

Use these for work that is not owned by one device module:

- `feature/<name>`
- `fix/<name>`
- `docs/<name>`

Examples:
- `feature/login`
- `feature/main-dashboard`
- `feature/navbar`
- `feature/mqtt-core`
- `feature/shared-api-client`

Short-lived branches merge into `integration`.

## Merge flow

```text
module/* -----------┐
feature/* ----------┤
fix/* --------------┼──> integration ──> main
docs/* -------------┘
```

## Rules

1. Do not push directly to `main`.
2. Prefer Pull Requests into `integration`.
3. Test integrated IoT + MQTT + backend + frontend behavior on `integration`.
4. Merge `integration` into `main` only when the system is stable/demo-ready.
5. Module owners should regularly sync `integration` into their module branches to avoid large conflicts.
6. Shared backend/frontend code should not live permanently inside one module branch; use a short-lived `feature/*` branch and merge it into `integration`.
