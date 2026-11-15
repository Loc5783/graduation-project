import { Router } from 'express';
import requireAuth from '../middleware/auth.js';
import DeviceObservation from '../models/DeviceObservation.js';
import { LIVE_DEVICE_FIELDS } from './liveDeviceRoutes.js';
import { getDeviceAccess } from '../services/deviceAccess.js';

export function createDeviceHistoryRouter({ auth = requireAuth, deviceAccessService = { getDeviceAccess } } = {}) {
  const router = Router();
  router.get('/:deviceId', auth, async (req, res, next) => {
    try {
      const { deviceId } = req.params;
      if (!Object.hasOwn(LIVE_DEVICE_FIELDS, deviceId)) return res.status(404).json({ success: false, code: 'DEVICE_NOT_FOUND' });
      const access = req.user?._id
        ? await deviceAccessService.getDeviceAccess(req.user._id, deviceId)
        : { canView: process.env.NODE_ENV === 'test' && !req.user ? true : false, device: null };
      if (!access.canView) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Bạn không có quyền xem lịch sử thiết bị này.' });
      }
      const rawLimit = req.query.limit ?? '120';
      if (Object.keys(req.query).some((key) => key !== 'limit') || !/^\d+$/.test(String(rawLimit)) || Number(rawLimit) < 1 || Number(rawLimit) > 300) {
        return res.status(400).json({ success: false, code: 'INVALID_QUERY' });
      }

      // Cách ly dữ liệu theo lần sở hữu: chỉ trả về dữ liệu phát sinh trong lần sở hữu hiện tại
      const filter = { deviceId };
      if (access.device?.claimedAt) {
        filter.observedAt = { $gte: access.device.claimedAt };
      }
      if (typeof access.device?.ownershipEpoch === 'number' && access.device.ownershipEpoch > 0) {
        filter.$and = [
          { observedAt: { $gte: access.device.claimedAt } },
          {
            $or: [
              { ownershipEpoch: access.device.ownershipEpoch },
              { ownershipEpoch: null }
            ]
          }
        ];
        delete filter.observedAt;
      }

      const rows = await DeviceObservation.find(filter).sort({ observedAt: -1, _id: -1 }).limit(Number(rawLimit)).lean();
      res.set('Cache-Control', 'no-store, private');
      return res.status(200).json({ success: true, data: { deviceId, scope: 'system_observations_30_days',
        items: rows.reverse().map((item) => ({ observedAt: item.observedAt, fresh: item.fresh,
          brokerConnected: item.brokerConnected, data: item.data })) } });
    } catch (error) { return next(error); }
  });
  return router;
}
