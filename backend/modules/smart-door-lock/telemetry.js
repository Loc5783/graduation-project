import { EventEmitter } from 'node:events';

export const DEVICE_ID = 'smart-door-lock';
export const STATUS_TOPIC = 'home/smart-door-lock/status';
export const TELEMETRY_TOPIC = 'home/smart-door-lock/telemetry';
export const FRESHNESS_MS = 7000;
export const EVENT_CODES = new Set([
  'BOOT', 'ACCESS_PIN', 'ACCESS_RFID', 'ACCESS_FINGERPRINT', 'ACCESS_INSIDE',
  'PIN_FAIL', 'PIN_LOCKOUT', 'PIN_LOCKOUT_ENDED', 'RFID_REJECTED',
  'RFID_ENROLLED', 'RFID_ENROLL_FAILED', 'FP_REJECTED', 'FP_ENROLLED',
  'FP_ENROLL_FAILED', 'FP_REVOKED', 'FP_OFFLINE', 'FP_READY', 'DOOR_OPEN',
  'DOOR_CLOSED', 'FORCED_OPEN', 'DOOR_HELD', 'VIBRATION_DETECTED',
  'LIGHT_CHANGED', 'LOCK_COMMANDED', 'UNLOCK_COMMANDED', 'PIN_CONFIGURED',
  'PIN_CHANGED', 'AUTH_RESET', 'LOG_RESET'
]);

const UINT32_MAX = 0xffffffff;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const isUint32 = (value) => isInt(value, 0, UINT32_MAX);
const isBool = (value) => typeof value === 'boolean';
const isBit = (value) => value === 0 || value === 1;
const isBootId = (value) => typeof value === 'string' && /^[a-f0-9]{8}$/i.test(value);
const copy = (value) => value === null ? null : JSON.parse(JSON.stringify(value));

function parsePayload(payload) {
  if (Buffer.isBuffer(payload) || typeof payload === 'string') {
    if (Buffer.byteLength(payload) > 8192) return null;
    try { return JSON.parse(payload.toString()); } catch { return null; }
  }
  return payload;
}

// Reconstruct allowlisted fields instead of passing through arbitrary device JSON.
export function normalizeTelemetry(payload) {
  const value = parsePayload(payload);
  if (!isObject(value) || value.schemaVersion !== 1 || value.deviceId !== DEVICE_ID ||
      !isBootId(value.bootId) || !isUint32(value.sequence) || !isUint32(value.uptimeMs)) return null;
  const envelope = {
    schemaVersion: 1, deviceId: DEVICE_ID, bootId: value.bootId.toLowerCase(),
    kind: value.kind, sequence: value.sequence, uptimeMs: value.uptimeMs
  };
  if (value.kind === 'event') {
    return EVENT_CODES.has(value.code) ? { ...envelope, code: value.code } : null;
  }
  if (value.kind !== 'state' || !isObject(value.data)) return null;
  const d = value.data;
  const booleans = [
    'doorOpen', 'boltCommandCompleted', 'servoPwmReady', 'insidePressed', 'buzzerOn',
    'forcedOpen', 'heldOpen', 'pinConfigured', 'pinLockout', 'adminActive',
    'rfidDetected', 'fingerprintOnline', 'fingerprintBusy', 'oledDetected', 'nvsReady', 'fsReady'
  ];
  if (booleans.some((key) => !isBool(d[key])) || !isBit(d.doorRaw) || !isBit(d.cdsRaw) ||
      !['unknown', 'locking', 'locked', 'unlocking', 'unlocked'].includes(d.boltCommand) ||
      d.boltFeedbackAvailable !== false || d.keypadConfigured !== true ||
      !isInt(d.servoPulseUs, 0, 2500) || !isInt(d.pinLockoutRemainingMs, 0, 60000) ||
      !isInt(d.failedPinAttempts, 0, 5) || !isInt(d.rfidCards, 0, 24) ||
      !isInt(d.fingerprintCount, 0, 127) || !isInt(d.oledAddress, 0, 127) ||
      !['SH1106', 'SSD1306'].includes(d.oledDriver) || !isInt(d.wifiRssi, -127, 0) ||
      !isUint32(d.droppedEvents) || typeof d.firmware !== 'string' ||
      !/^[A-Za-z0-9._+-]{1,64}$/.test(d.firmware) || !isObject(d.vibration)) return null;
  const v = d.vibration;
  if (!isBool(v.installed) || !(v.raw === null || isBit(v.raw)) ||
      !(v.active === null || isBool(v.active)) || !isUint32(v.triggerCount) ||
      (!v.installed && (v.raw !== null || v.active !== null))) return null;
  const data = Object.fromEntries(booleans.map((key) => [key, d[key]]));
  Object.assign(data, {
    doorRaw: d.doorRaw, cdsRaw: d.cdsRaw, boltCommand: d.boltCommand,
    boltFeedbackAvailable: false, keypadConfigured: true, servoPulseUs: d.servoPulseUs,
    pinLockoutRemainingMs: d.pinLockoutRemainingMs, failedPinAttempts: d.failedPinAttempts,
    rfidCards: d.rfidCards, fingerprintCount: d.fingerprintCount, oledAddress: d.oledAddress,
    oledDriver: d.oledDriver, wifiRssi: d.wifiRssi, droppedEvents: d.droppedEvents,
    firmware: d.firmware,
    vibration: { installed: v.installed, raw: v.raw, active: v.active, triggerCount: v.triggerCount }
  });
  return { ...envelope, data };
}

