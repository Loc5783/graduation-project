import { LIVE_DEVICE_FIELDS } from '../routes/liveDeviceRoutes.js';

// The speaker uses the gateway command history endpoint instead of telemetry.
export const DEVICE_DATA_FIELDS = Object.freeze({
  ...LIVE_DEVICE_FIELDS,
  'smart-speaker': ['command', 'result', 'time']
});
