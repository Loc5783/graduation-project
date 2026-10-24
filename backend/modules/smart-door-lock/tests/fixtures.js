export function stateMessage(overrides = {}) {
  const message = {
    schemaVersion: 1, deviceId: 'smart-door-lock', bootId: 'a1b2c3d4',
    kind: 'state', sequence: 1, uptimeMs: 1000,
    data: {
      doorOpen: false, doorRaw: 0, boltCommand: 'locked', boltCommandCompleted: true,
      boltFeedbackAvailable: false, servoPwmReady: true, servoPulseUs: 500,
      insidePressed: false, cdsRaw: 1,
      vibration: { installed: false, raw: null, active: null, triggerCount: 0 },
      buzzerOn: false, forcedOpen: false, heldOpen: false, pinConfigured: true,
      pinLockout: false, pinLockoutRemainingMs: 0, failedPinAttempts: 0, adminActive: false,
      rfidDetected: true, rfidCards: 2, fingerprintOnline: true, fingerprintBusy: false,
      fingerprintCount: 1, keypadConfigured: true, oledDetected: true,
      oledAddress: 60, oledDriver: 'SH1106', nvsReady: true, fsReady: true,
      wifiRssi: -52, droppedEvents: 0, firmware: 'smartdoor-realtime-1'
    }
  };
  return { ...message, ...overrides, data: { ...message.data, ...overrides.data } };
}

export const eventMessage = (overrides = {}) => ({
  schemaVersion: 1, deviceId: 'smart-door-lock', bootId: 'a1b2c3d4',
  kind: 'event', sequence: 2, uptimeMs: 1100, code: 'ACCESS_INSIDE', ...overrides
});

export const statusMessage = (overrides = {}) => ({
  schemaVersion: 1, deviceId: 'smart-door-lock', bootId: 'a1b2c3d4', online: true, ...overrides
});
