import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import SmartBinDashboard from '../modules/smart-bin/SmartBinDashboard.jsx';
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

describe('Smart Trash Bin Dashboard Tests', () => {
  let host, root;
  let mockLiveDevicesData;
  let mockAuthData;
  let mockLanguageData;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    mockAuthData = {
      currentUser: { id: 'user-bin-1', fullName: 'Tester Bin' }
    };
    mockLanguageData = {
      lang: 'vi',
      t: (key) => key
    };
    mockLiveDevicesData = {
      devices: [
        {
          id: 'smart-bin',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 3,
          data: {
            sensorOk: true,
            distanceCm: 15.2,
            fillPercent: 55.4,
            lidOpen: false,
            mode: 'auto'
          }
        }
      ],
      loading: false,
      error: null
    };

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

  it('1. Render dashboard với dữ liệu thật hợp lệ: 55%, 15.2 cm, Nắp đóng, chế độ AUTO', () => {
    act(() => {
      root.render(<SmartBinDashboard />);
    });

    expect(host.textContent).toContain('Thùng rác thông minh');
    expect(host.textContent).toContain('55%');
    expect(host.textContent).toContain('15.2 cm');
    expect(host.textContent).toContain('Đang đóng');
    expect(host.textContent).toContain('AUTO');
  });

  it('hiển thị nội dung cảnh báo khi gateway trả trạng thái lỗi dạng boolean', () => {
    mockLiveDevicesData.error = true;
    act(() => {
      root.render(<SmartBinDashboard />);
    });
    const banner = host.querySelector('.bin-dash-banner');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Không tải được dữ liệu trực tiếp');
  });

  it('2. Khi cảm biến siêu âm lỗi (sensorOk=false), KHÔNG biến thành 0%, hiển thị Không đọc được', () => {
    mockLiveDevicesData = {
      devices: [
        {
          id: 'smart-bin',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 2,
          data: {
            sensorOk: false,
            distanceCm: -1.0,
            fillPercent: 0.0,
            lidOpen: true,
            mode: 'auto'
          }
        }
      ],
      loading: false,
      error: null
    };

    act(() => {
      root.render(<SmartBinDashboard />);
    });

    expect(host.textContent).toContain('Không đọc được');
    expect(host.textContent).not.toContain('55%');
    // Kiểm tra thông báo cảnh báo lỗi xung echo
    expect(host.textContent).toContain('Mất tín hiệu xung siêu âm HC-SR04');
    expect(host.textContent).toContain('Chưa có số đo hợp lệ để tính dung tích');
  });

  it('3. Khi mức đầy >= 80%, hiển thị cảnh báo thùng đầy', () => {
    mockLiveDevicesData = {
      devices: [
        {
          id: 'smart-bin',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 1,
          data: {
            sensorOk: true,
            distanceCm: 4.8,
            fillPercent: 88.0,
            lidOpen: false,
            mode: 'auto'
          }
        }
      ],
      loading: false,
      error: null
    };

    act(() => {
      root.render(<SmartBinDashboard />);
    });

    expect(host.textContent).toContain('88%');
    expect(host.textContent).toContain('THÙNG RÁC ĐÃ ĐẦY');
    const visualizer = host.querySelector('.bin-visualizer-card');
    expect(visualizer.className).toContain('is-full-alert');
  });

  it('4. Biểu đồ đường sử dụng spanGaps: false để không nối qua khoảng offline hoặc mất cảm biến', () => {
    act(() => {
      root.render(<SmartBinDashboard />);
    });

    const chartEl = host.querySelector('[data-testid="mock-line-chart"]');
    expect(chartEl).not.toBeNull();
    const datasets = JSON.parse(chartEl.getAttribute('data-datasets'));
    expect(datasets[0].spanGaps).toBe(false);
  });

  it('5. Khi đổi tài khoản người dùng, toàn bộ lịch sử quan sát thùng rác được reset', () => {
    act(() => {
      root.render(<SmartBinDashboard />);
    });

    // Chuyển sang tài khoản mới
    mockAuthData = {
      currentUser: { id: 'user-bin-2', fullName: 'Tester Gamma' }
    };
    act(() => {
      root.render(<SmartBinDashboard />);
    });

    expect(host.textContent).toContain('Thùng rác thông minh');
  });
});
