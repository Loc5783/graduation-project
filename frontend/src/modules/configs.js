/**
 * Danh sách cấu hình thuần dữ liệu cho 5 thiết bị thông minh.
 * File này CHỈ chứa dữ liệu cấu hình, tuyệt đối không import UI hoặc JSX.
 */
import smartDoorLockConfig from './smart-door-lock/config.js';
import smartSpeakerConfig from './smart-speaker/config.js';
import windowSensorConfig from './window-sensor/config.js';
import smartPlugConfig from './smart-plug/config.js';
import environmentSensorConfig from './environment-sensor/config.js';

export const deviceConfigs = [
  smartDoorLockConfig,
  smartSpeakerConfig,
  windowSensorConfig,
  smartPlugConfig,
  environmentSensorConfig
];

export const deviceConfigMap = {
  [smartDoorLockConfig.id]: smartDoorLockConfig,
  [smartSpeakerConfig.id]: smartSpeakerConfig,
  [windowSensorConfig.id]: windowSensorConfig,
  [smartPlugConfig.id]: smartPlugConfig,
  [environmentSensorConfig.id]: environmentSensorConfig
};

export function getDeviceConfig(deviceId) {
  return deviceConfigMap[deviceId] || null;
}

export default deviceConfigs;
