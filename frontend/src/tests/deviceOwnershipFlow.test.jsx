import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../context/LanguageContext.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { MyDevicesProvider } from '../context/MyDevicesContext.jsx';
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
    // Tài khoản chỉ có 1 thiết bị -> Hiển thị "Thiết bị thông minh (1)", không được ghi (5)
    expect(sectionTitle.textContent.trim()).toBe('Thiết bị thông minh (1)');
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
});
