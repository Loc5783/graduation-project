import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useMyDevices } from '../../context/MyDevicesContext.jsx';
import { getDeviceShares, shareDevice, revokeDeviceShare, setDeviceCollection } from '../../services/myDeviceService.js';
import ActivityLogPanel from './ActivityLogPanel.jsx';
import { DEVICE_FIELD_LABELS } from './LiveDevicePanel.jsx';
import './DeviceShareManager.css';

export default function DeviceShareManager({ deviceId, isOwner }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const navigate = useNavigate();
  const { currentUser, handleUnauthorized } = useAuthContext();
  const { devices, updateDevice, unclaimDevice, refreshDevices } = useMyDevices();

  const currentDevice = devices.find((d) => d.id === deviceId);

  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [sharing, setSharing] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [confirmRevokeTarget, setConfirmRevokeTarget] = useState(null);

  // Quản lý tên gợi nhớ
  const [nameInput, setNameInput] = useState(currentDevice?.customName || '');
  const [savingName, setSavingName] = useState(false);

  // Quản lý gỡ thiết bị khỏi tài khoản
  const [isConfirmingUnclaim, setIsConfirmingUnclaim] = useState(false);
  const [unclaiming, setUnclaiming] = useState(false);
  const [savingCollection, setSavingCollection] = useState(false);

  const isMountedRef = useRef(true);
  const userIdRef = useRef(currentUser?.id);
  userIdRef.current = currentUser?.id;

  useEffect(() => {
    userIdRef.current = currentUser?.id;
    setErrorMsg(null);
    setSuccessMsg(null);
  }, [currentUser?.id]);

  useEffect(() => {
    setNameInput(currentDevice?.customName || '');
  }, [currentDevice?.customName]);

  const loadShares = useCallback(async () => {
    if (!deviceId || !isOwner) return;
    const reqUserId = currentUser?.id;
    setLoading(true);
    try {
      const res = await getDeviceShares(deviceId);
      if (!isMountedRef.current) return;
      if (reqUserId && reqUserId !== userIdRef.current) return;
      if (res?.status === 401) {
        if (reqUserId && reqUserId === userIdRef.current) {
          handleUnauthorized?.(reqUserId);
        }
        return;
      }
      if (res.success && Array.isArray(res.data?.users)) {
        setShares(res.data.users);
      }
    } catch {
      /* ignore load error */
    } finally {
      if (isMountedRef.current && (!reqUserId || reqUserId === userIdRef.current)) {
        setLoading(false);
      }
    }
  }, [deviceId, isOwner, currentUser?.id, handleUnauthorized]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadShares();
    return () => { isMountedRef.current = false; };
  }, [loadShares]);

  if (!isOwner) return null;

  const handleShare = async (e) => {
    e.preventDefault();
    const reqUserId = currentUser?.id;
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg(isEn ? 'Please enter a valid email address.' : 'Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }

    setSharing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await shareDevice(deviceId, cleanEmail);
      if (!isMountedRef.current) return;
      if (reqUserId && reqUserId !== userIdRef.current) return;
      if (res?.status === 401) {
        if (reqUserId && reqUserId === userIdRef.current) {
          handleUnauthorized?.(reqUserId);
        }
        return;
      }
      if (res.success) {
        setSuccessMsg(isEn ? `Shared view access with ${cleanEmail}` : `Đã chia sẻ quyền xem với ${cleanEmail}`);
        setEmailInput('');
        await loadShares();
      } else {
        if (res.code === 'USER_NOT_FOUND') {
          setErrorMsg(isEn ? 'User not found. They must register an account first.' : 'Không tìm thấy người dùng. Tài khoản phải được đăng ký trước trên hệ thống.');
        } else if (res.code === 'CANNOT_SHARE_SELF') {
          setErrorMsg(isEn ? 'You cannot share device with yourself.' : 'Bạn không thể tự chia sẻ thiết bị cho chính mình.');
        } else {
          setErrorMsg(res.message || (isEn ? 'Failed to share device.' : 'Chia sẻ không thành công.'));
        }
      }
    } catch {
      if (isMountedRef.current && (!reqUserId || reqUserId === userIdRef.current)) {
        setErrorMsg(isEn ? 'Network error during sharing.' : 'Lỗi kết nối khi chia sẻ thiết bị.');
      }
    } finally {
      if (isMountedRef.current && (!reqUserId || reqUserId === userIdRef.current)) {
        setSharing(false);
      }
    }
  };

  const handleRevokeConfirm = async (user) => {
    const reqUserId = currentUser?.id;
    setRevokingId(user.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await revokeDeviceShare(deviceId, user.id);
      if (!isMountedRef.current) return;
      if (reqUserId && reqUserId !== userIdRef.current) return;
      if (res?.status === 401) {
        if (reqUserId && reqUserId === userIdRef.current) {
          handleUnauthorized?.(reqUserId);
        }
        return;
      }
      if (res.success) {
        setSuccessMsg(isEn ? `Revoked access from ${user.email}` : `Đã thu hồi quyền xem của ${user.email}`);
        setConfirmRevokeTarget(null);
        await loadShares();
      } else {
        setErrorMsg(res.message || (isEn ? 'Failed to revoke access.' : 'Không thể thu hồi quyền xem.'));
      }
    } catch {
      if (isMountedRef.current && (!reqUserId || reqUserId === userIdRef.current)) {
        setErrorMsg(isEn ? 'Network error during revoke.' : 'Lỗi kết nối khi thu hồi quyền xem.');
      }
    } finally {
      if (isMountedRef.current && (!reqUserId || reqUserId === userIdRef.current)) {
        setRevokingId(null);
      }
    }
  };

  const handleSaveName = async (e) => {
    e.preventDefault();
    const reqUserId = currentUser?.id;
    const cleanName = nameInput.trim();
    if (cleanName.length > 50) {
      setErrorMsg(isEn ? 'Device name cannot exceed 50 characters.' : 'Tên gợi nhớ tối đa 50 ký tự.');
      return;
    }

    setSavingName(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await updateDevice(deviceId, { customName: cleanName || null });
      if (!isMountedRef.current) return;
      if (reqUserId && reqUserId !== userIdRef.current) return;
      if (res?.status === 401) {
        if (reqUserId && reqUserId === userIdRef.current) {
          handleUnauthorized?.(reqUserId);
        }
        return;
      }
      if (res.success) {
        setSuccessMsg(isEn ? 'Device name updated successfully.' : 'Cập nhật tên gợi nhớ thành công.');
      } else {
        setErrorMsg(res.message || (isEn ? 'Failed to update device name.' : 'Không thể cập nhật tên gợi nhớ.'));
      }
    } catch {
      if (isMountedRef.current && (!reqUserId || reqUserId === userIdRef.current)) {
        setErrorMsg(isEn ? 'Network error during name update.' : 'Lỗi kết nối khi cập nhật tên gợi nhớ.');
      }
    } finally {
      if (isMountedRef.current && (!reqUserId || reqUserId === userIdRef.current)) {
        setSavingName(false);
      }
    }
  };

  const handleResetName = async () => {
    const reqUserId = currentUser?.id;
    setSavingName(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await updateDevice(deviceId, { customName: null });
      if (!isMountedRef.current) return;
      if (reqUserId && reqUserId !== userIdRef.current) return;
      if (res?.status === 401) {
        if (reqUserId && reqUserId === userIdRef.current) {
          handleUnauthorized?.(reqUserId);
        }
        return;
      }
      if (res.success) {
        setNameInput('');
        setSuccessMsg(isEn ? 'Device name reset to default.' : 'Đã khôi phục tên mặc định của thiết bị.');
      } else {
        setErrorMsg(res.message || (isEn ? 'Failed to reset device name.' : 'Không thể khôi phục tên mặc định.'));
      }
    } catch {
      if (isMountedRef.current && (!reqUserId || reqUserId === userIdRef.current)) {
        setErrorMsg(isEn ? 'Network error during name reset.' : 'Lỗi kết nối khi khôi phục tên mặc định.');
      }
    } finally {
      if (isMountedRef.current && (!reqUserId || reqUserId === userIdRef.current)) {
        setSavingName(false);
      }
    }
  };

  const handleUnclaimConfirm = async () => {
    const reqUserId = currentUser?.id;
    setUnclaiming(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await unclaimDevice(deviceId);
      if (!isMountedRef.current) return;
      if (reqUserId && reqUserId !== userIdRef.current) return;
      if (res?.status === 401) {
        if (reqUserId && reqUserId === userIdRef.current) {
          handleUnauthorized?.(reqUserId);
        }
        return;
      }
      if (res.success) {
        navigate('/overview');
      } else {
        setErrorMsg(res.message || (isEn ? 'Failed to unclaim device.' : 'Không thể gỡ thiết bị khỏi tài khoản.'));
        setIsConfirmingUnclaim(false);
      }
    } catch {
      if (isMountedRef.current && (!reqUserId || reqUserId === userIdRef.current)) {
        setErrorMsg(isEn ? 'Network error during unclaim.' : 'Lỗi kết nối khi gỡ thiết bị khỏi tài khoản.');
        setIsConfirmingUnclaim(false);
      }
    } finally {
      if (isMountedRef.current && (!reqUserId || reqUserId === userIdRef.current)) {
        setUnclaiming(false);
      }
    }
  };

  const handleCollectionChange = async (event) => {
    const reqUserId = currentUser?.id;
    const enabled = event.target.checked;
    setSavingCollection(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await setDeviceCollection(deviceId, enabled);
      if (!isMountedRef.current) return;
      if (reqUserId && reqUserId !== userIdRef.current) return;
      if (res?.status === 401) {
        if (reqUserId && reqUserId === userIdRef.current) {
          handleUnauthorized?.(reqUserId);
        }
        return;
      }
      if (!res.success) throw new Error(res.message || 'SAVE_FAILED');
      await refreshDevices();
      setSuccessMsg(isEn ? 'Privacy setting saved.' : 'Đã lưu quyền thu thập dữ liệu.');
    } catch {
      if (isMountedRef.current && (!reqUserId || reqUserId === userIdRef.current)) {
        setErrorMsg(isEn ? 'Could not save the privacy setting.' : 'Không lưu được quyền thu thập dữ liệu.');
      }
    } finally {
      if (isMountedRef.current && (!reqUserId || reqUserId === userIdRef.current)) {
        setSavingCollection(false);
      }
    }
  };

  return (
    <div className="device-share-manager">
      <header className="share-manager-header">
        <h3 className="share-manager-title">
          {isEn ? 'Device Management & Sharing' : 'Quản lý & Chia sẻ thiết bị'}
        </h3>
        <p className="share-manager-subtitle">
          {isEn
            ? 'Manage friendly display name, share read-only view access, or unclaim this device from your account.'
            : 'Đổi tên gợi nhớ hiển thị, chia sẻ quyền xem dữ liệu cho người khác hoặc gỡ thiết bị khỏi tài khoản của bạn.'}
        </p>
      </header>

      {errorMsg && (
        <div className="share-alert share-alert-error" role="alert">
          <span aria-hidden="true">⚠️</span> {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="share-alert share-alert-success" role="status">
          <span aria-hidden="true">✓</span> {successMsg}
        </div>
      )}

      <section className="device-settings-subcard device-collection-card">
        <div>
          <h4 className="device-section-title">{isEn ? 'Data collection' : 'Thu thập dữ liệu'}</h4>
          <p className="device-section-desc">{isEn
            ? 'When off, the server stops storing readings and hides live and historical readings. The ESP may still measure and send data to the local gateway.'
            : 'Khi tắt, máy chủ ngừng lưu số đo và ẩn dữ liệu trực tiếp, lịch sử. ESP vẫn có thể đo và gửi tới gateway nội bộ.'}</p>
        </div>
        <label className="device-collection-toggle"><input type="checkbox" checked={currentDevice?.collectionEnabled !== false}
          onChange={handleCollectionChange} disabled={savingCollection || !currentDevice} />
          <span>{currentDevice?.collectionEnabled === false ? (isEn ? 'Off' : 'Đã tắt') : (isEn ? 'On' : 'Đang bật')}</span></label>
      </section>
      <section className="device-settings-subcard" aria-label={isEn ? 'Collected data types' : 'Loại dữ liệu thiết bị thu thập'}>
        <h4 className="device-section-title">{isEn ? 'Data collected by this device' : 'Thiết bị thu thập dữ liệu gì?'}</h4>
        <ul className="device-collected-fields">{(currentDevice?.collectedFields || []).map(field =>
          <li key={field}>{DEVICE_FIELD_LABELS[field]?.[isEn ? 1 : 0] || field}</li>)}</ul>
      </section>

      {/* 1. Khu vực đổi tên gợi nhớ thiết bị */}
      <section className="device-settings-subcard" aria-label={isEn ? 'Friendly name' : 'Tên gợi nhớ'}>
        <h4 className="device-section-title">
          {isEn ? 'Friendly Display Name' : 'Tên gợi nhớ thiết bị'}
        </h4>
        <p className="device-section-desc">
          {isEn
            ? 'Set a custom friendly name to easily recognize this device on Overview and Sidebar.'
            : 'Đặt tên gợi nhớ để dễ nhận biết thiết bị này trên Tổng quan và thanh điều hướng (ví dụ: Thùng rác phòng khách).'}
        </p>
        <form onSubmit={handleSaveName} className="device-name-form">
          <div className="name-input-row">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={isEn ? 'e.g. Living room smart bin' : 'VD: Thùng rác phòng khách'}
              maxLength={50}
              disabled={savingName}
              className="device-name-input"
            />
            <button
              type="submit"
              disabled={savingName || nameInput.trim() === (currentDevice?.customName || '')}
              className="btn btn-primary btn-sm btn-save-name"
            >
              {savingName ? '…' : (isEn ? 'Save Name' : 'Lưu tên')}
            </button>
            {currentDevice?.customName && (
              <button
                type="button"
                onClick={handleResetName}
                disabled={savingName}
                className="btn btn-secondary btn-sm btn-reset-name"
              >
                {isEn ? 'Reset' : 'Khôi phục mặc định'}
              </button>
            )}
          </div>
        </form>
      </section>

      {/* 2. Khu vực chia sẻ qua email */}
      <section className="device-settings-subcard" aria-label={isEn ? 'Read-only sharing' : 'Chia sẻ quyền xem'}>
        <h4 className="device-section-title">
          {isEn ? 'Share Read-Only View' : 'Chia sẻ quyền xem dữ liệu'}
        </h4>
        <p className="device-section-desc">
          {isEn
            ? 'Authorized viewers can observe live telemetry and history but cannot control devices, edit configurations, or re-share.'
            : 'Người được chia sẻ có thể xem dữ liệu thời gian thực và lịch sử nhưng không thể điều khiển, không sửa cấu hình và không chia sẻ tiếp.'}
        </p>

        <form onSubmit={handleShare} className="share-add-form">
          <div className="share-input-row">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder={isEn ? 'Enter registered user email…' : 'Nhập email tài khoản đã đăng ký…'}
              disabled={sharing}
              required
              className="share-email-input"
            />
            <button
              type="submit"
              disabled={sharing || !emailInput.trim()}
              className="btn btn-primary share-btn-submit"
            >
              {sharing ? (isEn ? 'Sharing…' : 'Đang chia sẻ…') : (isEn ? 'Share View' : 'Chia sẻ quyền xem')}
            </button>
          </div>
        </form>

        {/* Danh sách những người đang được chia sẻ */}
        <div className="share-list-container">
          <h5 className="share-list-title">
            {isEn ? 'Shared Users' : 'Tài khoản đang được chia sẻ'}
            <span className="share-count-badge">{shares.length}</span>
          </h5>

          {loading ? (
            <p className="share-loading-text">{isEn ? 'Loading shared users…' : 'Đang tải danh sách…'}</p>
          ) : shares.length === 0 ? (
            <p className="share-empty-text">
              {isEn ? 'No other users have been granted access to this device.' : 'Chưa có tài khoản nào khác được chia sẻ thiết bị này.'}
            </p>
          ) : (
            <ul className="share-user-list">
              {shares.map((u) => (
                <li key={u.id} className="share-user-item">
                  <div className="share-user-info">
                    <span className="share-user-name">{u.name}</span>
                    <span className="share-user-email">{u.email}</span>
                  </div>
                  <div className="share-user-actions">
                    {confirmRevokeTarget?.id === u.id ? (
                      <div className="revoke-confirm-group">
                        <span className="revoke-confirm-label">{isEn ? 'Confirm?' : 'Xác nhận thu hồi?'}</span>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRevokeConfirm(u)}
                          disabled={revokingId === u.id}
                        >
                          {revokingId === u.id ? '…' : (isEn ? 'Yes, Revoke' : 'Đồng ý')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setConfirmRevokeTarget(null)}
                          disabled={revokingId === u.id}
                        >
                          {isEn ? 'Cancel' : 'Hủy'}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm btn-revoke"
                        onClick={() => setConfirmRevokeTarget(u)}
                        disabled={revokingId === u.id}
                      >
                        {isEn ? 'Revoke Access' : 'Thu hồi'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <ActivityLogPanel key={deviceId} deviceId={deviceId} />

      {/* 3. Khu vực gỡ thiết bị khỏi tài khoản (Danger Zone) */}
      <section className="device-settings-subcard unclaim-subcard" aria-label={isEn ? 'Unclaim device' : 'Gỡ thiết bị khỏi tài khoản'}>
        <h4 className="device-section-title danger-title">
          {isEn ? 'Remove device from account' : 'Gỡ thiết bị khỏi tài khoản'}
        </h4>
        <p className="device-section-desc">
          {isEn
            ? 'This removes your ownership and all shared access. The printed pairing secret stays the same, so anyone who knows it may claim the device afterward. This is not a secure transfer.'
            : 'Thao tác này hủy quyền sở hữu và mọi lượt chia sẻ. Mã ghép nối trên tem không đổi; người biết mã có thể nhận lại thiết bị. Đây không phải cách chuyển quyền an toàn.'}
        </p>

        {isConfirmingUnclaim ? (
          <div className="unclaim-confirm-card" role="alert">
            <p className="unclaim-confirm-warning">
              ⚠️ <strong>{isEn ? 'Security Warning: Confirm unclaiming device?' : 'Cảnh báo bảo mật: Xác nhận gỡ thiết bị khỏi tài khoản?'}</strong>
              <br />
              {isEn
                ? 'Unclaiming will immediately revoke your ownership and all shared viewers. Because the physical pairing secret on the label cannot be rotated remotely, anyone who knows the secret can re-claim this device. Are you sure you want to proceed?'
                : 'Gỡ thiết bị sẽ hủy quyền sở hữu của bạn và toàn bộ người được chia sẻ ngay lập tức. Do mã ghép nối bí mật in trên tem vật lý không thể tự đổi từ xa, bất kỳ ai biết mã đều có thể ghép nối lại thiết bị. Bạn có chắc chắn muốn gỡ thiết bị khỏi tài khoản?'}
            </p>
            <div className="unclaim-confirm-actions">
              <button
                type="button"
                className="btn btn-danger btn-confirm-unclaim"
                onClick={handleUnclaimConfirm}
                disabled={unclaiming}
              >
                {unclaiming ? (isEn ? 'Unclaiming…' : 'Đang gỡ…') : (isEn ? 'Yes, Unclaim Device' : 'Đồng ý gỡ thiết bị')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-cancel-unclaim"
                onClick={() => setIsConfirmingUnclaim(false)}
                disabled={unclaiming}
              >
                {isEn ? 'Cancel' : 'Hủy'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-outline btn-danger btn-unclaim-trigger"
            onClick={() => setIsConfirmingUnclaim(true)}
          >
            {isEn ? 'Unclaim from Account' : 'Gỡ thiết bị khỏi tài khoản'}
          </button>
        )}
      </section>
    </div>
  );
}
