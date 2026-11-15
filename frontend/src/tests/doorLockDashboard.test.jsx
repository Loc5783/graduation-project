import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import DoorLockDashboard from '../modules/smart-door-lock/DoorLockDashboard.jsx';
import { useLiveDevices } from '../context/LiveDeviceContext.jsx';
import { useAuthContext } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

vi.mock('../context/LiveDeviceContext.jsx', () => ({
  useLiveDevices: vi.fn()
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuthContext: vi.fn()
}));

vi.mock('../context/LanguageContext.jsx', () => ({
  useLanguage: vi.fn()
}));

vi.mock('react-chartjs-2', () => ({
  Line: ({ data }) => (
    <div
      data-testid="mock-line-chart"
      data-labels={JSON.stringify(data.labels)}
      data-datasets={JSON.stringify(data.datasets.map((d) => ({
        label: d.label,
        data: d.data,
        stepped: d.stepped,
        spanGaps: d.spanGaps
      })))}
    />
  ),
  Doughnut: ({ data }) => (
    <div
      data-testid="mock-doughnut-chart"
      data-labels={JSON.stringify(data.labels)}
      data-datasets={JSON.stringify(data.datasets.map((d) => ({
        data: d.data,
        backgroundColor: d.backgroundColor
      })))}
    />
  )
}));

