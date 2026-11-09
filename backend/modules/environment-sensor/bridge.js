import { randomUUID } from 'node:crypto';
import mqtt from 'mqtt';
import { STATUS_TOPIC, TELEMETRY_TOPIC, ALERT_TOPIC } from './telemetry.js';

export function createEnvironmentSensorBridge(
  telemetry,
  { env = process.env, connect = mqtt.connect, logger = console } = {}
) {
  let client = null;
  let stopped = false;
  const disconnected = () => telemetry.setBrokerConnected(false);

  return {
    start() {
      if (client || stopped) return false;
      const mqttUrl = env.MQTT_URL || 'mqtt://broker.emqx.io:1883';
      
      const options = {
        clientId: env.MQTT_ENV_CLIENT_ID || `shp-env-${randomUUID().slice(0, 8)}`,
        username: env.MQTT_USERNAME || undefined,
        password: env.MQTT_PASSWORD || undefined,
        clean: true,
        keepalive: 30,
        connectTimeout: 8000,
        reconnectPeriod: 3000,
        resubscribe: true
      };

      try {
        client = connect(mqttUrl, options);
      } catch (err) {
        logger.warn('[EnvironmentSensor] Lỗi tạo client MQTT:', err.message);
        return false;
      }

      client.on('connect', () => {
        if (stopped) return;
        const topics = [STATUS_TOPIC, TELEMETRY_TOPIC, ALERT_TOPIC];
        client.subscribe(topics, { qos: 1 }, (error, granted) => {
          if (stopped) return;
          const allowed = !error && Array.isArray(granted) && granted.length === topics.length;
          telemetry.setBrokerConnected(allowed);
          if (allowed) {
            logger.log(`[EnvironmentSensor] Đã kết nối MQTT Broker (${mqttUrl}) và lắng nghe cảm biến môi trường.`);
          } else {
            logger.warn('[EnvironmentSensor] Không thể subscribe topics cảm biến môi trường.');
          }
        });
      });

      client.on('message', (topic, payload, packet = {}) => {
        if (stopped) return;
        if (topic === STATUS_TOPIC) {
          telemetry.ingestStatus(payload);
        } else if (topic === TELEMETRY_TOPIC || topic === ALERT_TOPIC) {
          telemetry.ingestTelemetry(payload, packet);
        }
      });

      client.on('offline', disconnected);
      client.on('close', disconnected);
      client.on('error', (err) => {
        disconnected();
        logger.warn('[EnvironmentSensor] Lỗi kết nối MQTT broker:', err.message);
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
        client.end(true, {}, () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      client.removeAllListeners();
      client = null;
    }
  };
}

