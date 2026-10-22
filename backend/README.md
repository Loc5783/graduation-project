# Backend

Backend service for IoT integration, APIs, authentication, data processing, and database access.

Authentication is implemented in `src/` with Express, Mongoose, bcryptjs and
MongoDB-backed HttpOnly sessions. Device integration remains in the planning stage.

See [local setup](../docs/run-local.md) before starting. Configure your own `.env`
from `.env.example` and generate a unique session secret. Never commit `.env`.

Run `npm ci`, then `npm run dev` (or `npm start`). The server binds to
`127.0.0.1:5000` by default. Run `npm test` only against the dedicated test database
documented in the setup guide; the suite clears its `users` and `sessions` collections.

Implemented routes: `POST /api/auth/register`, `POST /api/auth/login`,
`GET /api/auth/me`, `POST /api/auth/logout`. Successful user responses use `data.user`.
POST requests require JSON and an allowed Origin or valid Referer.
