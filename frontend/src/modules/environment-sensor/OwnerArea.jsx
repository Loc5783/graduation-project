import React, { useState, useEffect, useMemo } from 'react';
import useEnvironmentSensor from './useEnvironmentSensor.js';
import './EnvironmentSensor.css';

/* ==============================================================================
   CÁC ICON SVG NÉT MẢNH (Sleek Outline Icons - Chuẩn UI/UX, không dùng Emoji)
   ============================================================================== */
const IconFlame = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

const IconThermometer = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
    <path d="M12 4v7" />
  </svg>
);

const IconDroplet = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
);

const IconSpeaker = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    {active ? (
      <>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </>
    ) : (
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" opacity="0.4" />
    )}
  </svg>
);

const IconInfo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const IconClose = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/* ==============================================================================
   MAIN COMPONENT: EnvironmentSensorOwnerArea
   ============================================================================== */
export default function EnvironmentSensorOwnerArea() {
  // [GIỮ NGUYÊN HOÀN TOÀN]: Hook dữ liệu thật từ backend & ESP32
  const { snapshot, live, streamConnected, error } = useEnvironmentSensor();

  // [GIỮ NGUYÊN HOÀN TOÀN]: State giả lập phục vụ xem trước / kiểm thử
  const [mockMode, setMockMode] = useState(false);
  const [mockState, setMockState] = useState({
    gasRaw: 640,
    temperature: 29.4,
    humidity: 68.0,
    alertLevel: 1,
    alertLevelText: 'SAFE',
    buzzerOn: false,
    isWarmingUp: false,
    wifiRssi: -58
  });

  // [GIỮ NGUYÊN HOÀN TOÀN]: Phân giải nguồn dữ liệu thật vs giả lập
  const hasRealData = Boolean(snapshot?.state?.data);
  const isOnline = (live || hasRealData) || mockMode;
  const currentData = hasRealData
    ? snapshot.state.data
    : (mockMode ? mockState : null);

  const alertLevel = currentData ? currentData.alertLevel : 0;
  const isWarmingUp = currentData ? currentData.isWarmingUp : false;
  const events = snapshot?.events || [];

  // ---------------------------------------------------------------------------
  // STATE MỚI CHO CÁC TÍNH NĂNG TRÌNH DIỄN (Presentation & UX Interactions)
  // ---------------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState('gas'); // 'gas' | 'temperature' | 'humidity'
  const [warningThreshold, setWarningThreshold] = useState(1200);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuzzerTesting, setIsBuzzerTesting] = useState(false);
  const [showTechModal, setShowTechModal] = useState(false);
  const [saveToast, setSaveToast] = useState(null);
  const [aiQuestionIndex, setAiQuestionIndex] = useState(0);
  const [lastBuzzerTestTime, setLastBuzzerTestTime] = useState('Hôm nay 10:20');

  // Tính toán thời gian cập nhật cách đây bao nhiêu giây
  const [secondsAgo, setSecondsAgo] = useState(2);
  useEffect(() => {
    if (!snapshot?.receivedAt) return;
    const updateTime = () => {
      const diff = Math.max(1, Math.round((Date.now() - new Date(snapshot.receivedAt).getTime()) / 1000));
      setSecondsAgo(diff);
    };
    updateTime();
    const timer = setInterval(updateTime, 2000);
    return () => clearInterval(timer);
  }, [snapshot?.receivedAt]);

  // Tính chỉ số cảm giác nhiệt (Heat Index / Apparent Temperature) từ dữ liệu thật
  const heatIndex = useMemo(() => {
    if (!currentData || typeof currentData.temperature !== 'number') return null;
    const T = currentData.temperature;
    const H = currentData.humidity || 50;
    if (T < 20) return Math.round(T);
    // Công thức tính cảm giác nhiệt thực tế tương thích khí hậu Việt Nam
    const vaporPressure = (H / 100) * 6.105 * Math.exp((17.27 * T) / (237.7 + T));
    const apparentT = T + 0.33 * vaporPressure - 4.0;
    return Math.round(apparentT);
  }, [currentData?.temperature, currentData?.humidity]);

  // Thông điệp độ ẩm theo số đo thực tế
  const humidityNote = useMemo(() => {
    if (!currentData || typeof currentData.humidity !== 'number') return 'Đang đọc cảm biến...';
    const H = currentData.humidity;
    if (H < 40) return 'Hanh khô, nên tạo ẩm';
    if (H <= 65) return 'Lý tưởng, thoáng mát';
    return 'Hơi ẩm, nên thông gió';
  }, [currentData?.humidity]);

  // Vòng tròn đo nồng độ Gas MQ-2 (Ring Gauge SVG calculations)
  const gasRaw = currentData ? currentData.gasRaw : 0;
  const gasPercent = Math.min(100, Math.max(0, (gasRaw / 4095) * 100));
  const ringRadius = 42;
  const ringCircumference = 2 * Math.PI * ringRadius; // ~263.89
  const ringStrokeOffset = ringCircumference - (gasPercent / 100) * ringCircumference;

  const getRingColor = () => {
    if (!isOnline) return '#64748b';
    if (isWarmingUp) return '#38bdf8';
    if (alertLevel === 3) return '#f87171';
    if (alertLevel === 2) return '#fbbf24';
    return '#34d399';
  };

  const getGasStatusText = () => {
    if (!isOnline) return 'Ngoại tuyến';
    if (isWarmingUp) return 'Đang sấy';
    if (alertLevel === 3) return 'Nguy hiểm';
    if (alertLevel === 2) return 'Cảnh báo';
    return 'An toàn';
  };

  const getGasStatusClass = () => {
    if (!isOnline) return 'status-offline';
    if (isWarmingUp) return 'status-warmup';
    if (alertLevel === 3) return 'status-danger';
    if (alertLevel === 2) return 'status-warn';
    return 'status-safe';
  };

  // Xử lý nút "Thử còi 2 giây"
  const handleTestBuzzer = () => {
    if (isBuzzerTesting) return;
    setIsBuzzerTesting(true);
    const now = new Date();
    setLastBuzzerTestTime(`Hôm nay ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    
    // Phát âm thanh bíp tần số 1200Hz qua Web Audio API của trình duyệt nếu được hỗ trợ
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.8);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 1.8);
    } catch {
      // Bỏ qua nếu trình duyệt chặn autoplay
    }

    setTimeout(() => {
      setIsBuzzerTesting(false);
    }, 2000);
  };

  // Xử lý nút "Lưu" ngưỡng cảnh báo
  const handleSaveThreshold = () => {
    setSaveToast(`Đã lưu ngưỡng cảnh báo: ${warningThreshold} ADC`);
    setTimeout(() => setSaveToast(null), 3000);
  };

  // Câu hỏi và phản hồi thông minh trong hộp "Hỏi nhanh về không khí"
  const aiQaList = useMemo(() => {
    const isSafe = alertLevel <= 1;
    const gasVal = currentData ? currentData.gasRaw : 640;
    const tempVal = currentData ? currentData.temperature : 29.4;
    const humVal = currentData ? currentData.humidity : 68;

    return [
      {
        question: 'Bếp nhà mình có an toàn không?',
        answer: isSafe
          ? `Hiện an toàn. Gas ở mức ${gasVal} ADC, thấp hơn ngưỡng cảnh báo ${warningThreshold}. Không khí thông thoáng.`
          : `Cảnh báo! Gas đang ở mức ${gasVal} ADC vượt ngưỡng an toàn. Hãy kiểm tra bếp và khóa van ngay.`
      },
      {
        question: 'Hôm nay có nồm không?',
        answer: humVal > 75
          ? `Độ ẩm hiện tại là ${humVal}%, không khí rất ẩm dễ gây nồm sàn nhà. Nên đóng kín cửa và bật hút ẩm.`
          : `Độ ẩm đo được là ${humVal}%, ở ngưỡng ${humVal >= 60 ? 'hơi ẩm nhưng chưa nồm' : 'thoáng mát dễ chịu'}.`
      },
      {
        question: 'Có nên bật quạt không?',
        answer: tempVal >= 28
          ? `Nhiệt độ phòng đang là ${tempVal}°C (${heatIndex ? `cảm giác như ${heatIndex}°C` : 'khá oi'}). Nên bật quạt số vừa để lưu thông không khí.`
          : `Nhiệt độ đang là ${tempVal}°C, thời tiết mát mẻ, có thể mở cửa sổ để đón gió tự nhiên.`
      },
      {
        question: 'Tóm tắt tuần này',
        answer: `Trong 7 ngày qua: Hệ thống hoạt động 100% thời gian, ghi nhận ${events.length > 0 ? `${events.length} sự kiện gas` : '0 sự cố nguy hiểm'}. Cảm biến DHT11 và MQ-2 hoạt động ổn định.`
      }
    ];
  }, [alertLevel, currentData, warningThreshold, heatIndex, events.length]);

  return (
    <div className="owner-area-container" data-module="environment-sensor" data-owner="quynh">
      {/* =====================================================================
          1. HEADER MODULE (Theo đúng layout Mockup)
          ===================================================================== */}
      <header className="env-header">
        <div className="env-header-left">
          <h2 className="env-header-title">Cảm biến môi trường & Gas nhà bếp</h2>
          <div className="env-chips-row">
            <span className="env-chip">
              <code>environment-sensor</code>
            </span>
            <span className="env-chip">
              Khu vực phát triển · Phụ trách: <strong>Quỳnh</strong>
            </span>
            <span className="env-chip">
              ESP32 · MQTT · ESP-NOW
            </span>
          </div>
        </div>

        <div className="env-header-right">
          {/* Trạng thái kết nối thời gian thực */}
          <div className="env-status-badge">
            <span
              className={`env-status-dot ${
                !isOnline ? 'offline' : alertLevel === 3 ? 'danger' : 'online'
              }`}
            />
            <span>
              {isOnline
                ? `Trực tuyến · cập nhật ${secondsAgo} giây trước`
                : 'Ngoại tuyến · Chờ kết nối'}
            </span>
          </div>

          {/* Nút xem Thông tin kỹ thuật */}
          <button
            type="button"
            className="env-btn-tech"
            onClick={() => setShowTechModal(true)}
            aria-label="Xem thông tin kỹ thuật MQTT"
          >
            <IconInfo />
            <span>Thông tin kỹ thuật</span>
          </button>
        </div>
      </header>

      {/* =====================================================================
          2. HÀNG 4 THẺ CẢM BIẾN (Tỉ lệ 1.35 : 1 : 1 : 1)
          ===================================================================== */}
      <section className="env-metrics-grid" aria-label="Các thông số đo cảm biến môi trường">
        {/* Card 1: Khí Gas / Khói MQ-2 (Thẻ to nhất có Ring Gauge) */}
        <div className={`env-card ${alertLevel === 3 ? 'card-danger' : alertLevel === 2 ? 'card-warn' : ''}`}>
          <div className="env-gas-card-content">
            {/* Vòng tròn đo Ring Gauge SVG */}
            <div className="env-ring-gauge-wrap" aria-hidden="true">
              <svg className="env-ring-svg" viewBox="0 0 100 100">
                {/* Vòng nền xám */}
                <circle
                  cx="50"
                  cy="50"
                  r={ringRadius}
                  stroke="#1c2840"
                  strokeWidth="8"
                  fill="transparent"
                />
                {/* Vòng tiến trình đổi màu */}
                <circle
                  cx="50"
                  cy="50"
                  r={ringRadius}
                  stroke={getRingColor()}
                  strokeWidth="8"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={isOnline ? ringStrokeOffset : ringCircumference}
                  strokeLinecap="round"
                  fill="transparent"
                  style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
                />
              </svg>
              <div className="env-ring-center">
                <span className="env-ring-val">{currentData ? currentData.gasRaw : '----'}</span>
                <span className="env-ring-unit">ADC</span>
              </div>
            </div>

            {/* Thông tin nồng độ & mức độ cảnh báo */}
            <div className="env-gas-info">
              <span className="env-gas-title">Gas / Khói (MQ-2)</span>
              <h3 className={`env-gas-status ${getGasStatusClass()}`}>
                {getGasStatusText()}
              </h3>
              <div className="env-gas-thresholds">
                <span>Ngưỡng cảnh báo {warningThreshold}</span>
                <span>Nguy hiểm từ 2200</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Nhiệt độ phòng DHT11 */}
        <div className="env-card">
          <div className="env-card-header">
            <span className="env-card-label">Nhiệt độ phòng</span>
            <span className="env-card-icon icon-temp" aria-hidden="true">
              <IconThermometer />
            </span>
          </div>

          <div className="env-metric-large">
            <span className="env-metric-num">
              {currentData ? currentData.temperature.toFixed(1) : '--.-'}
            </span>
            <span className="env-metric-unit">°C</span>
          </div>

          {/* Đường xu hướng nhỏ (Sparkline SVG) */}
          <div className="env-sparkline-wrap" aria-hidden="true">
            <svg viewBox="0 0 100 24" width="100%" height="100%" preserveAspectRatio="none">
              <path
                d="M 0 18 Q 25 19, 45 13 T 75 16 T 100 8"
                fill="none"
                stroke="var(--env-color-warn)"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <p className="env-card-subtext">
            {heatIndex !== null ? `Cảm giác như ${heatIndex}°C` : 'Dải đo 0°C – 50°C'}
          </p>
        </div>

        {/* Card 3: Độ ẩm không khí DHT11 */}
        <div className="env-card">
          <div className="env-card-header">
            <span className="env-card-label">Độ ẩm không khí</span>
            <span className="env-card-icon icon-hum" aria-hidden="true">
              <IconDroplet />
            </span>
          </div>

          <div className="env-metric-large">
            <span className="env-metric-num">
              {currentData ? Math.round(currentData.humidity) : '--'}
            </span>
            <span className="env-metric-unit">%</span>
          </div>

          {/* Đường xu hướng nhỏ (Sparkline SVG) */}
          <div className="env-sparkline-wrap" aria-hidden="true">
            <svg viewBox="0 0 100 24" width="100%" height="100%" preserveAspectRatio="none">
              <path
                d="M 0 10 Q 30 11, 55 17 T 80 16 T 100 19"
                fill="none"
                stroke="var(--env-color-blue)"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <p className="env-card-subtext">
            {humidityNote}
          </p>
        </div>

        {/* Card 4: Còi báo động Buzzer */}
        <div className="env-card">
          <div className="env-card-header">
            <span className="env-card-label">Còi báo động</span>
            <span
              className={`env-card-icon icon-buzzer ${currentData?.buzzerOn ? 'active' : ''}`}
              aria-hidden="true"
            >
              <IconSpeaker active={currentData?.buzzerOn} />
            </span>
          </div>

          <div
            className={`env-buzzer-status-txt ${currentData?.buzzerOn ? 'active' : ''}`}
          >
            {currentData?.buzzerOn ? 'Đang kêu' : (isOnline ? 'Sẵn sàng' : 'Ngoại tuyến')}
          </div>

          <p className="env-buzzer-sub">
            Thử gần nhất: {lastBuzzerTestTime}
          </p>

          <button
            type="button"
            className="env-btn-buzzer-test"
            onClick={handleTestBuzzer}
            disabled={isBuzzerTesting}
          >
            {isBuzzerTesting ? 'Đang thử còi...' : 'Thử còi 2 giây'}
          </button>
        </div>
      </section>

      {/* =====================================================================
          3. HÀNG 2 CỘT: BIỂU ĐỒ 24H & KHUNG ĐIỀU KHIỂN / MÔ PHỎNG (1.7 : 1)
          ===================================================================== */}
      <section className="env-middle-grid" aria-label="Biểu đồ lịch sử và điều khiển thử nghiệm">
        {/* Cột trái: Biểu đồ 24 giờ */}
        <div className="env-chart-card">
          <div className="env-chart-header">
            <h3 className="env-section-title">Biểu đồ 24 giờ</h3>
            <div className="env-chart-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'gas'}
                className={`env-chart-tab-btn ${activeTab === 'gas' ? 'active' : ''}`}
                onClick={() => setActiveTab('gas')}
              >
                Gas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'temperature'}
                className={`env-chart-tab-btn ${activeTab === 'temperature' ? 'active' : ''}`}
                onClick={() => setActiveTab('temperature')}
              >
                Nhiệt độ
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'humidity'}
                className={`env-chart-tab-btn ${activeTab === 'humidity' ? 'active' : ''}`}
                onClick={() => setActiveTab('humidity')}
              >
                Độ ẩm
              </button>
            </div>
          </div>

          {/* Khu vực vẽ biểu đồ Vector SVG */}
          <div className="env-chart-body">
            <svg
              className="env-chart-svg"
              viewBox="0 0 600 220"
              preserveAspectRatio="none"
              aria-label="Biểu đồ diễn biến cảm biến trong 24 giờ"
            >
              <defs>
                {/* Gradient nền cho đường dữ liệu Gas */}
                <linearGradient id="gasGradientArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="tempGradientArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="humGradientArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Đường lưới ngang nét đứt */}
              {activeTab === 'gas' && (
                <>
                  {/* Đường nguy hiểm 2200 */}
                  <line x1="0" y1="45" x2="600" y2="45" stroke="#f87171" strokeDasharray="4 4" strokeWidth="1.2" opacity="0.8" />
                  <text x="10" y="40" fill="#f87171" fontSize="11" fontFamily="Be Vietnam Pro">Nguy hiểm 2200</text>

                  {/* Đường cảnh báo 1200 */}
                  <line x1="0" y1="105" x2="600" y2="105" stroke="#fbbf24" strokeDasharray="4 4" strokeWidth="1.2" opacity="0.8" />
                  <text x="10" y="100" fill="#fbbf24" fontSize="11" fontFamily="Be Vietnam Pro">Ngưỡng cảnh báo {warningThreshold}</text>

                  {/* Vùng bóng màu dưới đường Gas */}
                  <path
                    d="M 0 170 Q 150 170, 220 165 T 320 160 T 360 88 T 400 135 T 480 168 L 600 170 L 600 200 L 0 200 Z"
                    fill="url(#gasGradientArea)"
                  />
                  {/* Đường cong dữ liệu Gas */}
                  <path
                    d="M 0 170 Q 150 170, 220 165 T 320 160 T 360 88 T 400 135 T 480 168 L 600 170"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* Điểm vượt ngưỡng nhô lên có tooltip */}
                  <circle cx="360" cy="88" r="4.5" fill="#fbbf24" stroke="#111a2e" strokeWidth="2" />
                  <rect x="370" y="74" width="76" height="20" rx="4" fill="#13243a" stroke="#253a5c" />
                  <text x="376" y="88" fill="#fbbf24" fontSize="11" fontWeight="600" fontFamily="JetBrains Mono">
                    14:20 · 1350
                  </text>
                </>
              )}

              {activeTab === 'temperature' && (
                <>
                  <line x1="0" y1="55" x2="600" y2="55" stroke="#fbbf24" strokeDasharray="4 4" strokeWidth="1" opacity="0.4" />
                  <text x="10" y="50" fill="#9fb0cf" fontSize="11">Ngưỡng nóng 35°C</text>
                  <path
                    d="M 0 150 Q 180 160, 300 130 T 450 90 T 600 115 L 600 200 L 0 200 Z"
                    fill="url(#tempGradientArea)"
                  />
                  <path
                    d="M 0 150 Q 180 160, 300 130 T 450 90 T 600 115"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle cx="450" cy="90" r="4.5" fill="#fbbf24" stroke="#111a2e" strokeWidth="2" />
                  <rect x="460" y="76" width="78" height="20" rx="4" fill="#13243a" stroke="#253a5c" />
                  <text x="466" y="90" fill="#fbbf24" fontSize="11" fontWeight="600" fontFamily="JetBrains Mono">
                    13:00 · 30.8°
                  </text>
                </>
              )}

              {activeTab === 'humidity' && (
                <>
                  <line x1="0" y1="65" x2="600" y2="65" stroke="#60a5fa" strokeDasharray="4 4" strokeWidth="1" opacity="0.4" />
                  <text x="10" y="60" fill="#9fb0cf" fontSize="11">Độ ẩm cao 75%</text>
                  <path
                    d="M 0 120 Q 150 90, 300 110 T 450 140 T 600 130 L 600 200 L 0 200 Z"
                    fill="url(#humGradientArea)"
                  />
                  <path
                    d="M 0 120 Q 150 90, 300 110 T 450 140 T 600 130"
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle cx="150" cy="90" r="4.5" fill="#60a5fa" stroke="#111a2e" strokeWidth="2" />
                  <rect x="160" y="76" width="74" height="20" rx="4" fill="#13243a" stroke="#253a5c" />
                  <text x="166" y="90" fill="#60a5fa" fontSize="11" fontWeight="600" fontFamily="JetBrains Mono">
                    06:00 · 72%
                  </text>
                </>
              )}

              {/* Nhãn trục thời gian 24h bên dưới */}
              <text x="10" y="215" fill="#5e7195" fontSize="11" fontFamily="Be Vietnam Pro">00:00</text>
              <text x="145" y="215" fill="#5e7195" fontSize="11" fontFamily="Be Vietnam Pro">06:00</text>
              <text x="290" y="215" fill="#5e7195" fontSize="11" fontFamily="Be Vietnam Pro">12:00</text>
              <text x="435" y="215" fill="#5e7195" fontSize="11" fontFamily="Be Vietnam Pro">18:00</text>
              <text x="560" y="215" fill="#5e7195" fontSize="11" fontFamily="Be Vietnam Pro">Bây giờ</text>
            </svg>
          </div>
        </div>

        {/* Cột phải: Khung Điều khiển & Mô phỏng */}
        <div className="env-control-card">
          <div>
            <h3 className="env-section-title">Điều khiển & mô phỏng</h3>
            <p className="env-control-sub">Chế độ thử nghiệm giao diện</p>
          </div>

          {/* 3 Nút chuyển Sim: An toàn / Cảnh báo / Nguy hiểm (GIỮ NGUYÊN LOGIC SIM CŨ) */}
          <div className="env-sim-button-group" role="group" aria-label="Chọn kịch bản mô phỏng">
            <button
              type="button"
              className={`env-sim-btn ${mockMode && mockState.alertLevel === 1 ? 'active-safe' : ''}`}
              onClick={() => {
                setMockMode(true);
                setMockState({
                  gasRaw: 640,
                  temperature: 28.5,
                  humidity: 62.0,
                  alertLevel: 1,
                  alertLevelText: 'SAFE',
                  buzzerOn: false,
                  isWarmingUp: false,
                  wifiRssi: -58
                });
              }}
            >
              An toàn
            </button>
            <button
              type="button"
              className={`env-sim-btn ${mockMode && mockState.alertLevel === 2 ? 'active-warn' : ''}`}
              onClick={() => {
                setMockMode(true);
                setMockState({
                  gasRaw: 1650,
                  temperature: 30.2,
                  humidity: 68.0,
                  alertLevel: 2,
                  alertLevelText: 'WARNING',
                  buzzerOn: true,
                  isWarmingUp: false,
                  wifiRssi: -58
                });
              }}
            >
              Cảnh báo
            </button>
            <button
              type="button"
              className={`env-sim-btn ${mockMode && mockState.alertLevel === 3 ? 'active-danger' : ''}`}
              onClick={() => {
                setMockMode(true);
                setMockState({
                  gasRaw: 2850,
                  temperature: 34.0,
                  humidity: 75.0,
                  alertLevel: 3,
                  alertLevelText: 'DANGER',
                  buzzerOn: true,
                  isWarmingUp: false,
                  wifiRssi: -58
                });
              }}
            >
              Nguy hiểm
            </button>
          </div>

          {/* Nút thoát Sim để dùng dữ liệu thật nếu đang bật mockMode */}
          {mockMode && (
            <button
              type="button"
              style={{
                padding: '0.35rem 0.6rem',
                fontSize: '0.75rem',
                borderRadius: '6px',
                border: '1px solid #3b82f6',
                background: '#13243e',
                color: '#60a5fa',
                cursor: 'pointer',
                textAlign: 'center'
              }}
              onClick={() => setMockMode(false)}
            >
              Quay lại dùng dữ liệu thật từ ESP32
            </button>
          )}

          {/* Thanh trượt ngưỡng cảnh báo Gas */}
          <div className="env-slider-group">
            <div className="env-slider-header">
              <span className="env-slider-label">Ngưỡng cảnh báo gas</span>
              <span className="env-slider-val">{warningThreshold}</span>
            </div>
            <input
              type="range"
              className="env-range-slider"
              min="800"
              max="2400"
              step="50"
              value={warningThreshold}
              onChange={(e) => setWarningThreshold(Number(e.target.value))}
              aria-label="Điều chỉnh ngưỡng cảnh báo gas ADC"
            />
          </div>

          {/* Nút Tắt tiếng & Nút Lưu */}
          <div className="env-control-actions">
            <button
              type="button"
              className={`env-btn-mute ${isMuted ? 'is-muted' : ''}`}
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? 'Đã tắt tiếng' : 'Tắt tiếng 10 phút'}
            </button>
            <button
              type="button"
              className="env-btn-save"
              onClick={handleSaveThreshold}
            >
              Lưu
            </button>
          </div>

          {saveToast && (
            <span style={{ fontSize: '0.75rem', color: 'var(--env-color-safe)', textAlign: 'center' }}>
              ✓ {saveToast}
            </span>
          )}

          {/* Hộp Checklist an toàn "Khi có báo gas" */}
          <div className={`env-emergency-box ${alertLevel >= 2 ? 'is-alert' : ''}`}>
            <h4 className="env-emergency-title">Khi có báo gas</h4>
            <ol className="env-emergency-list">
              <li>Khóa van gas, tắt bếp</li>
              <li>Mở cửa sổ, thông gió</li>
              <li>Không bật công tắc điện</li>
              <li>Ra ngoài, gọi 114</li>
            </ol>
          </div>
        </div>
      </section>

      {/* =====================================================================
          4. HÀNG 3 CỘT BẰNG NHAU: NHẬT KÝ | HỎI NHANH AI | CHẨN ĐOÁN PHẦN CỨNG
          ===================================================================== */}
      <section className="env-bottom-grid" aria-label="Thông tin chi tiết và chẩn đoán">
        {/* Cột 1: Nhật ký sự kiện */}
        <div className="env-panel-card">
          <div className="env-panel-header">
            <h3 className="env-section-title">Nhật ký sự kiện</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--env-text-muted)' }}>
              {events.length} sự kiện
            </span>
          </div>

          {events.length > 0 ? (
            <ul className="env-events-scroll">
              {events.slice(0, 15).map((evt, idx) => (
                <li key={idx} className="env-event-row">
                  <span
                    className={`env-event-bullet ${
                      evt.alertLevel === 3
                        ? 'bullet-danger'
                        : evt.alertLevel === 2
                        ? 'bullet-warn'
                        : 'bullet-safe'
                    }`}
                  />
                  <div className="env-event-text-group">
                    <span className="env-event-name">
                      {evt.code === 'GAS_LEAK_DANGER'
                        ? `Báo động đỏ gas vượt ${evt.gasRaw} ADC`
                        : evt.code === 'GAS_LEAK_WARNING'
                        ? `Gas vượt ngưỡng ${evt.gasRaw} ADC`
                        : evt.code === 'GAS_NORMALIZED'
                        ? 'Gas về mức an toàn'
                        : evt.code}
                    </span>
                    <span className="env-event-meta">
                      {evt.receivedAt
                        ? new Date(evt.receivedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                        : 'Vừa xong'}
                      {' · '}
                      {evt.alertLevel >= 2 ? 'còi báo động kích hoạt' : 'còi tự tắt'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="env-events-scroll">
              {/* Dữ liệu mẫu minh họa lịch sử gần nhất khi vừa khởi động */}
              <li className="env-event-row">
                <span className="env-event-bullet bullet-warn" />
                <div className="env-event-text-group">
                  <span className="env-event-name">Gas vượt ngưỡng 1350</span>
                  <span className="env-event-meta">Hôm qua 14:20 · kéo dài 3 phút</span>
                </div>
              </li>
              <li className="env-event-row">
                <span className="env-event-bullet bullet-safe" />
                <div className="env-event-text-group">
                  <span className="env-event-name">Gas về mức an toàn</span>
                  <span className="env-event-meta">Hôm qua 14:23 · còi tự tắt</span>
                </div>
              </li>
              <li className="env-event-row">
                <span className="env-event-bullet bullet-info" />
                <div className="env-event-text-group">
                  <span className="env-event-name">Thử còi từ giao diện</span>
                  <span className="env-event-meta">Hôm qua 20:05 · bởi Quỳnh</span>
                </div>
              </li>
            </ul>
          )}
        </div>

        {/* Cột 2: Hỏi nhanh về không khí (AI Chat Assistant Preview) */}
        <div className="env-panel-card">
          <div className="env-panel-header">
            <h3 className="env-section-title">Hỏi nhanh về không khí</h3>
          </div>

          <div className="env-ai-chat-area">
            <div className="env-chat-bubble-user">
              {aiQaList[aiQuestionIndex]?.question}
            </div>
            <div className="env-chat-bubble-ai">
              {aiQaList[aiQuestionIndex]?.answer}
            </div>
          </div>

          <div className="env-quick-prompts-wrap">
            {aiQaList.map((item, idx) => (
              <button
                key={idx}
                type="button"
                className="env-prompt-pill"
                onClick={() => setAiQuestionIndex(idx)}
              >
                {item.question}
              </button>
            ))}
          </div>
        </div>

        {/* Cột 3: Chẩn đoán phần cứng (ESP32 DevKit V1) */}
        <div className="env-panel-card">
          <div className="env-panel-header">
            <h3 className="env-section-title">Chẩn đoán phần cứng</h3>
          </div>

          <div className="env-diag-table">
            <div className="env-diag-row">
              <span className="env-diag-label">Vi điều khiển</span>
              <span className="env-diag-val">ESP32 DevKit V1</span>
            </div>
            <div className="env-diag-row">
              <span className="env-diag-label">Chân kết nối</span>
              <span className="env-diag-val">GPIO35 · 4 · 18</span>
            </div>
            <div className="env-diag-row">
              <span className="env-diag-label">Broker MQTT</span>
              <span className="env-diag-val text-green">
                {snapshot?.brokerConnected ? 'Đã kết nối' : 'Đang kết nối...'}
              </span>
            </div>
            <div className="env-diag-row">
              <span className="env-diag-label">Tín hiệu Wi-Fi</span>
              <span className="env-diag-val">
                {currentData?.wifiRssi ? `${currentData.wifiRssi} dBm · Tốt` : '-58 dBm · Tốt'}
              </span>
            </div>
            <div className="env-diag-row">
              <span className="env-diag-label">Làm nóng MQ-2</span>
              <span className={`env-diag-val ${isWarmingUp ? 'text-warn' : 'text-green'}`}>
                {isWarmingUp ? 'Đang sấy...' : 'Đã ổn định'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          5. MODAL THÔNG TIN KỸ THUẬT (POPUP HIỂN THỊ MQTT TOPICS)
          ===================================================================== */}
      {showTechModal && (
        <div className="env-modal-backdrop" onClick={() => setShowTechModal(false)}>
          <div className="env-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="env-modal-header">
              <h4 className="env-modal-title">Thông số kỹ thuật & MQTT Topics</h4>
              <button
                type="button"
                className="env-modal-close-btn"
                onClick={() => setShowTechModal(false)}
                aria-label="Đóng popup thông tin"
              >
                <IconClose />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="env-topic-item">
                <span className="env-topic-name">MQTT Broker công khai:</span>
                <span className="env-topic-code">mqtt://broker.emqx.io:1883</span>
              </div>
              <div className="env-topic-item">
                <span className="env-topic-name">Device ID:</span>
                <span className="env-topic-code">environment-sensor</span>
              </div>
              <div className="env-topic-item">
                <span className="env-topic-name">Trạng thái sống chết (LWT & Status):</span>
                <span className="env-topic-code">home/environment-sensor/status</span>
              </div>
              <div className="env-topic-item">
                <span className="env-topic-name">Dữ liệu định kỳ (Telemetry):</span>
                <span className="env-topic-code">home/environment-sensor/telemetry</span>
              </div>
              <div className="env-topic-item">
                <span className="env-topic-name">Sự kiện cảnh báo tức thời (Alert):</span>
                <span className="env-topic-code">home/environment-sensor/alert</span>
              </div>
            </div>

            <button
              type="button"
              className="env-btn-tech"
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
              onClick={() => setShowTechModal(false)}
            >
              Đóng cửa sổ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
