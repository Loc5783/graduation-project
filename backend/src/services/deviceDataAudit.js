import User from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import { dispatchNotification } from './notificationService.js';

async function writeAccess(event) {
  try {
    await ActivityLog.updateOne({ viewBucket: event.viewBucket }, { $setOnInsert: event }, { upsert: true });
  } catch (error) {
    // A concurrent identical request may win the unique bucket. The audit row
    // then exists already; other database failures must block data delivery.
    if (error?.code !== 11000) throw error;
  }
}

// Polling happens every few seconds. One row per actor/device/source/minute is
// enough to show who read data without filling MongoDB with identical rows.
export async function recordDeviceRead({ device, actorId, source, now = new Date() }) {
  if (!device?.ownerUserId || !actorId) return;
  await writeAccess({ action: 'DEVICE_DATA_READ', actorId, ownerId: device.ownerUserId,
    deviceId: device.deviceId, ownershipEpoch: device.ownershipEpoch,
    detail: source,
    viewBucket: `read:${device.deviceId}:${device.ownershipEpoch}:${actorId}:${source}:${Math.floor(now.getTime() / 60000)}` });
}

// A revoked viewer still trying to read is a concrete unusual access event.
// Deduplicate notifications and log entries for 15 minutes.
export async function recordDeniedDeviceRead({ device, actorId, source, now = new Date() }) {
  if (!device?.ownerUserId || !actorId || String(device.ownerUserId) === String(actorId)) return;
  const bucket = Math.floor(now.getTime() / 900000);
  await writeAccess({ action: 'UNUSUAL_DATA_ACCESS', actorId, ownerId: device.ownerUserId,
    deviceId: device.deviceId, ownershipEpoch: device.ownershipEpoch, detail: source,
    viewBucket: `denied:${device.deviceId}:${device.ownershipEpoch}:${actorId}:${bucket}` });
  const owner = await User.findById(device.ownerUserId).select('settings');
  if (owner) await dispatchNotification({ user: owner, eventCode: 'UNUSUAL_DATA_ACCESS',
    type: 'unusualAccess', severity: 'warning',
    eventParams: { deviceId: device.deviceId },
    dedupKey: `denied:${device.deviceId}:${device.ownershipEpoch}:${actorId}:${bucket}`, now });
}
