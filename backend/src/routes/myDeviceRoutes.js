import { Router } from 'express';
import mongoose from 'mongoose';
import RegisteredDevice from '../models/RegisteredDevice.js';
import User from '../models/User.js';
import requireAuth from '../middleware/auth.js';
import verifyOrigin from '../middleware/csrf.js';
import requireJsonContentType from '../middleware/validateContentType.js';
import { createAuthRateLimiter } from '../middleware/rateLimiter.js';
import { verifyPairingSecret } from '../services/pairingSecret.js';
import { hasDeviceControl, hasDeviceView } from '../services/deviceAccess.js';
import ActivityLog from '../models/ActivityLog.js';
import { recordActivity, publicActivity } from '../services/activityLog.js';
import { DEVICE_DATA_FIELDS } from '../constants/deviceDataCatalog.js';
import { recordDeniedDeviceRead } from '../services/deviceDataAudit.js';

const claimLimiter = createAuthRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const cleanEmail = (value) => typeof value === 'string' && value.length <= 255 ? value.trim().toLowerCase() : null;
const publicDevice = (doc, userId) => ({
  id: doc.deviceId,
  code: doc.code,
  access: hasDeviceControl(doc, userId) ? 'owner' : 'viewer',
  customName: doc.customName || null,
  claimedAt: doc.claimedAt || null,
  ownershipEpoch: doc.ownershipEpoch || 0,
  collectionEnabled: doc.collectionEnabled !== false,
  collectedFields: DEVICE_DATA_FIELDS[doc.deviceId] || []
});

