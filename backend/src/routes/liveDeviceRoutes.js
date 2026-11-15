import { Router } from 'express';
import requireAuth from '../middleware/auth.js';
import { getAccessibleDeviceIds, getDeviceAccess } from '../services/deviceAccess.js';

export const LIVE_DEVICE_FIELDS = Object.freeze({
  'smart-door-lock': ['doorOpen', 'boltCommand', 'boltCommandCompleted', 'boltFeedbackAvailable', 'forcedOpen', 'heldOpen', 'tamper', 'alarm', 'wifiRssi', 'rssi'],
  'window-sensor': ['doorOpen', 'state', 'motion', 'alarm', 'alarmReason', 'rssi', 'wifiRssi'],
  'smart-bin': ['sensorOk', 'distanceCm', 'fillPercent', 'lidOpen', 'mode'],
  'environment-sensor': ['temperature', 'humidity', 'gasRaw', 'alertLevel', 'alertLevelText', 'isWarmingUp', 'buzzerOn', 'sensorOk', 'dhtOk', 'wifiRssi'],
  'smart-plug': ['relay', 'fan', 'auto', 'auto_mode', 'light', 'overload']
});

export function normalizeLiveDevices(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_GATEWAY_RESPONSE');
  return Object.entries(LIVE_DEVICE_FIELDS).map(([id, fields]) => {
    const state = raw[id];
    const age = state?.telemetryAgeSeconds;
    const payload = state?.telemetry;
    const source = payload?.data ?? payload;
    const valid = source && typeof source === 'object' && !Array.isArray(source);
    const brokerConnected = state?.brokerConnected === true;
    const status = state?.status;
    const explicitlyOffline = status?.online === false || status?.status === 'offline' || status?.state === 'offline';
    const fresh = Boolean(valid && brokerConnected && state?.fresh === true &&
      typeof age === 'number' && Number.isFinite(age) && age >= 0 && age < 15 && !explicitlyOffline);
    const data = {};
    if (valid) for (const key of fields) {
      const value = source[key];
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.length <= 160)) data[key] = value;
    }
    return { id, brokerConnected, fresh, ageSeconds: typeof age === 'number' && Number.isFinite(age) && age >= 0 ? age : null,
      data: Object.keys(data).length ? data : null };
  });
}

export function createLiveDeviceRouter({
  fetchImpl = globalThis.fetch,
  gatewayUrl = process.env.IOT_GATEWAY_URL || 'http://127.0.0.1:8001',
  auth = requireAuth,
  deviceAccessService = { getAccessibleDeviceIds, getDeviceAccess }
} = {}) {
  const router = Router();
  router.get('/', auth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const allowedIds = req.user?._id
        ? await deviceAccessService.getAccessibleDeviceIds(req.user._id)
        : (process.env.NODE_ENV === 'test' && !req.user ? new Set(Object.keys(LIVE_DEVICE_FIELDS)) : new Set());

      if (allowedIds.size === 0) {
        return res.json({ success: true, data: { devices: [], checkedAt: new Date().toISOString() } });
      }

      // Fixed server-side destination: client cannot choose a host or proxy arbitrary URLs.
      const response = await fetchImpl(new URL('/api/devices', gatewayUrl), {
        signal: AbortSignal.timeout(3500), redirect: 'error', headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('GATEWAY_UNAVAILABLE');
      const text = await response.text();
      if (text.length > 128000) throw new Error('INVALID_GATEWAY_RESPONSE');
      const allDevices = normalizeLiveDevices(JSON.parse(text));
      const devices = allDevices.filter((d) => allowedIds.has(d.id));
      res.json({ success: true, data: { devices, checkedAt: new Date().toISOString() } });
    } catch {
      res.status(503).json({ success: false, code: 'GATEWAY_UNAVAILABLE', message: 'Gateway chưa kết nối hoặc phản hồi không hợp lệ.' });
    }
  });

  // Proxy có xác thực đọc lịch sử lệnh loa từ Gateway (chỉ chủ sở hữu hoặc người được chia sẻ loa)
  router.get('/speaker-history', auth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const access = req.user?._id
        ? await deviceAccessService.getDeviceAccess(req.user._id, 'smart-speaker')
        : { canView: process.env.NODE_ENV === 'test' && !req.user ? true : false, device: null };

      if (!access.canView) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Bạn không có quyền xem dữ liệu loa thông minh.' });
      }

      // Cách ly dữ liệu theo lần sở hữu: Gateway lưu tập tin cục bộ không có định danh lần sở hữu tin cậy.
      // Khi thiết bị đã đổi chủ (ownershipEpoch > 1), tạm ẩn lịch sử cũ để bảo vệ quyền riêng tư của chủ trước.
      if (access.device && typeof access.device.ownershipEpoch === 'number' && access.device.ownershipEpoch > 1) {
        return res.json({
          success: true,
          data: {
            history: [],
            ownershipRestricted: true,
            note: 'Lịch sử từ Gateway tạm ẩn sau khi đổi chủ sở hữu để bảo vệ quyền riêng tư của chủ cũ (Gateway không hỗ trợ định danh theo lần sở hữu).'
          }
        });
      }

      const response = await fetchImpl(new URL('/api/history', gatewayUrl), {
        signal: AbortSignal.timeout(3500), redirect: 'error', headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('GATEWAY_UNAVAILABLE');
      const text = await response.text();
      if (text.length > 256000) throw new Error('INVALID_GATEWAY_RESPONSE');
      const rawHistory = JSON.parse(text);
      if (!Array.isArray(rawHistory)) throw new Error('INVALID_GATEWAY_RESPONSE');

      const history = rawHistory.slice(0, 50).map((item) => {
        const cmd = typeof item.command === 'string' ? item.command.slice(0, 64) : 'UNKNOWN';
        const seq = typeof item.sequence === 'number' && Number.isFinite(item.sequence) ? item.sequence : 0;
        const time = typeof item.time === 'string' ? item.time.slice(0, 32) : '';
        const resObj = item.result && typeof item.result === 'object' ? item.result : {};
        const display = typeof resObj.display === 'string' ? resObj.display.slice(0, 64) : null;
        const sent = resObj.sent === true;
        const local = resObj.local === true;
        const device = typeof resObj.device === 'string' ? resObj.device.slice(0, 32) : null;
        const action = typeof resObj.action === 'string' ? resObj.action.slice(0, 64) : null;

        return {
          command: cmd,
          sequence: seq,
          time,
          result: {
            display,
            sent,
            local,
            device,
            action,
            note: 'gateway received; mechanical execution not confirmed'
          }
        };
      });

      res.json({ success: true, data: { history, checkedAt: new Date().toISOString() } });
    } catch {
      res.status(503).json({ success: false, code: 'GATEWAY_UNAVAILABLE', message: 'Gateway chưa kết nối hoặc phản hồi không hợp lệ.' });
    }
  });

  return router;
}
