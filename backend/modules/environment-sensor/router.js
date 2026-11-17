import { Router } from 'express';
import requireAuth from '../../src/middleware/auth.js';
import { getDeviceAccess } from '../../src/services/deviceAccess.js';
import { recordDeviceRead, recordDeniedDeviceRead } from '../../src/services/deviceDataAudit.js';

export function createEnvironmentSensorRouter(
  telemetry,
  { authenticate = requireAuth, heartbeatMs = 15000 } = {}
) {
  const router = Router();
  router.use(authenticate);

  router.get('/state', async (request, response) => {
    try {
      const { canView, device } = await getDeviceAccess(request.user?._id, 'environment-sensor');
      if (!canView) {
        await recordDeniedDeviceRead({ device, actorId: request.user?._id, source: 'environment-state' });
        return response.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Bạn không có quyền xem dữ liệu cảm biến môi trường.'
        });
      }
      if (device?.collectionEnabled === false) return response.status(200).json({ success: true, data: null, collectionEnabled: false });
      await recordDeviceRead({ device, actorId: request.user?._id, source: 'environment-state' });
      response.set('Cache-Control', 'no-store');
      return response.json({ success: true, data: telemetry.getSnapshot() });
    } catch (err) {
      return response.status(500).json({ success: false, code: 'SERVER_ERROR' });
    }
  });

  router.get('/events', async (request, response) => {
    try {
      const { canView, device } = await getDeviceAccess(request.user?._id, 'environment-sensor');
      if (!canView) {
        await recordDeniedDeviceRead({ device, actorId: request.user?._id, source: 'environment-events' });
        return response.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Bạn không có quyền xem luồng sự kiện cảm biến môi trường.'
        });
      }
      if (device?.collectionEnabled === false) return response.status(403).json({ success: false, code: 'COLLECTION_PAUSED' });
      await recordDeviceRead({ device, actorId: request.user?._id, source: 'environment-events' });
    } catch {
      return response.status(500).json({ success: false, code: 'SERVER_ERROR' });
    }

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

    const onChange = async (snapshot) => {
      if (paused) {
        pendingSnapshot = snapshot;
        return;
      }
      try {
        const { canView, device } = await getDeviceAccess(request.user?._id, 'environment-sensor');
        if (!canView || device?.collectionEnabled === false) {
          close();
          return;
        }
      } catch {
        close();
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

    heartbeat = setInterval(async () => {
      if (closed) return;
      try {
        const { canView, device } = await getDeviceAccess(request.user?._id, 'environment-sensor');
        if (!canView || device?.collectionEnabled === false) {
          write('event: session-expired\ndata: {"code":"REVOKED"}\n\n');
          close();
          return;
        }
      } catch {
        close();
        return;
      }
      write(': heartbeat\n\n');
    }, heartbeatMs);
    heartbeat.unref();
  });

  return router;
}

