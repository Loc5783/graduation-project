import environmentSensorConfig from './config.js';
import DevicePage from '../../shared/components/DevicePage.jsx';
import EnvironmentSensorOwnerArea from './OwnerArea.jsx';

export default function EnvironmentSensorModule() {
  return (
    <DevicePage
      config={environmentSensorConfig}
      ownerArea={<EnvironmentSensorOwnerArea />}
    />
  );
}
