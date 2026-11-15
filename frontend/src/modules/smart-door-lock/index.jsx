import smartDoorLockConfig from './config.js';
import DevicePage from '../../shared/components/DevicePage.jsx';
import DoorLockDashboard from './DoorLockDashboard.jsx';

export default function SmartDoorLockModule() {
  return (
    <DevicePage
      config={smartDoorLockConfig}
      ownerArea={<DoorLockDashboard />}
      hideDescription={true}
    />
  );
}
