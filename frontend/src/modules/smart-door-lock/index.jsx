import smartDoorLockConfig from './config.js';
import DevicePage from '../../shared/components/DevicePage.jsx';
import SmartDoorLockOwnerArea from './OwnerArea.jsx';

export default function SmartDoorLockModule() {
  return (
    <DevicePage
      config={smartDoorLockConfig}
      ownerArea={<SmartDoorLockOwnerArea />}
    />
  );
}