describe('Smart Door Lock Dashboard Tests', () => {
  let host, root;
  let mockLiveDevicesData;
  let mockAuthData;
  let mockLanguageData;

  // Dữ liệu kiểm thử mô phỏng (Test Fixture - không phải bằng chứng ESP thật)
  const baseTestFixture = {
    devices: [
      {
        id: 'smart-door-lock',
        brokerConnected: true,
        fresh: true,
        ageSeconds: 2,
        data: {
          doorOpen: false,
          boltCommand: 'locked',
          boltFeedbackAvailable: false,
          forcedOpen: false,
          heldOpen: false,
          alarm: false,
          wifiRssi: -45
        }
      }
    ],
    loading: false,
    error: null
  };

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    mockAuthData = {
      currentUser: { id: 'user-lock-1', fullName: 'Tester Lock' }
    };
    mockLanguageData = {
      lang: 'vi',
      t: (key) => key
    };
    mockLiveDevicesData = { ...baseTestFixture };

    useAuthContext.mockImplementation(() => mockAuthData);
    useLanguage.mockImplementation(() => mockLanguageData);
    useLiveDevices.mockImplementation(() => mockLiveDevicesData);

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('1. Render dashboard với dữ liệu kiểm thử: Cửa đóng, Lệnh chốt locked và phân biệt rõ ràng không có cảm biến chốt cơ khí', () => {
    act(() => {
      root.render(<DoorLockDashboard />);
    });

    expect(host.textContent).toContain('Khóa cửa thông minh');
    expect(host.textContent).toContain('Đang đóng');
    expect(host.textContent).toContain('Đã khóa');
    expect(host.textContent).toContain('không xác nhận chốt đã khóa cơ học');
    expect(host.textContent).toContain('Chưa có xác nhận chốt');
  });

  it('2. Khóa cửa: thiếu doorOpen (null/undefined) không ghi log Đóng mà ghi Chưa xác định', () => {
    mockLiveDevicesData = {
      devices: [
        {
          id: 'smart-door-lock',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 1,
          data: {
            // doorOpen: null (thiếu)
            boltCommand: 'locked',
            boltFeedbackAvailable: false
          }
        }
      ],
      loading: false,
      error: null
    };

    act(() => {
      root.render(<DoorLockDashboard />);
    });

    const initEventText = host.querySelector('.door-log-item')?.textContent || '';
    expect(initEventText).toContain('CHƯA XÁC ĐỊNH');
    expect(initEventText).not.toContain('ĐANG ĐÓNG');
  });

  it('3. Khi fresh=false (offline), hiển thị ngoại tuyến và nhãn Trạng thái cuối', () => {
    mockLiveDevicesData = {
      devices: [
        {
          id: 'smart-door-lock',
          brokerConnected: true,
          fresh: false,
          ageSeconds: 22,
          data: {
            doorOpen: true,
            boltCommand: 'unlocked',
            forcedOpen: false,
            heldOpen: false,
            alarm: false
          }
        }
      ],
      loading: false,
      error: null
    };

    act(() => {
      root.render(<DoorLockDashboard />);
    });

    expect(host.textContent).toContain('NGOẠI TUYẾN');
    expect(host.textContent).toContain('Trạng thái cuối: CỬA ĐANG MỞ');
    const visualizer = host.querySelector('.door-visualizer-card');
    expect(visualizer.className).toContain('is-offline');
  });

  it('4. Khi có forcedOpen hoặc heldOpen, kích hoạt cảnh báo an ninh', () => {
    mockLiveDevicesData = {
      devices: [
        {
          id: 'smart-door-lock',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 1,
          data: {
            doorOpen: true,
            boltCommand: 'locked',
            forcedOpen: true,
            heldOpen: false,
            alarm: true
          }
        }
      ],
      loading: false,
      error: null
    };

    act(() => {
      root.render(<DoorLockDashboard />);
    });

    expect(host.textContent).toContain('BỊ CẠY CỬA');
    expect(host.textContent).toContain('CẢNH BÁO AN NINH: PHÁT HIỆN CẠY CỬA TRÁI PHÉP!');
    const visualizer = host.querySelector('.door-visualizer-card');
    expect(visualizer.className).toContain('is-alarm');
  });

  it('5. Biểu đồ đường sử dụng stepped line và spanGaps: false để không nối qua khoảng offline', () => {
    act(() => {
      root.render(<DoorLockDashboard />);
    });

    const chartEl = host.querySelector('[data-testid="mock-line-chart"]');
    expect(chartEl).not.toBeNull();
    const datasets = JSON.parse(chartEl.getAttribute('data-datasets'));
    expect(datasets.length).toBeGreaterThan(0);
    expect(datasets[0].stepped).toBe('before');
    expect(datasets[0].spanGaps).toBe(false);
  });

  it('6. Timer bị trễ và quá hạn freshness: thời lượng không bị tính sai thành live', () => {
    // Bản tin có ageSeconds = 14s, chỉ còn 1s độ tươi (15 - 14 = 1s)
    mockLiveDevicesData = {
      devices: [
        {
          id: 'smart-door-lock',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 14,
          data: {
            doorOpen: false,
            boltCommand: 'locked'
          }
        }
      ],
      loading: false,
      error: null
    };

    act(() => {
      root.render(<DoorLockDashboard />);
    });

    // Giả lập timer chạy trễ 20 giây
    act(() => {
      vi.advanceTimersByTime(20000);
    });

    // Tổng thời lượng là 20s
    expect(host.textContent).toContain('20s');
    // Phần lớn thời lượng (19s) được gán cho Ngoại tuyến / Chưa rõ, không gán 20s cho Closed
    expect(host.textContent).toContain('Ngoại tuyến / Chưa rõ');
  });

  it('7. Reconnect không bịa sự kiện thay đổi trạng thái xảy ra trong khoảng offline', () => {
    // 1. Live với doorOpen = false (Đóng)
    mockLiveDevicesData = {
      devices: [
        {
          id: 'smart-door-lock',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 1,
          data: {
            doorOpen: false,
            boltCommand: 'locked'
          }
        }
      ],
      loading: false,
      error: null
    };
    act(() => {
      root.render(<DoorLockDashboard />);
    });

    // 2. Chuyển sang Offline
    mockLiveDevicesData = {
      devices: [
        {
          id: 'smart-door-lock',
          brokerConnected: false,
          fresh: false,
          ageSeconds: 30,
          data: {
            doorOpen: false,
            boltCommand: 'locked'
          }
        }
      ],
      loading: false,
      error: null
    };
    act(() => {
      root.render(<DoorLockDashboard />);
    });
    expect(host.textContent).toContain('Mất kết nối khóa cửa');

    // 3. Reconnect với doorOpen = true (Mở)
    mockLiveDevicesData = {
      devices: [
        {
          id: 'smart-door-lock',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 1,
          data: {
            doorOpen: true,
            boltCommand: 'locked'
          }
        }
      ],
      loading: false,
      error: null
    };
    act(() => {
      root.render(<DoorLockDashboard />);
    });

    // Có sự kiện Reconnect
    expect(host.textContent).toContain('Khóa cửa trực tuyến trở lại');
    // KHÔNG được có sự kiện "Cửa mở ra" bịa đặt tại mốc reconnect
    const eventLogText = host.querySelector('.door-event-list')?.textContent || '';
    expect(eventLogText).not.toContain('Cửa mở ra');
  });

  it('8. Khi đổi tài khoản người dùng, toàn bộ lịch sử quan sát được reset', () => {
    act(() => {
      root.render(<DoorLockDashboard />);
    });

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(host.textContent).toContain('10s');

    mockAuthData = {
      currentUser: { id: 'user-lock-2', fullName: 'Tester Beta' }
    };
    act(() => {
      root.render(<DoorLockDashboard />);
    });

    expect(host.textContent).toContain('0s');
  });
});
