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

## Email verification and deployment

Production requires MongoDB, a unique `SESSION_SECRET`, `RESEND_API_KEY`, and
`EMAIL_FROM` using a verified sending domain. Set `NODE_ENV=production`,
`MONGODB_URI` to the production database, and `ALLOWED_ORIGINS` to the HTTPS web
origin. Serve the frontend and `/api` under the same HTTPS origin using a reverse
proxy; the session cookie is HttpOnly, SameSite=Lax and Secure in production.
The server refuses to start without MongoDB or the email settings in production.
Existing sessions created before this idle timeout feature must sign in again once.
On local development, set `EMAIL_AUTH_ENABLED=true` to exercise the email flow.

New registrations receive a six-digit email code and remain unable to log in
until verified. Newly registered and admin-created accounts have email two-step
verification on by default; existing accounts can enable it in Settings → Security. Codes expire
after 10 minutes, permit five attempts and have a 60-second resend cooldown.
Only an HMAC of each code is stored in MongoDB. Sessions end after 15 minutes
without a user activity signal, even if background requests continue.

