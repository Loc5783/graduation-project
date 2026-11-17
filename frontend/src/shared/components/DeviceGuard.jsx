import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useMyDevices } from '../../context/MyDevicesContext.jsx';
import DeviceShareManager from './DeviceShareManager.jsx';
import { getDeviceDetails } from '../../services/myDeviceService.js';
import './DeviceGuard.css';
import { DEVICE_FIELD_LABELS } from './LiveDevicePanel.jsx';

export default function DeviceGuard({ deviceId, children }) {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const { currentUser, handleUnauthorized } = useAuthContext();
  const myDevices = useMyDevices();
  const access = myDevices?.isProvided ? myDevices.getDeviceAccess(deviceId) : null;
  const [isAccessRevoked, setIsAccessRevoked] = useState(false);

  const currentUserId = currentUser?.id;
  const userIdRef = useRef(currentUserId);
  userIdRef.current = currentUserId;
  const refreshDevicesRef = useRef(myDevices?.refreshDevices);
  refreshDevicesRef.current = myDevices?.refreshDevices;
  const inFlightLockRef = useRef(null); // { userId, deviceId, seq }
  const fetchSeqRef = useRef(0);
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  // Khi đổi tài khoản hoặc đổi thiết bị: Reset ngay cờ revoked và dọn dẹp request cũ của tài khoản trước
  useEffect(() => {
    setIsAccessRevoked(false);
    if (
      inFlightLockRef.current?.userId !== currentUserId ||
      inFlightLockRef.current?.deviceId !== deviceId
    ) {
      inFlightLockRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, [currentUserId, deviceId]);

  // Khi viewer đang mở trang: Polling định kỳ mỗi 10 giây với dependency ổn định, chống request chồng
  useEffect(() => {
    isMountedRef.current = true;
    if (access !== 'viewer' || !deviceId || !currentUserId) {
      setIsAccessRevoked(false);
      return;
    }

    const checkViewerAccess = async () => {
      // Chống request chồng lặp cho CÙNG một người dùng trên CÙNG một thiết bị
      if (
        inFlightLockRef.current &&
        inFlightLockRef.current.userId === currentUserId &&
        inFlightLockRef.current.deviceId === deviceId
      ) {
        return;
      }

      const thisSeq = ++fetchSeqRef.current;
      inFlightLockRef.current = { userId: currentUserId, deviceId, seq: thisSeq };
      const reqUserId = currentUserId;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await getDeviceDetails(deviceId, { signal: controller.signal });
        if (!isMountedRef.current || reqUserId !== userIdRef.current || thisSeq !== fetchSeqRef.current) return;
        if (res?.status === 401) {
          handleUnauthorized?.(reqUserId);
          return;
        }
        if (res?.status === 403 || res?.status === 404 || res?.code === 'FORBIDDEN' || res?.code === 'DEVICE_NOT_FOUND') {
          // Ẩn ngay dữ liệu viewer trước/trong lúc refresh để không giữ telemetry cũ
          setIsAccessRevoked(true);
          void refreshDevicesRef.current?.();
        }
      } catch {
        /* Lỗi mạng hoặc abort: Không coi là thu hồi quyền, không set revoked để tránh crash UI tạm thời */
      } finally {
        // Chỉ request đang sở hữu khóa mới được nhả khóa
        if (inFlightLockRef.current?.seq === thisSeq) {
          inFlightLockRef.current = null;
        }
        // Không để finally cũ xóa abortControllerRef của request mới
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    };

    void checkViewerAccess();
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkViewerAccess();
      }
    }, 10000);

    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      clearInterval(intervalId);
    };
  }, [access, deviceId, currentUserId, handleUnauthorized]);

  if (!myDevices?.isProvided) {
    return children;
  }

  // Nếu quyền xem đã bị thu hồi: chặn ngay lập tức, không chờ loading của refreshDevices
  if (isAccessRevoked) {
    return (
      <div className="device-guard-unauthorized" role="alert">
        <div className="unauthorized-card">
          <span className="unauthorized-icon" aria-hidden="true">🔒</span>
          <h2>{isEn ? 'Device Not Paired' : 'Thiết bị chưa được kết nối'}</h2>
          <p>
            {isEn
              ? 'You do not have access to this device. You need to claim it using its secret pairing code or have the owner share view access with you.'
              : 'Tài khoản của bạn chưa nhận thiết bị này hoặc chưa được chủ sở hữu chia sẻ quyền xem.'}
          </p>
          <div className="unauthorized-actions">
            <Link to="/overview" className="btn btn-primary">
              ← {isEn ? 'Return to Overview' : 'Quay lại Tổng quan'}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { getDeviceAccess, loading } = myDevices;

  if (loading) {
    return (
      <div className="device-guard-loading" role="status">
        <div className="auth-spinner" aria-hidden="true"></div>
        <p>{isEn ? 'Checking device access…' : 'Đang kiểm tra quyền truy cập thiết bị…'}</p>
      </div>
    );
  }

  const currentAccess = getDeviceAccess(deviceId);

  if (!currentAccess) {
    return (
      <div className="device-guard-unauthorized" role="alert">
        <div className="unauthorized-card">
          <span className="unauthorized-icon" aria-hidden="true">🔒</span>
          <h2>{isEn ? 'Device Not Paired' : 'Thiết bị chưa được kết nối'}</h2>
          <p>
            {isEn
              ? 'You do not have access to this device. You need to claim it using its secret pairing code or have the owner share view access with you.'
              : 'Tài khoản của bạn chưa nhận thiết bị này hoặc chưa được chủ sở hữu chia sẻ quyền xem.'}
          </p>
          <div className="unauthorized-actions">
            <Link to="/overview" className="btn btn-primary">
              ← {isEn ? 'Return to Overview' : 'Quay lại Tổng quan'}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isDeviceOwner = currentAccess === 'owner';
  const currentDevice = myDevices.devices.find(device => device.id === deviceId);
  const collectionPaused = currentDevice?.collectionEnabled === false;
  const oldPlugBrokerHistory = deviceId === 'smart-plug' && Number(currentDevice?.ownershipEpoch) > 1;

  return (
    <div className={`device-guard-container access-${currentAccess}`}>
      {/* Thanh hiển thị quyền truy cập */}
      <div className="device-access-banner" role="status">
        <span className={`access-pill ${isDeviceOwner ? 'access-pill-owner' : 'access-pill-viewer'}`}>
          {isDeviceOwner
            ? (isEn ? '★ My Device (Owner)' : '★ Thiết bị của tôi (Chủ sở hữu)')
            : (isEn ? '👁 Shared Access (Read-only)' : '👁 Được chia sẻ · Chỉ xem')}
        </span>
        {!isDeviceOwner && (
          <span className="viewer-restriction-hint">
            {isEn
              ? 'Controls and configurations are disabled for read-only viewers.'
              : 'Tài khoản chỉ xem không có quyền điều khiển hoặc đổi cấu hình.'}
          </span>
        )}
      </div>

      {!isDeviceOwner && <details className="device-data-inventory">
        <summary>{isEn ? 'Data this device can collect' : 'Thiết bị này có thể thu thập dữ liệu gì?'}</summary>
        <ul>{(currentDevice?.collectedFields || []).map(field => <li key={field}>{DEVICE_FIELD_LABELS[field]?.[isEn ? 1 : 0] || field}</li>)}</ul>
      </details>}

      {/* Nội dung module thiết bị */}
      {collectionPaused || oldPlugBrokerHistory ? <div className="device-collection-paused" role="status">
        <h2>{isEn ? 'Data collection is paused' : 'Đã tắt thu thập dữ liệu'}</h2>
        <p>{oldPlugBrokerHistory ? (isEn ? 'This public MQTT topic has no ownership boundary. The module is hidden after a transfer until it uses a new authenticated topic.'
          : 'Topic MQTT công khai chưa phân biệt chủ cũ và chủ mới. Module được ẩn sau khi đổi chủ cho đến khi chuyển sang topic mới có xác thực.')
          : (isEn ? 'Live readings and history are hidden. The owner can turn collection back on below.'
            : 'Số đo trực tiếp và lịch sử đang được ẩn. Chủ sở hữu có thể bật lại ở phần quản lý bên dưới.')}</p>
      </div> : <div className="device-module-content">{children}</div>}

      {/* Khu vực chia sẻ thiết bị (Chỉ hiển thị cho chủ sở hữu) */}
      {isDeviceOwner && (
        <section className="device-owner-share-section" aria-label={isEn ? 'Device sharing' : 'Chia sẻ thiết bị'}>
          <DeviceShareManager deviceId={deviceId} isOwner={true} />
        </section>
      )}
    </div>
  );
}
