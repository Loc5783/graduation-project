/**
 * Cấu hình thiết bị: Khóa cửa thông minh
 * Người phụ trách: Thành (thanh)
 * Dữ liệu trực tiếp được lấy qua API có xác thực và MQTT phía máy chủ.
 */
export const smartDoorLockConfig = {
  id: 'smart-door-lock',
  name: 'Khóa cửa thông minh',
  owner: 'Thành',
  icon: 'lock',
  mqtt: {
    command: 'home/smart-door-lock/command',
    status: 'home/smart-door-lock/status',
    telemetry: 'home/smart-door-lock/telemetry'
  },
  dataTypes: [
    {
      key: 'unlock_history',
      label: 'Lịch sử mở khóa',
      sensitivity: 'high',
      enabled: true
    },
    {
      key: 'authentication_events',
      label: 'Nhật ký xác thực mở khóa',
      sensitivity: 'high',
      enabled: true,
      description: 'Chỉ ghi nhận sự kiện/kết quả xác thực (thành công/thất bại); không chứa mã PIN, mật khẩu hoặc dữ liệu sinh trắc học.'
    },
    {
      key: 'lock_state',
      label: 'Lệnh điều khiển servo khóa',
      sensitivity: 'medium',
      enabled: true,
      description: 'Lệnh điều khiển servo và trạng thái hoàn tất; chưa có cảm biến xác nhận vị trí chốt khóa vật lý.'
    },
    {
      key: 'door_contact',
      label: 'Trạng thái tiếp điểm cửa MC38',
      sensitivity: 'medium',
      enabled: true
    },
    {
      key: 'sensor_signals',
      label: 'Tín hiệu rung, ánh sáng và nút bên trong',
      sensitivity: 'medium',
      enabled: true
    },
    {
      key: 'peripheral_health',
      label: 'Tình trạng đầu đọc, bàn phím và bộ nhớ thiết bị',
      sensitivity: 'medium',
      enabled: true
    }
  ],
  accessors: [
    { name: 'Ứng dụng gia đình (Local App)' },
    { name: 'Máy chủ trung tâm nhà thông minh (Local Hub)' },
    { name: 'Máy chủ đám mây nhà sản xuất khóa (Giả định)', external: true },
    { name: 'Đối tác bảo hiểm thông minh (Giả định)', external: true }
  ]
};

export default smartDoorLockConfig;
