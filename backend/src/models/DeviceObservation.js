import mongoose from 'mongoose';
import { LIVE_DEVICE_FIELDS } from '../routes/liveDeviceRoutes.js';

const observationSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, enum: Object.keys(LIVE_DEVICE_FIELDS) },
  observedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  fresh: { type: Boolean, required: true },
  brokerConnected: { type: Boolean, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: null },
  ownershipEpoch: { type: Number, default: null }
}, { collection: 'device_observations', versionKey: false });

observationSchema.index({ deviceId: 1, observedAt: -1, _id: -1 });
// Fixed system history lifetime. User notification retention is separate.
observationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('DeviceObservation', observationSchema);
