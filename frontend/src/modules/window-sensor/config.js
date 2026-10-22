/**
 * Cấu hình thiết bị: Cảm biến cửa sổ
 * Người phụ trách: Minh (minh)
 * Lưu ý: Đây là cấu hình DEMO giả định, chưa đối chiếu backend chính thức. Giao thức truyền thông chưa xác nhận (không khẳng định Zigbee).
 */
export const windowSensorConfig = {
  id: 'window-sensor',
  name: 'Cảm biến cửa sổ',
  owner: 'Minh',
  icon: 'window',
  mqtt: {
    command: 'home/window-sensor/command',
    status: 'home/window-sensor/status',
    telemetry: 'home/window-sensor/telemetry'
  },
  dataTypes: [
    {
      key: 'tamper_vibration',
      label: 'Cảnh báo rung chấn & cạy mở cửa sổ',
      sensitivity: 'high',
      enabled: true
    },
    {
      key: 'open_close_events',
      label: 'Nhật ký thời điểm đóng/mở cửa sổ',
      sensitivity: 'high',
      enabled: true
    },
    {
      key: 'current_open_state',
      label: 'Trạng thái mở/đóng hiện thời',
      sensitivity: 'medium',
      enabled: true
    },
    {
      key: 'battery_and_signal',
      label: 'Mức pin & độ mạnh tín hiệu kết nối (Giao thức giả định)',
      sensitivity: 'low',
      enabled: true,
      description: 'Chỉ số chất lượng sóng vô tuyến mô phỏng; giao thức kết nối thực tế chưa xác nhận.'
    }
  ],
  accessors: [
    { name: 'Hệ thống an ninh gia đình nội bộ' },
    { name: 'Ứng dụng giám sát an ninh di động' },
    { name: 'Đơn vị giám sát an ninh khu đô thị (Giả định)', external: true }
  ]
};

export default windowSensorConfig;
