import SmartPlugTelemetry from './smartPlugModel.js';
import { getDeviceAccess } from '../../src/services/deviceAccess.js';

// Trạng thái bộ nhớ đệm tức thời (In-memory cache) cho thiết bị Smart Plug
const currentDeviceState = {
  deviceId: 'smart-plug',
  relayState: 'OFF',
  voltage: null,
  powerWatt: null,
  energyKwh: null,
  lightLux: null,
  isOverloaded: false,
  overloadThreshold: 2000,
  verifiedHardware: false,
  isUntrusted: true,
  lastUpdated: null
};

/**
 * Lấy trạng thái tức thời hiện tại của Ổ cắm thông minh (đồng bộ với DB)
 * GET /api/devices/smart-plug/state
 */
export async function getState(req, res, next) {
  try {
    const { canView } = await getDeviceAccess(req.user?._id, 'smart-plug');
    if (!canView) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền xem dữ liệu ổ cắm thông minh.'
      });
    }

    const latest = await SmartPlugTelemetry.findOne({ deviceId: 'smart-plug' })
      .sort({ createdAt: -1 })
      .lean();

    const state = latest
      ? {
          deviceId: latest.deviceId,
          relayState: latest.relayState,
          voltage: latest.voltage,
          powerWatt: latest.powerWatt,
          energyKwh: latest.energyKwh,
          lightLux: latest.lightLux,
          isOverloaded: latest.isOverloaded,
          overloadThreshold: latest.overloadThreshold,
          verifiedHardware: Boolean(latest.verifiedHardware),
          isUntrusted: Boolean(latest.isUntrusted),
          lastUpdated: latest.createdAt
        }
      : currentDeviceState;

    Object.assign(currentDeviceState, state);

    return res.status(200).json({
      success: true,
      data: {
        state
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Điều khiển Bật/Tắt Rơ-le ổ cắm
 * POST /api/devices/smart-plug/relay
 * Yêu cầu: Đã đăng nhập, quyền sở hữu thiết bị (Nhật Anh hoặc Admin)
 */
export async function toggleRelay(req, res, next) {
  try {
    const { state } = req.body || {};

    if (!state || (state !== 'ON' && state !== 'OFF')) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Trạng thái rơ-le phải là "ON" hoặc "OFF".'
      });
    }

    // Kiểm tra quyền hạn của tài khoản
    const { device, canControl } = await getDeviceAccess(req.user?._id, 'smart-plug');
    if (!canControl) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền điều khiển thiết bị này. Chỉ chủ sở hữu mới được thao tác.'
      });
    }

    const latest = await SmartPlugTelemetry.findOne({ deviceId: 'smart-plug' })
      .sort({ createdAt: -1 })
      .lean();
    const isCurrentlyOverloaded = latest ? latest.isOverloaded : currentDeviceState.isOverloaded;

    if (isCurrentlyOverloaded && state === 'ON') {
      return res.status(400).json({
        success: false,
        code: 'DEVICE_OVERLOADED',
        message: 'Thiết bị đang bị khóa do Quá tải! Cần reset cảnh báo trước khi bật lại.'
      });
    }

    const recordData = {
      deviceId: 'smart-plug',
      relayState: state,
      voltage: latest ? latest.voltage : currentDeviceState.voltage,
      powerWatt: latest ? latest.powerWatt : null,
      energyKwh: latest ? latest.energyKwh : currentDeviceState.energyKwh,
      lightLux: latest ? latest.lightLux : currentDeviceState.lightLux,
      isOverloaded: false,
      overloadThreshold: latest ? latest.overloadThreshold : currentDeviceState.overloadThreshold,
      ownershipEpoch: device?.ownershipEpoch ?? null
    };

    const record = await SmartPlugTelemetry.create(recordData);

    Object.assign(currentDeviceState, {
      ...recordData,
      lastUpdated: record.createdAt
    });

    return res.status(200).json({
      success: true,
      message: `Đã ${state === 'ON' ? 'BẬT' : 'TẮT'} nguồn rơ-le ổ cắm thành công.`,
      data: {
        state: currentDeviceState
      }
    });
  } catch (err) {
    next(err);
  }
}

/** HTTP telemetry has no device identity yet. Keep this endpoint closed to writes. */
export async function postTelemetry(req, res, next) {
  try {
    const { canControl } = await getDeviceAccess(req.user?._id, 'smart-plug');
    if (!canControl) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN' });
    }
    return res.status(503).json({
      success: false,
      code: 'TELEMETRY_SOURCE_NOT_CONFIGURED',
      message: 'Chưa cấu hình xác thực nguồn telemetry HTTP cho thiết bị.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Khôi phục trạng thái an toàn sau khi bị ngắt do quá tải
 * POST /api/devices/smart-plug/reset-overload
 */
export async function resetOverload(req, res, next) {
  try {
    const { device, canControl } = await getDeviceAccess(req.user?._id, 'smart-plug');
    if (!canControl) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền thao tác trên thiết bị này. Chỉ chủ sở hữu mới được thao tác.'
      });
    }

    const latest = await SmartPlugTelemetry.findOne({ deviceId: 'smart-plug' })
      .sort({ createdAt: -1 })
      .lean();

    const recordData = {
      deviceId: 'smart-plug',
      relayState: 'OFF',
      voltage: latest ? latest.voltage : currentDeviceState.voltage,
      powerWatt: latest ? latest.powerWatt : null,
      energyKwh: latest ? latest.energyKwh : currentDeviceState.energyKwh,
      lightLux: latest ? latest.lightLux : currentDeviceState.lightLux,
      isOverloaded: false,
      overloadThreshold: latest ? latest.overloadThreshold : currentDeviceState.overloadThreshold,
      ownershipEpoch: device?.ownershipEpoch ?? null
    };

    const record = await SmartPlugTelemetry.create(recordData);

    Object.assign(currentDeviceState, {
      ...recordData,
      lastUpdated: record.createdAt
    });

    return res.status(200).json({
      success: true,
      message: 'Đã giải phóng trạng thái quá tải an toàn.',
      data: {
        state: currentDeviceState
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lấy lịch sử tiêu thụ điện phục vụ vẽ đồ thị (sắp xếp trực tiếp trong DB)
 * GET /api/devices/smart-plug/history
 */
export async function getHistory(req, res, next) {
  try {
    const { device, canView } = await getDeviceAccess(req.user?._id, 'smart-plug');
    if (!canView) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền xem lịch sử thiết bị này.'
      });
    }

    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));

    // Cách ly dữ liệu theo lần sở hữu: chỉ trả về dữ liệu phát sinh trong lần sở hữu hiện tại
    const match = { deviceId: 'smart-plug' };
    if (device?.claimedAt) {
      match.createdAt = { $gte: device.claimedAt };
    }
    if (typeof device?.ownershipEpoch === 'number' && device.ownershipEpoch > 0) {
      match.$and = [
        { createdAt: { $gte: device.claimedAt } },
        {
          $or: [
            { ownershipEpoch: device.ownershipEpoch },
            { ownershipEpoch: null }
          ]
        }
      ];
      delete match.createdAt;
    }

    const records = await SmartPlugTelemetry.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $limit: limit },
      { $sort: { createdAt: 1 } }
    ]);

    return res.status(200).json({
      success: true,
      data: {
        records
      }
    });
  } catch (err) {
    next(err);
  }
}
