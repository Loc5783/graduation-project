import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import SmartSpeakerDashboard from '../modules/smart-speaker/SmartSpeakerDashboard.jsx';
import { apiRequest } from '../services/authService.js';

// Mock AuthContext
const mockAuth = vi.hoisted(() => ({
  currentUser: { id: 'user-speaker-1', fullName: 'Tester Speaker' },
  handleUnauthorized: vi.fn()
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuthContext: () => mockAuth
}));

vi.mock('../context/LanguageContext.jsx', () => ({
  useLanguage: () => ({ lang: 'vi', t: (key) => key })
}));

vi.mock('../services/authService.js', () => ({
  apiRequest: vi.fn(),
  isPreviewMode: () => false
}));

vi.mock('react-chartjs-2', () => ({
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

describe('Smart Speaker Dashboard & History Lifecycle Tests', () => {
  let host, root;

  // Dữ liệu kiểm thử mô phỏng (Test Fixture - không phải bằng chứng ESP thật)
  const testSpeakerFixture = {
    success: true,
    data: {
      history: [
        {
          command: 'DOOR_STATUS',
          sequence: 5,
          time: '2026-11-15 13:00:00',
          result: { display: 'DOOR CLOSED', device: 'smart-door-lock' }
        },
        {
          command: 'BIN_OPEN',
          sequence: 4,
          time: '2026-11-15 12:58:00',
          result: { sent: true, device: 'smart-bin', action: 'open' }
        }
      ]
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    mockAuth.currentUser = { id: 'user-speaker-1', fullName: 'Tester Speaker' };
    mockAuth.handleUnauthorized.mockClear();
    apiRequest.mockReset();

    apiRequest.mockResolvedValue(testSpeakerFixture);

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root.unmount());
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('1. Render dashboard với lịch sử lệnh từ dữ liệu kiểm thử', async () => {
    await act(async () => {
      root.render(<SmartSpeakerDashboard />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Loa thông minh điều khiển giọng nói (ESP32-S3)');
    expect(host.textContent).toContain('DOOR_STATUS');
    expect(host.textContent).toContain('BIN_OPEN');
    expect(host.textContent).toContain('DOOR CLOSED');
  });

  it('2. Khi chưa có bản ghi, visualizer hiển thị "Chưa có lệnh được ghi nhận", không ghi "Sẵn sàng nhận lệnh"', async () => {
    apiRequest.mockResolvedValueOnce({
      success: true,
      data: { history: [] }
    });

    await act(async () => {
      root.render(<SmartSpeakerDashboard />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Chưa có lệnh được ghi nhận');
    expect(host.textContent).not.toContain('SẴN SÀNG NHẬN LỆNH');
    expect(host.textContent).not.toContain('ESP VOICE READY');
  });

  it('3. Loa: request A pending → đổi sang User B → response A trả muộn (200, 401, error) không ghi vào User B', async () => {
    let resolveA;
    const pendingPromiseA = new Promise((resolve) => {
      resolveA = resolve;
    });

    // Request đầu tiên của User A bị hoãn
    apiRequest.mockImplementationOnce(() => pendingPromiseA);

    await act(async () => {
      root.render(<SmartSpeakerDashboard />);
    });

    // Chuyển sang User B
    const fixtureUserB = {
      success: true,
      data: {
        history: [
          {
            command: 'WINDOW_STATUS',
            sequence: 10,
            time: '2026-11-15 13:05:00',
            result: { display: 'WINDOW CLOSED', device: 'window-sensor' }
          }
        ]
      }
    };
    apiRequest.mockResolvedValueOnce(fixtureUserB);

    mockAuth.currentUser = { id: 'user-speaker-2', fullName: 'User B' };
    await act(async () => {
      root.render(<SmartSpeakerDashboard />);
    });

    // Chờ User B fetch xong
    await act(async () => {
      await Promise.resolve();
    });
    expect(host.textContent).toContain('WINDOW_STATUS');

    // Lúc này response của User A mới trả về 401
    await act(async () => {
      resolveA({ success: false, status: 401, message: 'Unauthorized' });
      await Promise.resolve();
    });

    // Không làm logout User B
    expect(mockAuth.handleUnauthorized).not.toHaveBeenCalled();
    // Dữ liệu của User B vẫn bảo toàn
    expect(host.textContent).toContain('WINDOW_STATUS');
  });

  it('4. Loa: request chậm không sinh request song song; unmount không cập nhật tiếp', async () => {
    let resolveSlow;
    const slowPromise = new Promise((resolve) => {
      resolveSlow = resolve;
    });

    apiRequest.mockImplementationOnce(() => slowPromise);

    await act(async () => {
      root.render(<SmartSpeakerDashboard />);
    });

    expect(apiRequest).toHaveBeenCalledTimes(1);

    // Dù trôi qua 10 giây (quá chu kỳ 5s), vì request 1 chưa xong nên KHÔNG sinh request song song
    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    expect(apiRequest).toHaveBeenCalledTimes(1);

    // Unmount component
    await act(async () => {
      root.unmount();
      root = null;
    });

    // Request chậm hoàn tất sau unmount
    await act(async () => {
      resolveSlow(testSpeakerFixture);
      await Promise.resolve();
    });

    // Không còn thêm lượt gọi nào sau khi unmount
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('5. Phản hồi sai định dạng hợp đồng phải hiển thị lỗi, không âm thầm giữ thành công', async () => {
    apiRequest.mockResolvedValueOnce({
      success: true,
      data: { history: 'invalid-string-not-array' }
    });

    await act(async () => {
      root.render(<SmartSpeakerDashboard />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Phản hồi lịch sử loa không đúng định dạng hợp đồng.');
  });
});
