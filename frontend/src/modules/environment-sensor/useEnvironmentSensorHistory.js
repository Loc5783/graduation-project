import { useState, useEffect, useRef } from 'react';
import { useLiveDevices } from '../../context/LiveDeviceContext.jsx';
import { useAuthContext } from '../../context/AuthContext.jsx';

const MAX_TIMELINE_POINTS = 1000;
const MAX_EVENTS = 500;
const MAX_WINDOW_MINUTES = 60;

/**
 * Custom hook quản lý lịch sử quan sát cho Cảm biến Môi trường & Gas (environment-sensor).
 * - Lưu trữ in-memory trong phiên web.
 * - Đo lường thời lượng bằng GIÂY THỰC TẾ trôi qua, chỉ tính live trong thời gian còn đủ độ tươi (<15s).
 * - Thiếu alertLevel hoặc mã ngoài enum 0/1/2/3: Chưa xác định, không gán SAFE.
 * - Thiếu buzzerOn: Chưa xác định, không tự coi là đang tắt.
 * - Dữ liệu thiếu không được tính vào thời lượng bình thường.
 * - Reconnect không bịa sự kiện thay đổi xảy ra trong khoảng offline.
 * - Tự động xóa lịch sử khi đổi tài khoản.
 */
export function useEnvironmentSensorHistory() {
  const { devices, loading, error } = useLiveDevices();
  const { currentUser } = useAuthContext();
  const currentUserId = currentUser?.id ?? currentUser?._id ?? null;

  const device = devices.find((d) => d.id === 'environment-sensor');
  const isLive = Boolean(device?.fresh && device?.data);
  const data = isLive ? device.data : (device?.data ?? null);

  const rawData = device?.data ?? null;
  const isFresh = Boolean(device?.fresh);

  const temperature = rawData && typeof rawData.temperature === 'number' && Number.isFinite(rawData.temperature)
    ? rawData.temperature
    : null;
  const humidity = rawData && typeof rawData.humidity === 'number' && Number.isFinite(rawData.humidity)
    ? rawData.humidity
    : null;
  const gasRaw = rawData && typeof rawData.gasRaw === 'number' && Number.isFinite(rawData.gasRaw)
    ? rawData.gasRaw
    : null;

  // alertLevel bắt buộc thuộc enum [0, 1, 2, 3]; ngoài ra là null (Chưa xác định), KHÔNG tự coi là SAFE
  const rawAlertLevel = rawData && typeof rawData.alertLevel === 'number' && Number.isFinite(rawData.alertLevel)
    ? rawData.alertLevel
    : null;
  const alertLevel = [0, 1, 2, 3].includes(rawAlertLevel) ? rawAlertLevel : null;
  const isWarmingUp = Boolean(rawData?.isWarmingUp || alertLevel === 0);
  const alertLevelText = alertLevel === 3 ? 'DANGER' : (alertLevel === 2 ? 'WARNING' : (alertLevel === 1 ? 'SAFE' : (alertLevel === 0 ? 'WARMUP' : null)));

  // buzzerOn chỉ hợp lệ khi là boolean; ngoài ra là null (Chưa xác định), KHÔNG tự coi là false (Yên tĩnh)
  const buzzerOn = typeof rawData?.buzzerOn === 'boolean' ? rawData.buzzerOn : null;

  const age = (typeof device?.ageSeconds === 'number' && Number.isFinite(device?.ageSeconds)) ? device.ageSeconds : 15;
  const remainingFreshSec = isLive ? Math.max(0, 15 - age) : 0;
  const freshUntil = Date.now() + remainingFreshSec * 1000;

  const [timeline, setTimeline] = useState([]);
  const [durations, setDurations] = useState({
    safeSeconds: 0,
    warningSeconds: 0,
    dangerSeconds: 0,
    warmupSeconds: 0,
    offlineSeconds: 0,
    totalSeconds: 0
  });
  const [events, setEvents] = useState([]);

  const prevFreshRef = useRef(null);
  const prevLevelRef = useRef(null);
  const prevBuzzerRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const currentAccountRef = useRef(currentUserId);
  const lastTickRef = useRef(Date.now());

  const liveStateRef = useRef({ isLive: false, freshUntil: 0, alertLevel: null, isWarmingUp: false });
  liveStateRef.current = {
    isLive: Boolean(isFresh && rawData),
    freshUntil,
    alertLevel,
    isWarmingUp
  };

  // 1. Reset dữ liệu khi đổi tài khoản
  useEffect(() => {
    if (currentAccountRef.current !== currentUserId) {
      currentAccountRef.current = currentUserId;
      setTimeline([]);
      setDurations({
        safeSeconds: 0,
        warningSeconds: 0,
        dangerSeconds: 0,
        warmupSeconds: 0,
        offlineSeconds: 0,
        totalSeconds: 0
      });
      setEvents([]);
      hasInitializedRef.current = false;
      prevFreshRef.current = null;
      prevLevelRef.current = null;
      prevBuzzerRef.current = null;
      lastTickRef.current = Date.now();
    }
  }, [currentUserId]);

  // 2. Tích lũy thời lượng quan sát thực tế (Elapsed Real Time)
  useEffect(() => {
    lastTickRef.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const lastTick = lastTickRef.current;
      lastTickRef.current = now;

      const deltaSec = Math.max(0, (now - lastTick) / 1000);
      if (deltaSec <= 0) return;

      setDurations((prev) => {
        const { isLive: liveNow, freshUntil: freshLimit, alertLevel: lvl, isWarmingUp: warm } = liveStateRef.current;

        // Chỉ tính trạng thái trong thời gian còn đủ độ tươi (<15s)
        let liveSec = 0;
        if (liveNow && freshLimit > lastTick) {
          liveSec = Math.max(0, Math.min(now, freshLimit) - lastTick) / 1000;
          liveSec = Math.min(deltaSec, liveSec);
        }
        const offlineSec = deltaSec - liveSec;

        let nextSafe = prev.safeSeconds;
        let nextWarn = prev.warningSeconds;
        let nextDang = prev.dangerSeconds;
        let nextWarm = prev.warmupSeconds;
        let nextOff = prev.offlineSeconds + offlineSec;

        if (liveSec > 0) {
          if (warm || lvl === 0) {
            nextWarm += liveSec;
          } else if (lvl === 3) {
            nextDang += liveSec;
          } else if (lvl === 2) {
            nextWarn += liveSec;
          } else if (lvl === 1) {
            nextSafe += liveSec;
          } else {
            // Thiếu alertLevel hoặc ngoài enum: tính vào offline / chưa xác định, không tính vào SAFE
            nextOff += liveSec;
          }
        }

        return {
          safeSeconds: nextSafe,
          warningSeconds: nextWarn,
          dangerSeconds: nextDang,
          warmupSeconds: nextWarm,
          offlineSeconds: nextOff,
          totalSeconds: nextSafe + nextWarn + nextDang + nextWarm + nextOff
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 3. Xử lý timeline và sinh nhật ký sự kiện chuyển mức
  useEffect(() => {
    if (loading && !isFresh && !rawData) return;

    const now = Date.now();
    const liveNow = Boolean(isFresh && rawData);
    const lvlNow = liveNow ? alertLevel : null;
    const buzzerNow = liveNow ? buzzerOn : null;

    // 3.1. Sự kiện ban đầu khi khởi tạo
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      prevFreshRef.current = liveNow;
      prevLevelRef.current = lvlNow;
      prevBuzzerRef.current = buzzerNow;

      setEvents([
        {
          id: `init-${now}`,
          timestamp: now,
          type: 'init',
          category: 'connection',
          title: 'Bắt đầu phiên quan sát môi trường',
          titleEn: 'Environment observation started',
          detail: liveNow
            ? `Cảm biến trực tuyến. Mức cảnh báo: ${alertLevelText || 'Chưa xác định'}, Gas: ${gasRaw !== null ? `${gasRaw} ADC` : '--'}.`
            : 'Đang chờ nhận bản tin telemetry đầu tiên từ cảm biến môi trường...',
          detailEn: liveNow
            ? `Sensor online. Alert level: ${alertLevelText || 'Unknown'}, Gas: ${gasRaw !== null ? `${gasRaw} ADC` : '--'}.`
            : 'Awaiting first telemetry packet from environment sensor...',
          level: liveNow ? 'info' : 'neutral'
        }
      ]);

      setTimeline([
        {
          timestamp: now,
          gasRaw: liveNow ? gasRaw : null,
          temperature: liveNow ? temperature : null,
          humidity: liveNow ? humidity : null,
          alertLevel: liveNow ? alertLevel : null,
          isLive: liveNow
        }
      ]);
      return;
    }

    // 3.2. Cập nhật timeline
    setTimeline((prev) => {
      const windowStart = now - MAX_WINDOW_MINUTES * 60 * 1000;
      const filtered = prev.filter((p) => p.timestamp >= windowStart);
      const newPoint = {
        timestamp: now,
        gasRaw: liveNow ? gasRaw : null,
        temperature: liveNow ? temperature : null,
        humidity: liveNow ? humidity : null,
        alertLevel: liveNow ? alertLevel : null,
        isLive: liveNow
      };
      const updated = [...filtered, newPoint];
      return updated.length > MAX_TIMELINE_POINTS ? updated.slice(-MAX_TIMELINE_POINTS) : updated;
    });

    // 3.3. So sánh thay đổi trạng thái để ghi log (deduplication)
    const newEvents = [];
    const prevLive = prevFreshRef.current;
    const prevLevel = prevLevelRef.current;
    const prevBuzzer = prevBuzzerRef.current;

    // Kết nối
    if (prevLive === true && liveNow === false) {
      newEvents.push({
        id: `conn-off-${now}`,
        timestamp: now,
        type: 'offline',
        category: 'connection',
        title: 'Mất kết nối cảm biến môi trường',
        titleEn: 'Environment sensor disconnected',
        detail: 'Không nhận được telemetry từ cảm biến môi trường trong 15 giây qua.',
        detailEn: 'No telemetry packet received from environment sensor in 15 seconds.',
        level: 'warning'
      });
    } else if (prevLive === false && liveNow === true) {
      newEvents.push({
        id: `conn-on-${now}`,
        timestamp: now,
        type: 'online',
        category: 'connection',
        title: 'Cảm biến môi trường trực tuyến trở lại',
        titleEn: 'Environment sensor reconnected',
        detail: `Kết nối lại. Mức cảnh báo: ${alertLevelText || 'Chưa xác định'}, Gas: ${gasRaw !== null ? `${gasRaw} ADC` : '--'}.`,
        detailEn: `Reconnected. Alert level: ${alertLevelText || 'Unknown'}, Gas: ${gasRaw !== null ? `${gasRaw} ADC` : '--'}.`,
        level: 'info'
      });
    }

    // Chuyển mức cảnh báo: CHỈ ghi khi thiết bị đang live liên tục (prevLive === true && liveNow === true)
    // Không bịa sự kiện thay đổi xảy ra trong khoảng offline
    if (prevLive === true && liveNow === true) {
      if (prevLevel !== null && lvlNow !== null && prevLevel !== lvlNow) {
        const levelNames = {
          0: 'ĐANG LÀM NÓNG CẢM BIẾN (WARM-UP)',
          1: 'AN TOÀN / BÌNH THƯỜNG',
          2: 'CẢNH BÁO RÒ RỈ KHÍ GAS',
          3: 'NGUY HIỂM: NỒNG ĐỘ GAS VƯỢT NGƯỠNG ĐỎ'
        };
        const levelNamesEn = {
          0: 'WARM-UP IN PROGRESS',
          1: 'SAFE / NORMAL',
          2: 'GAS LEAK WARNING',
          3: 'DANGER: HIGH GAS CONCENTRATION'
        };

        newEvents.push({
          id: `level-${now}`,
          timestamp: now,
          type: `level_${lvlNow}`,
          category: 'alert',
          title: levelNames[lvlNow] || `Chuyển mức: ${lvlNow}`,
          titleEn: levelNamesEn[lvlNow] || `Level changed: ${lvlNow}`,
          detail: `Firmware phát hiện chuyển dịch mức cảnh báo sang ${alertLevelText || lvlNow}. Gas ADC: ${gasRaw !== null ? `${gasRaw} ADC` : '--'}.`,
          detailEn: `Firmware detected alert level transition to ${alertLevelText || lvlNow}. Gas ADC: ${gasRaw !== null ? `${gasRaw} ADC` : '--'}.`,
          level: lvlNow === 3 ? 'danger' : (lvlNow === 2 ? 'warning' : 'info')
        });
      }

      // Thay đổi trạng thái còi Buzzer
      if (prevBuzzer !== null && buzzerNow !== null && prevBuzzer !== buzzerNow) {
        newEvents.push({
          id: `buzzer-${now}`,
          timestamp: now,
          type: buzzerNow ? 'buzzer_on' : 'buzzer_off',
          category: 'buzzer',
          title: buzzerNow ? 'Còi báo động đang kêu' : 'Còi báo động đã tắt',
          titleEn: buzzerNow ? 'Buzzer alarm activated' : 'Buzzer silenced',
          detail: buzzerNow
            ? 'Còi trên bo mạch ESP32 phát âm thanh cảnh báo nồng độ gas.'
            : 'Còi báo động đã ngừng phát âm thanh.',
          level: buzzerNow ? 'warning' : 'info'
        });
      }
    }

    if (newEvents.length > 0) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, MAX_EVENTS));
    }

    prevFreshRef.current = liveNow;
    prevLevelRef.current = lvlNow;
    prevBuzzerRef.current = buzzerNow;
  }, [isFresh, alertLevel, alertLevelText, gasRaw, temperature, humidity, buzzerOn, rawData, loading]);

  return {
    device,
    isLive,
    data,
    error,
    temperature,
    humidity,
    gasRaw,
    alertLevel,
    alertLevelText,
    isWarmingUp,
    buzzerOn,
    timeline,
    durations,
    events
  };
}
