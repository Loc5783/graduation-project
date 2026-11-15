import { useState, useEffect, useRef } from 'react';
import { useLiveDevices } from '../../context/LiveDeviceContext.jsx';
import { useAuthContext } from '../../context/AuthContext.jsx';

const MAX_TIMELINE_POINTS = 1000;
const MAX_EVENTS = 500;
const MAX_WINDOW_MINUTES = 60;

/**
 * Custom hook quản lý lịch sử quan sát cho Thùng rác thông minh (smart-bin).
 * - Lưu trữ in-memory trong phiên web.
 * - Khi sensorOk=false hoặc distanceCm < 0: KHÔNG biến thành 0%, trả null / không hợp lệ.
 * - Tự động xóa lịch sử khi đổi tài khoản.
 */
export function useSmartBinHistory() {
  const { devices, loading, error } = useLiveDevices();
  const { currentUser } = useAuthContext();
  const currentUserId = currentUser?.id ?? currentUser?._id ?? null;

  const device = devices.find((d) => d.id === 'smart-bin');
  const isLive = Boolean(device?.fresh && device?.data);
  const data = isLive ? device.data : (device?.data ?? null);

  const rawData = device?.data ?? null;
  const isFresh = Boolean(device?.fresh);

  // Trích xuất các trường từ payload
  const sensorOk = rawData && typeof rawData.sensorOk === 'boolean' ? rawData.sensorOk : null;
  const distanceCm = rawData && typeof rawData.distanceCm === 'number' && Number.isFinite(rawData.distanceCm)
    ? rawData.distanceCm
    : null;
  const rawFillPercent = rawData && typeof rawData.fillPercent === 'number' && Number.isFinite(rawData.fillPercent)
    ? rawData.fillPercent
    : null;

  // fillPercent chỉ hợp lệ khi sensorOk === true và distanceCm >= 0
  const isMeasurementValid = Boolean(sensorOk === true && distanceCm !== null && distanceCm >= 0 && rawFillPercent !== null);
  const fillPercent = isMeasurementValid ? rawFillPercent : null;

  const lidOpen = rawData && typeof rawData.lidOpen === 'boolean' ? rawData.lidOpen : null;
  const mode = rawData && typeof rawData.mode === 'string' ? rawData.mode : 'unknown';

  const [timeline, setTimeline] = useState([]);
  const [events, setEvents] = useState([]);

  const prevFreshRef = useRef(null);
  const prevLidRef = useRef(null);
  const prevModeRef = useRef(null);
  const prevSensorOkRef = useRef(null);
  const prevFullAlertRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const currentAccountRef = useRef(currentUserId);

  // 1. Reset dữ liệu khi đổi tài khoản
  useEffect(() => {
    if (currentAccountRef.current !== currentUserId) {
      currentAccountRef.current = currentUserId;
      setTimeline([]);
      setEvents([]);
      hasInitializedRef.current = false;
      prevFreshRef.current = null;
      prevLidRef.current = null;
      prevModeRef.current = null;
      prevSensorOkRef.current = null;
      prevFullAlertRef.current = null;
    }
  }, [currentUserId]);

  // 2. Timeline & Event Deduplication
  useEffect(() => {
    if (loading && !isFresh && !rawData) return;

    const now = Date.now();
    const liveNow = Boolean(isFresh && rawData);
    const lidNow = liveNow ? lidOpen : null;
    const modeNow = liveNow ? mode : 'unknown';
    const sensorOkNow = liveNow ? sensorOk : null;
    const fillNow = liveNow && isMeasurementValid ? fillPercent : null;
    const isFullAlert = Boolean(fillNow !== null && fillNow >= 80);

    // 2.1. Lần đầu khởi tạo
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      prevFreshRef.current = liveNow;
      prevLidRef.current = lidNow;
      prevModeRef.current = modeNow;
      prevSensorOkRef.current = sensorOkNow;
      prevFullAlertRef.current = isFullAlert;

      const initLidText = lidNow === true ? 'Mở' : (lidNow === false ? 'Đóng' : 'Chưa rõ');
      const initLidTextEn = lidNow === true ? 'Open' : (lidNow === false ? 'Closed' : 'Unknown');

      setEvents([
        {
          id: `init-${now}`,
          timestamp: now,
          type: 'init',
          category: 'connection',
          title: 'Bắt đầu phiên quan sát thùng rác',
          titleEn: 'Smart bin observation started',
          detail: liveNow
            ? `Cảm biến: ${sensorOkNow ? 'Bình thường' : 'Lỗi siêu âm'}, Mức đầy: ${fillNow !== null ? `${Math.round(fillNow)}%` : 'Không đọc được'}, Nắp: ${initLidText}.`
            : 'Đang đợi bản tin telemetry từ thùng rác...',
          detailEn: liveNow
            ? `Sensor: ${sensorOkNow ? 'OK' : 'Error'}, Fill: ${fillNow !== null ? `${Math.round(fillNow)}%` : 'Unreadable'}, Lid: ${initLidTextEn}.`
            : 'Awaiting telemetry packet from smart bin...',
          level: liveNow ? 'info' : 'neutral'
        }
      ]);

      setTimeline([
        {
          timestamp: now,
          fillPercent: fillNow,
          lidOpen: lidNow === true ? 1 : (lidNow === false ? 0 : null),
          isLive: liveNow
        }
      ]);
      return;
    }

    // 2.2. Ghi điểm timeline
    setTimeline((prev) => {
      const windowStart = now - MAX_WINDOW_MINUTES * 60 * 1000;
      const filtered = prev.filter((p) => p.timestamp >= windowStart);
      const newPoint = {
        timestamp: now,
        fillPercent: liveNow ? fillNow : null, // Ngắt quãng nếu offline hoặc sensor lỗi
        lidOpen: liveNow && lidNow !== null ? (lidNow ? 1 : 0) : null,
        isLive: liveNow
      };
      const updated = [...filtered, newPoint];
      return updated.length > MAX_TIMELINE_POINTS ? updated.slice(-MAX_TIMELINE_POINTS) : updated;
    });

    // 2.3. Phát hiện thay đổi trạng thái để ghi nhật ký
    const newEvents = [];
    const prevLive = prevFreshRef.current;
    const prevLid = prevLidRef.current;
    const prevMode = prevModeRef.current;
    const prevSensor = prevSensorOkRef.current;
    const prevFull = prevFullAlertRef.current;

    // Kết nối
    if (prevLive === true && liveNow === false) {
      newEvents.push({
        id: `conn-off-${now}`,
        timestamp: now,
        type: 'offline',
        category: 'connection',
        title: 'Thùng rác mất kết nối',
        titleEn: 'Smart bin disconnected',
        detail: 'Không nhận được telemetry từ thùng rác trong 15 giây qua.',
        detailEn: 'No telemetry received from smart bin in the last 15 seconds.',
        level: 'warning'
      });
    } else if (prevLive === false && liveNow === true) {
      const reconnectLidText = lidNow === true ? 'Mở' : (lidNow === false ? 'Đóng' : 'Chưa rõ');
      const reconnectLidTextEn = lidNow === true ? 'Open' : (lidNow === false ? 'Closed' : 'Unknown');

      newEvents.push({
        id: `conn-on-${now}`,
        timestamp: now,
        type: 'online',
        category: 'connection',
        title: 'Thùng rác trực tuyến trở lại',
        titleEn: 'Smart bin reconnected',
        detail: `Kết nối lại. Mức đầy: ${fillNow !== null ? `${Math.round(fillNow)}%` : 'Chưa đọc được'}, Nắp: ${reconnectLidText}.`,
        detailEn: `Reconnected. Fill: ${fillNow !== null ? `${Math.round(fillNow)}%` : 'Unreadable'}, Lid: ${reconnectLidTextEn}.`,
        level: 'info'
      });
    }

    // Các chuyển đổi trạng thái: CHỈ ghi khi thiết bị đang live liên tục (không bịa sự kiện trong khoảng offline)
    if (prevLive === true && liveNow === true) {
      // Nắp mở / đóng
      if (prevLid !== null && lidNow !== null && prevLid !== lidNow) {
        newEvents.push({
          id: `lid-${now}`,
          timestamp: now,
          type: lidNow ? 'lid_open' : 'lid_closed',
          category: 'lid',
          title: lidNow ? 'Nắp thùng rác mở ra' : 'Nắp thùng rác đã đóng',
          titleEn: lidNow ? 'Trash bin lid opened' : 'Trash bin lid closed',
          detail: lidNow
            ? 'Servo điều khiển nắp đã nâng lên góc mở.'
            : 'Servo điều khiển nắp đã hạ xuống đóng kín thùng.',
          detailEn: lidNow
            ? 'Servo moved lid to OPEN position.'
            : 'Servo lowered lid to CLOSED position.',
          level: 'info'
        });
      }

      // Đổi chế độ
      if (prevMode !== null && modeNow !== prevMode) {
        newEvents.push({
          id: `mode-${now}`,
          timestamp: now,
          type: 'mode_change',
          category: 'mode',
          title: `Chuyển chế độ: ${modeNow.toUpperCase()}`,
          titleEn: `Mode changed: ${modeNow.toUpperCase()}`,
          detail: `Chế độ hoạt động của thùng rác chuyển sang "${modeNow}".`,
          detailEn: `Operating mode changed to "${modeNow}".`,
          level: 'info'
        });
      }

      // Lỗi cảm biến siêu âm
      if (prevSensor !== null && sensorOkNow !== null && prevSensor !== sensorOkNow) {
        newEvents.push({
          id: `sensor-${now}`,
          timestamp: now,
          type: sensorOkNow ? 'sensor_ok' : 'sensor_error',
          category: 'sensor',
          title: sensorOkNow ? 'Cảm biến siêu âm bình thường' : 'Lỗi cảm biến siêu âm HC-SR04',
          titleEn: sensorOkNow ? 'Ultrasonic sensor restored' : 'HC-SR04 sensor error',
          detail: sensorOkNow
            ? 'Đã nhận lại xung echo hợp lệ từ cảm biến khoảng cách.'
            : 'Mất tín hiệu xung echo (NO ECHO), không thể đo khoảng cách tới rác.',
          detailEn: sensorOkNow
            ? 'Valid echo pulse restored from distance sensor.'
            : 'Echo pulse timeout (NO ECHO), unable to measure trash distance.',
          level: sensorOkNow ? 'info' : 'danger'
        });
      }

      // Cảnh báo đầy rác (>=80%)
      if (prevFull !== null && isFullAlert !== prevFull) {
        newEvents.push({
          id: `full-${now}`,
          timestamp: now,
          type: isFullAlert ? 'bin_full' : 'bin_cleared',
          category: 'alert',
          title: isFullAlert ? 'CẢNH BÁO: THÙNG RÁC ĐÃ ĐẦY (>=80%)' : 'Thùng rác đã được dọn bớt',
          titleEn: isFullAlert ? 'ALERT: TRASH BIN FULL (>=80%)' : 'Trash bin emptied',
          detail: isFullAlert
            ? `Mức đầy hiện tại là ${fillNow ? Math.round(fillNow) : 80}%. Đèn đỏ và còi cảnh báo kích hoạt.`
            : 'Mức rác đã giảm xuống dưới ngưỡng cảnh báo an toàn.',
          detailEn: isFullAlert
            ? `Current fill level is ${fillNow ? Math.round(fillNow) : 80}%. Red LED and alert active.`
            : 'Trash level dropped below warning threshold.',
          level: isFullAlert ? 'warning' : 'info'
        });
      }
    }

    if (newEvents.length > 0) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, MAX_EVENTS));
    }

    prevFreshRef.current = liveNow;
    prevLidRef.current = lidNow;
    prevModeRef.current = modeNow;
    prevSensorOkRef.current = sensorOkNow;
    prevFullAlertRef.current = isFullAlert;
  }, [isFresh, sensorOk, distanceCm, rawFillPercent, isMeasurementValid, fillPercent, lidOpen, mode, rawData, loading]);

  return {
    device,
    isLive,
    data,
    loading,
    error,
    sensorOk,
    distanceCm,
    fillPercent,
    isMeasurementValid,
    lidOpen,
    mode,
    timeline,
    events
  };
}
