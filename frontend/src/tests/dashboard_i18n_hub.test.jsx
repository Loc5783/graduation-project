import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { LanguageProvider, useLanguage, STORAGE_KEY_LANG } from '../context/LanguageContext.jsx';
import LanguageToggle from '../shared/components/LanguageToggle.jsx';
import HubStatusIndicator from '../shared/components/HubStatusIndicator.jsx';
import { BrandHeader, AuthBrandHeader } from '../shared/components/AuthIcons.jsx';
import Overview from '../pages/Overview.jsx';
import DevicePage from '../shared/components/DevicePage.jsx';
import NotFound from '../pages/NotFound.jsx';
import Login from '../pages/Login.jsx';
import Register from '../pages/Register.jsx';
import Layout from '../shared/components/Layout.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { DeviceProvider } from '../context/DeviceContext.jsx';
import { deviceConfigs } from '../modules/configs.js';
import * as authService from '../services/authService.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Trợ giúp điền giá trị input và kích hoạt synthetic event của React trong môi trường jsdom
 */
function fillInput(element, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  nativeSetter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Hoàn thiện Dashboard, Header VI/EN và Trạng thái Hub', () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.documentElement.lang = 'vi';
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Chuyển ngôn ngữ VI / EN (LanguageContext & LanguageToggle)
  // ==========================================================================
  describe('1. Chuyển ngôn ngữ VI / EN', () => {
    it('Mặc định là VI, cập nhật document.documentElement.lang = "vi"', async () => {
      function TestLangDisplay() {
        const { lang, t } = useLanguage();
        return (
          <div>
            <span data-testid="current-lang">{lang}</span>
            <span data-testid="translated-title">{t('login_title')}</span>
          </div>
        );
      }

      await act(async () => {
        root.render(
          <LanguageProvider>
            <TestLangDisplay />
          </LanguageProvider>
        );
      });

      expect(container.querySelector('[data-testid="current-lang"]').textContent).toBe('vi');
      expect(container.querySelector('[data-testid="translated-title"]').textContent).toBe('Đăng nhập');
      expect(document.documentElement.lang).toBe('vi');
    });

    it('Nút chuyển đổi VI / EN đổi ngay lập tức nội dung không cần tải lại trang', async () => {
      function TestLanguageSwitchApp() {
        const { t } = useLanguage();
        return (
          <div>
            <LanguageToggle />
            <h1 data-testid="title">{t('login_title')}</h1>
            <p data-testid="subtitle">{t('brand_subtitle')}</p>
          </div>
        );
      }

      await act(async () => {
        root.render(
          <LanguageProvider>
            <TestLanguageSwitchApp />
          </LanguageProvider>
        );
      });

      // Mặc định: VI
      expect(container.querySelector('[data-testid="title"]').textContent).toBe('Đăng nhập');
      expect(container.querySelector('[data-testid="subtitle"]').textContent).toBe(
        'Cổng Khởi Tạo & Bảo Mật Trung Tâm Nhà Thông Minh'
      );

      // Nhấn chuyển sang EN
      const buttons = container.querySelectorAll('.lang-toggle-btn');
      expect(buttons).toHaveLength(2);
      const enBtn = buttons[1];

      await act(async () => {
        enBtn.click();
      });

      // Cập nhật ngay lập tức: EN
      expect(container.querySelector('[data-testid="title"]').textContent).toBe('Sign in');
      expect(container.querySelector('[data-testid="subtitle"]').textContent).toBe(
        'Smart Home Central Setup & Privacy Vault'
      );
      expect(document.documentElement.lang).toBe('en');

      // Nhấn quay lại VI
      const viBtn = buttons[0];
      await act(async () => {
        viBtn.click();
      });

      expect(container.querySelector('[data-testid="title"]').textContent).toBe('Đăng nhập');
      expect(document.documentElement.lang).toBe('vi');
    });

    it('Lưu lựa chọn ngôn ngữ vào localStorage và khôi phục khi khởi động', async () => {
      window.localStorage.setItem(STORAGE_KEY_LANG, 'en');

      function TestLangDisplay() {
        const { lang } = useLanguage();
        return <span data-testid="lang">{lang}</span>;
      }

      await act(async () => {
        root.render(
          <LanguageProvider>
            <TestLangDisplay />
          </LanguageProvider>
        );
      });

      expect(container.querySelector('[data-testid="lang"]').textContent).toBe('en');
      expect(document.documentElement.lang).toBe('en');
    });

    it('An toàn tuyệt đối khi localStorage ném SecurityError, fallback về tiếng Việt không crash', async () => {
      const originalStorage = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('Access denied', 'SecurityError');
        }
      });

      function TestLangFallback() {
        const { lang, t } = useLanguage();
        return (
          <div>
            <LanguageToggle />
            <span data-testid="lang">{lang}</span>
            <span data-testid="text">{t('btn_login')}</span>
          </div>
        );
      }

      try {
        await act(async () => {
          root.render(
            <LanguageProvider>
              <TestLangFallback />
            </LanguageProvider>
          );
        });

        expect(container.querySelector('[data-testid="lang"]').textContent).toBe('vi');
        expect(container.querySelector('[data-testid="text"]').textContent).toBe('Đăng nhập');

        // Bấm chuyển ngữ trong bộ nhớ tạm vẫn hoạt động bình thường
        const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
        await act(async () => {
          enBtn.click();
        });

        expect(container.querySelector('[data-testid="lang"]').textContent).toBe('en');
        expect(container.querySelector('[data-testid="text"]').textContent).toBe('Sign in');
      } finally {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          value: originalStorage
        });
      }
    });

    it('LanguageToggle hỗ trợ điều hướng bàn phím bằng phím mũi tên Trái/Phải và Home/End', async () => {
      await act(async () => {
        root.render(
          <LanguageProvider>
            <LanguageToggle />
          </LanguageProvider>
        );
      });

      const buttons = container.querySelectorAll('.lang-toggle-btn');
      const viBtn = buttons[0];
      const enBtn = buttons[1];

      viBtn.focus();
      expect(document.activeElement).toBe(viBtn);

      await act(async () => {
        viBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(document.activeElement).toBe(enBtn);

      await act(async () => {
        enBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });
      expect(document.activeElement).toBe(viBtn);
    });
  });

  // ==========================================================================
  // 2. Chỉ báo trạng thái Hub (HubStatusIndicator)
  // ==========================================================================
  describe('2. Chỉ báo trạng thái kết nối Hub trung tâm', () => {
    it('Hiển thị đúng trạng thái not_connected mặc định với chấm xám và không crash', async () => {
      await act(async () => {
        root.render(
          <LanguageProvider>
            <HubStatusIndicator status="not_connected" />
          </LanguageProvider>
        );
      });

      expect(container.textContent).toContain('Hub chưa kết nối');
      const badge = container.querySelector('.hub-status-indicator');
      expect(badge).not.toBeNull();
      expect(badge.className).toContain('status-not_connected');
    });

    it('Hiển thị hiệu ứng chấm sáng nhấp nháy nhẹ (pulse) khi ở trạng thái Online', async () => {
      await act(async () => {
        root.render(
          <LanguageProvider>
            <HubStatusIndicator status="online" />
          </LanguageProvider>
        );
      });

      expect(container.textContent).toContain('Hub trực tuyến');
      const badge = container.querySelector('.hub-status-indicator');
      expect(badge.className).toContain('status-online');
      const pulse = container.querySelector('.hub-status-pulse');
      expect(pulse).not.toBeNull();
    });

    it('Hỗ trợ các trạng thái Connecting và Offline với nhãn chính xác', async () => {
      // Connecting
      await act(async () => {
        root.render(
          <LanguageProvider>
            <HubStatusIndicator status="connecting" />
          </LanguageProvider>
        );
      });
      expect(container.textContent).toContain('Đang kết nối...');

      // Offline
      await act(async () => {
        root.render(
          <LanguageProvider>
            <HubStatusIndicator status="offline" />
          </LanguageProvider>
        );
      });
      expect(container.textContent).toContain('Hub ngoại tuyến');
    });

    it('Khi đổi ngôn ngữ sang EN, nhãn trạng thái Hub tự động cập nhật ngay', async () => {
      function TestHubSwitchApp() {
        return (
          <LanguageProvider>
            <LanguageToggle />
            <HubStatusIndicator status="not_connected" />
          </LanguageProvider>
        );
      }

      await act(async () => {
        root.render(<TestHubSwitchApp />);
      });

      expect(container.textContent).toContain('Hub chưa kết nối');

      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      expect(container.textContent).toContain('Hub not connected');
    });
  });

  // ==========================================================================
  // 3. Khối Thương hiệu (BrandHeader & AuthBrandHeader)
  // ==========================================================================
  describe('3. Khối Thương hiệu theo ảnh tham chiếu', () => {
    it('BrandHeader hiển thị đúng "SmartHome" và "Privacy", có dòng phụ và TUYỆT ĐỐI KHÔNG có badge Zero-Knowledge', async () => {
      await act(async () => {
        root.render(
          <BrandHeader subtitle="Cổng Khởi Tạo & Bảo Mật Trung Tâm Nhà Thông Minh" />
        );
      });

      expect(container.textContent).toContain('SmartHome');
      expect(container.textContent).toContain('Privacy');
      expect(container.textContent).toContain('Cổng Khởi Tạo & Bảo Mật Trung Tâm Nhà Thông Minh');

      // Kiểm tra tuyệt đối không còn badge Zero-Knowledge E2EE
      expect(container.textContent).not.toContain('Zero-Knowledge');
      expect(container.textContent).not.toContain('E2EE');
    });

    it('AuthBrandHeader hiển thị gọn gàng trên form đăng nhập và tạo tài khoản', async () => {
      await act(async () => {
        root.render(
          <AuthBrandHeader subtitle="Cổng Khởi Tạo & Bảo Mật Trung Tâm Nhà Thông Minh" />
        );
      });

      expect(container.textContent).toContain('SmartHomePrivacy');
      expect(container.textContent).not.toContain('Zero-Knowledge');
    });
  });

  // ==========================================================================
  // 4. Tổng quan (Overview) & Chi tiết thiết bị (DevicePage)
  // ==========================================================================
  describe('4. Bảng điều khiển (Overview & DevicePage)', () => {
    it('Overview hiển thị đủ 5 thẻ thiết bị và trạng thái "Chưa kết nối dữ liệu"', async () => {
      await act(async () => {
        root.render(
          <LanguageProvider>
            <MemoryRouter>
              <Overview />
            </MemoryRouter>
          </LanguageProvider>
        );
      });

      const cards = container.querySelectorAll('.overview-card');
      expect(cards).toHaveLength(5);

      deviceConfigs.forEach((cfg) => {
        expect(container.textContent).toContain(cfg.name);
        expect(container.textContent).toContain(cfg.owner);
      });

      expect(container.textContent).toContain('Chưa kết nối dữ liệu');
      expect(container.textContent).toContain('Chi tiết & Cấu hình →');
    });

    it('Overview hiển thị tên 5 thiết bị bằng tiếng Anh khi đổi sang EN và giữ nguyên người phụ trách', async () => {
      function TestOverviewWithToggle() {
        return (
          <LanguageProvider>
            <LanguageToggle />
            <MemoryRouter>
              <Overview />
            </MemoryRouter>
          </LanguageProvider>
        );
      }

      await act(async () => {
        root.render(<TestOverviewWithToggle />);
      });

      // Mặc định VI: chứa tên tiếng Việt
      expect(container.textContent).toContain('Khóa cửa thông minh');
      expect(container.textContent).toContain('Loa thông minh');

      // Chuyển sang EN
      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      // Tên tiếng Anh của 5 thiết bị
      expect(container.textContent).toContain('Smart Door Lock');
      expect(container.textContent).toContain('Smart Speaker');
      expect(container.textContent).toContain('Window Sensor');
      expect(container.textContent).toContain('Smart Plug');
      expect(container.textContent).toContain('Environment Sensor');

      // Giữ nguyên người phụ trách không dịch
      expect(container.textContent).toContain('Thành');
      expect(container.textContent).toContain('Lộc');
      expect(container.textContent).toContain('Minh');
      expect(container.textContent).toContain('Nhật Anh');
      expect(container.textContent).toContain('Quỳnh');

      // Giữ nguyên Device ID không dịch
      expect(container.textContent).toContain('smart-door-lock');
      expect(container.textContent).toContain('smart-speaker');
      expect(container.textContent).toContain('window-sensor');
      expect(container.textContent).toContain('smart-plug');
      expect(container.textContent).toContain('environment-sensor');
    });

    it('Overview có tiêu đề rút gọn "Tổng quan" ở VI và "Overview" ở EN, thẻ rỗng súc tích', async () => {
      function TestOverviewWithToggle() {
        return (
          <LanguageProvider>
            <LanguageToggle />
            <MemoryRouter>
              <Overview />
            </MemoryRouter>
          </LanguageProvider>
        );
      }

      await act(async () => {
        root.render(<TestOverviewWithToggle />);
      });

      // Ở chế độ VI mặc định
      expect(container.querySelector('.overview-title').textContent).toBe('Tổng quan');
      expect(container.querySelector('.empty-state-title').textContent).toBe('Chưa kết nối dữ liệu');
      expect(container.textContent).not.toContain('Mỗi thành viên sẽ phụ trách phát triển tính năng chi tiết');

      // Nhấn chuyển sang EN
      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      expect(container.querySelector('.overview-title').textContent).toBe('Overview');
      expect(container.querySelector('.empty-state-title').textContent).toBe('No data connected');
    });

    it('DevicePage hiển thị khung thông tin kỹ thuật dạng thu gọn (collapsible details)', async () => {
      const sampleConfig = deviceConfigs[0];
      const sampleOwnerArea = (
        <div data-testid="custom-owner-area">Owner Area của Thành</div>
      );

      await act(async () => {
        root.render(
          <LanguageProvider>
            <MemoryRouter>
              <DevicePage config={sampleConfig} ownerArea={sampleOwnerArea} />
            </MemoryRouter>
          </LanguageProvider>
        );
      });

      expect(container.textContent).toContain(sampleConfig.name);
      expect(container.textContent).toContain(sampleConfig.owner);
      expect(container.querySelector('[data-testid="custom-owner-area"]')).not.toBeNull();

      // Kiểm tra phần tử <details> thu gọn thông tin kỹ thuật
      const details = container.querySelector('.device-tech-details');
      expect(details).not.toBeNull();
      expect(details.textContent).toContain('Thông tin kỹ thuật');
      expect(details.textContent).toContain('Định dạng Topic MQTT đề xuất');
      expect(details.textContent).toContain(sampleConfig.mqtt.command);
    });

    it('DevicePage hiển thị tên thiết bị tiếng Anh khi ở EN, không dịch ID, MQTT và tên người phụ trách', async () => {
      const lockConfig = deviceConfigs.find((c) => c.id === 'smart-door-lock');
      function TestDevicePageWithToggle() {
        return (
          <LanguageProvider>
            <LanguageToggle />
            <MemoryRouter>
              <DevicePage config={lockConfig} ownerArea={<div>Custom Lock Area</div>} />
            </MemoryRouter>
          </LanguageProvider>
        );
      }

      await act(async () => {
        root.render(<TestDevicePageWithToggle />);
      });

      expect(container.querySelector('.device-title').textContent).toBe('Khóa cửa thông minh');

      // Chuyển sang EN
      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      expect(container.querySelector('.device-title').textContent).toBe('Smart Door Lock');
      expect(container.textContent).toContain('Thành');
      expect(container.textContent).toContain('smart-door-lock');
      expect(container.textContent).toContain('home/smart-door-lock/command');
    });
  });

  // ==========================================================================
  // 5. Đồng bộ giao diện Xác thực (Login / Register) với Ngôn ngữ VI / EN
  // ==========================================================================
  describe('5. Đồng bộ giao diện Auth với chuyển ngữ VI / EN', () => {
    it('Login cập nhật toàn bộ nhãn, placeholder và nút khi đổi sang tiếng Anh', async () => {
      await act(async () => {
        root.render(
          <LanguageProvider>
            <AuthProvider>
              <MemoryRouter>
                <Login />
              </MemoryRouter>
            </AuthProvider>
          </LanguageProvider>
        );
      });

      expect(container.querySelector('.au-title').textContent).toBe('Đăng nhập');
      expect(container.textContent).toContain('Ghi nhớ đăng nhập');

      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      expect(container.querySelector('.au-title').textContent).toBe('Sign in');
      expect(container.textContent).toContain('Remember me');
      expect(container.textContent).toContain('Forgot password?');
      expect(container.querySelector('#email').getAttribute('placeholder')).toBe('Enter email');
      expect(container.querySelector('#password').getAttribute('placeholder')).toBe('Enter password');
      expect(container.querySelector('button[type="submit"]').textContent).toBe('Sign in');
    });

    it('Lỗi validation Login: Gửi login trống ở VI -> đổi EN -> lỗi tự động đổi sang tiếng Anh không cần submit lại', async () => {
      await act(async () => {
        root.render(
          <LanguageProvider>
            <AuthProvider>
              <MemoryRouter>
                <Login />
              </MemoryRouter>
            </AuthProvider>
          </LanguageProvider>
        );
      });

      // Bấm submit form trống ở VI
      const submitBtn = container.querySelector('button[type="submit"]');
      await act(async () => {
        submitBtn.click();
      });

      // Lỗi xuất hiện bằng tiếng Việt
      const emailError = container.querySelector('#email-error');
      expect(emailError).not.toBeNull();
      expect(emailError.textContent).toBe('Vui lòng nhập địa chỉ email.');

      // Đổi sang EN qua nút toggle
      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      // Lỗi tự động chuyển sang tiếng Anh mà không cần bấm submit lại
      expect(container.querySelector('#email-error').textContent).toBe('Please enter your email address.');
      expect(container.querySelector('.au-title').textContent).toBe('Sign in');

      // Đổi lại VI -> lỗi lập tức quay lại tiếng Việt
      const viBtn = container.querySelectorAll('.lang-toggle-btn')[0];
      await act(async () => {
        viBtn.click();
      });
      expect(container.querySelector('#email-error').textContent).toBe('Vui lòng nhập địa chỉ email.');
    });

    it('Nhập email sai định dạng ở VI -> đổi EN -> thông báo lỗi cập nhật sang tiếng Anh', async () => {
      await act(async () => {
        root.render(
          <LanguageProvider>
            <AuthProvider>
              <MemoryRouter>
                <Login />
              </MemoryRouter>
            </AuthProvider>
          </LanguageProvider>
        );
      });

      const emailInput = container.querySelector('#email');
      const submitBtn = container.querySelector('button[type="submit"]');
      await act(async () => {
        fillInput(emailInput, 'invalid-email-format');
        submitBtn.click();
      });

      expect(container.querySelector('#email-error').textContent).toBe(
        'Địa chỉ email không đúng định dạng (ví dụ: user@example.com).'
      );

      // Chuyển sang EN
      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      expect(container.querySelector('#email-error').textContent).toBe(
        'Invalid email format (e.g. user@example.com).'
      );
    });

    it('Register cập nhật toàn bộ nhãn và tiêu đề khi đổi sang tiếng Anh', async () => {
      await act(async () => {
        root.render(
          <LanguageProvider>
            <AuthProvider>
              <MemoryRouter>
                <Register />
              </MemoryRouter>
            </AuthProvider>
          </LanguageProvider>
        );
      });

      expect(container.querySelector('.au-title').textContent).toBe('Tạo tài khoản');

      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      expect(container.querySelector('.au-title').textContent).toBe('Create account');
      expect(container.textContent).toContain('Full name');
      expect(container.textContent).toContain('Confirm password');
      expect(container.querySelector('button[type="submit"]').textContent).toBe('Create account');
    });

    it('Lỗi validation Register: Submit form trống ở VI -> đổi EN -> trường lỗi đổi sang tiếng Anh', async () => {
      await act(async () => {
        root.render(
          <LanguageProvider>
            <AuthProvider>
              <MemoryRouter>
                <Register />
              </MemoryRouter>
            </AuthProvider>
          </LanguageProvider>
        );
      });

      const submitBtn = container.querySelector('button[type="submit"]');
      await act(async () => {
        submitBtn.click();
      });

      // Lỗi tiếng Việt ở trường đầu tiên (họ và tên)
      expect(container.querySelector('#fullName-error').textContent).toBe('Vui lòng nhập họ và tên của bạn.');

      // Chuyển EN
      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      expect(container.querySelector('#fullName-error').textContent).toBe('Please enter your full name.');
    });

    it('Backend lỗi 401 INVALID_CREDENTIALS: hiển thị tiếng Anh khi ở chế độ EN', async () => {
      vi.spyOn(authService, 'loginService').mockResolvedValueOnce({
        success: false,
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không chính xác.'
      });

      await act(async () => {
        root.render(
          <LanguageProvider>
            <AuthProvider>
              <MemoryRouter>
                <Login />
              </MemoryRouter>
            </AuthProvider>
          </LanguageProvider>
        );
      });

      // Chuyển sang EN trước khi submit
      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      const emailInput = container.querySelector('#email');
      const passInput = container.querySelector('#password');
      const submitBtn = container.querySelector('button[type="submit"]');

      await act(async () => {
        fillInput(emailInput, 'wrong@example.com');
        fillInput(passInput, 'wrongpass123');
        submitBtn.click();
      });

      const alertBox = container.querySelector('.au-alert');
      expect(alertBox).not.toBeNull();
      expect(alertBox.textContent).toContain('Incorrect email or password.');
      expect(alertBox.textContent).not.toContain('Email hoặc mật khẩu không chính xác');
    });

    it('Backend lỗi 409 DUPLICATE_KEY: hiển thị tiếng Anh dưới ô email khi ở chế độ EN', async () => {
      vi.spyOn(authService, 'registerService').mockResolvedValueOnce({
        success: false,
        status: 409,
        code: 'DUPLICATE_KEY',
        message: 'Địa chỉ email này đã được sử dụng.'
      });

      await act(async () => {
        root.render(
          <LanguageProvider>
            <AuthProvider>
              <MemoryRouter>
                <Register />
              </MemoryRouter>
            </AuthProvider>
          </LanguageProvider>
        );
      });

      // Chuyển sang EN
      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      const fullNameInput = container.querySelector('#fullName');
      const emailInput = container.querySelector('#email');
      const passInput = container.querySelector('#password');
      const confirmInput = container.querySelector('#confirmPassword');
      const submitBtn = container.querySelector('button[type="submit"]');

      await act(async () => {
        fillInput(fullNameInput, 'Test User');
        fillInput(emailInput, 'existing@example.com');
        fillInput(passInput, 'Password123!');
        fillInput(confirmInput, 'Password123!');
        submitBtn.click();
      });

      const emailError = container.querySelector('#email-error');
      expect(emailError).not.toBeNull();
      expect(emailError.textContent).toBe('This email address is already in use.');
    });

    it('Backend lỗi 429 TOO_MANY_REQUESTS: hiển thị tiếng Anh khi ở chế độ EN', async () => {
      vi.spyOn(authService, 'loginService').mockResolvedValueOnce({
        success: false,
        status: 429,
        code: 'TOO_MANY_REQUESTS',
        message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.'
      });

      await act(async () => {
        root.render(
          <LanguageProvider>
            <AuthProvider>
              <MemoryRouter>
                <Login />
              </MemoryRouter>
            </AuthProvider>
          </LanguageProvider>
        );
      });

      // Chuyển sang EN
      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      const emailInput = container.querySelector('#email');
      const passInput = container.querySelector('#password');
      const submitBtn = container.querySelector('button[type="submit"]');

      await act(async () => {
        fillInput(emailInput, 'spam@example.com');
        fillInput(passInput, 'password123');
        submitBtn.click();
      });

      const alertBox = container.querySelector('.au-alert');
      expect(alertBox).not.toBeNull();
      expect(alertBox.textContent).toContain('Too many requests. Please try again later.');
    });
  });

  // ==========================================================================
  // 6. Trang 404 (NotFound)
  // ==========================================================================
  describe('6. Trang 404', () => {
    it('NotFound hiển thị đúng mã 404 và hỗ trợ chuyển ngữ', async () => {
      await act(async () => {
        root.render(
          <LanguageProvider>
            <MemoryRouter>
              <NotFound />
            </MemoryRouter>
          </LanguageProvider>
        );
      });

      expect(container.querySelector('.not-found-code').textContent).toBe('404');
      expect(container.querySelector('.not-found-title').textContent).toBe('Không tìm thấy trang yêu cầu');
      expect(container.textContent).toContain('Quay lại Trang tổng quan');
    });
  });

  // ==========================================================================
  // 7. Topbar và Điều hướng theo Route
  // ==========================================================================
  describe('7. Topbar và Điều hướng theo Route', () => {
    it('Topbar hiển thị tên trang "Tổng quan" khi ở /overview và đổi thành "Overview" khi chuyển sang EN', async () => {
      await act(async () => {
        root.render(
          <LanguageProvider>
            <AuthProvider enableDemoAuth={false}>
              <DeviceProvider>
                <MemoryRouter initialEntries={['/overview']}>
                  <Layout />
                </MemoryRouter>
              </DeviceProvider>
            </AuthProvider>
          </LanguageProvider>
        );
      });

      const topbarTitle = container.querySelector('.topbar-system-name');
      expect(topbarTitle).not.toBeNull();
      expect(topbarTitle.textContent).toBe('Tổng quan');

      // Đổi sang EN
      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      expect(container.querySelector('.topbar-system-name').textContent).toBe('Overview');
    });

    it('Topbar hiển thị tên thiết bị linh hoạt theo route /devices/:id', async () => {
      await act(async () => {
        root.render(
          <LanguageProvider>
            <AuthProvider enableDemoAuth={false}>
              <DeviceProvider>
                <MemoryRouter initialEntries={['/devices/smart-door-lock']}>
                  <Layout />
                </MemoryRouter>
              </DeviceProvider>
            </AuthProvider>
          </LanguageProvider>
        );
      });

      expect(container.querySelector('.topbar-system-name').textContent).toBe('Khóa cửa thông minh');

      // Đổi sang EN
      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      expect(container.querySelector('.topbar-system-name').textContent).toBe('Smart Door Lock');
    });

    it('Sidebar hiển thị đủ 5 thiết bị bằng tiếng Việt ở VI và tiếng Anh ở EN, không dịch người phụ trách', async () => {
      await act(async () => {
        root.render(
          <LanguageProvider>
            <AuthProvider enableDemoAuth={false}>
              <DeviceProvider>
                <MemoryRouter initialEntries={['/overview']}>
                  <Layout />
                </MemoryRouter>
              </DeviceProvider>
            </AuthProvider>
          </LanguageProvider>
        );
      });

      const sidebar = container.querySelector('#app-sidebar');
      expect(sidebar.textContent).toContain('Khóa cửa thông minh');
      expect(sidebar.textContent).toContain('Loa thông minh');
      expect(sidebar.textContent).toContain('Cảm biến cửa sổ');
      expect(sidebar.textContent).toContain('Ổ cắm thông minh');
      expect(sidebar.textContent).toContain('Cảm biến môi trường');

      // Đổi sang EN
      const enBtn = container.querySelectorAll('.lang-toggle-btn')[1];
      await act(async () => {
        enBtn.click();
      });

      expect(sidebar.textContent).toContain('Smart Door Lock');
      expect(sidebar.textContent).toContain('Smart Speaker');
      expect(sidebar.textContent).toContain('Window Sensor');
      expect(sidebar.textContent).toContain('Smart Plug');
      expect(sidebar.textContent).toContain('Environment Sensor');

      // Người phụ trách vẫn giữ nguyên
      expect(sidebar.textContent).toContain('Thành');
      expect(sidebar.textContent).toContain('Lộc');
      expect(sidebar.textContent).toContain('Minh');
      expect(sidebar.textContent).toContain('Nhật Anh');
      expect(sidebar.textContent).toContain('Quỳnh');
    });
  });
});
