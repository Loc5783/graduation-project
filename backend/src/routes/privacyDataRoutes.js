import { Router } from 'express';
import requireAuth from '../middleware/auth.js';
import Notification from '../models/Notification.js';
import UserSession from '../models/UserSession.js';
import { normalizePrivacy } from '../constants/privacyDefaults.js';
import verifyOrigin from '../middleware/csrf.js';
import requireJsonContentType from '../middleware/validateContentType.js';
import RegisteredDevice from '../models/RegisteredDevice.js';
import ActivityLog from '../models/ActivityLog.js';
import { DEVICE_DATA_FIELDS } from '../constants/deviceDataCatalog.js';

function currentTenureFilter(device) {
  return { deviceId: device.deviceId, ownerId: device.ownerUserId,
    ownershipEpoch: device.ownershipEpoch || 0 };
}

function dailySharing(grouped, days = 14, now = new Date()) {
  const counts = new Map(grouped.map(row => [row._id, row.count]));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now.getTime() - (days - index - 1) * 86400000).toISOString().slice(0, 10);
    return { date, count: counts.get(date) || 0 };
  });
}

// Prefix dangerous spreadsheet formulae, including values with leading whitespace.
export function csvCell(value) {
  const raw = value == null ? '' : String(value);
  const safe = /^[\s\uFEFF]*[=+\-@\t\r]/u.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function createPrivacyDataRouter({ auth = requireAuth } = {}) {
  const router = Router();
  router.get('/report', auth, async (req, res, next) => {
    try {
      const userId = req.user._id;
      const [notificationCount, activeSessionCount, devices] = await Promise.all([
        Notification.countDocuments({ userId }),
        UserSession.countDocuments({ userId, isRevoked: false, expiresAt: { $gt: new Date() } }),
        RegisteredDevice.find({ ownerUserId: userId }).select('deviceId code customName viewerUserIds collectionEnabled ownershipEpoch ownerUserId').lean()
      ]);
      const filters = devices.map(currentTenureFilter);
      const accesses = filters.length ? await ActivityLog.find({ $or: filters,
        action: { $in: ['DEVICE_DATA_READ', 'UNUSUAL_DATA_ACCESS', 'DEVICE_SHARED', 'DEVICE_SHARE_REVOKED'] } })
        .sort({ createdAt: -1, _id: -1 }).limit(50).populate('actorId', 'name email').lean() : [];
      const sharingByDay = filters.length ? await ActivityLog.aggregate([
        { $match: { $or: filters, action: 'DEVICE_DATA_READ', createdAt: { $gte: new Date(Date.now() - 13 * 86400000) },
          $expr: { $ne: ['$actorId', '$ownerId'] } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 } } }
      ]) : [];
      res.set('Cache-Control', 'no-store, private');
      return res.status(200).json({ success: true, data: {
        generatedAt: new Date().toISOString(),
        profile: { name: req.user.name, email: req.user.email, role: req.user.role, owned: req.user.owned || [] },
        retentionDays: normalizePrivacy(req.user.settings?.privacy).retentionDays,
        notificationCount, activeSessionCount,
        devices: devices.map(d => ({ id: d.deviceId, name: d.customName || d.deviceId,
          collectedFields: DEVICE_DATA_FIELDS[d.deviceId] || [], collectionEnabled: d.collectionEnabled !== false,
          viewerCount: d.viewerUserIds?.length || 0 })),
        sharingTimeline: dailySharing(sharingByDay),
        recentAccess: accesses.map(row => ({ action: row.action, deviceId: row.deviceId,
          actor: row.actorId?.name || row.actorId?.email || 'Unknown', at: row.createdAt }))
      } });
    } catch (error) { return next(error); }
  });
  router.get('/export.csv', auth, async (req, res, next) => {
    try {
      const userId = req.user._id;
      const [notifications, sessions, devices] = await Promise.all([
        Notification.find({ userId }).sort({ createdAt: 1, _id: 1 }).lean(),
        UserSession.find({ userId }).sort({ lastActiveAt: 1, _id: 1 }).lean(),
        RegisteredDevice.find({ ownerUserId: userId }).lean()
      ]);
      const filters = devices.map(currentTenureFilter);
      const accesses = filters.length ? await ActivityLog.find({ $or: filters }).sort({ createdAt: 1, _id: 1 }).lean() : [];
      const rows = [
        ['section', 'id', 'field', 'value', 'timestamp'],
        ['account', String(userId), 'name', req.user.name, req.user.createdAt],
        ['account', String(userId), 'email', req.user.email, req.user.createdAt],
        ['account', String(userId), 'role', req.user.role, req.user.createdAt],
        ['settings', String(userId), 'retentionDays', normalizePrivacy(req.user.settings?.privacy).retentionDays, '']
      ];
      for (const notification of notifications) {
        const id = String(notification._id);
        for (const field of ['eventCode', 'type', 'severity', 'isRead', 'readAt']) {
          rows.push(['notification', id, field, notification[field], notification.createdAt]);
        }
      }
      for (const session of sessions) {
        const id = String(session._id);
        for (const field of ['deviceLabel', 'browserLabel', 'lastActiveAt', 'expiresAt', 'isRevoked']) {
          rows.push(['session', id, field, session[field], session.createdAt]);
        }
      }
      for (const device of devices) {
        for (const field of ['deviceId', 'code', 'customName', 'collectionEnabled']) {
          rows.push(['device', device.deviceId, field, device[field], device.claimedAt]);
        }
        rows.push(['device', device.deviceId, 'collectedFields', (DEVICE_DATA_FIELDS[device.deviceId] || []).join('; '), device.claimedAt]);
      }
      for (const access of accesses) {
        rows.push(['access', String(access._id), access.action, `${access.deviceId} by ${access.actorId}`, access.createdAt]);
      }
      const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="my-privacy-data.csv"',
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff'
      });
      return res.status(200).send(csv);
    } catch (error) {
      return next(error);
    }
  });
  router.delete('/notifications', auth, verifyOrigin, requireJsonContentType, async (req, res, next) => {
    try {
      if (!req.body || Object.keys(req.body).length !== 1 || req.body.confirmation !== 'DELETE_NOTIFICATIONS') {
        return res.status(400).json({ success: false, code: 'CONFIRMATION_REQUIRED', message: 'Cần xác nhận xóa lịch sử thông báo.' });
      }
      const result = await Notification.deleteMany({ userId: req.user._id });
      res.set('Cache-Control', 'no-store, private');
      return res.status(200).json({ success: true, data: { deletedCount: result.deletedCount || 0 } });
    } catch (error) {
      return next(error);
    }
  });
  return router;
}
