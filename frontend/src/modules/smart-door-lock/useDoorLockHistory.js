import { useState, useEffect, useRef } from 'react';
import { useLiveDevices } from '../../context/LiveDeviceContext.jsx';
import { useAuthContext } from '../../context/AuthContext.jsx';

const MAX_TIMELINE_POINTS = 1000;
const MAX_EVENTS = 500;
const MAX_WINDOW_MINUTES = 60;

/**
 * Custom hook quản lý lịch sử quan sát cho Khóa cửa thông minh (smart-door-lock).
 * - Lưu trữ trong bộ nhớ phiên web (In-Memory Session), không lưu localStorage.
 * - Đo lường thời lượng bằng GIÂY THỰC TẾ trôi qua, chỉ tính live trong thời gian còn đủ độ tươi (<15s).
 * - Khi mất kết nối hoặc dữ liệu cũ (age >= 15s), chèn null để biểu đồ ngắt quãng.
 * - Reconnect không bịa sự kiện thay đổi xảy ra trong khoảng offline.
 * - Thiếu doorOpen ghi log "Chưa xác định", không dùng toán tử truthy biến thành Đóng.
 * - Tự động dọn sạch lịch sử khi đổi tài khoản đăng nhập.
 */
export function useDoorLockHistory() {
  const { devices, loading, error } = useLiveDevices();
  const { currentUser } = useAuthContext();
  const currentUserId = currentUser?.id ?? currentUser?._id ?? null;

  const device = devices.find((d) => d.id === 'smart-door-lock');
  const isLive = Boolean(device?.fresh && device?.data);
  const data = isLive ? device.data : (device?.data ?? null);

  const rawData = device?.data ?? null;
  const isFresh = Boolean(device?.fresh);

  const currentDoor = rawData && typeof rawData.doorOpen === 'boolean' ? rawData.doorOpen : null;
  const currentBoltCmd = rawData && typeof rawData.boltCommand === 'string' ? rawData.boltCommand : 'unknown';
  const currentForced = rawData && typeof rawData.forcedOpen === 'boolean' ? rawData.forcedOpen : false;
  const currentHeld = rawData && typeof rawData.heldOpen === 'boolean' ? rawData.heldOpen : false;
  const currentAlarm = rawData && typeof rawData.alarm === 'boolean' ? rawData.alarm : (currentForced || currentHeld);

  const age = (typeof device?.ageSeconds === 'number' && Number.isFinite(device?.ageSeconds)) ? device.ageSeconds : 15;
  const remainingFreshSec = isLive ? Math.max(0, 15 - age) : 0;
  const freshUntil = Date.now() + remainingFreshSec * 1000;

  const [timeline, setTimeline] = useState([]);
  const [durations, setDurations] = useState({
    openSeconds: 0,
    closedSeconds: 0,
    offlineSeconds: 0,
    totalSeconds: 0
  });
  const [events, setEvents] = useState([]);

  const prevFreshRef = useRef(null);
  const prevDoorRef = useRef(null);
  const prevBoltCmdRef = useRef(null);
  const prevAlarmRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const currentAccountRef = useRef(currentUserId);
  const lastTickRef = useRef(Date.now());

  const liveStateRef = useRef({ isLive: false, freshUntil: 0, doorOpen: null });
  liveStateRef.current = {
    isLive: Boolean(isFresh && rawData),
    freshUntil,
    doorOpen: currentDoor
  };

  // 1. Reset dữ liệu khi đổi tài khoản
  useEffect(() => {
    if (currentAccountRef.current !== currentUserId) {
      currentAccountRef.current = currentUserId;
      setTimeline([]);
      setDurations({
        openSeconds: 0,
        closedSeconds: 0,
        offlineSeconds: 0,
        totalSeconds: 0
      });
      setEvents([]);
      hasInitializedRef.current = false;
      prevFreshRef.current = null;
      prevDoorRef.current = null;
      prevBoltCmdRef.current = null;
      prevAlarmRef.current = null;
      lastTickRef.current = Date.now();
    }
  }, [currentUserId]);

  // 2. Tích lũy thời lượng quan sát bằng thời gian thực trôi qua (Elapsed Real Time)
  useEffect(() => {
    lastTickRef.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const lastTick = lastTickRef.current;
      lastTickRef.current = now;

      const deltaSec = Math.max(0, (now - lastTick) / 1000);
      if (deltaSec <= 0) return;

      setDurations((prev) => {
        const { isLive: liveNow, freshUntil: freshLimit, doorOpen: doorNow } = liveStateRef.current;

        // Chỉ tính trạng thái trong thời gian còn đủ độ tươi (<15s)
        let liveSec = 0;
        if (liveNow && freshLimit > lastTick) {
          liveSec = Math.max(0, Math.min(now, freshLimit) - lastTick) / 1000;
          liveSec = Math.min(deltaSec, liveSec);
        }
        const offlineSec = deltaSec - liveSec;

        let nextOpen = prev.openSeconds;
        let nextClosed = prev.closedSeconds;
        let nextOffline = prev.offlineSeconds + offlineSec;

        if (liveSec > 0) {
          if (doorNow === true) {
            nextOpen += liveSec;
          } else if (doorNow === false) {
            nextClosed += liveSec;
          } else {
            // Dữ liệu thiếu không được tính vào phần thời lượng bình thường
            nextOffline += liveSec;
          }
        }

        return {
          openSeconds: nextOpen,
          closedSeconds: nextClosed,
          offlineSeconds: nextOffline,
          totalSeconds: nextOpen + nextClosed + nextOffline
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 3. Xử lý timeline và sinh nhật ký sự kiện chuyển trạng thái
  useEffect(() => {
    if (loading && !isFresh && !rawData) return;

    const now = Date.now();
    const liveNow = Boolean(isFresh && rawData);
    const doorNow = liveNow ? currentDoor : null;
    const boltNow = liveNow ? currentBoltCmd : 'unknown';
    const alarmNow = liveNow ? Boolean(currentAlarm || currentForced || currentHeld) : null;

    const doorStatusText = doorNow === true ? 'ĐANG MỞ' : (doorNow === false ? 'ĐANG ĐÓNG' : 'CHƯA XÁC ĐỊNH');
    const doorStatusTextEn = doorNow === true ? 'OPEN' : (doorNow === false ? 'CLOSED' : 'UNKNOWN');

    // 3.1. Sự kiện ban đầu khi khởi tạo
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      prevFreshRef.current = liveNow;
      prevDoorRef.current = doorNow;
      prevBoltCmdRef.current = boltNow;
      prevAlarmRef.current = alarmNow;

      setEvents([
        {
          id: `init-${now}`,
          timestamp: now,
          type: 'init',
          category: 'connection',
          title: 'Bắt đầu phiên quan sát',
          titleEn: 'Observation session started',
          detail: liveNow
            ? `Cảm biến cửa: ${doorStatusText}, Lệnh chốt: ${boltNow} (chưa có xác nhận cơ khí).`
            : 'Đang chờ nhận bản tin telemetry đầu tiên từ khóa cửa...',
          detailEn: liveNow
            ? `Door sensor: ${doorStatusTextEn}, Bolt command: ${boltNow} (no mechanical confirmation).`
            : 'Awaiting first telemetry packet from smart door lock...',
          level: liveNow ? 'info' : 'neutral'
        }
      ]);

      setTimeline([
        {
          timestamp: now,
          doorOpen: doorNow === true ? 1 : (doorNow === false ? 0 : null),
          alarm: alarmNow ? 1 : 0,
          isLive: liveNow
        }
      ]);
      return;
    }

    // 3.2. Cập nhật timeline (chèn null khi offline hoặc doorOpen thiếu)
    setTimeline((prev) => {
      const windowStart = now - MAX_WINDOW_MINUTES * 60 * 1000;
      const filtered = prev.filter((p) => p.timestamp >= windowStart);
      const newPoint = {
        timestamp: now,
        doorOpen: liveNow && doorNow !== null ? (doorNow ? 1 : 0) : null,
        alarm: liveNow && alarmNow !== null ? (alarmNow ? 1 : 0) : null,
        isLive: liveNow
      };
      const updated = [...filtered, newPoint];
      return updated.length > MAX_TIMELINE_POINTS ? updated.slice(-MAX_TIMELINE_POINTS) : updated;
    });

    // 3.3. So sánh chuyển đổi trạng thái để ghi log (deduplication)
    const newEvents = [];
    const prevLive = prevFreshRef.current;
    const prevDoor = prevDoorRef.current;
    const prevBolt = prevBoltCmdRef.current;
    const prevAlarm = prevAlarmRef.current;

    // Kết nối
    if (prevLive === true && liveNow === false) {
      newEvents.push({
        id: `conn-off-${now}`,
        timestamp: now,
        type: 'offline',
        category: 'connection',
        title: 'Mất kết nối khóa cửa',
        titleEn: 'Door lock disconnected',
        detail: 'Không nhận được telemetry từ khóa cửa trong 15 giây qua.',
        detailEn: 'No telemetry packet received from door lock in the last 15 seconds.',
        level: 'warning'
      });
    } else if (prevLive === false && liveNow === true) {
      const reconnectDoorText = doorNow === true ? 'MỞ' : (doorNow === false ? 'ĐÓNG' : 'CHƯA XÁC ĐỊNH');
      const reconnectDoorTextEn = doorNow === true ? 'OPEN' : (doorNow === false ? 'CLOSED' : 'UNKNOWN');

      newEvents.push({
        id: `conn-on-${now}`,
        timestamp: now,
        type: 'online',
        category: 'connection',
        title: 'Khóa cửa trực tuyến trở lại',
        titleEn: 'Door lock reconnected',
        detail: `Kết nối lại. Cửa: ${reconnectDoorText}, Lệnh chốt: ${boltNow}.`,
        detailEn: `Reconnected. Door: ${reconnectDoorTextEn}, Bolt command: ${boltNow}.`,
        level: 'info'
      });
    }

    // Các chuyển đổi trạng thái: CHỈ ghi khi thiết bị đang live liên tục (prevLive === true && liveNow === true)
    // Tuyệt đối không bịa sự kiện thay đổi xảy ra trong khoảng offline
    if (prevLive === true && liveNow === true) {
      // Cửa mở / đóng
      if (prevDoor !== null && doorNow !== null && prevDoor !== doorNow) {
        newEvents.push({
          id: `door-${now}`,
          timestamp: now,
          type: doorNow ? 'door_open' : 'door_closed',
          category: 'door',
          title: doorNow ? 'Cửa mở ra' : 'Cửa đã khép lại',
          titleEn: doorNow ? 'Door opened' : 'Door closed',
          detail: doorNow
            ? 'Cảm biến từ ghi nhận cánh cửa đã MỞ RA.'
            : 'Cảm biến từ ghi nhận cánh cửa đã ĐÓNG LẠI (Lưu ý: Không đồng nghĩa chốt đã khóa).',
          detailEn: doorNow
            ? 'Magnetic reed switch detected door is now OPEN.'
            : 'Magnetic reed switch detected door is now CLOSED (Note: Does not confirm bolt is locked).',
          level: doorNow ? 'warning' : 'info'
        });
      } else if (prevDoor !== null && doorNow === null) {
        newEvents.push({
          id: `door-lost-${now}`,
          timestamp: now,
          type: 'door_state_lost',
          category: 'door',
          title: 'Mất tín hiệu trạng thái cửa',
          titleEn: 'Door state unknown',
          detail: 'Bản tin telemetry mới không chứa trường doorOpen hợp lệ.',
          detailEn: 'New telemetry packet is missing valid doorOpen field.',
          level: 'warning'
        });
      }

      // Lệnh chốt (boltCommand)
      if (prevBolt !== null && boltNow !== prevBolt) {
        newEvents.push({
          id: `bolt-${now}`,
          timestamp: now,
          type: 'bolt_command',
          category: 'bolt',
          title: `Lệnh chốt: ${boltNow.toUpperCase()}`,
          titleEn: `Bolt command: ${boltNow.toUpperCase()}`,
          detail: `Firmware ghi nhận trạng thái lệnh chốt là "${boltNow}" (Trạng thái lệnh phần mềm, phần cứng chưa có cảm biến phản hồi chốt).`,
          detailEn: `Firmware recorded bolt command status "${boltNow}" (Software command state; no mechanical feedback sensor).`,
          level: 'info'
        });
      }

      // Cảnh báo (forcedOpen / heldOpen / alarm)
      if (prevAlarm !== null && alarmNow !== null && prevAlarm !== alarmNow) {
        const isForced = Boolean(currentForced);
        const isHeld = Boolean(currentHeld);
        newEvents.push({
          id: `alarm-${now}`,
          timestamp: now,
          type: alarmNow ? 'alarm_active' : 'alarm_cleared',
          category: 'alarm',
          title: alarmNow
            ? (isForced ? 'CẢNH BÁO: CẠY CỬA TRÁI PHÉP' : (isHeld ? 'CẢNH BÁO: CỬA MỞ QUÁ LÂU' : 'Cảnh báo an ninh khóa cửa'))
            : 'Cảnh báo an ninh đã được giải tỏa',
          titleEn: alarmNow
            ? (isForced ? 'ALERT: FORCED ENTRY DETECTED' : (isHeld ? 'ALERT: DOOR HELD OPEN' : 'Door security alert triggered'))
            : 'Security alert cleared',
          detail: alarmNow
            ? `Cảm biến kích hoạt báo động. Forced: ${isForced}, HeldOpen: ${isHeld}.`
            : 'Trạng thái khóa cửa đã trở về mức an toàn.',
          detailEn: alarmNow
            ? `Sensor triggered alert. Forced: ${isForced}, HeldOpen: ${isHeld}.`
            : 'Door lock state returned to safe.',
          level: alarmNow ? 'danger' : 'info'
        });
      }
    }

    if (newEvents.length > 0) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, MAX_EVENTS));
    }

    prevFreshRef.current = liveNow;
    prevDoorRef.current = doorNow;
    prevBoltCmdRef.current = boltNow;
    prevAlarmRef.current = alarmNow;
  }, [isFresh, currentDoor, currentBoltCmd, currentAlarm, currentForced, currentHeld, rawData, loading]);

  return {
    device,
    isLive,
    data,
    loading,
    error,
    timeline,
    durations,
    events
  };
}
