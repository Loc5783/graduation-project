import mongoose from 'mongoose';

export const AUDIT_CATEGORIES = Object.freeze([
  'auth',
  'role',
  'device',
  'privacy',
  'system'
]);

export const AUDIT_SEVERITIES = Object.freeze([
  'info',
  'warning',
  'danger'
]);

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    category: {
      type: String,
      required: true,
      enum: AUDIT_CATEGORIES,
      default: 'system',
      index: true
    },
    severity: {
      type: String,
      required: true,
      enum: AUDIT_SEVERITIES,
      default: 'info',
      index: true
    },
    actor: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
      default: 'system',
      index: true
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    target: {
      type: String,
      trim: true,
      maxlength: 150,
      default: ''
    },
    details: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    ip: {
      type: String,
      trim: true,
      maxlength: 64,
      default: '127.0.0.1'
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 300,
      default: ''
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false,
    collection: 'audit_logs',
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id ? ret._id.toString() : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Chỉ mục tìm kiếm và phân trang ổn định theo thời gian
auditLogSchema.index({ createdAt: -1, _id: -1 });
auditLogSchema.index({ category: 1, severity: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
