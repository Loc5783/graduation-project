import RegisteredDevice from '../models/RegisteredDevice.js';

export function hasDeviceView(device, userId) {
  const id = String(userId || '');
  return Boolean(device && (String(device.ownerUserId || '') === id ||
    device.viewerUserIds?.some((viewerId) => String(viewerId) === id)));
}

export function hasDeviceControl(device, userId) {
  return Boolean(device && device.ownerUserId && String(device.ownerUserId) === String(userId || ''));
}

export async function getDeviceAccess(userId, deviceId) {
  const device = await RegisteredDevice.findOne({ deviceId });
  return { device, canView: hasDeviceView(device, userId), canControl: hasDeviceControl(device, userId) };
}

export async function getAccessibleDeviceIds(userId) {
  if (!userId) return new Set();
  const docs = await RegisteredDevice.find({
    $or: [{ ownerUserId: userId }, { viewerUserIds: userId }]
  }).select('deviceId').lean();
  return new Set(docs.map((d) => d.deviceId));
}
