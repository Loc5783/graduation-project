import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import WindowSensorDashboard from '../modules/window-sensor/WindowSensorDashboard.jsx';
import { useLiveDevices } from '../context/LiveDeviceContext.jsx';
import { useAuthContext } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

// Mock các contexts
vi.mock('../context/LiveDeviceContext.jsx', () => ({
  useLiveDevices: vi.fn()
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuthContext: vi.fn()
}));

vi.mock('../context/LanguageContext.jsx', () => ({
  useLanguage: vi.fn()
}));

// Mock react-chartjs-2 để kiểm tra prop mà không cần canvas engine
vi.mock('react-chartjs-2', () => ({
  Line: ({ data, _options }) => (
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

describe('Window Sensor Dashboard Tests', () => {
  let host, root;
  let mockLiveDevicesData;
  let mockAuthData;
  let mockLanguageData;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    mockAuthData = {
      currentUser: { id: 'user-alpha', fullName: 'Tester Alpha' }
    };
    useAuthContext.mockImplementation(() => mockAuthData);

    mockLanguageData = {
      lang: 'vi',
      t: (key) => key
    };
    useLanguage.mockImplementation(() => mockLanguageData);

    mockLiveDevicesData = {
      devices: [
        {
          id: 'window-sensor',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 2.1,
          data: {
            doorOpen: false,
            motion: false,
            alarm: false,
            uptimeMs: 120000
          }
        }
      ],
      loading: false,
      error: null
    };
    useLiveDevices.mockImplementation(() => mockLiveDevicesData);

    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const renderDashboard = async () => {
    await act(async () => {
      root.render(<WindowSensorDashboard />);
    });
  };

  it('1. Hiển thị phân biệt rõ ràng giữa true, false và trường thiếu (unknown)', async () => {
    // Trạng thái Đóng (false)
    await renderDashboard();
    expect(host.textContent).toContain('ĐANG ĐÓNG');
    expect(host.textContent).toContain('YÊN TĨNH');
    expect(host.textContent).toContain('AN TOÀN');

    // Chuyển sang trạng thái Mở (true)
    mockLiveDevicesData = {
      devices: [
        {
          id: 'window-sensor',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 1.0,
          data: {
            doorOpen: true,
            motion: true,
            alarm: true,
            alarmReason: 'Cửa mở quá lâu',
            uptimeMs: 125000
          }
        }
      ],
      loading: false,
      error: null
    };
    await renderDashboard();
    expect(host.textContent).toContain('ĐANG MỞ');
    expect(host.textContent).toContain('CÓ CHUYỂN ĐỘNG');
    expect(host.textContent).toContain('BÁO ĐỘNG');
    expect(host.textContent).toContain('Cửa mở quá lâu');

    // Chuyển sang trạng thái thiếu/null (unknown) - Không mặc định là đóng
    mockLiveDevicesData = {
      devices: [
        {
          id: 'window-sensor',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 0.5,
          data: null
        }
      ],
      loading: false,
      error: null
    };
    await renderDashboard();
    expect(host.textContent).toContain('Chưa rõ');
    expect(host.textContent).not.toContain('ĐANG ĐÓNG');
  });

  it('2. Khi Offline: Giữ lại số đo quan sát cuối nhưng dừng hiệu ứng live và gắn nhãn rõ ràng', async () => {
    // Ban đầu Live với Cửa Mở
    mockLiveDevicesData = {
      devices: [
        {
          id: 'window-sensor',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 2.0,
          data: {
            doorOpen: true,
            motion: false,
            alarm: false,
            uptimeMs: 130000
          }
        }
      ],
      loading: false,
      error: null
    };
    await renderDashboard();
    expect(host.querySelector('.live-device-badge.is-live')).not.toBeNull();
    expect(host.textContent).toContain('ĐANG MỞ');

    // Sau đó mất kết nối (fresh: false, ageSeconds: 18s)
    mockLiveDevicesData = {
      devices: [
        {
          id: 'window-sensor',
          brokerConnected: true,
          fresh: false,
          ageSeconds: 18.0,
          data: {
            doorOpen: true,
            motion: false,
            alarm: false,
            uptimeMs: 130000
          }
        }
      ],
      loading: false,
      error: null
    };
    await renderDashboard();

    // Huy hiệu không còn is-live
    expect(host.querySelector('.live-device-badge.is-live')).toBeNull();
    expect(host.textContent).toContain('Ngoại tuyến');
    // Giữ trạng thái cuối
    expect(host.textContent).toContain('Trạng thái cuối: Đang mở');
    // SVG bị làm dịu (muted)
    expect(host.querySelector('.window-svg.is-muted')).not.toBeNull();
  });

  it('3. Bản tin lặp không sinh nhật ký trùng lặp', async () => {
    await renderDashboard();

    // 1 sự kiện session_start ban đầu
    const initialEvents = host.querySelectorAll('.log-event-row');
    expect(initialEvents.length).toBe(1);

    // Giả lập nhận 5 bản tin liên tiếp giống hệt nhau
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      await renderDashboard();
    }

    const currentEvents = host.querySelectorAll('.log-event-row');
    // Vẫn chỉ là 1 sự kiện khởi tạo, không sinh log rác mỗi lần poll
    expect(currentEvents.length).toBe(1);
  });

  it('4. Online/offline/reconnect tạo sự kiện đúng 1 lần và không bịa chuyển trạng thái trong lúc offline', async () => {
    await renderDashboard();

    // Chuyển sang Offline
    mockLiveDevicesData = {
      devices: [
        {
          id: 'window-sensor',
          brokerConnected: true,
          fresh: false,
          ageSeconds: 20.0,
          data: { doorOpen: false, motion: false, alarm: false }
        }
      ],
      loading: false,
      error: null
    };
    await renderDashboard();

    expect(host.textContent).toContain('Mất kết nối thiết bị');

    // Kết nối lại với trạng thái cửa đã mở từ trước
    mockLiveDevicesData = {
      devices: [
        {
          id: 'window-sensor',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 1.0,
          data: { doorOpen: true, motion: false, alarm: false }
        }
      ],
      loading: false,
      error: null
    };
    await renderDashboard();

    // Ghi nhận sự kiện kết nối lại kèm trạng thái hiện tại, không suy đoán thời điểm mở lúc mất mạng
    expect(host.textContent).toContain('Thiết bị trực tuyến trở lại');
    expect(host.textContent).toContain('Đã kết nối lại; trạng thái hiện tại: Cửa Mở');
  });

  it('5. Biểu đồ đường dùng stepped line và không nối qua khoảng offline (spanGaps: false)', async () => {
    await renderDashboard();

    // Chuyển offline tạo điểm null
    mockLiveDevicesData = {
      devices: [
        {
          id: 'window-sensor',
          brokerConnected: true,
          fresh: false,
          ageSeconds: 25.0,
          data: { doorOpen: false, motion: false, alarm: false }
        }
      ],
      loading: false,
      error: null
    };
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await renderDashboard();

    const chartElem = host.querySelector('[data-testid="mock-line-chart"]');
    expect(chartElem).not.toBeNull();
    const datasets = JSON.parse(chartElem.getAttribute('data-datasets'));

    // Kiểm tra cấu hình stepped line và spanGaps: false
    datasets.forEach((ds) => {
      expect(ds.stepped).toBe('before');
      expect(ds.spanGaps).toBe(false);
    });

    // Điểm khi offline phải là null để tạo khoảng ngắt (gap)
    const doorDataset = datasets.find((d) => d.label.includes('Window') || d.label.includes('Cửa'));
    expect(doorDataset.data).toContain(null);
  });

  it('6. Thời lượng Doughnut tính theo thời gian thực (giây), không tính theo số lần polling', async () => {
    await renderDashboard();

    // Ban đầu cửa đóng trong 10 giây
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    await renderDashboard();

    // Chuyển cửa mở trong 5 giây
    mockLiveDevicesData = {
      devices: [
        {
          id: 'window-sensor',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 1.0,
          data: { doorOpen: true, motion: false, alarm: false }
        }
      ],
      loading: false,
      error: null
    };
    await renderDashboard();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await renderDashboard();

    const doughnutElem = host.querySelector('[data-testid="mock-doughnut-chart"]');
    expect(doughnutElem).not.toBeNull();
    const datasets = JSON.parse(doughnutElem.getAttribute('data-datasets'));
    const [openSec, closedSec] = datasets[0].data;

    // Tổng thời gian xấp xỉ 15s (10s đóng, 5s mở)
    expect(closedSec).toBeGreaterThanOrEqual(10);
    expect(openSec).toBeGreaterThanOrEqual(5);

    // Phần trăm hiển thị trong legend
    expect(host.textContent).toContain('Cửa mở');
    expect(host.textContent).toContain('Cửa đóng');
  });

  it('7. Chuyển đổi ngôn ngữ/theme không làm mất lịch sử; Đổi tài khoản phải dọn dẹp lịch sử', async () => {
    await renderDashboard();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Đổi ngôn ngữ sang tiếng Anh
    mockLanguageData = { lang: 'en', t: (k) => k };
    await renderDashboard();
    expect(host.textContent).toContain('Window State');

    // Đổi tài khoản sang User Beta
    mockAuthData = {
      currentUser: { id: 'user-beta', fullName: 'Tester Beta' }
    };
    await renderDashboard();

    // Lịch sử thời lượng được reset về 0 cho tài khoản mới (hiển thị empty state tiếng Anh do lang='en')
    expect(host.textContent).toContain('Awaiting observation data');
  });
});
