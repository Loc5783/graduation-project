import mongoose from 'mongoose';

// The current MQTT topics identify one physical unit per device type. A second
// unit of the same type needs its own topic before it can be registered here.
export const DEVICE_TYPES = Object.freeze([
  'smart-bin', 'smart-door-lock', 'smart-speaker', 'window-sensor',
  'smart-plug', 'environment-sensor'
]);

const schema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, trim: true, minlength: 6, maxlength: 32 },
  deviceId: { type: String, required: true, enum: DEVICE_TYPES },
  claimSecretHash: { type: String, required: true },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  viewerUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  customName: { type: String, default: null, trim: true, maxlength: 50 },
  claimedAt: { type: Date, default: null },
  ownershipEpoch: { type: Number, default: 0 }
}, { timestamps: true, collection: 'registered_devices' });

schema.index({ code: 1 }, { unique: true });
schema.index({ deviceId: 1 }, { unique: true });
schema.index({ ownerUserId: 1 });
schema.index({ viewerUserIds: 1 });

export default mongoose.model('RegisteredDevice', schema);
