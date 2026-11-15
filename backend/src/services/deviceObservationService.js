import DeviceObservation from '../models/DeviceObservation.js';
import { normalizeLiveDevices } from '../routes/liveDeviceRoutes.js';
import User from '../models/User.js';
import RegisteredDevice from '../models/RegisteredDevice.js';
import { dispatchNotification } from './notificationService.js';

const DEVICE_HISTORY_DAYS = 30;
const DAY_MS = 86400000;

function alertKind(item) {
  if (!item.fresh || !item.data) return null;
  if (item.id === 'environment-sensor') {
    if (item.data.alertLevel === 3) return 'GAS_DANGER';
    if (item.data.alertLevel === 2) return 'GAS_WARNING';
  }
  if (item.id === 'window-sensor' && item.data.alarm === true) return 'WINDOW_ALARM';
  if (item.id === 'smart-door-lock') {
    if (item.data.forcedOpen === true) return 'FORCED_OPEN';
    if (item.data.heldOpen === true) return 'HELD_OPEN';
    if (item.data.tamper === true) return 'TAMPER';
    if (item.data.alarm === true) return 'DOOR_ALARM';
  }
  return null;
}

async function notifyResponsibleUsers(item, eventCode, kind, observedAt) {
  const reg = await RegisteredDevice.findOne({ deviceId: item.id }).select('ownerUserId viewerUserIds').lean();
  if (!reg) return;
  const userIds = [reg.ownerUserId, ...(reg.viewerUserIds || [])].filter(Boolean);
  if (!userIds.length) return;
  const recipients = await User.find({ _id: { $in: userIds } }).select('_id settings');
  const eventType = eventCode === 'DEVICE_DISCONNECTED' ? 'deviceDisconnected' : 'unusualAccess';
  const severity = kind === 'GAS_DANGER' || kind === 'FORCED_OPEN' ? 'urgent' : 'warning';
  for (const user of recipients) {
    await dispatchNotification({ user, eventCode, type: eventType, severity,
      eventParams: { deviceId: item.id, alertKind: kind },
      dedupKey: `device:${item.id}:${eventCode}:${kind}:${observedAt.getTime()}`,
      now: observedAt });
  }
}

export function createDeviceObserver({ fetchImpl = globalThis.fetch, gatewayUrl = process.env.IOT_GATEWAY_URL || 'http://127.0.0.1:8001', now = () => new Date() } = {}) {
  const lastWritten = new Map();
  let busy = false;
  async function poll() {
    if (busy) return false;
    busy = true;
    try {
      const response = await fetchImpl(new URL('/api/devices', gatewayUrl), {
        signal: AbortSignal.timeout(3500), redirect: 'error', headers: { Accept: 'application/json' }
      });
      if (!response.ok) return false;
      const text = await response.text();
      if (text.length > 128000) return false;
      const devices = normalizeLiveDevices(JSON.parse(text));
      const observedAt = now();
      for (const item of devices) {
        const fingerprint = JSON.stringify([item.fresh, item.brokerConnected, item.data]);
        const prior = lastWritten.get(item.id);
        // Write transitions and changed readings immediately. Repeat unchanged states
        // at most once per minute, preserving enough points for historical charts.
        if (prior?.fingerprint === fingerprint && observedAt.getTime() - prior.at < 60000) continue;
        if (!item.fresh && !prior) continue; // No history exists for an unseen device.
        const reg = await RegisteredDevice.findOne({ deviceId: item.id }).select('ownerUserId viewerUserIds ownershipEpoch').lean();
        await DeviceObservation.create({ deviceId: item.id, observedAt,
          expiresAt: new Date(observedAt.getTime() + DEVICE_HISTORY_DAYS * DAY_MS),
          fresh: item.fresh, brokerConnected: item.brokerConnected, data: item.data,
          ownershipEpoch: reg?.ownershipEpoch ?? null });
        const signal = alertKind(item);
        lastWritten.set(item.id, { fingerprint, at: observedAt.getTime(), fresh: item.fresh, signal });
        if (prior?.fresh && !item.fresh) {
          await notifyResponsibleUsers(item, 'DEVICE_DISCONNECTED', 'OFFLINE', observedAt);
        } else if (signal && (!prior || prior.signal !== signal)) {
          await notifyResponsibleUsers(item, 'DEVICE_ALERT', signal, observedAt);
        }
      }
      return true;
    } catch { return false; }
    finally { busy = false; }
  }
  function start(intervalMs = 5000) {
    const timer = setInterval(() => { void poll(); }, intervalMs);
    timer.unref?.();
    void poll();
    return () => clearInterval(timer);
  }
  return { poll, start };
}
