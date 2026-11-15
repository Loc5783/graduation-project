import { useLanguage } from '../../context/LanguageContext.jsx';

export default function SpeakerCommandGuide() {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const commandGroups = [
    {
      category: isEn ? 'Smart Trash Bin' : 'Thùng rác thông minh',
      icon: '🗑️',
      commands: [
        { phrase: 'OPEN THE BIN', desc: isEn ? 'Open trash bin lid' : 'Mở nắp thùng rác' },
        { phrase: 'CLOSE THE BIN', desc: isEn ? 'Close trash bin lid' : 'Đóng nắp thùng rác' },
        { phrase: 'SET BIN TO AUTOMATIC MODE', desc: isEn ? 'Set lid to auto mode' : 'Chuyển nắp sang tự động' },
        { phrase: 'CHECK THE BIN / BIN STATUS', desc: isEn ? 'Query fill percentage' : 'Hỏi mức đầy thùng rác' }
      ]
    },
    {
      category: isEn ? 'Door & Window Security' : 'An ninh Cửa & Cửa sổ',
      icon: '🚪',
      commands: [
        { phrase: 'DOOR STATUS / CHECK THE DOOR', desc: isEn ? 'Query door open/closed status' : 'Hỏi trạng thái cửa mở/đóng' },
        { phrase: 'WINDOW STATUS / CHECK THE WINDOW', desc: isEn ? 'Query window sensor & alarm' : 'Hỏi trạng thái cửa sổ & cảnh báo' }
      ]
    },
    {
      category: isEn ? 'Environment & Gas' : 'Môi trường & Khí gas',
      icon: '🔥',
      commands: [
        { phrase: 'GAS STATUS / CHECK THE GAS', desc: isEn ? 'Query kitchen gas level' : 'Hỏi nồng độ gas nhà bếp' },
        { phrase: 'GAS LEVEL / GAS READING', desc: isEn ? 'Query raw gas ADC reading' : 'Hỏi chỉ số cảm biến gas' }
      ]
    },
    {
      category: isEn ? 'Smart Plug & Appliances' : 'Ổ cắm & Thiết bị điện',
      icon: '🔌',
      commands: [
        { phrase: 'PLUG LIGHT ON / PLUG LIGHT OFF', desc: isEn ? 'Toggle plug lamp relay' : 'Bật/tắt đèn ổ cắm' },
        { phrase: 'FAN ON / FAN OFF', desc: isEn ? 'Toggle cooling fan relay' : 'Bật/tắt quạt làm mát' },
        { phrase: 'CHECK THE PLUG', desc: isEn ? 'Query smart plug relay states' : 'Hỏi trạng thái các rơ-le' }
      ]
    }
  ];

  return (
    <div className="speaker-guide-card">
      <div className="speaker-guide-header">
        <h3 className="speaker-guide-title">
          {isEn ? 'Supported Offline Voice Commands' : 'Cú pháp câu lệnh giọng nói hỗ trợ'}
        </h3>
        <p className="speaker-guide-subtitle">
          {isEn
            ? 'Processed on-device by ESP-SR Multinet. English speech only.'
            : 'Nhận diện cục bộ trên ESP32-S3 bằng mô hình ESP-SR Multinet (Tiếng Anh).'}
        </p>
      </div>

      <div className="speaker-guide-grid">
        {commandGroups.map((group, idx) => (
          <div key={idx} className="speaker-guide-group">
            <h4 className="speaker-group-title">
              <span className="speaker-group-icon">{group.icon}</span>
              <span>{group.category}</span>
            </h4>
            <ul className="speaker-cmd-list">
              {group.commands.map((cmd, cIdx) => (
                <li key={cIdx} className="speaker-cmd-item">
                  <code className="speaker-cmd-code">&quot;{cmd.phrase}&quot;</code>
                  <span className="speaker-cmd-desc">{cmd.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

