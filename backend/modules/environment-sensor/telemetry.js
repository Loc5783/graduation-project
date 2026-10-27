import { EventEmitter } from 'node:events';

export const DEVICE_ID = 'environment-sensor';
export const STATUS_TOPIC = 'home/environment-sensor/status';
export const TELEMETRY_TOPIC = 'home/environment-sensor/telemetry';
export const ALERT_TOPIC = 'home/environment-sensor/alert';
export const FRESHNESS_MS = 7000;

export const ALERT_CODES = new Set([
  'BOOT',
  'WARMUP_STARTED',
  'WARMUP_COMPLETED',
  'GAS_LEAK_WARNING',
  'GAS_LEAK_DANGER',
  'GAS_NORMALIZED',
  'SENSOR_ERROR'
]);

const UINT32_MAX = 0xffffffff;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const isUint32 = (value) => isInt(value, 0, UINT32_MAX);
const isBool = (value) => typeof value === 'boolean';
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isBootId = (value) => typeof value === 'string' && /^[a-f0-9]{8}$/i.test(value);
const copy = (value) => (value === null ? null : JSON.parse(JSON.stringify(value)));

function parsePayload(payload) {
  if (Buffer.isBuffer(payload) || typeof payload === 'string') {
    if (Buffer.byteLength(payload) > 8192) return null;
    try {
      return JSON.parse(payload.toString());
    } catch {
      return null;
    }
  }
  return payload;
}

export function normalizeTelemetry(payload) {
  const value = parsePayload(payload);
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    value.deviceId !== DEVICE_ID ||
    !isBootId(value.bootId) ||
    !isUint32(value.sequence) ||
    !isUint32(value.uptimeMs)
  ) {
    return null;
  }

  const envelope = {
    schemaVersion: 1,
    deviceId: DEVICE_ID,
    bootId: value.bootId.toLowerCase(),
    kind: value.kind,
    sequence: value.sequence,
    uptimeMs: value.uptimeMs
  };

  if (value.kind === 'alert') {
    const code = typeof value.code === 'string' ? value.code : 'GAS_LEAK_WARNING';
    return {
      ...envelope,
      code,
      gasRaw: isInt(value.gasRaw, 0, 4095) ? value.gasRaw : 0,
      alertLevel: isInt(value.alertLevel, 0, 3) ? value.alertLevel : 1,
      alertLevelText: typeof value.alertLevelText === 'string' ? value.alertLevelText : 'WARNING'
    };
  }

  if (value.kind !== 'state' || !isObject(value.data)) return null;

  const d = value.data;
  if (
    !isNumber(d.temperature) ||
    !isNumber(d.humidity) ||
    !isInt(d.gasRaw, 0, 4095) ||
    !isInt(d.alertLevel, 0, 3) ||
    !isBool(d.buzzerOn) ||
    !isBool(d.isWarmingUp) ||
    !isUint32(d.warmupRemainingMs)
  ) {
    return null;
  }

  const alertTexts = ['WARMUP', 'SAFE', 'WARNING', 'DANGER'];
  const data = {
    temperature: Math.round(d.temperature * 10) / 10,
    humidity: Math.round(d.humidity * 10) / 10,
    gasRaw: d.gasRaw,
    alertLevel: d.alertLevel,
    alertLevelText: alertTexts[d.alertLevel] || 'SAFE',
    buzzerOn: d.buzzerOn,
    isWarmingUp: d.isWarmingUp,
    warmupRemainingMs: d.warmupRemainingMs,
    wifiRssi: isInt(d.wifiRssi, -127, 0) ? d.wifiRssi : 0,
    firmware: typeof d.firmware === 'string' ? d.firmware.slice(0, 32) : '1.0.0'
  };

  return { ...envelope, data };
}

export function normalizeStatus(payload) {
  const value = parsePayload(payload);
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    value.deviceId !== DEVICE_ID ||
    !isBootId(value.bootId) ||
    !isBool(value.online)
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    deviceId: DEVICE_ID,
    bootId: value.bootId.toLowerCase(),
    online: value.online
  };
}

export function isNewerSequence(sequence, previous) {
  const difference = (sequence - previous) >>> 0;
  return difference > 0 && difference < 0x80000000;
}

export class EnvironmentSensorTelemetry extends EventEmitter {
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
    const fresh =
      this.brokerConnected &&
      this.availability === 'online' &&
      this.receivedAtMs !== null &&
      this.now() - this.receivedAtMs < this.freshnessMs;

    return {
      deviceId: DEVICE_ID,
      brokerConnected: this.brokerConnected,
      availability: this.receivedAtMs !== null && !fresh ? 'offline' : this.availability,
      fresh,
      receivedAt: this.receivedAtMs === null ? null : new Date(this.receivedAtMs).toISOString(),
      state: copy(this.state),
      events: copy(this.events)
    };
  }

  broadcast() {
    this.emit('change', this.getSnapshot());
  }

  setBrokerConnected(connected) {
    if (this.closed || this.brokerConnected === connected) return;
    this.brokerConnected = connected;
    if (!connected) this.availability = 'offline';
    this.broadcast();
  }

  expire() {
    if (
      !this.closed &&
      this.availability === 'online' &&
      this.receivedAtMs !== null &&
      this.now() - this.receivedAtMs >= this.freshnessMs
    ) {
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
        if (this.retiredBoots.size > 32) {
          this.retiredBoots.delete(this.retiredBoots.values().next().value);
        }
      }
      this.bootId = message.bootId;
      this.lastSequence = null;
      this.state = null;
      this.receivedAtMs = null;
      this.availability = 'unknown';
    }

    if (this.lastSequence !== null && !isNewerSequence(message.sequence, this.lastSequence)) {
      return false;
    }
    this.lastSequence = message.sequence;
    const receivedAt = this.now();

    if (message.kind === 'state') {
      this.state = message;
      this.receivedAtMs = receivedAt;
      this.availability = 'online';
    } else {
      this.events.unshift({ ...message, receivedAt: new Date(receivedAt).toISOString() });
      this.events = this.events.slice(0, 50);
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

