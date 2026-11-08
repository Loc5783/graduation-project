import SmartPlugTelemetry from './smartPlugModel.js';

// Trạng thái bộ nhớ đệm tức thời (In-memory cache) cho thiết bị Smart Plug
const currentDeviceState = {
  deviceId: 'smart-plug',
  relayState: 'OFF',
  voltage: 220.4,
  powerWatt: 0,
  energyKwh: 0.042,
  lightLux: 320,
  isOverloaded: false,
  overloadThreshold: 2000,
  lastUpdated: new Date()
};

/**
 * Lấy trạng thái tức thời hiện tại của Ổ cắm thông minh (đồng bộ với DB)
 * GET /api/devices/smart-plug/state
 */
export async function getState(req, res, next) {
  try {
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
    const user = req.user;
    const canControl = user && (user.role === 'admin' || (user.role === 'member' && Array.isArray(user.owned) && user.owned.includes('smart-plug')));

    if (!canControl) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền điều khiển thiết bị này. Chỉ Nhật Anh hoặc Quản trị viên mới được thao tác.'
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
      powerWatt: state === 'ON' ? 50.0 : 0,
      energyKwh: latest ? latest.energyKwh : currentDeviceState.energyKwh,
      lightLux: latest ? latest.lightLux : currentDeviceState.lightLux,
      isOverloaded: false,
      overloadThreshold: latest ? latest.overloadThreshold : currentDeviceState.overloadThreshold
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

/**
 * Tiếp nhận bản tin Telemetry từ thiết bị phần cứng (ESP32) hoặc worker
 * POST /api/devices/smart-plug/telemetry
 */
export async function postTelemetry(req, res, next) {
  try {
    const { relayState, voltage, powerWatt, energyKwh, lightLux } = req.body || {};

    if (typeof powerWatt !== 'number' || typeof voltage !== 'number' || Number.isNaN(powerWatt) || Number.isNaN(voltage)) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu đo đạc (voltage, powerWatt) phải là số.'
      });
    }

    if (relayState !== undefined && relayState !== 'ON' && relayState !== 'OFF') {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Trạng thái rơ-le phải là "ON" hoặc "OFF".'
      });
    }

    const latest = await SmartPlugTelemetry.findOne({ deviceId: 'smart-plug' })
      .sort({ createdAt: -1 })
      .lean();
    const threshold = latest ? latest.overloadThreshold : currentDeviceState.overloadThreshold;

    let effectiveRelayState = relayState || (latest ? latest.relayState : currentDeviceState.relayState);
    let effectivePowerWatt = powerWatt;
    let isOverloaded = false;

    // Tự động ngắt khi quá tải, hoặc tự động giải phóng khi công suất trở về mức an toàn
    if (powerWatt > threshold) {
      isOverloaded = true;
      effectiveRelayState = 'OFF';
      effectivePowerWatt = 0;
    } else {
      isOverloaded = false;
    }

    const recordData = {
      deviceId: 'smart-plug',
      relayState: effectiveRelayState,
      voltage,
      powerWatt: effectivePowerWatt,
      energyKwh: typeof energyKwh === 'number' ? energyKwh : (latest ? latest.energyKwh : currentDeviceState.energyKwh),
      lightLux: typeof lightLux === 'number' ? lightLux : (latest ? latest.lightLux : currentDeviceState.lightLux),
      isOverloaded,
      overloadThreshold: threshold
    };

    // Lưu vào database trước khi cập nhật bộ nhớ
    const record = await SmartPlugTelemetry.create(recordData);

    Object.assign(currentDeviceState, {
      ...recordData,
      lastUpdated: record.createdAt
    });

    return res.status(201).json({
      success: true,
      message: 'Đã lưu bản tin telemetry thành công.',
      data: {
        telemetry: record
      }
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
    const user = req.user;
    const canControl = user && (user.role === 'admin' || (user.role === 'member' && Array.isArray(user.owned) && user.owned.includes('smart-plug')));

    if (!canControl) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền thao tác trên thiết bị này.'
      });
    }

    const latest = await SmartPlugTelemetry.findOne({ deviceId: 'smart-plug' })
      .sort({ createdAt: -1 })
      .lean();

    const recordData = {
      deviceId: 'smart-plug',
      relayState: 'OFF',
      voltage: latest ? latest.voltage : currentDeviceState.voltage,
      powerWatt: 0,
      energyKwh: latest ? latest.energyKwh : currentDeviceState.energyKwh,
      lightLux: latest ? latest.lightLux : currentDeviceState.lightLux,
      isOverloaded: false,
      overloadThreshold: latest ? latest.overloadThreshold : currentDeviceState.overloadThreshold
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
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));

    const records = await SmartPlugTelemetry.aggregate([
      { $match: { deviceId: 'smart-plug' } },
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
