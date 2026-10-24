import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import mqtt from 'mqtt';
import { STATUS_TOPIC, TELEMETRY_TOPIC } from './telemetry.js';

/** Subscribe only. This bridge never publishes lock commands. */
export function createSmartDoorLockBridge(telemetry, { env = process.env, connect = mqtt.connect, logger = console } = {}) {
  let client = null;
  let stopped = false;
  const disconnected = () => telemetry.setBrokerConnected(false);

  return {
    start() {
      if (client || stopped || !env.MQTT_URL) return false;
      const url = new URL(env.MQTT_URL);
      if (!['mqtt:', 'mqtts:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('MQTT_URL phải dùng mqtt:// hoặc mqtts://; đặt thông tin đăng nhập trong MQTT_USERNAME/MQTT_PASSWORD.');
      }
      const options = {
        clientId: env.MQTT_CLIENT_ID || `smart-home-door-${randomUUID().slice(0, 12)}`,
        username: env.MQTT_USERNAME || undefined,
        password: env.MQTT_PASSWORD || undefined,
        clean: true,
        keepalive: 30,
        connectTimeout: 5000,
        reconnectPeriod: 2000,
        resubscribe: false,
        queueQoSZero: false,
        rejectUnauthorized: true
      };
      if (env.MQTT_CA_FILE) options.ca = readFileSync(env.MQTT_CA_FILE);
      client = connect(env.MQTT_URL, options);
      client.on('connect', () => {
        if (stopped) return;
        client.subscribe([STATUS_TOPIC, TELEMETRY_TOPIC], { qos: 1 }, (error, granted) => {
          if (stopped) return;
          const allowed = !error && Array.isArray(granted) && granted.length === 2 &&
            granted.every((subscription) => subscription.qos !== 128);
          telemetry.setBrokerConnected(allowed);
          if (!allowed) logger.warn('[SmartDoorLock] Không thể đăng ký MQTT topics; kiểm tra quyền broker.');
        });
      });
      client.on('message', (topic, payload, packet = {}) => {
        if (stopped) return;
        if (topic === STATUS_TOPIC) telemetry.ingestStatus(payload);
        else if (topic === TELEMETRY_TOPIC) telemetry.ingestTelemetry(payload, packet);
      });
      client.on('offline', disconnected);
      client.on('close', disconnected);
      client.on('error', () => {
        disconnected();
        // Avoid logging URLs, credentials or a raw payload supplied by a remote peer.
        logger.warn('[SmartDoorLock] Lỗi kết nối MQTT; thiết bị sẽ thử kết nối lại.');
      });
      return true;
    },

    async close() {
      if (stopped) return;
      stopped = true;
      disconnected();
      telemetry.close();
      if (!client) return;
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 2000);
        timeout.unref();
        client.end(true, {}, () => { clearTimeout(timeout); resolve(); });
      });
      client.removeAllListeners();
      client = null;
    }
  };
}
