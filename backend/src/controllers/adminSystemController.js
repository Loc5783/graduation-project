import { normalizeLiveDevices } from '../routes/liveDeviceRoutes.js';

export function createSystemStatusHandler({ fetchImpl = globalThis.fetch, gatewayUrl = process.env.IOT_GATEWAY_URL || 'http://127.0.0.1:8001' } = {}) {
  return async function getSystemStatus(_req, res) {
    res.set('Cache-Control', 'no-store, private');
    try {
      const response = await fetchImpl(new URL('/api/devices', gatewayUrl), {
        signal: AbortSignal.timeout(3500), redirect: 'error', headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('Gateway unavailable');
      const text = await response.text();
      if (text.length > 128000) throw new Error('Gateway response too large');
      const devices = normalizeLiveDevices(JSON.parse(text)).map(({ id, brokerConnected, fresh, ageSeconds }) => ({
        id, brokerConnected, fresh, ageSeconds
      }));
      return res.status(200).json({ success: true, data: { devices, checkedAt: new Date().toISOString() } });
    } catch {
      return res.status(503).json({ success: false, code: 'GATEWAY_UNAVAILABLE', message: 'Không lấy được trạng thái thiết bị từ Gateway.' });
    }
  };
}
