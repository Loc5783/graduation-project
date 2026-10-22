/**
 * Cấu hình thiết bị: Khóa cửa thông minh
 * Người phụ trách: Thành (thanh)
 * Lưu ý: Đây là cấu hình DEMO giả định, chưa đối chiếu backend chính thức.
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
      label: 'Trạng thái chốt khóa vật lý',
      sensitivity: 'medium',
      enabled: true
    },
    {
      key: 'battery_level',
      label: 'Dung lượng pin thiết bị',
      sensitivity: 'low',
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
