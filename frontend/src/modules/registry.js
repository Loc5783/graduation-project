/**
 * Đăng ký sẵn đủ 5 trang thiết bị.
 * Route và Sidebar lấy thông tin trực tiếp từ registry này,
 * không cần sửa registry khi các thành viên chỉnh sửa nội dung trong module của mình.
 */
import SmartDoorLockModule from './smart-door-lock/index.jsx';
import SmartSpeakerModule from './smart-speaker/index.jsx';
import WindowSensorModule from './window-sensor/index.jsx';
import SmartPlugModule from './smart-plug/index.jsx';
import EnvironmentSensorModule from './environment-sensor/index.jsx';

import smartDoorLockConfig from './smart-door-lock/config.js';
import smartSpeakerConfig from './smart-speaker/config.js';
import windowSensorConfig from './window-sensor/config.js';
import smartPlugConfig from './smart-plug/config.js';
import environmentSensorConfig from './environment-sensor/config.js';

export const deviceRegistry = [
  {
    id: smartDoorLockConfig.id,
    name: smartDoorLockConfig.name,
    owner: smartDoorLockConfig.owner,
    icon: smartDoorLockConfig.icon,
    path: `/devices/${smartDoorLockConfig.id}`,
    config: smartDoorLockConfig,
    Component: SmartDoorLockModule
  },
  {
    id: smartSpeakerConfig.id,
    name: smartSpeakerConfig.name,
    owner: smartSpeakerConfig.owner,
    icon: smartSpeakerConfig.icon,
    path: `/devices/${smartSpeakerConfig.id}`,
    config: smartSpeakerConfig,
    Component: SmartSpeakerModule
  },
  {
    id: windowSensorConfig.id,
    name: windowSensorConfig.name,
    owner: windowSensorConfig.owner,
    icon: windowSensorConfig.icon,
    path: `/devices/${windowSensorConfig.id}`,
    config: windowSensorConfig,
    Component: WindowSensorModule
  },
  {
    id: smartPlugConfig.id,
    name: smartPlugConfig.name,
    owner: smartPlugConfig.owner,
    icon: smartPlugConfig.icon,
    path: `/devices/${smartPlugConfig.id}`,
    config: smartPlugConfig,
    Component: SmartPlugModule
  },
  {
    id: environmentSensorConfig.id,
    name: environmentSensorConfig.name,
    owner: environmentSensorConfig.owner,
    icon: environmentSensorConfig.icon,
    path: `/devices/${environmentSensorConfig.id}`,
    config: environmentSensorConfig,
    Component: EnvironmentSensorModule
  }
];

export const registryMap = deviceRegistry.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export function getRegistryItem(id) {
  return registryMap[id] || null;
}

export default deviceRegistry;
