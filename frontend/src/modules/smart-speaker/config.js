/**
 * Cấu hình thiết bị: Loa thông minh
 * Người phụ trách: Lộc (loc)
 * Lưu ý: Đây là cấu hình DEMO giả định, chưa đối chiếu backend chính thức.
 */
export const smartSpeakerConfig = {
  id: 'smart-speaker',
  name: 'Loa thông minh',
  owner: 'Lộc',
  icon: 'speaker',
  mqtt: {
    command: 'home/smart-speaker/command',
    status: 'home/smart-speaker/status',
    telemetry: 'home/smart-speaker/telemetry'
  },
  dataTypes: [
    {
      key: 'voice_audio_recordings',
      label: 'Bản ghi âm giọng nói & lệnh thoại',
      sensitivity: 'high',
      enabled: true
    },
    {
      key: 'conversation_transcripts',
      label: 'Văn bản phiên âm hội thoại',
      sensitivity: 'high',
      enabled: true
    },
    {
      key: 'media_playback_history',
      label: 'Lịch sử phát nhạc & radio',
      sensitivity: 'medium',
      enabled: true
    },
    {
      key: 'device_diagnostic',
      label: 'Thông tin kết nối mạng & âm lượng',
      sensitivity: 'low',
      enabled: true
    }
  ],
  accessors: [
    { name: 'Bộ điều khiển âm thanh gia đình' },
    { name: 'Ứng dụng di động nội bộ' },
    { name: 'Nền tảng xử lý giọng nói đám mây (Giả định)', external: true },
    { name: 'Dịch vụ phân tích thói quen nghe nhạc (Giả định)', external: true }
  ]
};

export default smartSpeakerConfig;
