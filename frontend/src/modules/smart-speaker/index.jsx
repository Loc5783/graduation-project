import smartSpeakerConfig from './config.js';
import DevicePage from '../../shared/components/DevicePage.jsx';
import SmartSpeakerOwnerArea from './OwnerArea.jsx';

export default function SmartSpeakerModule() {
  return (
    <DevicePage
      config={smartSpeakerConfig}
      ownerArea={<SmartSpeakerOwnerArea />}
    />
  );
}
