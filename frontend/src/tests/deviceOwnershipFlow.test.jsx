import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../context/LanguageContext.jsx';
import { AuthProvider, AuthContext } from '../context/AuthContext.jsx';
import { MyDevicesProvider, useMyDevices, MyDevicesContext } from '../context/MyDevicesContext.jsx';
import Overview from '../pages/Overview.jsx';
import Layout from '../shared/components/Layout.jsx';
import { DeviceProvider } from '../context/DeviceContext.jsx';
import DeviceGuard from '../shared/components/DeviceGuard.jsx';
import DeviceShareManager from '../shared/components/DeviceShareManager.jsx';
import ClaimDeviceModal from '../shared/components/ClaimDeviceModal.jsx';
import * as myDeviceService from '../services/myDeviceService.js';
import * as authService from '../services/authService.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(element, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  nativeSetter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Frontend Device Ownership, Pairing and Sharing Flow (Phase 2 & 3)', () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
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
    vi.restoreAllMocks();
  });

  it('1. Tài khoản mới chưa có thiết bị: Hiển thị Tổng quan trống với nút "+ Thêm thiết bị", không render card thiết bị', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'user_1', name: 'User One', email: 'user1@example.com', role: 'viewer', owned: [] } }
    });
    vi.spyOn(myDeviceService, 'getMyDevices').mockResolvedValue({
      success: true,
      data: { devices: [] }
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <Overview />
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain('Chưa có thiết bị nào trong nhà của bạn');
    expect(container.textContent).toContain('Thêm thiết bị');

    const cards = container.querySelectorAll('.overview-card');
    expect(cards).toHaveLength(0);
  });

  it('2. Form Thêm thiết bị (ClaimDeviceModal): Bắt buộc mã nhận diện & mã bí mật, xử lý lỗi và đóng sau khi thành công', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'user_1', name: 'User One', email: 'user1@example.com', role: 'viewer', owned: [] } }
    });
    const claimSpy = vi.spyOn(myDeviceService, 'claimDevice').mockResolvedValueOnce({
      success: false,
      code: 'CLAIM_FAILED',
      message: 'Mã thiết bị hoặc mã ghép nối bí mật không đúng.'
    }).mockResolvedValueOnce({
      success: true,
      data: { id: 'smart-bin', code: 'TRTM01', access: 'owner' }
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <ClaimDeviceModal isOpen={true} onClose={() => {}} onSuccess={() => {}} />
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    const codeInput = container.querySelector('#device-code-input');
    const secretInput = container.querySelector('#pairing-secret-input');
    const form = container.querySelector('form.claim-modal-form');

    expect(codeInput).not.toBeNull();
    expect(secretInput).not.toBeNull();

    // Điền mã sai lần 1
    await act(async () => {
      setInputValue(codeInput, 'TRTM01');
      setInputValue(secretInput, 'wrong-secret-code');
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain('Mã thiết bị hoặc mã ghép nối bí mật không đúng.');
    expect(claimSpy).toHaveBeenCalledTimes(1);

    // Điền mã đúng lần 2
    await act(async () => {
      setInputValue(secretInput, 'correct-private-pairing-secret-123');
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain('Nhận và ghép nối thiết bị thành công!');
    expect(claimSpy).toHaveBeenCalledTimes(2);
  });

  it('3. DeviceGuard chặn người dùng chưa nhận thiết bị khi gõ URL trực tiếp', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'user_1', name: 'User One', role: 'member', owned: [] } }
    });
    vi.spyOn(myDeviceService, 'getMyDevices').mockResolvedValue({
      success: true,
      data: { devices: [{ id: 'smart-bin', code: 'TRTM01', access: 'owner' }] }
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <DeviceGuard deviceId="smart-door-lock">
                  <div className="secret-door-lock-content">Nội dung nhạy cảm của khóa cửa</div>
                </DeviceGuard>
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    expect(container.querySelector('.secret-door-lock-content')).toBeNull();
    expect(container.textContent).toContain('Thiết bị chưa được kết nối');
    expect(container.textContent).toContain('Quay lại Tổng quan');
  });

  it('4. Phân biệt quyền Owner vs Viewer: Owner thấy phần chia sẻ, Viewer chỉ thấy badge Chỉ xem', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'viewer_1', name: 'Viewer User', email: 'viewer@example.com', role: 'viewer', owned: [] } }
    });
    vi.spyOn(myDeviceService, 'getMyDevices').mockResolvedValue({
      success: true,
      data: { devices: [{ id: 'smart-plug', code: 'OCTM01', access: 'viewer' }] }
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <DeviceGuard deviceId="smart-plug">
                  <div className="plug-body">Nội dung ổ cắm</div>
                </DeviceGuard>
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    // Chờ AuthProvider và MyDevicesProvider nạp xong dữ liệu bất đồng bộ
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Được chia sẻ · Chỉ xem');
    expect(container.querySelector('.device-owner-share-section')).toBeNull();
    expect(container.querySelector('.device-share-manager')).toBeNull();
  });

  it('5. Quản lý chia sẻ (DeviceShareManager): Chủ sở hữu nạp danh sách, thêm email và thu hồi quyền xem', async () => {
    const listSpy = vi.spyOn(myDeviceService, 'getDeviceShares').mockResolvedValue({
      success: true,
      data: {
        users: [
          { id: 'user_shared_1', name: 'Nguyen Van A', email: 'vana@example.com' }
        ]
      }
    });
    const shareSpy = vi.spyOn(myDeviceService, 'shareDevice').mockResolvedValue({
      success: true,
      data: { user: { id: 'user_shared_2', name: 'Tran B', email: 'tranb@example.com' } }
    });
    const revokeSpy = vi.spyOn(myDeviceService, 'revokeDeviceShare').mockResolvedValue({
      success: true,
      data: { removed: true }
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <DeviceShareManager deviceId="smart-plug" isOwner={true} />
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    expect(listSpy).toHaveBeenCalledWith('smart-plug');
    expect(container.textContent).toContain('vana@example.com');
    expect(container.textContent).toContain('Nguyen Van A');

    const emailInput = container.querySelector('input.share-email-input');
    const form = container.querySelector('form.share-add-form');

    await act(async () => {
      setInputValue(emailInput, 'tranb@example.com');
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(shareSpy).toHaveBeenCalledWith('smart-plug', 'tranb@example.com');

    const revokeBtn = container.querySelector('button.btn-revoke');
    expect(revokeBtn).not.toBeNull();

    await act(async () => {
      revokeBtn.click();
    });

    expect(container.textContent).toContain('Xác nhận thu hồi?');
    const confirmBtn = container.querySelector('button.btn-danger');

    await act(async () => {
      confirmBtn.click();
    });

    expect(revokeSpy).toHaveBeenCalledWith('smart-plug', 'user_shared_1');
  });

  it('6. Khi quyền bị thu hồi, sự kiện 403 (app:forbidden) hoặc quay lại tab tự động làm mới quyền và DeviceGuard chặn truy cập', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'viewer_user', name: 'Viewer User', email: 'v@example.com', role: 'viewer', owned: [] } }
    });

    const getDevicesSpy = vi.spyOn(myDeviceService, 'getMyDevices')
      // Lần 1: Viewer đang có quyền xem smart-door-lock
      .mockResolvedValueOnce({
        success: true,
        data: { devices: [{ id: 'smart-door-lock', code: 'KCTM01', access: 'viewer' }] }
      })
      // Lần 2 (sau khi bị thu hồi): Server trả về 0 thiết bị
      .mockResolvedValueOnce({
        success: true,
        data: { devices: [] }
      });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <DeviceGuard deviceId="smart-door-lock">
                  <div className="actual-door-content">Dữ liệu khóa cửa bí mật</div>
                </DeviceGuard>
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    // Ban đầu có quyền xem
    expect(container.textContent).toContain('Được chia sẻ · Chỉ xem');
    expect(container.querySelector('.actual-door-content')).not.toBeNull();

    // Giả lập phát sinh 403 từ API call (ví dụ SSE ngắt hoặc fetch state thất bại)
    await act(async () => {
      window.dispatchEvent(new CustomEvent('app:forbidden', { detail: { endpoint: '/api/devices/smart-door-lock' } }));
    });

    // MyDevicesContext tự động kích hoạt refreshDevices -> nhận mảng rỗng -> DeviceGuard lập tức chặn truy cập
    expect(getDevicesSpy).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Thiết bị chưa được kết nối');
    expect(container.querySelector('.actual-door-content')).toBeNull();
  });

  it('7. Tài khoản chỉ có TRTM01: Overview chỉ render 1 card Thùng rác trong LiveDevicePanel và 1 card trong danh sách, phụ đề báo đúng 1 thiết bị', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'user_bin_only', name: 'Bin Owner', email: 'bin@example.com', role: 'member', owned: [] } }
    });
    vi.spyOn(myDeviceService, 'getMyDevices').mockResolvedValue({
      success: true,
      data: { devices: [{ id: 'smart-bin', code: 'TRTM01', access: 'owner' }] }
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <Overview />
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Phụ đề động
    expect(container.textContent).toContain('Theo dõi và quản lý dữ liệu riêng tư của 1 thiết bị trong nhà bạn.');
    expect(container.textContent).not.toContain('5 thiết bị trong hệ thống');

    // LiveDevicePanel chỉ có 1 card: Thùng rác
    const liveCards = container.querySelectorAll('.live-device-card');
    expect(liveCards).toHaveLength(1);
    expect(liveCards[0].textContent).toContain('Thùng rác');

    // Overview module cards chỉ có 1 card: Thùng rác
    const moduleCards = container.querySelectorAll('.overview-card.module-card');
    expect(moduleCards).toHaveLength(1);
    expect(moduleCards[0].textContent).toContain('Thùng rác');
    expect(moduleCards[0].textContent).toContain('TRTM01');
    expect(moduleCards[0].textContent).toContain('Chủ sở hữu');

    // Tuyệt đối không hiển thị Khóa cửa, Cửa sổ, Môi trường, Ổ cắm
    expect(container.textContent).not.toContain('Khóa cửa');
    expect(container.textContent).not.toContain('Cửa sổ');
    expect(container.textContent).not.toContain('Cảm biến môi trường');
    expect(container.textContent).not.toContain('Ổ cắm');
  });

  it('8. Tài khoản có nhiều thiết bị được chia sẻ: Overview render đúng danh sách được chia sẻ, gắn nhãn Chỉ xem và phụ đề tương ứng', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'viewer_multi', name: 'Multi Viewer', email: 'mviewer@example.com', role: 'viewer', owned: [] } }
    });
    vi.spyOn(myDeviceService, 'getMyDevices').mockResolvedValue({
      success: true,
      data: {
        devices: [
          { id: 'smart-door-lock', code: 'KCTM01', access: 'viewer' },
          { id: 'window-sensor', code: 'CSTM01', access: 'viewer' }
        ]
      }
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <Overview />
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Phụ đề động: 2 thiết bị
    expect(container.textContent).toContain('Theo dõi và quản lý dữ liệu riêng tư của 2 thiết bị trong nhà bạn.');

    // LiveDevicePanel có đúng 2 card
    const liveCards = container.querySelectorAll('.live-device-card');
    expect(liveCards).toHaveLength(2);
    const liveTexts = Array.from(liveCards).map(c => c.textContent);
    expect(liveTexts.some(t => t.includes('Khóa cửa'))).toBe(true);
    expect(liveTexts.some(t => t.includes('Cửa sổ'))).toBe(true);
    expect(liveTexts.some(t => t.includes('Thùng rác'))).toBe(false);

    // Module cards có đúng 2 card, cả hai đều có nhãn "Chỉ xem"
    const moduleCards = container.querySelectorAll('.overview-card.module-card');
    expect(moduleCards).toHaveLength(2);
    expect(moduleCards[0].textContent).toContain('Chỉ xem');
    expect(moduleCards[1].textContent).toContain('Chỉ xem');
  });

  it('9. Khi quyền thiết bị bị thu hồi: Overview lập tức loại bỏ thiết bị đó khỏi LiveDevicePanel và danh sách', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'viewer_revoke', name: 'Revoke User', email: 'rev@example.com', role: 'viewer', owned: [] } }
    });

    const getDevicesSpy = vi.spyOn(myDeviceService, 'getMyDevices')
      .mockResolvedValueOnce({
        success: true,
        data: {
          devices: [
            { id: 'smart-bin', code: 'TRTM01', access: 'viewer' },
            { id: 'smart-door-lock', code: 'KCTM01', access: 'viewer' }
          ]
        }
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          devices: [
            { id: 'smart-bin', code: 'TRTM01', access: 'viewer' }
          ]
        }
      });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <Overview />
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelectorAll('.live-device-card')).toHaveLength(2);
    expect(container.textContent).toContain('2 thiết bị');

    // Giả lập phát sinh sự kiện app:forbidden (thu hồi quyền cửa)
    await act(async () => {
      window.dispatchEvent(new CustomEvent('app:forbidden', { detail: { endpoint: '/api/devices/smart-door-lock' } }));
    });

    expect(getDevicesSpy).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll('.live-device-card')).toHaveLength(1);
    expect(container.textContent).toContain('1 thiết bị');
    expect(container.textContent).not.toContain('Khóa cửa');
  });

  it('10. ClaimDeviceModal chặn submit khi mã ghép nối bí mật thiếu hoặc < 12 ký tự', async () => {
    const claimSpy = vi.spyOn(myDeviceService, 'claimDevice');

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <ClaimDeviceModal isOpen={true} onClose={() => {}} onSuccess={() => {}} />
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    const codeInput = container.querySelector('#device-code-input');
    const secretInput = container.querySelector('#pairing-secret-input');
    const form = container.querySelector('form.claim-modal-form');

    // Trường hợp 1: Có code nhưng bí mật rỗng
    await act(async () => {
      setInputValue(codeInput, 'TRTM01');
      setInputValue(secretInput, '');
    });
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain('Mã ghép nối bí mật phải có ít nhất 12 ký tự');
    expect(claimSpy).not.toHaveBeenCalled();

    // Trường hợp 2: Có code nhưng bí mật chỉ 6 ký tự
    await act(async () => {
      setInputValue(secretInput, '123456');
    });
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain('Mã ghép nối bí mật phải có ít nhất 12 ký tự');
    expect(claimSpy).not.toHaveBeenCalled();
  });

  it('11. Sidebar Navigation: Tiêu đề nhóm hiển thị số lượng thiết bị thực tế đang có, không ghi cứng (5)', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'user_bin_only', name: 'Bin Owner', email: 'bin@example.com', role: 'member', owned: [] } }
    });
    vi.spyOn(myDeviceService, 'getMyDevices').mockResolvedValue({
      success: true,
      data: { devices: [{ id: 'smart-bin', code: 'TRTM01', access: 'owner' }] }
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/overview']}>
          <LanguageProvider>
            <AuthProvider>
              <DeviceProvider>
                <MyDevicesProvider>
                  <Layout />
                </MyDevicesProvider>
              </DeviceProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const sectionTitle = container.querySelector('.nav-section-title');
    expect(sectionTitle).not.toBeNull();
    expect(sectionTitle.textContent.trim()).toBe('Thiết bị của tôi (1)');
    expect(container.querySelector('.nav-section-shared').textContent.trim()).toBe('Được chia sẻ · Chỉ xem (0)');
    expect(container.querySelector('a[href="/activity"]')?.textContent).toContain('Nhật ký & phiên hoạt động');
  });

  it('12. DeviceShareManager: Đổi tên gợi nhớ thiết bị thành công và cập nhật phản hồi', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'owner_user', name: 'Owner User', email: 'owner@example.com', role: 'member', owned: [] } }
    });
    vi.spyOn(myDeviceService, 'getMyDevices').mockResolvedValue({
      success: true,
      data: { devices: [{ id: 'smart-bin', code: 'TRTM01', access: 'owner', customName: null }] }
    });
    const updateSpy = vi.spyOn(myDeviceService, 'updateDevice').mockResolvedValue({
      success: true,
      data: { id: 'smart-bin', code: 'TRTM01', access: 'owner', customName: 'Thùng rác phòng khách' }
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <DeviceShareManager deviceId="smart-bin" isOwner={true} />
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const nameInput = container.querySelector('.device-name-input');
    const nameForm = container.querySelector('form.device-name-form');
    expect(nameInput).not.toBeNull();
    expect(nameForm).not.toBeNull();

    await act(async () => {
      setInputValue(nameInput, 'Thùng rác phòng khách');
    });

    await act(async () => {
      nameForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(updateSpy).toHaveBeenCalledWith('smart-bin', { customName: 'Thùng rác phòng khách' });
    expect(container.textContent).toContain('Cập nhật tên gợi nhớ thành công.');
  });

  it('13. DeviceShareManager: Gỡ thiết bị khỏi tài khoản yêu cầu xác nhận 2 bước và điều hướng', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'owner_user', name: 'Owner User', email: 'owner@example.com', role: 'member', owned: [] } }
    });
    vi.spyOn(myDeviceService, 'getMyDevices').mockResolvedValue({
      success: true,
      data: { devices: [{ id: 'smart-bin', code: 'TRTM01', access: 'owner' }] }
    });
    const unclaimSpy = vi.spyOn(myDeviceService, 'unclaimDevice').mockResolvedValue({
      success: true,
      data: { unclaimed: true, deviceId: 'smart-bin' }
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/devices/smart-bin']}>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <DeviceShareManager deviceId="smart-bin" isOwner={true} />
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const triggerBtn = container.querySelector('.btn-unclaim-trigger');
    expect(triggerBtn).not.toBeNull();

    // Bấm mở xác nhận
    await act(async () => {
      triggerBtn.click();
    });

    expect(container.textContent).toContain('Xác nhận gỡ thiết bị khỏi tài khoản?');
    const confirmBtn = container.querySelector('.btn-confirm-unclaim');
    expect(confirmBtn).not.toBeNull();

    // Bấm xác nhận gỡ
    await act(async () => {
      confirmBtn.click();
    });

    expect(unclaimSpy).toHaveBeenCalledWith('smart-bin');
  });

  it('14. DeviceGuard cho Viewer: Không bao giờ hiển thị phần quản lý đổi tên và gỡ thiết bị', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'viewer_user', name: 'Viewer User', email: 'v@example.com', role: 'viewer', owned: [] } }
    });
    vi.spyOn(myDeviceService, 'getMyDevices').mockResolvedValue({
      success: true,
      data: { devices: [{ id: 'smart-bin', code: 'TRTM01', access: 'viewer' }] }
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <DeviceGuard deviceId="smart-bin">
                  <div className="bin-content">Nội dung thùng rác</div>
                </DeviceGuard>
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    // Viewer thấy badge Chỉ xem
    expect(container.textContent).toContain('Được chia sẻ · Chỉ xem');
    // Tuyệt đối không thấy form đổi tên, form chia sẻ hay nút gỡ thiết bị
    expect(container.querySelector('.device-name-form')).toBeNull();
    expect(container.querySelector('.btn-unclaim-trigger')).toBeNull();
    expect(container.querySelector('.device-owner-share-section')).toBeNull();
  });

  it('15. DeviceShareManager: Xử lý lỗi 401 kích hoạt đăng xuất đúng user', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'owner_user_401', name: 'Owner User', email: 'owner401@example.com', role: 'member', owned: [] } }
    });
    vi.spyOn(myDeviceService, 'getMyDevices').mockResolvedValue({
      success: true,
      data: { devices: [{ id: 'smart-bin', code: 'TRTM01', access: 'owner' }] }
    });
    vi.spyOn(myDeviceService, 'getDeviceShares').mockResolvedValue({
      success: false,
      status: 401,
      message: 'Unauthorized'
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <DeviceShareManager deviceId="smart-bin" isOwner={true} />
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    // Khi phiên hết hạn 401, session storage được dọn
    expect(window.sessionStorage.getItem('shp_auth_session')).toBeNull();
  });

  it('16. DeviceGuard: Viewer bị thu hồi khi đứng yên trên trang sẽ mất dữ liệu cũ và unmount module con', async () => {
    vi.spyOn(authService, 'getMeService').mockResolvedValue({
      success: true,
      data: { user: { id: 'viewer_standing', name: 'Viewer User', email: 'viewer@example.com', role: 'viewer', owned: [] } }
    });
    // Ban đầu tài khoản có quyền viewer
    const getDevicesSpy = vi.spyOn(myDeviceService, 'getMyDevices').mockResolvedValueOnce({
      success: true,
      data: { devices: [{ id: 'smart-bin', code: 'TRTM01', access: 'viewer' }] }
    }).mockResolvedValueOnce({
      // Lần 2: sau khi chủ sở hữu thu hồi quyền, danh sách thiết bị không còn smart-bin
      success: true,
      data: { devices: [] }
    });

    // Mock getDeviceDetails trả về 403 Forbidden khi bị chủ sở hữu thu hồi
    const getDetailsSpy = vi.spyOn(myDeviceService, 'getDeviceDetails').mockResolvedValue({
      success: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Không có quyền truy cập.'
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <LanguageProvider>
            <AuthProvider>
              <MyDevicesProvider>
                <DeviceGuard deviceId="smart-bin">
                  <div className="confidential-bin-data">DỮ LIỆU CẢM BIẾN THỜI GIAN THỰC</div>
                </DeviceGuard>
              </MyDevicesProvider>
            </AuthProvider>
          </LanguageProvider>
        </MemoryRouter>
      );
    });

    // Đợi polling / kiểm tra quyền hoàn tất
    await act(async () => {
      await Promise.resolve();
    });

    // getDeviceDetails đã được gọi để kiểm tra tính hợp lệ của quyền viewer
    expect(getDetailsSpy).toHaveBeenCalledWith('smart-bin', expect.anything());
    // Khi nhận 403, refreshDevices được kích hoạt
    expect(getDevicesSpy).toHaveBeenCalledTimes(2);

    // Module con chứa dữ liệu cũ phải bị unmount hoàn toàn
    expect(container.querySelector('.confidential-bin-data')).toBeNull();
    // Thay vào đó hiển thị màn hình từ chối truy cập
    expect(container.querySelector('.device-guard-unauthorized')).not.toBeNull();
    expect(container.textContent).toContain('Thiết bị chưa được kết nối');
  });

  it('17. DeviceGuard: Sử dụng Fake Timers đếm chính xác số lần GET trong 30 giây, không bị vòng lặp vô tận', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        data: { user: { id: 'viewer_timer', name: 'Viewer Timer', email: 'vtimer@example.com', role: 'viewer', owned: [] } }
      });
      vi.spyOn(myDeviceService, 'getMyDevices').mockResolvedValue({
        success: true,
        data: { devices: [{ id: 'smart-bin', code: 'TRTM01', access: 'viewer' }] }
      });
      const getDetailsSpy = vi.spyOn(myDeviceService, 'getDeviceDetails').mockResolvedValue({
        success: true,
        data: { device: { id: 'smart-bin', access: 'viewer' } }
      });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <LanguageProvider>
              <AuthProvider>
                <MyDevicesProvider>
                  <DeviceGuard deviceId="smart-bin">
                    <div className="telemetry-ok">Dữ liệu hợp lệ</div>
                  </DeviceGuard>
                </MyDevicesProvider>
              </AuthProvider>
            </LanguageProvider>
          </MemoryRouter>
        );
      });

      // Tại thời điểm mount (t = 0s): gọi đúng 1 lần
      expect(getDetailsSpy).toHaveBeenCalledTimes(1);

      // Tiến tới 10 giây: gọi lần 2
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });
      expect(getDetailsSpy).toHaveBeenCalledTimes(2);

      // Tiến tới 20 giây: gọi lần 3
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });
      expect(getDetailsSpy).toHaveBeenCalledTimes(3);

      // Tiến tới 30 giây: gọi lần 4
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });
      expect(getDetailsSpy).toHaveBeenCalledTimes(4);

      // Đảm bảo dữ liệu vẫn hiển thị ổn định
      expect(container.textContent).toContain('Dữ liệu hợp lệ');
    } finally {
      vi.useRealTimers();
    }
  });

  it('18. DeviceGuard: Xử lý Network Error không lặp vô tận và dọn dẹp timer khi unmount', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(authService, 'getMeService').mockResolvedValue({
        success: true,
        data: { user: { id: 'viewer_net', name: 'Viewer Net', email: 'vnet@example.com', role: 'viewer', owned: [] } }
      });
      vi.spyOn(myDeviceService, 'getMyDevices').mockResolvedValue({
        success: true,
        data: { devices: [{ id: 'smart-bin', code: 'TRTM01', access: 'viewer' }] }
      });
      // Giả lập lỗi mạng
      const getDetailsSpy = vi.spyOn(myDeviceService, 'getDeviceDetails').mockRejectedValue(new Error('Network Offline'));

      await act(async () => {
        root.render(
          <MemoryRouter>
            <LanguageProvider>
              <AuthProvider>
                <MyDevicesProvider>
                  <DeviceGuard deviceId="smart-bin">
                    <div className="telemetry-content">Dữ liệu cảm biến</div>
                  </DeviceGuard>
                </MyDevicesProvider>
              </AuthProvider>
            </LanguageProvider>
          </MemoryRouter>
        );
      });

      // Mount: gọi 1 lần
      expect(getDetailsSpy).toHaveBeenCalledTimes(1);

      // 10s sau khi mạng mất: gọi lần 2 và catch an toàn, không crash
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });
      expect(getDetailsSpy).toHaveBeenCalledTimes(2);

      // Unmount component
      await act(async () => {
        root.unmount();
      });

      // Tiến thêm 20 giây: không được gọi thêm lần nào nữa do đã dọn dẹp interval
      await act(async () => {
        vi.advanceTimersByTime(20000);
      });
      expect(getDetailsSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('19. DeviceShareManager: Stale response 401 của User A không làm logout nhầm User B', async () => {
    let resolveShareRequestA;
    const deferredPromiseA = new Promise((resolve) => {
      resolveShareRequestA = resolve;
    });

    const mockHandleUnauthorized = vi.fn();
    // Lần 1 (User A) bị hoãn; Lần 2 (User B) thành công bình thường
    const shareSpy = vi.spyOn(myDeviceService, 'getDeviceShares')
      .mockReturnValueOnce(deferredPromiseA)
      .mockResolvedValueOnce({ success: true, data: { users: [] } });

    const renderWithUser = (user) => {
      return act(async () => {
        root.render(
          <MemoryRouter>
            <LanguageProvider>
              <AuthContext.Provider value={{ currentUser: user, handleUnauthorized: mockHandleUnauthorized }}>
                <MyDevicesProvider>
                  <DeviceShareManager deviceId="smart-bin" isOwner={true} />
                </MyDevicesProvider>
              </AuthContext.Provider>
            </LanguageProvider>
          </MemoryRouter>
        );
      });
    };

    // 1. User A gửi request nạp danh sách chia sẻ
    await renderWithUser({ id: 'user_A', name: 'User A', email: 'userA@example.com' });
    expect(shareSpy).toHaveBeenCalledTimes(1);

    // 2. Trước khi request của User A có kết quả, User A đăng xuất và User B đăng nhập
    await renderWithUser({ id: 'user_B', name: 'User B', email: 'userB@example.com' });
    expect(shareSpy).toHaveBeenCalledTimes(2);

    // 3. Bây giờ request cũ của User A mới trả về lỗi 401 Unauthorized
    await act(async () => {
      resolveShareRequestA({
        success: false,
        status: 401,
        message: 'Token expired'
      });
    });

    // Stale response của User A tuyệt đối không được kích hoạt logout User B!
    expect(mockHandleUnauthorized).not.toHaveBeenCalledWith('user_B');
    expect(mockHandleUnauthorized).not.toHaveBeenCalled();
  });

  it('20. MyDevicesContext: Đổi tài khoản khi GET của A đang pending -> B GET gửi ngay và thiết bị B hiển thị trước khi A hoàn tất; A 401/reject/resolve không tác động B', async () => {
    let resolveGetA;
    const deferredPromiseA = new Promise((resolve) => {
      resolveGetA = resolve;
    });

    const mockHandleUnauthorized = vi.fn();
    // Lần 1 (User A) bị treo chờ (deferredPromiseA); Lần 2 (User B) trả về ngay danh sách thiết bị của B
    const getDevicesSpy = vi.spyOn(myDeviceService, 'getMyDevices')
      .mockReturnValueOnce(deferredPromiseA)
      .mockResolvedValueOnce({
        success: true,
        data: {
          devices: [
            { id: 'device-b-1', code: 'DEV_B1', access: 'owner' }
          ]
        }
      });

    // Helper component tiêu thụ context để kiểm chứng state hiển thị
    function DevicesConsumer() {
      const { devices, loading, error } = useMyDevices();
      return (
        <div data-testid="consumer">
          {loading && <span data-testid="loading-indicator">Đang tải...</span>}
          {error && <span data-testid="error-message">{error}</span>}
          <ul data-testid="device-list">
            {devices.map(d => (
              <li key={d.id}>{d.id} - {d.access}</li>
            ))}
          </ul>
        </div>
      );
    }

    const renderWithUser = (user) => {
      return act(async () => {
        root.render(
          <MemoryRouter>
            <LanguageProvider>
              <AuthContext.Provider value={{ currentUser: user, handleUnauthorized: mockHandleUnauthorized }}>
                <MyDevicesProvider>
                  <DevicesConsumer />
                </MyDevicesProvider>
              </AuthContext.Provider>
            </LanguageProvider>
          </MemoryRouter>
        );
      });
    };

    // 1. User A đăng nhập: kích hoạt GET lần 1 (đang pending)
    await renderWithUser({ id: 'user_A', name: 'User A', email: 'userA@example.com' });
    expect(getDevicesSpy).toHaveBeenCalledTimes(1);

    // 2. Trước khi A trả về, chuyển sang User B: B GET phải được gửi ngay, không bị inFlight của A chặn
    await renderWithUser({ id: 'user_B', name: 'User B', email: 'userB@example.com' });
    expect(getDevicesSpy).toHaveBeenCalledTimes(2);

    // B resolve ngay: thiết bị của B được hiển thị trên giao diện trước khi A hoàn tất
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('device-b-1 - owner');
    expect(container.querySelector('[data-testid="loading-indicator"]')).toBeNull();

    // 3. Bây giờ request cũ của A trả về 401 Unauthorized
    await act(async () => {
      resolveGetA({
        success: false,
        status: 401,
        message: 'A session expired'
      });
    });

    // Phản hồi 401 của A tuyệt đối không được logout User B
    expect(mockHandleUnauthorized).not.toHaveBeenCalled();
    // Thiết bị của B vẫn hiển thị nguyên vẹn
    expect(container.textContent).toContain('device-b-1 - owner');
    // Không bị set lỗi nhầm
    expect(container.querySelector('[data-testid="error-message"]')).toBeNull();
  });

  it('21. DeviceGuard: Đổi tài khoản A sang B trên cùng deviceId khi request A đang pending -> Quyền lấy theo B, không kẹt tải và response cũ của A không tác động', async () => {
    let resolveDetailsA;
    const deferredDetailsA = new Promise((resolve) => {
      resolveDetailsA = resolve;
    });

    const mockHandleUnauthorized = vi.fn();
    // Lần 1 (A là viewer trên smart-bin) bị hoãn; Lần 2 (B) không bị chặn
    const detailsSpy = vi.spyOn(myDeviceService, 'getDeviceDetails')
      .mockReturnValueOnce(deferredDetailsA);

    const renderGuardWithUser = (user, userDevices) => {
      return act(async () => {
        root.render(
          <MemoryRouter>
            <LanguageProvider>
              <AuthContext.Provider value={{ currentUser: user, handleUnauthorized: mockHandleUnauthorized }}>
                <MyDevicesContext.Provider value={{
                  devices: userDevices,
                  loading: false,
                  isProvided: true,
                  getDeviceAccess: (id) => userDevices.find(d => d.id === id)?.access || null,
                  refreshDevices: vi.fn()
                }}>
                  <DeviceGuard deviceId="smart-bin">
                    <div className="protected-content">Nội dung an toàn của B</div>
                  </DeviceGuard>
                </MyDevicesContext.Provider>
              </AuthContext.Provider>
            </LanguageProvider>
          </MemoryRouter>
        );
      });
    };

    // 1. User A là viewer trên smart-bin: bắt đầu checkViewerAccess và GET bị hoãn
    await renderGuardWithUser(
      { id: 'user_A', name: 'User A', email: 'userA@example.com' },
      [{ id: 'smart-bin', access: 'viewer' }]
    );
    expect(detailsSpy).toHaveBeenCalledTimes(1);

    // 2. Chuyển sang User B: User B là owner trên smart-bin
    await renderGuardWithUser(
      { id: 'user_B', name: 'User B', email: 'userB@example.com' },
      [{ id: 'smart-bin', access: 'owner' }]
    );

    // B là owner: Quyền lấy theo B ngay lập tức, không kẹt tải, hiển thị nội dung
    expect(container.textContent).toContain('Nội dung an toàn của B');
    expect(container.querySelector('.device-guard-unauthorized')).toBeNull();

    // 3. Request A kết thúc với 403 Forbidden (thu hồi quyền)
    await act(async () => {
      resolveDetailsA({
        success: false,
        status: 403,
        code: 'FORBIDDEN',
        message: 'A viewer revoked'
      });
    });

    // Quyền của B vẫn được bảo toàn nguyên vẹn, không bị A 403 làm thu hồi
    expect(container.textContent).toContain('Nội dung an toàn của B');
    expect(container.querySelector('.device-guard-unauthorized')).toBeNull();
    expect(mockHandleUnauthorized).not.toHaveBeenCalled();
  });

  it('22. MyDevicesContext: Race A1 pending -> B -> A2 pending -> A1 401: Không giải phóng khóa A2, không gửi A3 khi trigger refresh, A2 hoàn tất đúng', async () => {
    let resolveGetA1;
    const deferredPromiseA1 = new Promise((resolve) => {
      resolveGetA1 = resolve;
    });

    let resolveGetA2;
    const deferredPromiseA2 = new Promise((resolve) => {
      resolveGetA2 = resolve;
    });

    const mockHandleUnauthorized = vi.fn();
    // Lần 1: A1 (hoãn)
    // Lần 2: B (xong ngay)
    // Lần 3: A2 (hoãn)
    // Lần 4: Refresh sau khi A2 xong (xong ngay)
    const getDevicesSpy = vi.spyOn(myDeviceService, 'getMyDevices')
      .mockReturnValueOnce(deferredPromiseA1)
      .mockResolvedValueOnce({
        success: true,
        data: { devices: [{ id: 'device-b', code: 'DEV_B', access: 'owner' }] }
      })
      .mockReturnValueOnce(deferredPromiseA2)
      .mockResolvedValueOnce({
        success: true,
        data: { devices: [{ id: 'device-a-post', code: 'DEV_A_POST', access: 'owner' }] }
      });

    let refreshDevicesFn = null;
    function DevicesConsumer() {
      const ctx = useMyDevices();
      refreshDevicesFn = ctx.refreshDevices;
      return (
        <div data-testid="consumer">
          {ctx.loading && <span data-testid="loading-indicator">Đang tải...</span>}
          {ctx.error && <span data-testid="error-message">{ctx.error}</span>}
          <ul data-testid="device-list">
            {ctx.devices.map(d => (
              <li key={d.id}>{d.id}</li>
            ))}
          </ul>
        </div>
      );
    }

    const renderWithUser = (user) => {
      return act(async () => {
        root.render(
          <MemoryRouter>
            <LanguageProvider>
              <AuthContext.Provider value={{ currentUser: user, handleUnauthorized: mockHandleUnauthorized }}>
                <MyDevicesProvider>
                  <DevicesConsumer />
                </MyDevicesProvider>
              </AuthContext.Provider>
            </LanguageProvider>
          </MemoryRouter>
        );
      });
    };

    // 1. User A đăng nhập lần đầu: A1 pending
    await renderWithUser({ id: 'user_A', name: 'User A', email: 'userA@example.com' });
    expect(getDevicesSpy).toHaveBeenCalledTimes(1);

    // 2. Chuyển sang User B: B resolve ngay
    await renderWithUser({ id: 'user_B', name: 'User B', email: 'userB@example.com' });
    expect(getDevicesSpy).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('device-b');

    // 3. Chuyển trở lại User A: A2 pending
    await renderWithUser({ id: 'user_A', name: 'User A', email: 'userA@example.com' });
    expect(getDevicesSpy).toHaveBeenCalledTimes(3);

    // 4. Request cũ A1 trả về 401 Unauthorized
    await act(async () => {
      resolveGetA1({
        success: false,
        status: 401,
        message: 'A1 token expired'
      });
    });

    // A1 không được logout phiên A2
    expect(mockHandleUnauthorized).not.toHaveBeenCalled();

    // 5. Thử trigger refresh trong lúc A2 đang pending:
    // Khóa in-flight của A2 phải được bảo vệ, KHÔNG gửi request A3 chồng chéo
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      if (refreshDevicesFn) {
        void refreshDevicesFn();
      }
    });

    // Số lần gọi getMyDevices vẫn giữ nguyên là 3, tuyệt đối không có A3
    expect(getDevicesSpy).toHaveBeenCalledTimes(3);

    // 6. Bây giờ request A2 hoàn tất thành công
    await act(async () => {
      resolveGetA2({
        success: true,
        data: { devices: [{ id: 'device-a-final', code: 'DEV_A2', access: 'owner' }] }
      });
    });

    // Dữ liệu của A2 được hiển thị chính xác
    expect(container.textContent).toContain('device-a-final');
    expect(container.querySelector('[data-testid="loading-indicator"]')).toBeNull();
    expect(mockHandleUnauthorized).not.toHaveBeenCalled();

    // 7. Sau khi A2 đã xong, trigger refresh lần nữa sẽ được phép gửi (lần 4)
    await act(async () => {
      if (refreshDevicesFn) {
        void refreshDevicesFn();
      }
    });
    expect(getDevicesSpy).toHaveBeenCalledTimes(4);
  });

  it('23. DeviceGuard: Race A1 pending -> B -> A2 pending -> A1 403: Không giải phóng khóa A2, tick poll 10s không gửi A3, quyền A2 giữ nguyên', async () => {
    vi.useFakeTimers();
    try {
      let resolveDetailsA1;
      const deferredDetailsA1 = new Promise((resolve) => {
        resolveDetailsA1 = resolve;
      });

      let resolveDetailsA2;
      const deferredDetailsA2 = new Promise((resolve) => {
        resolveDetailsA2 = resolve;
      });

      const mockHandleUnauthorized = vi.fn();
      // Lần 1: A1 (hoãn)
      // Lần 2: B (xong ngay)
      // Lần 3: A2 (hoãn)
      // Lần 4: Tick poll sau khi A2 xong (xong ngay)
      const detailsSpy = vi.spyOn(myDeviceService, 'getDeviceDetails')
        .mockReturnValueOnce(deferredDetailsA1)
        .mockResolvedValueOnce({
          success: true,
          data: { device: { id: 'smart-bin', access: 'viewer' } }
        })
        .mockReturnValueOnce(deferredDetailsA2)
        .mockResolvedValueOnce({
          success: true,
          data: { device: { id: 'smart-bin', access: 'viewer' } }
        });

      const renderGuardWithUser = (user, userDevices) => {
        return act(async () => {
          root.render(
            <MemoryRouter>
              <LanguageProvider>
                <AuthContext.Provider value={{ currentUser: user, handleUnauthorized: mockHandleUnauthorized }}>
                  <MyDevicesContext.Provider value={{
                    devices: userDevices,
                    loading: false,
                    isProvided: true,
                    getDeviceAccess: (id) => userDevices.find(d => d.id === id)?.access || null,
                    refreshDevices: vi.fn()
                  }}>
                    <DeviceGuard deviceId="smart-bin">
                      <div className="protected-content">Nội dung an toàn của viewer</div>
                    </DeviceGuard>
                  </MyDevicesContext.Provider>
                </AuthContext.Provider>
              </LanguageProvider>
            </MemoryRouter>
          );
        });
      };

      // 1. User A (viewer) mount: A1 pending
      await renderGuardWithUser(
        { id: 'user_A', name: 'User A', email: 'userA@example.com' },
        [{ id: 'smart-bin', access: 'viewer' }]
      );
      expect(detailsSpy).toHaveBeenCalledTimes(1);

      // 2. Chuyển sang User B (viewer): B resolve ngay
      await renderGuardWithUser(
        { id: 'user_B', name: 'User B', email: 'userB@example.com' },
        [{ id: 'smart-bin', access: 'viewer' }]
      );
      expect(detailsSpy).toHaveBeenCalledTimes(2);

      // 3. Chuyển trở lại User A (viewer): A2 pending
      await renderGuardWithUser(
        { id: 'user_A', name: 'User A', email: 'userA@example.com' },
        [{ id: 'smart-bin', access: 'viewer' }]
      );
      expect(detailsSpy).toHaveBeenCalledTimes(3);

      // 4. Request cũ A1 trả về 403 Forbidden (thu hồi)
      await act(async () => {
        resolveDetailsA1({
          success: false,
          status: 403,
          code: 'FORBIDDEN',
          message: 'A1 revoked'
        });
      });

      // A1 không được revoke quyền của A2, màn hình unauthorized không hiện
      expect(container.querySelector('.device-guard-unauthorized')).toBeNull();

      // 5. Tick poll 10s trong lúc A2 đang pending:
      // Khóa của A2 được bảo vệ, KHÔNG gửi request A3 chồng chéo
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      // Vẫn giữ nguyên 3 lần gọi, không có A3
      expect(detailsSpy).toHaveBeenCalledTimes(3);

      // 6. Request A2 hoàn tất thành công
      await act(async () => {
        resolveDetailsA2({
          success: true,
          data: { device: { id: 'smart-bin', access: 'viewer' } }
        });
      });

      // Quyền và nội dung của A2 được bảo toàn
      expect(container.textContent).toContain('Nội dung an toàn của viewer');
      expect(container.querySelector('.device-guard-unauthorized')).toBeNull();

      // 7. Sau khi A2 đã hoàn tất, tick poll 10s tiếp theo sẽ gửi request lần 4 bình thường
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });
      expect(detailsSpy).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
