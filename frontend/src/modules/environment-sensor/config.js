/**
 * Cấu hình thiết bị: Cảm biến môi trường
 * Người phụ trách: Quỳnh (quynh)
 * Lưu ý: Đây là cấu hình DEMO giả định, chưa đối chiếu backend chính thức.
 * Các khả năng đo CO2, VOC và suy luận có người trong phòng là giả định demo.
 */
export const environmentSensorConfig = {
  id: 'environment-sensor',
  name: 'Cảm biến môi trường',
  owner: 'Quỳnh',
  icon: 'environment',
  mqtt: {
    command: 'home/environment-sensor/command',
    status: 'home/environment-sensor/status',
    telemetry: 'home/environment-sensor/telemetry'
  },
  dataTypes: [
    {
      key: 'co2_presence_inference',
      label: 'Nồng độ CO₂ suy luận hiện diện (Giả định demo)',
      sensitivity: 'high',
      enabled: true,
      description: 'Chỉ số CO2 được dùng để suy đoán có người trong phòng; đây là chức năng giả định demo.'
    },
    {
      key: 'indoor_climate',
      label: 'Nhiệt độ & độ ẩm phòng',
      sensitivity: 'medium',
      enabled: true
    },
    {
      key: 'ambient_light',
      label: 'Cường độ ánh sáng môi trường (Lux)',
      sensitivity: 'medium',
      enabled: true
    },
    {
      key: 'voc_air_quality',
      label: 'Chỉ số hợp chất hữu cơ bay hơi VOC (Giả định demo)',
      sensitivity: 'low',
      enabled: true,
      description: 'Khả năng quan trắc chỉ số VOC là cảm biến giả định demo.'
    }
  ],
  accessors: [
    { name: 'Bộ điều hòa không khí thông minh nội bộ (HVAC)' },
    { name: 'Màn hình hiển thị trung tâm phòng khách' },
    { name: 'Nền tảng thời tiết & quan trắc môi trường (Giả định)', external: true }
  ]
};

export default environmentSensorConfig;
