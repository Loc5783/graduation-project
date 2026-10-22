# Frontend

Web dashboard for monitoring and controlling IoT devices.

The active application is React 18 + Vite + React Router 6, JavaScript and plain CSS.
It includes real authentication, the shared dashboard shell, VI/EN, and five independent
device pages with empty states while hardware integration is pending.

From this directory, run `npm ci` and `npm run dev` after setting up the backend.
Open `http://localhost:5173`. Use `npm run lint`, `npm test` and `npm run build` for checks.

See [local setup](../docs/run-local.md) for complete instructions.

Work on `src/modules/<device-id>/OwnerArea.jsx` for device-specific UI. Shared UI lives
in `src/shared/`, providers in `src/context/`, and API calls in `src/services/`.
Coordinate changes to shared files and dependencies before merging.

`features/` and `shared/` at this directory's top level are original planning folders;
the application imports code from `src/`. Do not create a second implementation there.
