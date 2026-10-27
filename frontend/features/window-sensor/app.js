/**
 * Window Sensor Real-time IoT Local Dashboard
 * Protocol: WebSocket (Direct ESP32 AsyncWebSocket or local broker bridge)
 */

// Application State
const state = {
  isOpen: false,
  openedAt: null,
  battery: 100,
  rssi: -60,
  uptimeSec: 0,
  ws: null,
  wsConnected: false,
  alarmActive: false,
  alarmReason: null,
  currentFilter: 'all',
  events: []
};

// DOM Elements
const dom = {
  connPill: document.getElementById('connPill'),
  connDot: document.getElementById('connDot'),
  connText: document.getElementById('connText'),
  windowFrame: document.getElementById('windowFrame'),
  windowStatePill: document.getElementById('windowStatePill'),
  stateIcon: document.getElementById('stateIcon'),
  stateText: document.getElementById('stateText'),
  badgeLastUpdate: document.getElementById('badgeLastUpdate'),
  openDurationContainer: document.getElementById('openDurationContainer'),
  openDurationText: document.getElementById('openDurationText'),
  metricBattery: document.getElementById('metricBattery'),
  metricRssi: document.getElementById('metricRssi'),
  metricUptime: document.getElementById('metricUptime'),
  timelineContainer: document.getElementById('timelineContainer'),
  emptyTimeline: document.getElementById('emptyTimeline'),
  countAll: document.getElementById('countAll'),
  countState: document.getElementById('countState'),
  countAlert: document.getElementById('countAlert'),
  alertBanner: document.getElementById('alertBanner'),
  alertTitle: document.getElementById('alertTitle'),
  alertMessage: document.getElementById('alertMessage'),
  alertDismissBtn: document.getElementById('alertDismissBtn'),
  simulatorPanel: document.getElementById('simulatorPanel'),
  simToggleBtn: document.getElementById('simToggleBtn'),
  simCloseBtn: document.getElementById('simCloseBtn'),
  simOpenBtn: document.getElementById('simOpenBtn'),
  simCloseBtnAction: document.getElementById('simCloseBtnAction'),
  simTamperBtn: document.getElementById('simTamperBtn'),
  simVibrateBtn: document.getElementById('simVibrateBtn'),
  simTimeoutBtn: document.getElementById('simTimeoutBtn'),
  wsHostInput: document.getElementById('wsHostInput'),
  wsConnectBtn: document.getElementById('wsConnectBtn'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  filterBtns: document.querySelectorAll('.filter-btn')
};

// Format seconds into HH:MM:SS
function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Format timestamp
function formatTime(date) {
  return date.toTimeString().split(' ')[0];
}

// Timer for open duration and uptime
setInterval(() => {
  if (state.isOpen && state.openedAt) {
    const elapsed = Math.floor((Date.now() - state.openedAt) / 1000);
    dom.openDurationText.textContent = formatDuration(elapsed);
  }
  if (state.wsConnected) {
    state.uptimeSec += 1;
    const hrs = Math.floor(state.uptimeSec / 3600);
    const mins = Math.floor((state.uptimeSec % 3600) / 60);
    dom.metricUptime.textContent = `${hrs}h ${mins}m`;
  }
}, 1000);

// Update Visual UI based on State
function updateWindowState(isOpen, details = {}) {
  const previousState = state.isOpen;
  state.isOpen = isOpen;

  if (isOpen) {
    dom.windowFrame.classList.add('is-open');
    dom.windowStatePill.className = 'state-pill open';
    dom.stateIcon.textContent = '🔓';
    dom.stateText.textContent = 'CỬA ĐANG MỞ';
    dom.openDurationContainer.style.display = 'block';

    if (!previousState) {
      state.openedAt = Date.now();
      addLogEvent({
        type: 'state',
        title: 'Cửa sổ đã mở',
        desc: details.desc || 'Phát hiện tiếp điểm nam châm tách rời',
        icon: '🔓',
        badgeClass: 'badge-open'
      });
    }
  } else {
    dom.windowFrame.classList.remove('is-open');
    dom.windowStatePill.className = 'state-pill closed';
    dom.stateIcon.textContent = '🔒';
    dom.stateText.textContent = 'CỬA ĐANG ĐÓNG';
    dom.openDurationContainer.style.display = 'none';

    if (previousState) {
      const openDurationSec = state.openedAt ? Math.floor((Date.now() - state.openedAt) / 1000) : 0;
      addLogEvent({
        type: 'state',
        title: 'Cửa sổ đã đóng',
        desc: `Thời gian mở trước đó: ${formatDuration(openDurationSec)}`,
        icon: '🔒',
        badgeClass: 'badge-close'
      });
      state.openedAt = null;
    }
  }

  dom.badgeLastUpdate.textContent = formatTime(new Date());
}

// Trigger Alert
function triggerAlert(title, message, alertType = 'alert') {
  dom.alertTitle.textContent = title;
  dom.alertMessage.textContent = message;
  dom.alertBanner.style.display = 'flex';

  addLogEvent({
    type: 'alert',
    title: title,
    desc: message,
    icon: '⚠️',
    badgeClass: 'badge-alert'
  });
}

// Add event to timeline log
function addLogEvent(item) {
  const timestamp = new Date();
  const eventObj = {
    id: Date.now() + Math.random(),
    time: formatTime(timestamp),
    ...item
  };

  state.events.unshift(eventObj);
  renderTimeline();
}

// Render Timeline with Filters
function renderTimeline() {
  const filtered = state.events.filter(ev => {
    if (state.currentFilter === 'all') return true;
    return ev.type === state.currentFilter;
  });

  // Update counts
  dom.countAll.textContent = state.events.length;
  dom.countState.textContent = state.events.filter(e => e.type === 'state').length;
  dom.countAlert.textContent = state.events.filter(e => e.type === 'alert').length;

  if (filtered.length === 0) {
    dom.timelineContainer.innerHTML = '';
    dom.timelineContainer.appendChild(dom.emptyTimeline);
    dom.emptyTimeline.style.display = 'flex';
    return;
  }

  dom.emptyTimeline.style.display = 'none';
  dom.timelineContainer.innerHTML = filtered.map(ev => `
    <div class="timeline-item">
      <div class="item-left">
        <div class="item-badge ${ev.badgeClass}">${ev.icon}</div>
        <div>
          <div class="item-title">${ev.title}</div>
          <div class="item-desc">${ev.desc}</div>
        </div>
      </div>
      <div class="item-time">${ev.time}</div>
    </div>
  `).join('');
}

// Filter Tabs Handling
dom.filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    dom.filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentFilter = btn.dataset.filter;
    renderTimeline();
  });
});

