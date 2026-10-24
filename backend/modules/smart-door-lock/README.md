# Smart Door Lock Backend

Owner: Thành

Read-only MQTT integration for the ESP32-S3 Smart Door Lock. Other devices and
their routes are unchanged. There is no remote unlock endpoint.

## Setup

Install backend dependencies with `npm ci`. Configure MongoDB/session settings as
usual, then set these values in the untracked backend `.env`:

```dotenv
MQTT_URL=mqtt://127.0.0.1:1883
MQTT_USERNAME=your_backend_broker_user
MQTT_PASSWORD=your_backend_broker_password
```

Leave `MQTT_URL` empty to keep device integration disabled. Start the backend with
`npm run dev` or `npm start`. The broker is a separate service; the ESP32 must use
the broker's LAN address rather than `127.0.0.1`. Use a different broker client ID
and broker account for the ESP32. Broker ACLs should grant the backend read access
only to the two topics below. For TLS, use `mqtts://` and, when needed, set
`MQTT_CA_FILE` to the broker's trusted CA PEM file. Certificate checking is enabled.

## MQTT and API

The bridge subscribes to `home/smart-door-lock/status` (retained availability/LWT)
and `home/smart-door-lock/telemetry` (non-retained state and sanitized event
envelopes). It never publishes commands. Only schema version 1 for device
`smart-door-lock` is accepted. The state parser reconstructs all allowlisted
fields, never forwards credentials, RFID UIDs or fingerprint templates, and
rejects malformed states. Telemetry replay/out-of-order checks use an unsigned
32-bit sequence shared by state and events for each boot ID.

The browser must have a real backend login session. Development preview mode does
not grant API access. Both endpoints use the existing HttpOnly session guard:

- `GET /api/smart-door-lock/state`: `{success:true,data:snapshot}`.
- `GET /api/smart-door-lock/events`: SSE `event: state` with raw `snapshot` as JSON.

The snapshot has `deviceId`, `brokerConnected`, `availability` (`online`, `offline`
or `unknown`), `fresh`, `receivedAt`, `state` and `events`. `state` is the complete
normalized firmware envelope; events include the backend `receivedAt` timestamp.
This timestamp records receipt, not the actual historical time on the ESP32.
Hardware health and Wi-Fi RSSI are included in state; there is no invented battery
level or physical bolt feedback.

A valid sensor state heartbeat is required at least every 7 seconds. A retained
online status, event, or broker reconnection cannot renew freshness. Disconnects
and heartbeat expiry notify SSE subscribers. Up to 64 recent events are held in
memory only; restarting the backend clears this history. The ESP32's separate
local log is not backfilled by this implementation.

SSE sends the full initial snapshot, supports automatic browser reconnect, closes
on session expiry/revocation, cleans up disconnected clients and bounds slow-client
buffering. On shutdown the bridge closes streams before the HTTP server stops.

## Tests

```powershell
npm test -- modules/smart-door-lock/tests
```

These focused tests use fake MQTT clients and a loopback HTTP server; they do not
need MongoDB or physical hardware. The existing authentication integration suite
still requires its dedicated `smart_home_privacy_test` MongoDB database. A passing
module suite does not confirm physical sensor wiring or broker/ESP32 connectivity.

To include the real loopback-broker test, install Mosquitto and run:

```powershell
$env:MOSQUITTO_BIN = 'C:\Program Files\mosquitto\mosquitto.exe'
npm test -- modules/smart-door-lock/tests
```

That test starts its own hidden broker process on an ephemeral loopback port and
removes its temporary configuration afterward. It does not alter a broker service
or firewall configuration. Without `MOSQUITTO_BIN`, only this one optional test is
skipped.
