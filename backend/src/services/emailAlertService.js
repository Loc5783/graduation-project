import User from '../models/User.js';
import RegisteredDevice from '../models/RegisteredDevice.js';
import EmailAlert from '../models/EmailAlert.js';
import { sendEmail, isEmailConfigured } from './emailService.js';

const ALERTS = {
  GAS_DANGER: 'Cảnh báo khí nguy hiểm',
  FORCED_OPEN: 'Cảnh báo cạy cửa',
  OFFLINE: 'Thiết bị mất kết nối'
};

export async function deliverDeviceEmailAlert({ userId, eventCode, eventParams, dedupKey }) {
  const label = ALERTS[eventParams?.alertKind];
  if (!label || !isEmailConfigured() || !eventParams?.deviceId) return false;
  const [user, device] = await Promise.all([
    User.findById(userId).select('email emailVerificationRequired emailVerifiedAt'),
    RegisteredDevice.findOne({ deviceId: eventParams.deviceId }).select('ownerUserId viewerUserIds').lean()
  ]);
  if (!user?.email || (user.emailVerificationRequired && !user.emailVerifiedAt) || !device) return false;
  const permitted = String(device.ownerUserId) === String(userId) ||
    (device.viewerUserIds || []).some((id) => String(id) === String(userId));
  if (!permitted) return false;
  let record;
  try {
    record = await EmailAlert.create({ userId, dedupKey, status: 'pending' });
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
  try {
    await sendEmail({ to: user.email, subject: `[Smart Home Privacy] ${label}`,
      text: `${label} tại thiết bị ${eventParams.deviceId}. Hãy đăng nhập để xem trạng thái mới nhất.\nMã sự kiện: ${eventCode}` });
    await EmailAlert.updateOne({ _id: record._id }, { $set: { status: 'sent', sentAt: new Date() } });
    return true;
  } catch (error) {
    await EmailAlert.updateOne({ _id: record._id }, { $set: { status: 'failed' } }).catch(() => {});
    console.error('[Email alert] Gửi thất bại:', error?.code || error?.message);
    return false;
  }
}
