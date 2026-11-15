import smartSpeakerConfig from './config.js';
import DevicePage from '../../shared/components/DevicePage.jsx';
import SmartSpeakerDashboard from './SmartSpeakerDashboard.jsx';

export default function SmartSpeakerModule() {
  return (
    <DevicePage
      config={smartSpeakerConfig}
      ownerArea={<SmartSpeakerDashboard />}
      hideDescription={true}
    />
  );
}
