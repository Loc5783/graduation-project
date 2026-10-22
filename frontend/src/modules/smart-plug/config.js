/**
 * Cấu hình thiết bị: Ổ cắm thông minh
 * Người phụ trách: Nhật Anh (nhatanh)
 * Lưu ý: Đây là cấu hình DEMO giả định, chưa đối chiếu backend chính thức.
 * Phân biệt riêng biệt công suất tức thời (W) và điện năng tiêu thụ tích lũy (kWh).
 */
export const smartPlugConfig = {
  id: 'smart-plug',
  name: 'Ổ cắm thông minh',
  owner: 'Nhật Anh',
  icon: 'plug',
  mqtt: {
    command: 'home/smart-plug/command',
    status: 'home/smart-plug/status',
    telemetry: 'home/smart-plug/telemetry'
  },
  dataTypes: [
    {
      key: 'usage_pattern_inference',
      label: 'Thói quen sinh hoạt suy luận từ chu kỳ cắm điện (Giả định demo)',
      sensitivity: 'high',
      enabled: true,
      description: 'Dữ liệu suy đoán lịch trình sinh hoạt dựa trên thời gian thiết bị tiêu thụ điện; là tính năng giả định demo.'
    },
    {
      key: 'instant_power_watt',
      label: 'Công suất tiêu thụ tức thời (W)',
      sensitivity: 'medium',
      enabled: true,
      description: 'Đo lường công suất tức thời tại thời điểm đọc (Watt).'
    },
    {
      key: 'energy_consumption_kwh',
      label: 'Điện năng tiêu thụ tích lũy (kWh)',
      sensitivity: 'medium',
      enabled: true,
      description: 'Tổng điện năng tiêu hao tích lũy theo chu kỳ (Kilowatt-giờ).'
    },
    {
      key: 'relay_state',
      label: 'Trạng thái đóng/ngắt rơ-le nguồn',
      sensitivity: 'medium',
      enabled: true
    },
    {
      key: 'voltage_and_temperature',
      label: 'Điện áp lưới & nhiệt độ ổ cắm (Giả định demo)',
      sensitivity: 'low',
      enabled: true,
      description: 'Khả năng đo điện áp và cảm biến nhiệt độ ổ cắm là thông số giả định demo.'
    }
  ],
  accessors: [
    { name: 'Hệ thống tự động hóa nhà thông minh' },
    { name: 'Ứng dụng quản lý năng lượng gia đình' },
    { name: 'Nền tảng lưới điện thông minh (Giả định)', external: true },
    { name: 'Đối tác phân tích hiệu suất năng lượng (Giả định)', external: true }
  ]
};

export default smartPlugConfig;
