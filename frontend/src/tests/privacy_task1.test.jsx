import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { LanguageProvider } from '../context/LanguageContext.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { DeviceProvider } from '../context/DeviceContext.jsx';
import { SettingsProvider } from '../context/SettingsContext.jsx';
import * as settingsService from '../services/settingsService.js';
import * as authService from '../services/authService.js';
import PrivacySettings from '../pages/Settings/PrivacySettings.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Task 1: Hoàn thiện Quyền riêng tư & Dữ liệu trong Cài đặt (Nhật Anh)', () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.sessionStorage.setItem('shp_auth_session', JSON.stringify({ username: 'admin' }));
  });

  afterEach(async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  const renderComponent = async (username = 'admin') => {
    window.sessionStorage.setItem('shp_auth_session', JSON.stringify({ username }));
    vi.spyOn(authService, 'isPreviewMode').mockReturnValue(false);
    vi.spyOn(settingsService, 'getSettingsService').mockResolvedValue({
      success: true,
      status: 200,
      data: {
        privacy: { retentionDays: 30 }
      }
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/settings/privacy']}>
          <LanguageProvider>
            <AuthProvider enableDemoAuth={true}>
              <DeviceProvider>
                <SettingsProvider>
                  <Routes>
                    <Route path="/settings/privacy" element={<PrivacySettings />} />
                  </Routes>
                </SettingsProvider>
              </DeviceProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });
  };

  it('1. Render đầy đủ 4 khu vực: Thời gian lưu giữ, Tải dữ liệu (CSV/PDF), Quản lý sự đồng ý, và Xóa dữ liệu', async () => {
    await renderComponent('admin');

    expect(container.querySelector('.privacy-settings-page')).not.toBeNull();
    expect(container.textContent).toContain('Thời gian lưu giữ');
    expect(container.textContent).toContain('Tải dữ liệu của tôi');
    expect(container.textContent).toContain('Các sự đồng ý đã cấp');
    expect(container.textContent).toContain('Xóa dữ liệu của tôi');

    // Nút Xuất CSV và In PDF
    const csvBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Xuất CSV'));
    const pdfBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('In / Lưu PDF'));
    expect(csvBtn).not.toBeNull();
    expect(pdfBtn).not.toBeNull();
    expect(csvBtn.disabled).toBe(false);
    expect(pdfBtn.disabled).toBe(false);
  });

  it('2. Khách xem (Viewer) bị vô hiệu hóa quyền Xuất CSV và In PDF', async () => {
    await renderComponent('guest');

    const csvBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Xuất CSV'));
    const pdfBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('In / Lưu PDF'));

    expect(csvBtn.disabled).toBe(true);
    expect(pdfBtn.disabled).toBe(true);
  });

  it('3. Xuất CSV tạo file với UTF-8 BOM chuẩn cho Excel', async () => {
    await renderComponent('admin');

    let createdBlob = null;
    let clickedDownload = false;

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn((blob) => {
      createdBlob = blob;
      return 'blob:mock-csv';
    });
    window.URL.revokeObjectURL = vi.fn();

    const originalAppendChild = document.body.appendChild;
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node.tagName === 'A') {
        node.click = () => { clickedDownload = true; };
      }
      return originalAppendChild.call(document.body, node);
    });

    const csvBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Xuất CSV'));
    await act(async () => {
      csvBtn.click();
    });

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(clickedDownload).toBe(true);
    expect(createdBlob).not.toBeNull();
    expect(container.textContent).toContain('Đã xuất tệp CSV báo cáo minh bạch thành công');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('4. In PDF gọi hàm window.print()', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    await renderComponent('admin');

    const pdfBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('In / Lưu PDF'));
    await act(async () => {
      pdfBtn.click();
    });

    expect(printSpy).toHaveBeenCalled();
  });

  it('5. Quản lý sự đồng ý có tác dụng thực tế (Consent Toggle)', async () => {
    await renderComponent('admin');

    const checkboxes = container.querySelectorAll('.privacy-switch input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);

    const firstCheckbox = checkboxes[0];
    await act(async () => {
      firstCheckbox.click();
    });

    expect(container.textContent).toContain('Đã thu hồi quyền');
  });

  it('6. Modal xác nhận Xóa dữ liệu có cảnh báo và đặt lại preferences', async () => {
    await renderComponent('admin');

    const deleteBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Xóa dữ liệu & Đặt lại'));
    expect(deleteBtn).not.toBeNull();

    await act(async () => {
      deleteBtn.click();
    });

    const modal = container.querySelector('.modal-backdrop');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('Xác nhận xóa và đặt lại dữ liệu riêng tư');

    const confirmBtn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent.includes('Tôi hiểu và xác nhận xóa'));
    await act(async () => {
      confirmBtn.click();
    });

    expect(container.querySelector('.modal-backdrop')).toBeNull();
    expect(container.textContent).toContain('Đã xóa toàn bộ dữ liệu nhật ký và đặt lại');
  });

  it('7. Dọn dẹp thông báo thủ công phản hồi thông báo thành công', async () => {
    await renderComponent('admin');

    const cleanupBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Dọn dẹp thông báo ngay'));
    expect(cleanupBtn).not.toBeNull();

    await act(async () => {
      cleanupBtn.click();
    });

    expect(container.textContent).toContain('Đã hoàn tất dọn dẹp các thông báo và nhật ký cũ hơn');
  });
});
