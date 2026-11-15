import windowSensorConfig from './config.js';
import DevicePage from '../../shared/components/DevicePage.jsx';
import WindowSensorDashboard from './WindowSensorDashboard.jsx';

export default function WindowSensorModule() {
  return (
    <DevicePage
      config={windowSensorConfig}
      hideDescription={true}
      ownerArea={<WindowSensorDashboard />}
    />
  );
}