// Dismiss alert
dom.alertDismissBtn.addEventListener('click', () => {
  dom.alertBanner.style.display = 'none';
});

// Clear log
dom.clearLogBtn.addEventListener('click', () => {
  state.events = [];
  renderTimeline();
});

// WebSocket Connection Logic (Local ESP32 Web Server)
function connectWebSocket(url) {
  if (state.ws) {
    state.ws.close();
  }

  dom.connDot.className = 'status-dot pulse';
  dom.connText.textContent = 'Đang kết nối: ' + url;

  try {
    const socket = new WebSocket(url);
    state.ws = socket;

    socket.onopen = () => {
      if (state.ws !== socket) return;
      state.wsConnected = true;
      dom.connDot.className = 'status-dot connected';
      dom.connText.textContent = 'Đã kết nối ESP32 (' + url + ')';

      // Request initial status from ESP
      socket.send(JSON.stringify({ cmd: "getStatus" }));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleIncomingIoTData(data);
      } catch (err) {
        console.warn('Dữ liệu thô không phải JSON:', event.data);
      }
    };

    socket.onclose = () => {
      if (state.ws !== socket) return;
      state.wsConnected = false;
      dom.connDot.className = 'status-dot disconnected';
      dom.connText.textContent = 'Mất kết nối ESP32 (' + url + ')';
    };

    socket.onerror = () => {
      if (state.ws !== socket) return;
      state.wsConnected = false;
      dom.connDot.className = 'status-dot disconnected';
      dom.connText.textContent = 'Lỗi kết nối WebSocket (' + url + ')';
    };
  } catch (e) {
    dom.connDot.className = 'status-dot disconnected';
    dom.connText.textContent = 'Địa chỉ WebSocket không hợp lệ';
  }
}

