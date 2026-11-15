import smartBinConfig from './config.js';
import DevicePage from '../../shared/components/DevicePage.jsx';
import SmartBinDashboard from './SmartBinDashboard.jsx';

export default function SmartBinModule() {
  return (
    <DevicePage
      config={smartBinConfig}
      ownerArea={<SmartBinDashboard />}
      hideDescription={true}
    />
  );
}
