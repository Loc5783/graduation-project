import { Router } from 'express';
import requireAuth from '../../src/middleware/auth.js';

function isAuthOrDev(request, response, next) {
  if (request.session?.userId) {
    return next();
  }
  // Cho phép xem trong chế độ development hoặc cờ xem trước
  if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_ANONYMOUS_TELEMETRY === 'true') {
    return next();
  }
  return requireAuth(request, response, next);
}

export function createEnvironmentSensorRouter(
  telemetry,
  { authenticate = isAuthOrDev, heartbeatMs = 15000 } = {}
) {
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
    let heartbeat;
    let drainTimer;
    let paused = false;
    let pendingSnapshot = null;

    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
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
      try {
        if (!response.write(text)) {
          paused = true;
          drainTimer = setTimeout(close, 5000);
          drainTimer.unref();
        }
      } catch {
        close();
      }
    };

    const onChange = (snapshot) => {
      if (paused) {
        pendingSnapshot = snapshot;
        return;
      }
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

    heartbeat = setInterval(() => {
      if (closed) return;
      write(': heartbeat\n\n');
    }, heartbeatMs);
    heartbeat.unref();
  });

  return router;
}

