import environmentSensorConfig from './config.js';
import DevicePage from '../../shared/components/DevicePage.jsx';
import EnvironmentSensorDashboard from './EnvironmentSensorDashboard.jsx';

export default function EnvironmentSensorModule() {
  return (
    <DevicePage
      config={environmentSensorConfig}
      ownerArea={<EnvironmentSensorDashboard />}
      hideDescription={true}
    />
  );
}