// Parse Incoming Payload from ESP32 / IoT device
function handleIncomingIoTData(data) {
  // 1. Trạng thái đóng/mở cửa sổ (MC-38)
  if (data.state !== undefined) {
    const isOpen = (data.state === 'open' || data.state === 1 || data.state === true);
    updateWindowState(isOpen, { desc: data.message || 'Dữ liệu nhận từ cảm biến MC-38' });
  }

  // 2. Cảm biến chuyển động PIR
  if (data.motion !== undefined) {
    const metricMotion = document.getElementById('metricMotion');
    if (metricMotion) {
      metricMotion.textContent = data.motion ? 'PHÁT HIỆN' : 'Không có';
      metricMotion.style.color = data.motion ? 'var(--accent-amber)' : '#fff';
    }
  }

  // 3. Đèn & Rơ-le Relay
  if (data.relay !== undefined) {
    const metricRelay = document.getElementById('metricRelay');
    if (metricRelay) {
      metricRelay.textContent = data.relay;
      metricRelay.style.color = (data.relay === 'ON') ? 'var(--accent-emerald)' : '#fff';
    }
  }

  // 4. Cảnh báo Báo động (Alarm & Còi Buzzer)
  if (data.alarm === true || data.alert) {
    let title = '🚨 CẢNH BÁO AN NINH';
    let msg = data.message || 'Hệ thống kích hoạt còi cảnh báo!';
    if (data.alarmReason === 'INTRUSION_PIR') {
      title = '🚨 PHÁT HIỆN ĐỘT NHẬP (PIR)';
      msg = 'Cửa đang mở và phát hiện có người di chuyển qua cảm biến PIR!';
    } else if (data.alarmReason === 'DOOR_LEFT_OPEN') {
      title = '⏳ CỬA MỞ QUÁ THỜI GIAN QUI ĐỊNH';
      msg = 'Cửa đã mở liên tục vượt quá 10 giây!';
    }
    if (!state.alarmActive || data.alarmReason !== state.alarmReason) {
      triggerAlert(title, msg);
    }
    state.alarmActive = true;
    state.alarmReason = data.alarmReason || null;
  } else if (data.alarm === false) {
    state.alarmActive = false;
    state.alarmReason = null;
    dom.alertBanner.style.display = 'none';
  }

  // 5. Cường độ sóng Wi-Fi RSSI
  if (data.rssi !== undefined) {
    state.rssi = data.rssi;
    dom.metricRssi.textContent = `${data.rssi} dBm`;
  }

  if (data.uptime !== undefined) {
    state.uptimeSec = Number(data.uptime);
    const hrs = Math.floor(state.uptimeSec / 3600);
    const mins = Math.floor((state.uptimeSec % 3600) / 60);
    dom.metricUptime.textContent = `${hrs}h ${mins}m`;
  }
}

// Simulator Panel Toggle
dom.simToggleBtn.addEventListener('click', () => {
  dom.simulatorPanel.classList.toggle('active');
});

dom.simCloseBtn.addEventListener('click', () => {
  dom.simulatorPanel.classList.remove('active');
});

// Simulator Action Triggers
dom.simOpenBtn.addEventListener('click', () => {
  updateWindowState(true, { desc: 'Mô phỏng mở cửa qua bảng điều khiển' });
});

dom.simCloseBtnAction.addEventListener('click', () => {
  updateWindowState(false, { desc: 'Mô phỏng đóng cửa qua bảng điều khiển' });
});

dom.simTamperBtn.addEventListener('click', () => {
  triggerAlert('🚨 CẢNH BÁO: BỊ CẠY THÁO (TAMPER)', 'Công tắc chống tháo gỡ vỏ thiết bị bị kích hoạt!');
});

dom.simVibrateBtn.addEventListener('click', () => {
  triggerAlert('📳 PHÁT HIỆN RUNG CHẤN', 'Cảm biến gia tốc/rung ghi nhận va đập mạnh lên khung cửa sổ!');
});

dom.simTimeoutBtn.addEventListener('click', () => {
  triggerAlert('⏳ CỬA MỞ QUÁ LÂU', 'Cửa sổ đã mở liên tục vượt quá 10 phút, nguy cơ mất an toàn hoặc mưa tạt!');
});

dom.wsConnectBtn.addEventListener('click', () => {
  const url = dom.wsHostInput.value.trim();
  if (!url) return;
  localStorage.setItem('esp_ws_url', url);
  connectWebSocket(url);
});

// Initial boot logic
window.addEventListener('DOMContentLoaded', () => {
  // Check if saved previously in localStorage
  const savedWsUrl = localStorage.getItem('esp_ws_url');
  const defaultWsUrl = savedWsUrl || '';

  dom.wsHostInput.value = defaultWsUrl;
  if (defaultWsUrl) {
    connectWebSocket(defaultWsUrl);
  } else {
    dom.connDot.className = 'status-dot disconnected';
    dom.connText.textContent = 'Nhập địa chỉ WebSocket của ESP32';
  }
});
