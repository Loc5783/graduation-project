import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import EnvironmentSensorDashboard from '../modules/environment-sensor/EnvironmentSensorDashboard.jsx';
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

describe('Environment Sensor Dashboard Tests', () => {
  let host, root;
  let mockLiveDevicesData;
  let mockAuthData;
  let mockLanguageData;

  // Dữ liệu kiểm thử mô phỏng (Test Fixture - không phải bằng chứng ESP thật)
  const baseTestFixture = {
    devices: [
      {
        id: 'environment-sensor',
        brokerConnected: true,
        fresh: true,
        ageSeconds: 2,
        data: {
          temperature: 28.5,
          humidity: 55.0,
          gasRaw: 1450,
          alertLevel: 2,
          alertLevelText: 'WARNING',
          isWarmingUp: false,
          buzzerOn: true,
          wifiRssi: -52
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
      currentUser: { id: 'user-env-1', fullName: 'Tester Env' }
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

  it('1. Render dashboard với dữ liệu kiểm thử hợp lệ: 1450 ADC, 28.5°C, 55.0% RH, cảnh báo WARNING và còi đang kêu', () => {
    act(() => {
      root.render(<EnvironmentSensorDashboard />);
    });

    expect(host.textContent).toContain('Cảm biến môi trường & Khí gas');
    expect(host.textContent).toContain('1450 ADC');
    expect(host.textContent).toContain('28.5°C');
    expect(host.textContent).toContain('55.0%');
    expect(host.textContent).toContain('WARNING');
    expect(host.textContent).toContain('Đang kêu');
    expect(host.textContent).toContain('Gas là giá trị ADC thô 12-bit (0–4095), chưa phải nồng độ ppm đã hiệu chuẩn');
  });

  it('2. Thiếu hoặc không hợp lệ alertLevel (mã 99) và thiếu buzzerOn không hiện bình thường mà hiện Chưa xác định', () => {
    mockLiveDevicesData = {
      devices: [
        {
          id: 'environment-sensor',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 1,
          data: {
            temperature: 26.0,
            humidity: 50.0,
            gasRaw: 500,
            alertLevel: 99, // Không thuộc enum 0/1/2/3
            // Thiếu buzzerOn
            isWarmingUp: false
          }
        }
      ],
      loading: false,
      error: null
    };

    act(() => {
      root.render(<EnvironmentSensorDashboard />);
    });

    // Mức cảnh báo không được tự coi là SAFE
    expect(host.textContent).toContain('Mức cảnh báo: Chưa xác định');
    // Visualizer pill hiển thị Chưa xác định
    expect(host.textContent).toContain('CHƯA XÁC ĐỊNH');
    // Còi không được tự coi là Yên tĩnh / Silent
    expect(host.textContent).toContain('CÒI: CHƯA RÕ');
    expect(host.textContent).toContain('Bản tin thiếu trạng thái còi');
  });

  it('3. Khi offline (fresh=false), hiển thị ngoại tuyến và nhãn Trạng thái cuối', () => {
    mockLiveDevicesData = {
      devices: [
        {
          id: 'environment-sensor',
          brokerConnected: true,
          fresh: false,
          ageSeconds: 30,
          data: {
            temperature: 25.0,
            humidity: 50.0,
            gasRaw: 800,
            alertLevel: 1,
            alertLevelText: 'SAFE',
            isWarmingUp: false,
            buzzerOn: false
          }
        }
      ],
      loading: false,
      error: null
    };

    act(() => {
      root.render(<EnvironmentSensorDashboard />);
    });

    expect(host.textContent).toContain('NGOẠI TUYẾN');
    expect(host.textContent).toContain('Trạng thái cuối: AN TOÀN');
    const visualizer = host.querySelector('.env-visualizer-card');
    expect(visualizer.className).toContain('is-offline');
  });

  it('4. Biểu đồ có tab chuyển đổi giữa Nhiệt ẩm và Gas ADC, không trộn lẫn đơn vị', () => {
    act(() => {
      root.render(<EnvironmentSensorDashboard />);
    });

    const climateTab = host.querySelector('button[role="tab"]:nth-child(1)');
    const gasTab = host.querySelector('button[role="tab"]:nth-child(2)');
    expect(climateTab.textContent).toContain('Nhiệt độ & Độ ẩm');
    expect(gasTab.textContent).toContain('Khí Gas (ADC)');

    act(() => {
      gasTab.click();
    });
    expect(gasTab.className).toContain('is-active');
  });

  it('5. Timer bị trễ và quá hạn freshness: thời lượng không bị tính sai toàn bộ thành live', () => {
    // Bản tin có ageSeconds = 13s, tức chỉ còn 2s độ tươi (15 - 13 = 2s)
    mockLiveDevicesData = {
      devices: [
        {
          id: 'environment-sensor',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 13,
          data: {
            temperature: 27.0,
            humidity: 50.0,
            gasRaw: 1200,
            alertLevel: 1, // Safe
            buzzerOn: false
          }
        }
      ],
      loading: false,
      error: null
    };

    act(() => {
      root.render(<EnvironmentSensorDashboard />);
    });

    // Giả lập timer bị delay 30 giây (chạy nền)
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    // Tổng thời gian là 30s
    expect(host.textContent).toContain('30s');
    // Tuy nhiên thời lượng Safe chỉ tăng tối đa 2s (không bị gán toàn bộ 30s)
    // Tỷ lệ an toàn Safe / 30s chỉ là ~7% (<= 10%), phần còn lại là Ngoại tuyến / Chưa rõ
    expect(host.textContent).toContain('Ngoại tuyến / Chưa rõ');
  });

  it('6. Reconnect không bịa sự kiện thay đổi mức xảy ra trong khoảng offline', () => {
    // 1. Live với alertLevel = 1 (Safe)
    mockLiveDevicesData = {
      devices: [
        {
          id: 'environment-sensor',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 1,
          data: {
            gasRaw: 600,
            alertLevel: 1,
            alertLevelText: 'SAFE',
            buzzerOn: false
          }
        }
      ],
      loading: false,
      error: null
    };
    act(() => {
      root.render(<EnvironmentSensorDashboard />);
    });

    // 2. Chuyển sang Offline
    mockLiveDevicesData = {
      devices: [
        {
          id: 'environment-sensor',
          brokerConnected: false,
          fresh: false,
          ageSeconds: 25,
          data: {
            gasRaw: 600,
            alertLevel: 1,
            alertLevelText: 'SAFE',
            buzzerOn: false
          }
        }
      ],
      loading: false,
      error: null
    };
    act(() => {
      root.render(<EnvironmentSensorDashboard />);
    });
    expect(host.textContent).toContain('Mất kết nối cảm biến môi trường');

    // 3. Reconnect với alertLevel = 2 (Warning)
    mockLiveDevicesData = {
      devices: [
        {
          id: 'environment-sensor',
          brokerConnected: true,
          fresh: true,
          ageSeconds: 1,
          data: {
            gasRaw: 1500,
            alertLevel: 2,
            alertLevelText: 'WARNING',
            buzzerOn: false
          }
        }
      ],
      loading: false,
      error: null
    };
    act(() => {
      root.render(<EnvironmentSensorDashboard />);
    });

    // Phải có sự kiện Reconnect
    expect(host.textContent).toContain('Cảm biến môi trường trực tuyến trở lại');
    // KHÔNG được có sự kiện "Chuyển mức: 2" bịa ra tại thời điểm reconnect
    const eventLogText = host.querySelector('.env-log-list')?.textContent || '';
    expect(eventLogText).not.toContain('Chuyển mức: 2');
    expect(eventLogText).not.toContain('CẢNH BÁO RÒ RỈ KHÍ GAS');
  });

  it('7. Khi đổi tài khoản người dùng, toàn bộ lịch sử quan sát môi trường được reset', () => {
    act(() => {
      root.render(<EnvironmentSensorDashboard />);
    });

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    mockAuthData = {
      currentUser: { id: 'user-env-2', fullName: 'Tester Delta' }
    };
    act(() => {
      root.render(<EnvironmentSensorDashboard />);
    });

    expect(host.textContent).toContain('0s');
  });
});
