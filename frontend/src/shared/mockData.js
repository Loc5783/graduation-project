/**
 * Mock data generator với seed ổn định và logic xử lý dữ liệu demo.
 * Tuân thủ nghiêm ngặt các quy tắc:
 * - Mốc thời gian demo: 2026-10-20, múi giờ Asia/Ho_Chi_Minh (+07:00).
 * - Seed theo deviceId: không dùng Math.random/Date.now.
 * - Đúng 4/40 log (10%) trong khung giờ đêm 00:00 - trước 05:00.
 * - Kiểm tra riêng biệt biên 04:59 (đêm/bất thường) và 05:00 (ngày/không bất thường).
 * - Công thức điểm chia sẻ: round(100 * tổng trọng số đang bật / tổng trọng số tất cả).
 */

export const DEMO_DATE = '2026-10-20';
export const TIMEZONE = 'Asia/Ho_Chi_Minh';
export const TOTAL_LOGS_COUNT = 40;
export const NIGHT_LOGS_COUNT = 4;

export const SENSITIVITY_WEIGHTS = {
  high: 3,
  medium: 2,
  low: 1
};

/**
 * Thuật toán PRNG Mulberry32 dựa trên hash của seed string
 */
export function createPrng(seedStr = 'default-seed') {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function nextRandom() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Kiểm tra xem thời gian có thuộc khung giờ đêm hay không (00:00 đến trước 05:00)
 * 04:59 -> đêm (true)
 * 05:00 -> ngày (false)
 */
export function isNightTime(hour, minute = 0) {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return false;
  }
  return hour >= 0 && hour < 5;
}

/**
 * Kiểm tra xem hành động bên ngoài có thuộc nhóm trích xuất/chia sẻ hay không
 */
export function isExternalExportOrShare(external, action) {
  return Boolean(external) && (action === 'export' || action === 'share');
}

/**
 * Đánh giá tính bất thường và sinh lý do tương ứng
 */
export function evaluateAnomaly(hour, minute, external, action) {
  const night = isNightTime(hour, minute);
  const extRisk = isExternalExportOrShare(external, action);
  const anomalous = night || extRisk;

  const reasons = [];
  if (night) {
    reasons.push('Truy cập trong khung giờ đêm (00:00 - 04:59)');
  }
  if (extRisk) {
    reasons.push('Bên ngoài trích xuất hoặc chia sẻ dữ liệu');
  }

  return {
    anomalous,
    reason: reasons.length > 0 ? reasons.join('; ') : ''
  };
}

/**
 * Tính điểm chia sẻ dữ liệu (Share Score)
 * Công thức: round(100 * tổng trọng số đang bật / tổng trọng số tất cả)
 * Trọng số: high=3, medium=2, low=1
 * Rỗng: trả về 0
 */
export function calculateShareScore(dataTypes = [], preferences = {}) {
  if (!Array.isArray(dataTypes) || dataTypes.length === 0) {
    return 0;
  }

  let totalWeight = 0;
  let activeWeight = 0;

  for (const dt of dataTypes) {
    const weight = SENSITIVITY_WEIGHTS[dt.sensitivity] || 1;
    totalWeight += weight;
    const isEnabled = preferences[dt.key] !== undefined ? Boolean(preferences[dt.key]) : Boolean(dt.enabled);
    if (isEnabled) {
      activeWeight += weight;
    }
  }

  if (totalWeight === 0) {
    return 0;
  }

  return Math.round((100 * activeWeight) / totalWeight);
}

/**
 * Sinh danh sách 40 bản ghi log tất định cho một thiết bị
 */