export function normalizeStatus(payload) {
  const value = parsePayload(payload);
  if (!isObject(value) || value.schemaVersion !== 1 || value.deviceId !== DEVICE_ID ||
      !isBootId(value.bootId) || !isBool(value.online)) return null;
  return { schemaVersion: 1, deviceId: DEVICE_ID, bootId: value.bootId.toLowerCase(), online: value.online };
}

export function isNewerSequence(sequence, previous) {
  const difference = (sequence - previous) >>> 0;
  return difference > 0 && difference < 0x80000000;
}

/** Memory-only read model. Device credentials and raw authentication identifiers never enter it. */
export class SmartDoorLockTelemetry extends EventEmitter {
  constructor({ now = Date.now, freshnessMs = FRESHNESS_MS, sweepMs = 1000 } = {}) {
    super();
    this.now = now;
    this.freshnessMs = freshnessMs;
    this.brokerConnected = false;
    this.availability = 'unknown';
    this.receivedAtMs = null;
    this.state = null;
    this.events = [];
    this.bootId = null;
    this.lastSequence = null;
    this.retiredBoots = new Set();
    this.closed = false;
    this.timer = sweepMs > 0 ? setInterval(() => this.expire(), sweepMs) : null;
    this.timer?.unref();
  }

  getSnapshot() {
    const fresh = this.brokerConnected && this.availability === 'online' && this.receivedAtMs !== null &&
      this.now() - this.receivedAtMs < this.freshnessMs;
    return {
      deviceId: DEVICE_ID, brokerConnected: this.brokerConnected,
      availability: this.receivedAtMs !== null && !fresh ? 'offline' : this.availability,
      fresh, receivedAt: this.receivedAtMs === null ? null : new Date(this.receivedAtMs).toISOString(),
      state: copy(this.state), events: copy(this.events)
    };
  }

  broadcast() { this.emit('change', this.getSnapshot()); }

  setBrokerConnected(connected) {
    if (this.closed || this.brokerConnected === connected) return;
    this.brokerConnected = connected;
    // A broker reconnect alone never makes the last device state live again.
    if (!connected) this.availability = 'offline';
    this.broadcast();
  }

  expire() {
    if (!this.closed && this.availability === 'online' && this.receivedAtMs !== null &&
        this.now() - this.receivedAtMs >= this.freshnessMs) {
      this.availability = 'offline';
      this.broadcast();
    }
  }

  ingestStatus(payload) {
    if (this.closed || !this.brokerConnected) return false;
    const status = normalizeStatus(payload);
    if (!status || (this.bootId && status.bootId !== this.bootId)) return false;
    if (!status.online) this.availability = 'offline';
    else if (!this.state) this.availability = 'online';
    // A retained online/LWT message is not a sensor heartbeat.
    this.broadcast();
    return true;
  }

  ingestTelemetry(payload, { retain = false } = {}) {
    if (this.closed || !this.brokerConnected || retain) return false;
    const message = normalizeTelemetry(payload);
    if (!message || this.retiredBoots.has(message.bootId)) return false;
    if (message.bootId !== this.bootId) {
      if (this.bootId) {
        this.retiredBoots.add(this.bootId);
        if (this.retiredBoots.size > 32) this.retiredBoots.delete(this.retiredBoots.values().next().value);
      }
      this.bootId = message.bootId;
      this.lastSequence = null;
      // Keep historical events, but never display the previous boot's state as this boot's state.
      this.state = null;
      this.receivedAtMs = null;
      this.availability = 'unknown';
    }
    if (this.lastSequence !== null && !isNewerSequence(message.sequence, this.lastSequence)) return false;
    this.lastSequence = message.sequence;
    const receivedAt = this.now();
    if (message.kind === 'state') {
      this.state = message;
      this.receivedAtMs = receivedAt;
      this.availability = 'online';
    } else {
      this.events.unshift({ ...message, receivedAt: new Date(receivedAt).toISOString() });
      this.events = this.events.slice(0, 64);
    }
    this.broadcast();
    return true;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.emit('shutdown');
    this.removeAllListeners();
  }
}
