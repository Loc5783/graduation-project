import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  challengeId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authVersion: { type: Number, default: 0 },
  purpose: { type: String, enum: ['register', 'login'], required: true },
  codeHash: { type: String, required: true },
  remember: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null }
}, { timestamps: true, collection: 'email_challenges' });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ userId: 1, purpose: 1, consumedAt: 1 });

export default mongoose.model('EmailChallenge', schema);
