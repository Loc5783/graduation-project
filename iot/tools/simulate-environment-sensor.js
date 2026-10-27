import mqtt from 'mqtt';
import { randomBytes } from 'node:crypto';

const BROKER = process.env.MQTT_URL || 'mqtt://broker.emqx.io:1883';
const bootId = randomBytes(4).toString('hex');
let sequence = 0;
let gasRaw = 850;
let alertLevel = 1;
let alertLevelText = 'SAFE';
let buzzerOn = false;

console.log('====================================================');
console.log(' SIMULATOR: CẢM BIẾN MÔI TRƯỜNG & GAS NHÀ BẾP (ESP32)');
console.log(' Broker:', BROKER);
console.log(' Device ID: environment-sensor | Boot ID:', bootId);
console.log('====================================================');

const client = mqtt.connect(BROKER);

client.on('connect', () => {
  console.log('[MQTT] Đã kết nối Broker thành công! Bắt đầu phát dữ liệu...');

  // Phát trạng thái Online
  const statusDoc = {
    schemaVersion: 1,
    deviceId: 'environment-sensor',
    bootId,
    online: true
  };
  client.publish('home/environment-sensor/status', JSON.stringify(statusDoc), { qos: 1, retain: true });

  let tick = 0;
  setInterval(() => {
    tick++;

    // Tự động mô phỏng chu kỳ: An toàn -> Chớm Gas -> Nguy hiểm -> Phục hồi An toàn
    if (tick % 20 < 10) {
      // Bình thường
      gasRaw = 800 + Math.floor(Math.random() * 80);
      alertLevel = 1;
      alertLevelText = 'SAFE';
      buzzerOn = false;
    } else if (tick % 20 < 15) {
      // Cảnh báo chớm có gas
      gasRaw = 1400 + Math.floor(Math.random() * 200);
      alertLevel = 2;
      alertLevelText = 'WARNING';
      buzzerOn = true;
    } else {
      // Nguy hiểm khẩn cấp
      gasRaw = 2500 + Math.floor(Math.random() * 400);
      alertLevel = 3;
      alertLevelText = 'DANGER';
      buzzerOn = true;
    }

    const statePayload = {
      schemaVersion: 1,
      deviceId: 'environment-sensor',
      bootId,
      kind: 'state',
      sequence: ++sequence,
      uptimeMs: tick * 1500,
      data: {
        temperature: Math.round((28.0 + Math.random() * 2) * 10) / 10,
        humidity: Math.round((60.0 + Math.random() * 5) * 10) / 10,
        gasRaw,
        alertLevel,
        alertLevelText,
        buzzerOn,
        isWarmingUp: false,
        warmupRemainingMs: 0,
        wifiRssi: -52,
        firmware: 'sim-1.0.0'
      }
    };

    client.publish('home/environment-sensor/telemetry', JSON.stringify(statePayload), { qos: 0 });
    console.log(`[TX #${sequence}] Gas: ${gasRaw} ADC (${alertLevelText}) | T: ${statePayload.data.temperature}°C | H: ${statePayload.data.humidity}% | Buzzer: ${buzzerOn ? 'ON' : 'OFF'}`);
  }, 1500);
});

client.on('error', (err) => {
  console.error('[MQTT Error]', err.message);
});