export function createMyDeviceRouter({ auth = requireAuth, limiter = claimLimiter } = {}) {
  const router = Router();
  router.use(auth);
  router.get('/', async (req, res, next) => {
    try {
      const userId = req.user._id;
      const docs = await RegisteredDevice.find({ $or: [{ ownerUserId: userId }, { viewerUserIds: userId }] }).lean();
      res.set('Cache-Control', 'no-store, private');
      return res.json({ success: true, data: { devices: docs.map((doc) => publicDevice(doc, userId)) } });
    } catch (error) { return next(error); }
  });

  router.post('/claim', verifyOrigin, requireJsonContentType, limiter, async (req, res, next) => {
    try {
      const { code, pairingSecret } = req.body || {};
      if (Object.keys(req.body || {}).length !== 2 || typeof code !== 'string' || !/^[A-Z0-9]{6,32}$/i.test(code) ||
          typeof pairingSecret !== 'string' || pairingSecret.length < 12 || pairingSecret.length > 128) {
        return res.status(400).json({ success: false, code: 'INVALID_CLAIM' });
      }
      const doc = await RegisteredDevice.findOne({ code: code.toUpperCase() });
      if (!doc || !await verifyPairingSecret(pairingSecret, doc.claimSecretHash)) {
        return res.status(400).json({ success: false, code: 'CLAIM_FAILED', message: 'Mã thiết bị hoặc mã ghép nối không đúng.' });
      }
      if (doc.ownerUserId && String(doc.ownerUserId) === String(req.user._id)) {
        return res.json({ success: true, data: publicDevice(doc, req.user._id) });
      }
      const nextEpoch = (doc.ownershipEpoch || 0) + 1;
      const claimed = await RegisteredDevice.findOneAndUpdate(
        { _id: doc._id, ownerUserId: null },
        {
          $set: {
            ownerUserId: req.user._id,
            claimedAt: new Date(),
            ownershipEpoch: nextEpoch,
            viewerUserIds: [],
            customName: null,
            collectionEnabled: true
          }
        },
        { returnDocument: 'after' }
      );
      if (!claimed) return res.status(409).json({ success: false, code: 'ALREADY_CLAIMED', message: 'Thiết bị đã có chủ sở hữu.' });
      return res.status(200).json({ success: true, data: publicDevice(claimed, req.user._id) });
    } catch (error) { return next(error); }
  });

  router.get('/:deviceId', async (req, res, next) => {
    try {
      const doc = await RegisteredDevice.findOne({ deviceId: req.params.deviceId });
      if (!hasDeviceView(doc, req.user._id)) {
        await recordDeniedDeviceRead({ device: doc, actorId: req.user._id, source: 'device-page' });
        return res.status(404).json({ success: false, code: 'DEVICE_NOT_FOUND' });
      }
      if (!hasDeviceControl(doc, req.user._id)) await recordActivity({ action: 'SHARED_DEVICE_VIEW', actorId: req.user._id,
        ownerId: doc.ownerUserId, deviceId: doc.deviceId, ownershipEpoch: doc.ownershipEpoch,
        viewBucket: `${doc.deviceId}:${doc.ownershipEpoch}:${req.user._id}:${Math.floor(Date.now() / 60000)}` });
      res.set('Cache-Control', 'no-store, private');
      return res.json({ success: true, data: publicDevice(doc, req.user._id) });
    } catch (error) { return next(error); }
  });

  router.get('/:deviceId/activity', async (req, res, next) => {
    try {
      const doc = await RegisteredDevice.findOne({ deviceId: req.params.deviceId });
      if (!hasDeviceControl(doc, req.user._id)) return res.status(404).json({ success: false, code: 'DEVICE_NOT_FOUND' });
      const rows = await ActivityLog.find({ ownerId: req.user._id, deviceId: doc.deviceId,
        ownershipEpoch: doc.ownershipEpoch }).sort({ createdAt: -1, _id: -1 }).limit(50)
        .populate('actorId', 'name email').populate('subjectId', 'name email').lean();
      res.set('Cache-Control', 'no-store, private');
      return res.json({ success: true, data: { items: rows.map(publicActivity) } });
    } catch (error) { return next(error); }
  });

  router.patch('/:deviceId/collection', verifyOrigin, requireJsonContentType, async (req, res, next) => {
    try {
      if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.enabled !== 'boolean') {
        return res.status(400).json({ success: false, code: 'INVALID_COLLECTION_SETTING' });
      }
      const doc = await RegisteredDevice.findOneAndUpdate(
        { deviceId: req.params.deviceId, ownerUserId: req.user._id },
        { $set: { collectionEnabled: req.body.enabled } }, { returnDocument: 'after' }
      );
      if (!doc) return res.status(403).json({ success: false, code: 'FORBIDDEN' });
      await recordActivity({ action: 'DEVICE_COLLECTION_CHANGED', actorId: req.user._id,
        ownerId: req.user._id, deviceId: doc.deviceId, ownershipEpoch: doc.ownershipEpoch,
        detail: req.body.enabled ? 'enabled' : 'disabled' });
      res.set('Cache-Control', 'no-store, private');
      return res.json({ success: true, data: publicDevice(doc, req.user._id) });
    } catch (error) { return next(error); }
  });

  router.get('/:deviceId/shares', async (req, res, next) => {
    try {
      const doc = await RegisteredDevice.findOne({ deviceId: req.params.deviceId });
      if (!hasDeviceControl(doc, req.user._id)) return res.status(404).json({ success: false, code: 'DEVICE_NOT_FOUND' });
      const users = await User.find({ _id: { $in: doc.viewerUserIds } }).select('name email').lean();
      res.set('Cache-Control', 'no-store, private');
      return res.json({ success: true, data: { users: users.map((u) => ({ id: String(u._id), name: u.name, email: u.email })) } });
    } catch (error) { return next(error); }
  });

  router.post('/:deviceId/shares', verifyOrigin, requireJsonContentType, async (req, res, next) => {
    try {
      const email = cleanEmail(req.body?.email);
      if (Object.keys(req.body || {}).length !== 1 || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, code: 'INVALID_EMAIL' });
      }
      const recipient = await User.findOne({ email }).select('_id name email');
      if (!recipient) return res.status(404).json({ success: false, code: 'USER_NOT_FOUND' });
      if (String(recipient._id) === String(req.user._id)) return res.status(400).json({ success: false, code: 'CANNOT_SHARE_SELF' });
      const doc = await RegisteredDevice.findOneAndUpdate(
        { deviceId: req.params.deviceId, ownerUserId: req.user._id },
        { $addToSet: { viewerUserIds: recipient._id } }, { returnDocument: 'after' }
      );
      if (!doc) return res.status(404).json({ success: false, code: 'DEVICE_NOT_FOUND' });
      await recordActivity({ action: 'DEVICE_SHARED', actorId: req.user._id, ownerId: req.user._id,
        subjectId: recipient._id, deviceId: doc.deviceId, ownershipEpoch: doc.ownershipEpoch });
      return res.json({ success: true, data: { user: { id: String(recipient._id), name: recipient.name, email: recipient.email } } });
    } catch (error) { return next(error); }
  });

  router.delete('/:deviceId/shares/:userId', verifyOrigin, async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.userId)) return res.status(400).json({ success: false, code: 'INVALID_USER_ID' });
      const doc = await RegisteredDevice.findOneAndUpdate(
        { deviceId: req.params.deviceId, ownerUserId: req.user._id },
        { $pull: { viewerUserIds: new mongoose.Types.ObjectId(req.params.userId) } }, { returnDocument: 'after' }
      );
      if (!doc) return res.status(404).json({ success: false, code: 'DEVICE_NOT_FOUND' });
      await recordActivity({ action: 'DEVICE_SHARE_REVOKED', actorId: req.user._id, ownerId: req.user._id,
        subjectId: req.params.userId, deviceId: doc.deviceId, ownershipEpoch: doc.ownershipEpoch });
      return res.json({ success: true, data: { removed: true } });
    } catch (error) { return next(error); }
  });

  // Đổi tên gợi nhớ thiết bị (Chỉ Owner)
  router.patch('/:deviceId', verifyOrigin, requireJsonContentType, async (req, res, next) => {
    try {
      const doc = await RegisteredDevice.findOne({ deviceId: req.params.deviceId });
      if (!doc) return res.status(404).json({ success: false, code: 'DEVICE_NOT_FOUND', message: 'Thiết bị không tồn tại.' });
      if (!hasDeviceControl(doc, req.user._id)) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Chỉ chủ sở hữu mới có quyền đổi tên thiết bị.' });
      }
      const { customName } = req.body || {};
      if (customName !== null && customName !== undefined && typeof customName !== 'string') {
        return res.status(400).json({ success: false, code: 'INVALID_NAME', message: 'Tên gợi nhớ không hợp lệ.' });
      }
      const trimmedName = typeof customName === 'string' ? customName.trim() : null;
      if (trimmedName && trimmedName.length > 50) {
        return res.status(400).json({ success: false, code: 'NAME_TOO_LONG', message: 'Tên gợi nhớ tối đa 50 ký tự.' });
      }
      doc.customName = trimmedName || null;
      await doc.save();
      return res.json({ success: true, data: publicDevice(doc, req.user._id) });
    } catch (error) { return next(error); }
  });

  // Gỡ thiết bị khỏi tài khoản (Chỉ Owner, thu hồi toàn bộ viewer và quyền sở hữu một cách nguyên tử)
  router.post('/:deviceId/unclaim', verifyOrigin, async (req, res, next) => {
    try {
      const doc = await RegisteredDevice.findOne({ deviceId: req.params.deviceId });
      if (!doc) return res.status(404).json({ success: false, code: 'DEVICE_NOT_FOUND', message: 'Thiết bị không tồn tại.' });
      if (!hasDeviceControl(doc, req.user._id)) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Chỉ chủ sở hữu mới có quyền gỡ thiết bị khỏi tài khoản.' });
      }
      const unclaimed = await RegisteredDevice.findOneAndUpdate(
        { deviceId: req.params.deviceId, ownerUserId: req.user._id },
        {
          $set: {
            ownerUserId: null,
            claimedAt: null,
            viewerUserIds: [],
            customName: null
          }
        },
        { returnDocument: 'after' }
      );
      if (!unclaimed) {
        return res.status(404).json({ success: false, code: 'DEVICE_NOT_FOUND', message: 'Thiết bị không còn thuộc quyền sở hữu của bạn.' });
      }
      return res.json({ success: true, data: { unclaimed: true, deviceId: req.params.deviceId } });
    } catch (error) { return next(error); }
  });
  return router;
}
