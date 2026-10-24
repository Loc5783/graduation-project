import { Router } from 'express';
import requireAuth from '../../src/middleware/auth.js';

function sessionExpiresAt(request) {
  const expires = request.session?.cookie?.expires;
  return expires ? new Date(expires).getTime() : null;
}

// Re-read the session store so logout in another tab also closes its open stream.
export async function isStreamSessionValid(request) {
  const expiresAt = sessionExpiresAt(request);
  if (!request.session?.userId || (expiresAt !== null && expiresAt <= Date.now()) ||
      !request.sessionID || typeof request.sessionStore?.get !== 'function') return false;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5000);
    timeout.unref();
    request.sessionStore.get(request.sessionID, (error, stored) => {
      clearTimeout(timeout);
      const storedExpiry = stored?.cookie?.expires ? new Date(stored.cookie.expires).getTime() : null;
      resolve(!error && Boolean(stored?.userId) && String(stored.userId) === String(request.session.userId) &&
        (storedExpiry === null || storedExpiry > Date.now()));
    });
  });
}

export function createSmartDoorLockRouter(telemetry, {
  authenticate = requireAuth,
  revalidateSession = isStreamSessionValid,
  heartbeatMs = 15000
} = {}) {
  const router = Router();
  router.use(authenticate);
  router.get('/state', (request, response) => {
    response.set('Cache-Control', 'no-store');
    response.json({ success: true, data: telemetry.getSnapshot() });
  });

  router.get('/events', (request, response) => {
    response.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    response.flushHeaders();
    let closed = false;
    let checking = false;
    let heartbeat;
    let expiryTimer;
    let drainTimer;
    let paused = false;
    let pendingSnapshot = null;

    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      clearTimeout(expiryTimer);
      clearTimeout(drainTimer);
      telemetry.off('change', onChange);
      telemetry.off('shutdown', close);
      response.off('close', close);
      response.off('error', close);
      response.off('drain', onDrain);
      response.end();
    };

    const write = (text) => {
      if (closed || response.destroyed || response.writableEnded) return;
      if (paused) return;
      // Bound the stream to Node's write buffer and one replacement snapshot.
      try {
        if (!response.write(text)) {
          paused = true;
          drainTimer = setTimeout(close, 5000);
          drainTimer.unref();
        }
      } catch { close(); }
    };
    const onChange = (snapshot) => {
      if (paused) { pendingSnapshot = snapshot; return; }
      write(`event: state\ndata: ${JSON.stringify(snapshot)}\n\n`);
    };
    const onDrain = () => {
      clearTimeout(drainTimer);
      paused = false;
      if (pendingSnapshot) {
        const snapshot = pendingSnapshot;
        pendingSnapshot = null;
        onChange(snapshot);
      }
    };
    telemetry.on('change', onChange);
    telemetry.on('shutdown', close);
    response.on('close', close);
    response.on('error', close);
    response.on('drain', onDrain);
    write('retry: 3000\n\n');
    onChange(telemetry.getSnapshot());
    if (closed) return;

    heartbeat = setInterval(async () => {
      if (checking || closed) return;
      checking = true;
      try {
        if (!await revalidateSession(request)) {
          write('event: session-expired\ndata: {}\n\n');
          close();
        } else write(': heartbeat\n\n');
      } catch { close(); } finally { checking = false; }
    }, heartbeatMs);
    heartbeat.unref();
    const expiresAt = sessionExpiresAt(request);
    if (expiresAt !== null) {
      expiryTimer = setTimeout(() => {
        write('event: session-expired\ndata: {}\n\n');
        close();
      }, Math.max(0, Math.min(expiresAt - Date.now(), 0x7fffffff)));
      expiryTimer.unref();
    }
  });

  return router;
}
