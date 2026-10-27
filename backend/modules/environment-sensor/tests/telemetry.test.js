import { describe, it, expect } from 'vitest';
import {
  normalizeTelemetry,
  normalizeStatus,
  EnvironmentSensorTelemetry,
  DEVICE_ID
} from '../telemetry.js';

describe('EnvironmentSensor Telemetry & Normalization', () => {
  it('chuẩn hóa telemetry state hợp lệ', () => {
    const raw = {
      schemaVersion: 1,
      deviceId: DEVICE_ID,
      bootId: '1234abcd',
      kind: 'state',
      sequence: 10,
      uptimeMs: 15000,
      data: {
        temperature: 28.56,
        humidity: 62.4,
        gasRaw: 1350,
        alertLevel: 2,
        alertLevelText: 'WARNING',
        buzzerOn: true,
        isWarmingUp: false,
        warmupRemainingMs: 0,
        wifiRssi: -60,
        firmware: '1.0.0'
      }
    };

    const normalized = normalizeTelemetry(raw);
    expect(normalized).not.toBeNull();
    expect(normalized.data.temperature).toBe(28.6);
    expect(normalized.data.humidity).toBe(62.4);
    expect(normalized.data.gasRaw).toBe(1350);
    expect(normalized.data.alertLevel).toBe(2);
    expect(normalized.data.alertLevelText).toBe('WARNING');
    expect(normalized.data.buzzerOn).toBe(true);
  });

  it('từ chối telemetry sai schema hoặc deviceId', () => {
    expect(normalizeTelemetry({ deviceId: 'wrong-id' })).toBeNull();
    expect(normalizeTelemetry({ schemaVersion: 2, deviceId: DEVICE_ID })).toBeNull();
  });

  it('chuẩn hóa status online/offline LWT', () => {
    const status = normalizeStatus({
      schemaVersion: 1,
      deviceId: DEVICE_ID,
      bootId: '1234abcd',
      online: true
    });
    expect(status).toEqual({
      schemaVersion: 1,
      deviceId: DEVICE_ID,
      bootId: '1234abcd',
      online: true
    });
  });

  it('EnvironmentSensorTelemetry cập nhật snapshot khi nhận telemetry', () => {
    const telemetry = new EnvironmentSensorTelemetry({ sweepMs: 0 });
    telemetry.setBrokerConnected(true);

    const success = telemetry.ingestTelemetry({
      schemaVersion: 1,
      deviceId: DEVICE_ID,
      bootId: '1234abcd',
      kind: 'state',
      sequence: 1,
      uptimeMs: 1000,
      data: {
        temperature: 25.0,
        humidity: 50.0,
        gasRaw: 800,
        alertLevel: 1,
        alertLevelText: 'SAFE',
        buzzerOn: false,
        isWarmingUp: false,
        warmupRemainingMs: 0,
        wifiRssi: -50
      }
    });

    expect(success).toBe(true);
    const snapshot = telemetry.getSnapshot();
    expect(snapshot.availability).toBe('online');
    expect(snapshot.fresh).toBe(true);
    expect(snapshot.state.data.gasRaw).toBe(800);
    expect(snapshot.state.data.alertLevelText).toBe('SAFE');
  });
});

