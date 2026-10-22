import windowSensorConfig from './config.js';
import DevicePage from '../../shared/components/DevicePage.jsx';
import WindowSensorOwnerArea from './OwnerArea.jsx';

export default function WindowSensorModule() {
  return (
    <DevicePage
      config={windowSensorConfig}
      ownerArea={<WindowSensorOwnerArea />}
    />
  );
}
