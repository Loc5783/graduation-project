import mongoose from 'mongoose';
import { ALLOWED_NOTIFICATION_TYPES_FIELDS } from '../constants/notificationDefaults.js';

export const NOTIFICATION_EVENT_CODES = Object.freeze([
  'SESSION_REVOKED'
]);

export const NOTIFICATION_SEVERITIES = Object.freeze([
  'info',
  'warning',
  'urgent'
]);

/**
 * Schema quản lý thông báo người dùng (Notification Model)
 *
 * Mục đích:
 * 1. Lưu trữ thông báo trong hộp thư MongoDB cho từng người dùng (userId).
 * 2. Lưu trữ có cấu trúc: eventCode, type, severity, params (đã whitelist, giới hạn độ dài).
 * 3. Hỗ trợ đa ngôn ngữ VI/EN trên frontend thông qua eventCode và params (không lưu HTML hay văn bản cứng một ngôn ngữ).
 * 4. Chống tạo trùng bằng khóa dedupKey kết hợp userId (Unique Index).
 * 5. Tối ưu truy vấn phân trang ổn định theo { createdAt: -1, _id: -1 } và đếm chưa đọc { userId: 1, isRead: 1 }.
 * 6. Không lưu thông tin nhạy cảm: token, cookie, password, raw sessionStoreId.
 */
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    eventCode: {
      type: String,
      required: true,
      enum: NOTIFICATION_EVENT_CODES,
      trim: true
    },
    type: {
      type: String,
      required: true,
      enum: ALLOWED_NOTIFICATION_TYPES_FIELDS
    },
    severity: {
      type: String,
      required: true,
      enum: NOTIFICATION_SEVERITIES
    },
    params: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },
    isRead: {
      type: Boolean,
      required: true,
      default: false
    },
    readAt: {
      type: Date,
      default: null
    },
    isSilent: {
      type: Boolean,
      required: true,
      default: false
    },
    dedupKey: {
      type: String,
      required: true,
      trim: true
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  {
    timestamps: false,
    collection: 'notifications',
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id ? ret._id.toString() : undefined;
        delete ret._id;
        delete ret.__v;
        delete ret.userId;
        delete ret.dedupKey;
        return ret;
      }
    }
  }
);

// 1. Chỉ mục Unique chống tạo trùng thông báo cho cùng một người nhận và sự kiện
notificationSchema.index({ userId: 1, dedupKey: 1 }, { unique: true });

// 2. Chỉ mục phân trang ổn định theo thứ tự thời gian mới nhất
notificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });

// 3. Chỉ mục đếm thông báo chưa đọc nhanh
notificationSchema.index({ userId: 1, isRead: 1 });

export const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
