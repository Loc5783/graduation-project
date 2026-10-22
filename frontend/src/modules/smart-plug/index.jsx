import smartPlugConfig from './config.js';
import DevicePage from '../../shared/components/DevicePage.jsx';
import SmartPlugOwnerArea from './OwnerArea.jsx';

export default function SmartPlugModule() {
  return (
    <DevicePage
      config={smartPlugConfig}
      ownerArea={<SmartPlugOwnerArea />}
    />
  );
}
