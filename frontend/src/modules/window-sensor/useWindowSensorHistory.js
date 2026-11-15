import { useState, useEffect, useRef } from 'react';
import { useLiveDevices } from '../../context/LiveDeviceContext.jsx';
import { useAuthContext } from '../../context/AuthContext.jsx';

const MAX_TIMELINE_POINTS = 1000;
const MAX_EVENTS = 500;
const MAX_WINDOW_MINUTES = 60;

/**
 * Custom hook quản lý lịch sử quan sát thời gian thực cho Cảm biến Cửa sổ.
 * - Chỉ lưu trong bộ nhớ phiên làm việc web hiện tại (In-Memory Session).
 * - Tính tỷ lệ thời lượng theo GIÂY THỰC TẾ (Elapsed Time), không theo số lần polling.
 * - Điểm dữ liệu khi mất kết nối được gán null để biểu đồ không nối đường qua khoảng offline.
 * - Xóa lịch sử khi đổi tài khoản; giữ nguyên khi đổi ngôn ngữ (VI/EN) hoặc Theme.
 */
export function useWindowSensorHistory() {
  const { devices, loading, error } = useLiveDevices();
  const { currentUser } = useAuthContext();
  const currentUserId = currentUser?.id ?? currentUser?._id ?? null;

  const device = devices.find((d) => d.id === 'window-sensor');
  const isLive = Boolean(device?.fresh && device?.data);
  const data = isLive ? device.data : (device?.data ?? null);

  const rawData = device?.data ?? null;
  const isFresh = Boolean(device?.fresh);
  const currentDoor = rawData && typeof rawData.doorOpen === 'boolean' ? rawData.doorOpen : null;
  const currentMotion = rawData && typeof rawData.motion === 'boolean' ? rawData.motion : null;
  const currentAlarm = rawData && typeof rawData.alarm === 'boolean' ? rawData.alarm : null;
  const currentAlarmReason = rawData?.alarmReason || null;

  const age = (typeof device?.ageSeconds === 'number' && Number.isFinite(device?.ageSeconds)) ? device.ageSeconds : 15;
  const remainingFreshSec = isLive ? Math.max(0, 15 - age) : 0;
  const freshUntil = Date.now() + remainingFreshSec * 1000;

  // Dữ liệu timeline biểu đồ đường: { time, doorOpen, motion, alarm, isLive }
  const [timeline, setTimeline] = useState([]);

  // Thời lượng tích lũy tính bằng GIÂY
  const [durations, setDurations] = useState({
    openSeconds: 0,
    closedSeconds: 0,
    offlineSeconds: 0,
    totalSeconds: 0
  });

  // Danh sách sự kiện nhật ký: { id, timestamp, type, category, title, detail, level }
  const [events, setEvents] = useState([]);

  // Refs để lưu trạng thái trước đó nhằm phát hiện chuyển biến (State Transition)
  const prevFreshRef = useRef(null);
  const prevDoorRef = useRef(null);
  const prevMotionRef = useRef(null);
  const prevAlarmRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const currentAccountRef = useRef(currentUserId);
  const lastTickRef = useRef(Date.now());

  // Ref giữ trạng thái live hiện tại cho timer
  const liveStateRef = useRef({ isLive: false, freshUntil: 0, doorOpen: null });
  liveStateRef.current = {
    isLive: Boolean(isFresh && rawData),
    freshUntil,
    doorOpen: currentDoor
  };

  // 1. Reset dữ liệu khi đổi tài khoản người dùng
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
      prevMotionRef.current = null;
      prevAlarmRef.current = null;
      lastTickRef.current = Date.now();
    }
  }, [currentUserId]);

  // 2. Định kỳ tích lũy thời lượng quan sát thực tế (Elapsed Real Time)
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
            // Thiếu doorOpen: tính vào offline / chưa xác định, không tính vào bình thường
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

  // 3. Ghi nhận timeline và sinh sự kiện khi trạng thái thay đổi
  useEffect(() => {
    if (loading && !isFresh && !rawData) return;

    const now = Date.now();
    const liveNow = Boolean(isFresh && rawData);
    const doorNow = liveNow ? currentDoor : null;
    const motionNow = liveNow ? currentMotion : null;
    const alarmNow = liveNow ? currentAlarm : null;
    const alarmReason = liveNow ? currentAlarmReason : null;

    // 3.1. Sự kiện khởi tạo ban đầu (chỉ kích hoạt 1 lần khi mở trang)
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const initialEvent = {
        id: `init-${now}`,
        timestamp: now,
        type: 'session_start',
        category: 'connection',
        title: 'Bắt đầu phiên quan sát',
        titleEn: 'Observation session started',
        detail: liveNow
          ? `Thiết bị đang trực tuyến. Trạng thái: Cửa ${doorNow ? 'Mở' : 'Đóng'}, ${motionNow ? 'Có' : 'Không có'} chuyển động.`
          : 'Thiết bị hiện chưa trực tuyến. Đang chờ dữ liệu telemetry từ broker.',
        detailEn: liveNow
          ? `Device is online. State: Window ${doorNow ? 'Open' : 'Closed'}, ${motionNow ? 'Motion' : 'No motion'}.`
          : 'Device is currently offline. Waiting for telemetry data from broker.',
        level: liveNow ? 'info' : 'warning'
      };

      setEvents([initialEvent]);
      setTimeline([
        {
          time: now,
          doorOpen: liveNow ? (doorNow ? 1 : 0) : null,
          motion: liveNow ? (motionNow ? 1 : 0) : null,
          alarm: liveNow ? (alarmNow ? 1 : 0) : null,
          isLive: liveNow
        }
      ]);

      prevFreshRef.current = liveNow;
      prevDoorRef.current = doorNow;
      prevMotionRef.current = motionNow;
      prevAlarmRef.current = alarmNow;
      return;
    }

    // 3.2. Cập nhật timeline
    setTimeline((prev) => {
      const newPoint = {
        time: now,
        doorOpen: liveNow && doorNow !== null ? (doorNow ? 1 : 0) : null,
        motion: liveNow && motionNow !== null ? (motionNow ? 1 : 0) : null,
        alarm: liveNow && alarmNow !== null ? (alarmNow ? 1 : 0) : null,
        isLive: liveNow
      };

      // Giữ tối đa 1000 điểm và trong phạm vi 60 phút
      const cutoff = now - MAX_WINDOW_MINUTES * 60 * 1000;
      const filtered = prev.filter((p) => p.time >= cutoff);
      const updated = [...filtered, newPoint];
      return updated.length > MAX_TIMELINE_POINTS
        ? updated.slice(updated.length - MAX_TIMELINE_POINTS)
        : updated;
    });

    // 3.3. Kiểm tra các chuyển đổi trạng thái để tạo sự kiện nhật ký (chỉ khi có thay đổi)
    const newEvents = [];
    const prevLive = prevFreshRef.current;
    const prevDoor = prevDoorRef.current;
    const prevMotion = prevMotionRef.current;
    const prevAlarm = prevAlarmRef.current;

    // Chuyển đổi trạng thái kết nối
    if (prevLive === true && liveNow === false) {
      newEvents.push({
        id: `conn-off-${now}`,
        timestamp: now,
        type: 'offline',
        category: 'connection',
        title: 'Mất kết nối thiết bị',
        titleEn: 'Device disconnected',
        detail: 'Cảm biến đã chuyển sang ngoại tuyến (không nhận bản tin trong 15s).',
        detailEn: 'Sensor went offline (no telemetry received in 15 seconds).',
        level: 'warning'
      });
    } else if (prevLive === false && liveNow === true) {
      const reconnectDoorText = doorNow === true ? 'Mở' : (doorNow === false ? 'Đóng' : 'Chưa rõ');
      const reconnectDoorTextEn = doorNow === true ? 'Open' : (doorNow === false ? 'Closed' : 'Unknown');
      const reconnectMotionText = motionNow === true ? 'Có' : (motionNow === false ? 'Không có' : 'Chưa rõ');
      const reconnectMotionTextEn = motionNow === true ? 'Motion' : (motionNow === false ? 'No motion' : 'Unknown');

      newEvents.push({
        id: `conn-on-${now}`,
        timestamp: now,
        type: 'online',
        category: 'connection',
        title: 'Thiết bị trực tuyến trở lại',
        titleEn: 'Device reconnected',
        detail: `Đã kết nối lại; trạng thái hiện tại: Cửa ${reconnectDoorText}, ${reconnectMotionText} chuyển động.`,
        detailEn: `Reconnected; current state: Window ${reconnectDoorTextEn}, ${reconnectMotionTextEn}.`,
        level: 'info'
      });
    }

    // Các thay đổi cảm biến (CHỈ ghi khi thiết bị đang live liên tục; không bịa sự kiện trong khoảng offline)
    if (prevLive === true && liveNow === true) {
      // Thay đổi cửa mở / đóng
      if (prevDoor !== null && doorNow !== null && prevDoor !== doorNow) {
        newEvents.push({
          id: `door-${now}`,
          timestamp: now,
          type: doorNow ? 'door_open' : 'door_closed',
          category: 'door',
          title: doorNow ? 'Cửa sổ mở ra' : 'Cửa sổ đã đóng',
          titleEn: doorNow ? 'Window opened' : 'Window closed',
          detail: doorNow
            ? 'Tiếp điểm từ MC-38 ghi nhận cửa sổ chuyển sang trạng thái MỞ.'
            : 'Tiếp điểm từ MC-38 ghi nhận cửa sổ đã được ĐÓNG lại an toàn.',
          detailEn: doorNow
            ? 'Magnetic reed switch detected window state changed to OPEN.'
            : 'Magnetic reed switch detected window state changed to CLOSED safely.',
          level: doorNow ? 'warning' : 'info'
        });
      }

      // Thay đổi chuyển động PIR
      if (prevMotion !== null && motionNow !== null && prevMotion !== motionNow) {
        newEvents.push({
          id: `motion-${now}`,
          timestamp: now,
          type: motionNow ? 'motion_start' : 'motion_end',
          category: 'motion',
          title: motionNow ? 'Phát hiện chuyển động' : 'Kết thúc chuyển động',
          titleEn: motionNow ? 'Motion detected' : 'Motion cleared',
          detail: motionNow
            ? 'Cảm biến hồng ngoại PIR ghi nhận có chuyển động trong vùng quét.'
            : 'Vùng quét cảm biến PIR đã yên tĩnh trở lại.',
          detailEn: motionNow
            ? 'PIR sensor detected motion activity in detection zone.'
            : 'PIR sensor detection zone is now clear.',
          level: 'info'
        });
      }

      // Thay đổi cảnh báo
      if (prevAlarm !== null && alarmNow !== null && prevAlarm !== alarmNow) {
        newEvents.push({
          id: `alarm-${now}`,
          timestamp: now,
          type: alarmNow ? 'alarm_active' : 'alarm_cleared',
          category: 'alarm',
          title: alarmNow ? 'Cảnh báo an ninh kích hoạt' : 'Cảnh báo đã tắt',
          titleEn: alarmNow ? 'Security alarm triggered' : 'Alarm cleared',
          detail: alarmNow
            ? (alarmReason ? `Lý do: ${alarmReason}` : 'Firmware kích hoạt còi và trạng thái báo động.')
            : 'Hệ thống đã hủy trạng thái báo động, trở về an toàn.',
          detailEn: alarmNow
            ? (alarmReason ? `Reason: ${alarmReason}` : 'Firmware triggered buzzer and alarm state.')
            : 'System cleared alarm state, returned to normal.',
          level: alarmNow ? 'danger' : 'info'
        });
      }
    }

    if (newEvents.length > 0) {
      setEvents((prev) => {
        const merged = [...newEvents, ...prev];
        return merged.slice(0, MAX_EVENTS);
      });
    }

    // Cập nhật refs
    prevFreshRef.current = liveNow;
    prevDoorRef.current = doorNow;
    prevMotionRef.current = motionNow;
    prevAlarmRef.current = alarmNow;
  }, [isFresh, currentDoor, currentMotion, currentAlarm, currentAlarmReason, rawData, loading]);

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