export function generateLogs(config, count = TOTAL_LOGS_COUNT) {
  if (!config || !config.id) {
    return [];
  }

  const prng = createPrng(config.id);
  const dataTypes = config.dataTypes || [];
  const accessors = config.accessors || [];

  if (dataTypes.length === 0 || accessors.length === 0) {
    return [];
  }

  // Phân chia danh sách bên truy cập nội bộ và bên ngoài
  const internalAccessors = accessors.filter(a => !a.external);
  const externalAccessors = accessors.filter(a => a.external);

  // Tạo cố định mốc thời gian cho 40 log
  // Đúng 4 log đêm: index 0 (01:15), index 1 (02:30), index 2 (03:45), index 3 (04:59 - biên đêm)
  // Biên ngày: index 4 (05:00:00)
  // Các log còn lại từ index 5 đến 39 phân bổ từ 05:20 đến 23:30
  const timeSlots = [
    { hour: 1, minute: 15, second: 12 },
    { hour: 2, minute: 30, second: 45 },
    { hour: 3, minute: 45, second: 20 },
    { hour: 4, minute: 59, second: 10 }, // Biên đêm
    { hour: 5, minute: 0, second: 0 },   // Biên ngày (05:00 KHÔNG phải đêm)
    { hour: 5, minute: 40, second: 22 },
    { hour: 6, minute: 15, second: 33 },
    { hour: 6, minute: 50, second: 18 },
    { hour: 7, minute: 20, second: 55 },
    { hour: 7, minute: 55, second: 40 },
    { hour: 8, minute: 30, second: 12 },
    { hour: 9, minute: 10, second: 25 },
    { hour: 9, minute: 45, second: 50 },
    { hour: 10, minute: 20, second: 15 },
    { hour: 11, minute: 0, second: 30 },
    { hour: 11, minute: 35, second: 42 },
    { hour: 12, minute: 10, second: 19 },
    { hour: 12, minute: 50, second: 58 },
    { hour: 13, minute: 25, second: 34 },
    { hour: 14, minute: 5, second: 10 },
    { hour: 14, minute: 40, second: 26 },
    { hour: 15, minute: 15, second: 51 },
    { hour: 15, minute: 55, second: 12 },
    { hour: 16, minute: 30, second: 35 },
    { hour: 17, minute: 10, second: 44 },
    { hour: 17, minute: 45, second: 29 },
    { hour: 18, minute: 20, second: 11 },
    { hour: 18, minute: 55, second: 53 },
    { hour: 19, minute: 25, second: 37 },
    { hour: 20, minute: 5, second: 14 },
    { hour: 20, minute: 40, second: 28 },
    { hour: 21, minute: 15, second: 46 },
    { hour: 21, minute: 50, second: 21 },
    { hour: 22, minute: 15, second: 39 },
    { hour: 22, minute: 45, second: 50 },
    { hour: 23, minute: 5, second: 12 },
    { hour: 23, minute: 20, second: 30 },
    { hour: 23, minute: 35, second: 45 },
    { hour: 23, minute: 48, second: 10 },
    { hour: 23, minute: 58, second: 25 }
  ];

  const logs = [];

  for (let i = 0; i < count; i++) {
    const slot = timeSlots[i] || {
      hour: Math.floor(prng() * 19) + 5,
      minute: Math.floor(prng() * 60),
      second: Math.floor(prng() * 60)
    };

    const hour = slot.hour;
    const minute = slot.minute;
    const second = slot.second;

    // Chọn dataType tuần tự đều đặn để mọi dataKey đều có các mốc kiểm tra
    const dtIndex = i % dataTypes.length;
    const dt = dataTypes[dtIndex];

    // Xác định accessor và action:
    // Đa số action là 'read' (>= 80%)
    // Cố ý tạo tình huống:
    // - i === 2: ban đêm + external + share => cả 2 lý do bất thường
    // - i === 3: ban đêm (04:59) + internal + read => chỉ 1 lý do (ban đêm)
    // - i === 4: ban ngày (05:00) + internal + read => bình thường
    // - i === 12: ban ngày + external + export => bất thường do external export
    // - i === 25: ban ngày + external + share => bất thường do external share
    // - i === 18: ban ngày + external + read => bình thường (external đọc ban ngày là hợp lệ)
    let accessor;
    let action = 'read';

    if (i === 2) {
      accessor = externalAccessors.length > 0 ? externalAccessors[0] : accessors[0];
      action = 'share';
    } else if (i === 3) {
      accessor = internalAccessors.length > 0 ? internalAccessors[0] : accessors[0];
      action = 'read';
    } else if (i === 4) {
      accessor = internalAccessors.length > 0 ? internalAccessors[0] : accessors[0];
      action = 'read';
    } else if (i === 12) {
      accessor = externalAccessors.length > 0 ? externalAccessors[0] : accessors[0];
      action = 'export';
    } else if (i === 18) {
      accessor = externalAccessors.length > 0 ? externalAccessors[0] : accessors[0];
      action = 'read'; // External read ban ngày -> không bất thường
    } else if (i === 25) {
      accessor = externalAccessors.length > 0 ? externalAccessors[0] : accessors[0];
      action = 'share';
    } else {
      // Các log khác: dùng PRNG
      const isExternalPick = prng() < 0.25 && externalAccessors.length > 0;
      if (isExternalPick) {
        accessor = externalAccessors[Math.floor(prng() * externalAccessors.length)];
        const actionRand = prng();
        if (actionRand < 0.75) {
          action = 'read';
        } else if (actionRand < 0.9) {
          action = 'export';
        } else {
          action = 'share';
        }
      } else {
        const pool = internalAccessors.length > 0 ? internalAccessors : accessors;
        accessor = pool[Math.floor(prng() * pool.length)];
        action = 'read';
      }
    }

    const external = Boolean(accessor.external);
    const { anomalous, reason } = evaluateAnomaly(hour, minute, external, action);

    const pad = n => String(n).padStart(2, '0');
    const timeFormatted = `${DEMO_DATE} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
    const isoString = `${DEMO_DATE}T${pad(hour)}:${pad(minute)}:${pad(second)}+07:00`;

    logs.push({
      id: `${config.id}-log-${i + 1}`,
      deviceId: config.id,
      index: i + 1,
      time: timeFormatted,
      isoTime: isoString,
      hour,
      minute,
      second,
      accessor: accessor.name,
      external,
      dataKey: dt.key,
      dataLabel: dt.label,
      sensitivity: dt.sensitivity,
      action,
      anomalous,
      reason
    });
  }

  return logs;
}

/**
 * Trộn trạng thái allowed / blocked dựa theo lựa chọn hiện tại của người dùng.
 * Hàm thuần (pure function) KHÔNG làm thay đổi mảng logs gốc.
 */
export function enrichLogsWithPreferences(logs = [], devicePreferences = {}) {
  if (!Array.isArray(logs)) return [];

  return logs.map(log => {
    // Nếu preferences có giá trị rõ ràng thì lấy giá trị đó, nếu không mặc định là true
    const isEnabled = devicePreferences[log.dataKey] !== undefined ? Boolean(devicePreferences[log.dataKey]) : true;
    const status = isEnabled ? 'allowed' : 'blocked';

    return {
      ...log,
      status
    };
  });
}

/**
 * Lấy danh sách các cảnh báo đang hoạt động.
 * Điều kiện: log phải là bất thường (anomalous) VÀ đang ở trạng thái được phép (status === 'allowed').
 * Các log bị chặn (status === 'blocked') sẽ KHÔNG tạo cảnh báo.
 */
export function getActiveAlerts(enrichedLogs = []) {
  if (!Array.isArray(enrichedLogs)) return [];
  return enrichedLogs.filter(log => log.anomalous && log.status === 'allowed');
}
