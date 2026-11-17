import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import SmartPlugOwnerArea from '../modules/smart-plug/OwnerArea.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { LanguageProvider } from '../context/LanguageContext.jsx';
import * as smartPlugService from '../services/smartPlugService.js';
import * as mqttHookModule from '../modules/smart-plug/useSmartPlugMQTT.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Smart Plug OwnerArea - Chế độ chỉ xem & Khóa điều khiển an toàn (Chat A nghiệm thu)', () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.sessionStorage.setItem('shp_auth_session', JSON.stringify({ username: 'nhatanh' }));
  });

  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  it('1. Render giao diện chỉ xem: Hiển thị cảnh báo khóa điều khiển công khai cho mọi runtime', async () => {
    vi.spyOn(smartPlugService, 'getSmartPlugState').mockResolvedValue({
      success: true,
      data: { state: { relayState: 'OFF', isOverloaded: false } }
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider enableDemoAuth={true}>
              <SmartPlugOwnerArea />
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    expect(container.querySelector('.owner-area-container')).not.toBeNull();
    expect(container.textContent).toContain('Ổ cắm thông minh');
    expect(container.textContent).toContain('Đèn LED');
    expect(container.textContent).toContain('Quạt làm mát');
    expect(container.textContent).toContain('Hẹn giờ tắt thiết bị');

    // Hiển thị cảnh báo khóa kênh công khai cho mọi runtime
    expect(container.textContent).toContain('Chế độ chỉ xem');
    expect(container.textContent).toContain('toàn bộ tính năng điều khiển công tắc, quạt và hẹn giờ đã được khóa');
  });

  it('2. Toàn bộ các nút điều khiển Smart Plug đều bị disable để bảo vệ thiết bị', async () => {
    vi.spyOn(smartPlugService, 'getSmartPlugState').mockResolvedValue({
      success: true,
      data: { state: { relayState: 'OFF', isOverloaded: false } }
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider enableDemoAuth={true}>
              <SmartPlugOwnerArea />
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    // 1. Nút Bật/Tắt nguồn LED
    const powerBtn = container.querySelector('button.apple-power-btn');
    expect(powerBtn).not.toBeNull();
    expect(powerBtn.disabled).toBe(true);

    // 2. Nút Tự động
    const autoBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.trim() === 'Tự động');
    expect(autoBtn).toBeDefined();
    expect(autoBtn.disabled).toBe(true);

    // 3. Nút Quạt làm mát
    const fanBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('quạt') || b.textContent.includes('Fan'));
    expect(fanBtn).toBeDefined();
    expect(fanBtn.disabled).toBe(true);

    // 4. Nút Hẹn giờ tắt
    const timerBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Bắt đầu hẹn giờ'));
    expect(timerBtn).toBeDefined();
    expect(timerBtn.disabled).toBe(true);
  });

  it('3. Khi bị khóa, không được gửi bất kỳ lệnh API /relay hay lệnh MQTT nào', async () => {
    vi.spyOn(smartPlugService, 'getSmartPlugState').mockResolvedValue({
      success: true,
      data: { state: { relayState: 'OFF', isOverloaded: false } }
    });
    const toggleSpy = vi.spyOn(smartPlugService, 'toggleSmartPlugRelay');

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider enableDemoAuth={true}>
              <SmartPlugOwnerArea />
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    const powerBtn = container.querySelector('button.apple-power-btn');

    // Thử click nút nguồn bị disabled
    await act(async () => {
      powerBtn.click();
    });

    // Tuyệt đối không được gửi request API toggle
    expect(toggleSpy).not.toHaveBeenCalled();
    // Trạng thái hiển thị không bị đổi giả tạo thành "Đang bật"
    expect(container.textContent).toContain('Đang tắt');
  });

  it('4. Hiển thị rõ trạng thái chỉ là phần mềm máy chủ, không khẳng định phần cứng ESP32 đã thi hành', async () => {
    vi.spyOn(smartPlugService, 'getSmartPlugState').mockResolvedValue({
      success: true,
      data: { state: { relayState: 'ON', isOverloaded: false } }
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider enableDemoAuth={true}>
              <SmartPlugOwnerArea />
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    // Chú thích rõ ràng trạng thái phần mềm
    expect(container.textContent).toContain('Đèn LED (phần mềm)');
    expect(container.textContent).toContain('Quạt 5V (phần mềm)');
    expect(container.textContent).toContain('Chỉ hiển thị trạng thái lệnh relay phần mềm lưu trên máy chủ');
  });

  it('5. Banner quá tải an toàn: Nút Safe Reset cũng bị khóa khi chưa có kênh nội bộ an toàn', async () => {
    vi.spyOn(smartPlugService, 'getSmartPlugState').mockResolvedValue({
      success: true,
      data: { state: { relayState: 'OFF', isOverloaded: true } }
    });
    const resetSpy = vi.spyOn(smartPlugService, 'resetSmartPlugOverload');

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider enableDemoAuth={true}>
              <SmartPlugOwnerArea />
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain('Thiết bị bị ngắt do vượt ngưỡng công suất an toàn');
    const resetBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Khôi phục an toàn'));
    expect(resetBtn).toBeDefined();
    expect(resetBtn.disabled).toBe(true);

    await act(async () => {
      resetBtn.click();
    });

    expect(resetSpy).not.toHaveBeenCalled();
  });

  it('6. Bản tin MQTT công khai giả mạo: Nhận telemetry từ broker công khai không được khẳng định ESP32 thật online, hiển thị cảnh báo chưa xác thực', async () => {
    vi.spyOn(smartPlugService, 'getSmartPlugState').mockResolvedValue({
      success: true,
      data: { state: { relayState: 'OFF', isOverloaded: false } }
    });

    // Mock useSmartPlugMQTT hook giả lập nhận gói tin từ broker EMQX công khai
    vi.spyOn(mqttHookModule, 'useSmartPlugMQTT').mockReturnValue({
      isMqttConnected: true,
      isDeviceOnline: true, // Bản tin nhận được trên public topic
      relayState: true,
      fanState: false,
      isAutoMode: true,
      isPublicPublishLocked: true,
      hasPublicTelemetry: true,
      isPublicSourceUnauthenticated: true,
      isPhysicalHardwareVerified: false,
      publishRelayCommand: vi.fn(),
      publishFanCommand: vi.fn(),
      publishAutoCommand: vi.fn()
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider enableDemoAuth={true}>
              <SmartPlugOwnerArea />
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    // 1. Tuyệt đối KHÔNG được khẳng định "Thiết bị ESP32: Trực tuyến"
    expect(container.textContent).not.toContain('Thiết bị ESP32: Trực tuyến');
    expect(container.textContent).not.toContain('ESP32: Online');

    // 2. Nhãn hiển thị trung thực: nguồn MQTT công khai có tín hiệu nhưng chưa xác thực nguồn
    const statusPill = container.querySelector('[data-testid="smart-plug-telemetry-status"]');
    expect(statusPill).not.toBeNull();
    expect(statusPill.textContent).toContain('Nguồn MQTT công khai: Có tín hiệu (Chưa xác thực nguồn)');

    // 3. Hiển thị cảnh báo tính xác thực
    expect(container.textContent).toContain('Cảnh báo tính xác thực');
    expect(container.textContent).toContain('Bản tin nhận từ broker MQTT công khai không có chữ ký số hay danh tính thiết bị, có thể bị giả mạo');
    expect(container.textContent).toContain('Giao diện KHÔNG khẳng định phần cứng ESP32 thật đang trực tuyến');

    // 4. Các nút điều khiển vẫn phải bị khóa an toàn
    const powerBtn = container.querySelector('button.apple-power-btn');
    expect(powerBtn.disabled).toBe(true);
  });
});
