import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import SmartPlugOwnerArea from '../modules/smart-plug/OwnerArea.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { LanguageProvider } from '../context/LanguageContext.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Smart Plug OwnerArea - Apple Minimalist Interface Tests (Nhật Anh)', () => {
  let container = null;
  let root = null;

  beforeEach(() => {
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
  });

  it('1. Render giao diện tối giản Apple: Tiêu đề, Đèn LED (kèm nút Tự động), Quạt & Hẹn giờ tắt', async () => {
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
    expect(container.textContent).toContain('Tự động');
    expect(container.textContent).toContain('Hẹn giờ tắt thiết bị');
  });

  it('2. Nút Bật / Tắt nguồn đèn LED phản hồi mượt mà và chuẩn xác', async () => {
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

    const powerBtn = container.querySelector('button.btn-outline');
    expect(powerBtn).not.toBeNull();
    expect(powerBtn.textContent).toContain('Bật nguồn');

    // Bấm Bật nguồn
    await act(async () => {
      powerBtn.click();
    });

    expect(powerBtn.textContent).toContain('Tắt nguồn');
    expect(container.textContent).toContain('Đang bật');
  });

  it('3. Bấm nút Tự động (chỉ 1 chữ) & Kích hoạt bộ hẹn giờ tắt kiểu iPhone', async () => {
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

    // Thử nút Tự động
    const buttons = Array.from(container.querySelectorAll('button'));
    const autoBtn = buttons.find((b) => b.textContent.trim() === 'Tự động');
    expect(autoBtn).toBeDefined();

    const powerBtn = container.querySelector('button.apple-power-btn');
    expect(powerBtn).not.toBeNull();
    expect(powerBtn.disabled).toBe(false);

    // Bật Tự động -> nút Bật/Tắt nguồn bị khóa không thể bấm
    await act(async () => {
      autoBtn.click();
    });
    expect(autoBtn.classList.contains('active')).toBe(true);
    expect(powerBtn.disabled).toBe(true);

    // Tắt Tự động -> nút Bật/Tắt nguồn được mở khóa trở lại
    await act(async () => {
      autoBtn.click();
    });
    expect(autoBtn.classList.contains('active')).toBe(false);
    expect(powerBtn.disabled).toBe(false);

    // Thử nút hẹn giờ 15 phút
    const preset15 = buttons.find((b) => b.textContent.includes('15') && b.textContent.includes('phút'));
    expect(preset15).toBeDefined();

    await act(async () => {
      preset15.click();
    });

    // Bấm nút "Bắt đầu hẹn giờ"
    const startBtn = buttons.find((b) => b.textContent.includes('Bắt đầu hẹn giờ'));
    expect(startBtn).toBeDefined();

    await act(async () => {
      startBtn.click();
    });

    expect(container.textContent).toContain('Tự động tắt');
    expect(container.textContent).toContain('Hủy hẹn giờ');
  });
});
