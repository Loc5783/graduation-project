import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  action: { type: String, required: true, enum: ['REGISTER', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'DEVICE_SHARED', 'DEVICE_SHARE_REVOKED', 'SHARED_VIEWER_LOGIN', 'SHARED_DEVICE_VIEW', 'DEVICE_DATA_READ', 'DEVICE_COLLECTION_CHANGED', 'UNUSUAL_DATA_ACCESS'] },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: String, default: null },
  ownershipEpoch: { type: Number, default: null },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  viewBucket: { type: String, default: undefined },
  deviceLabel: { type: String, maxlength: 100, default: null },
  browserLabel: { type: String, maxlength: 100, default: null },
  detail: { type: String, maxlength: 100, default: null },
  createdAt: { type: Date, default: Date.now, required: true }
}, { collection: 'activity_logs', timestamps: false });

activityLogSchema.index({ actorId: 1, createdAt: -1, _id: -1 });
activityLogSchema.index({ ownerId: 1, deviceId: 1, ownershipEpoch: 1, createdAt: -1, _id: -1 });
activityLogSchema.index({ viewBucket: 1 }, { unique: true, sparse: true });

export default mongoose.model('ActivityLog', activityLogSchema);
