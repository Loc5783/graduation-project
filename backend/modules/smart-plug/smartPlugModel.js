import mongoose from 'mongoose';

/**
 * Schema lưu trữ nhật ký dữ liệu đo đạc (Telemetry) của Ổ cắm thông minh (Smart Plug)
 * Người phụ trách: Nhật Anh (nhatanh)
 */
const smartPlugTelemetrySchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      default: 'smart-plug',
      index: true
    },
    relayState: {
      type: String,
      enum: ['ON', 'OFF'],
      default: 'OFF'
    },
    voltage: {
      type: Number,
      default: null
    },
    powerWatt: {
      type: Number,
      default: null
    },
    energyKwh: {
      type: Number,
      default: null
    },
    lightLux: {
      type: Number,
      default: null
    },
    isOverloaded: {
      type: Boolean,
      default: false
    },
    overloadThreshold: {
      type: Number,
      default: 2000
    },
    verifiedHardware: {
      type: Boolean,
      default: false
    },
    isUntrusted: {
      type: Boolean,
      default: true
    },
    ownershipEpoch: {
      type: Number,
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Đánh chỉ mục kép trên deviceId và thời gian để truy vấn lịch sử nhanh chóng
smartPlugTelemetrySchema.index({ deviceId: 1, createdAt: -1 });

// Tự động xoá bản ghi theo cấu hình TTL (mặc định 7 ngày = 604800 giây) để chống tràn dung lượng database
const ttlSeconds = parseInt(process.env.TELEMETRY_TTL_SECONDS, 10) || 604800;
smartPlugTelemetrySchema.index({ createdAt: 1 }, { expireAfterSeconds: ttlSeconds });

export const SmartPlugTelemetry = mongoose.model('SmartPlugTelemetry', smartPlugTelemetrySchema);
export default SmartPlugTelemetry;
