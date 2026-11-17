import mongoose from 'mongoose';

const emailAlertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  dedupKey: { type: String, required: true },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 90 * 86400000) },
  sentAt: { type: Date, default: null }
});
emailAlertSchema.index({ userId: 1, dedupKey: 1 }, { unique: true });
emailAlertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('EmailAlert', emailAlertSchema);
