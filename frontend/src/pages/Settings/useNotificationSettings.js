import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { isPreviewMode } from '../../services/authService.js';
import {
  getSettingsService,
  updateNotificationsService,
  DEFAULT_NOTIFICATIONS
} from '../../services/settingsService.js';

export const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * Kiểm tra chuỗi định dạng giờ 24h: HH:mm từ 00:00 đến 23:59
 */
export function isValidTimeFormat(val) {
  return typeof val === 'string' && TIME_REGEX.test(val);
}

/**
 * Tạo bản sao sâu an toàn của cấu trúc notifications
 */
export function cloneNotifications(notif) {
  if (!notif) return null;
  return {
    types: {
      unusualAccess: Boolean(notif.types?.unusualAccess),
      deviceDisconnected: Boolean(notif.types?.deviceDisconnected),
      permissionChanges: Boolean(notif.types?.permissionChanges),
      monthlyReport: Boolean(notif.types?.monthlyReport)
    },
    minSeverity: ['urgent', 'warning', 'all'].includes(notif.minSeverity) ? notif.minSeverity : 'warning',
    quietHours: {
      enabled: Boolean(notif.quietHours?.enabled),
      startTime: isValidTimeFormat(notif.quietHours?.startTime) ? notif.quietHours.startTime : '22:00',
      endTime: isValidTimeFormat(notif.quietHours?.endTime) ? notif.quietHours.endTime : '07:00',
      allowUrgentBypass: true
    },
    channels: {
      inAppWeb: Boolean(notif.channels?.inAppWeb),
      email: false
    }
  };
}

/**
 * Kiểm tra hợp đồng phản hồi notifications từ backend
 */
export function isValidNotificationsContract(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;

  // Types
  if (!data.types || typeof data.types !== 'object' || Array.isArray(data.types)) return false;
  if (typeof data.types.unusualAccess !== 'boolean') return false;
  if (typeof data.types.deviceDisconnected !== 'boolean') return false;
  if (typeof data.types.permissionChanges !== 'boolean') return false;
  if (typeof data.types.monthlyReport !== 'boolean') return false;

  // minSeverity
  if (!['urgent', 'warning', 'all'].includes(data.minSeverity)) return false;

  // quietHours
  if (!data.quietHours || typeof data.quietHours !== 'object' || Array.isArray(data.quietHours)) return false;
  if (typeof data.quietHours.enabled !== 'boolean') return false;
  if (typeof data.quietHours.startTime !== 'string' || !isValidTimeFormat(data.quietHours.startTime)) return false;
  if (typeof data.quietHours.endTime !== 'string' || !isValidTimeFormat(data.quietHours.endTime)) return false;
  if (data.quietHours.allowUrgentBypass !== true) return false;

  // channels: email bắt buộc phải là false trong giai đoạn này (chưa hỗ trợ gửi email)
  if (!data.channels || typeof data.channels !== 'object' || Array.isArray(data.channels)) return false;
  if (typeof data.channels.inAppWeb !== 'boolean') return false;
  if (data.channels.email !== false) return false;

  return true;
}

/**
 * Kiểm tra xác thực các lá trong snapshot đã gửi có khớp chính xác với response server hay không
 */
export function verifyInFlightLeaves(serverNotif, inFlightChanges) {
  if (!serverNotif || !inFlightChanges) return true;
  for (const [path, expectedVal] of Object.entries(inFlightChanges)) {
    const parts = path.split('.');
    let actualVal = serverNotif;
    for (const part of parts) {
      if (actualVal === null || actualVal === undefined) return false;
      actualVal = actualVal[part];
    }
    if (actualVal !== expectedVal) {
      return false;
    }
  }
  return true;
}

/**
 * So sánh và tính toán các lá khác biệt giữa hai bản ghi notifications
 */
export function computeLeafDiffs(source, target) {
  if (!source || !target) return {};
  const diffs = {};
  if (source.types.unusualAccess !== target.types?.unusualAccess) {
    diffs['types.unusualAccess'] = source.types.unusualAccess;
  }
  if (source.types.deviceDisconnected !== target.types?.deviceDisconnected) {
    diffs['types.deviceDisconnected'] = source.types.deviceDisconnected;
  }
  if (source.types.permissionChanges !== target.types?.permissionChanges) {
    diffs['types.permissionChanges'] = source.types.permissionChanges;
  }
  if (source.types.monthlyReport !== target.types?.monthlyReport) {
    diffs['types.monthlyReport'] = source.types.monthlyReport;
  }
  if (source.minSeverity !== target.minSeverity) {
    diffs['minSeverity'] = source.minSeverity;
  }
  if (source.quietHours.enabled !== target.quietHours?.enabled) {
    diffs['quietHours.enabled'] = source.quietHours.enabled;
  }
  if (source.quietHours.startTime !== target.quietHours?.startTime) {
    diffs['quietHours.startTime'] = source.quietHours.startTime;
  }
  if (source.quietHours.endTime !== target.quietHours?.endTime) {
    diffs['quietHours.endTime'] = source.quietHours.endTime;
  }
  if (source.channels.inAppWeb !== target.channels?.inAppWeb) {
    diffs['channels.inAppWeb'] = source.channels.inAppWeb;
  }
  return diffs;
}

/**
 * Xây dựng delta payload lồng nhau từ tập hợp các thay đổi lá
 */
export function buildDeltaPayload(leafChanges) {
  const payload = {};
  for (const [path, val] of Object.entries(leafChanges)) {
    const parts = path.split('.');
    if (parts.length === 1) {
      payload[parts[0]] = val;
    } else if (parts.length === 2) {
      payload[parts[0]] = payload[parts[0]] || {};
      payload[parts[0]][parts[1]] = val;
    }
  }
  return payload;
}

/**
 * So sánh xem draft và persisted có hoàn toàn đồng nhất hay không
 */
export function areNotificationsEqual(a, b) {
  if (!a || !b) return false;
  if (a.types.unusualAccess !== b.types.unusualAccess) return false;
  if (a.types.deviceDisconnected !== b.types.deviceDisconnected) return false;
  if (a.types.permissionChanges !== b.types.permissionChanges) return false;
  if (a.types.monthlyReport !== b.types.monthlyReport) return false;
  if (a.minSeverity !== b.minSeverity) return false;
  if (a.quietHours.enabled !== b.quietHours.enabled) return false;
  if (a.quietHours.startTime !== b.quietHours.startTime) return false;
  if (a.quietHours.endTime !== b.quietHours.endTime) return false;
  if (a.channels.inAppWeb !== b.channels.inAppWeb) return false;
  if (a.channels.email !== b.channels.email) return false;
  return true;
}

/**
 * Phân loại kết quả lưu máy chủ chưa xác định:
 * - Lỗi mạng / timeout / status 0
 * - Lỗi máy chủ HTTP 500+
 * - Phản hồi hỏng (INVALID_RESPONSE)
 * - HTTP thành công nhưng thiếu data.notifications
 * - HTTP thành công nhưng notifications vi phạm hợp đồng schema/khóa nghiệp vụ
 * - HTTP thành công nhưng không xác nhận đúng các lá đã gửi (verifyInFlightLeaves false)
 */
export function isUncertainServerResult(res, inFlightChanges = null) {
  if (!res) return true;
  // 1. Lỗi mạng hoặc timeout từ apiRequest (status = 0, isNetworkError, code TIMEOUT/NETWORK_ERROR)
  if (res.isNetworkError || res.status === 0 || res.code === 'TIMEOUT' || res.code === 'NETWORK_ERROR') {
    return true;
  }
  // 2. Lỗi máy chủ 500+ (không thể biết DB đã commit trước khi server gặp sự cố hay chưa)
  if (typeof res.status === 'number' && res.status >= 500) {
    return true;
  }
  // 3. Response không đúng định dạng JSON hoặc code lỗi mạng/server
  if (res.code === 'INVALID_RESPONSE' || res.code === 'INTERNAL_SERVER_ERROR') {
    return true;
  }
  // 4. Nếu là lỗi validation 4xx rõ ràng được backend từ chối trước khi ghi -> không phải uncertain
  if (!res.success && typeof res.status === 'number' && res.status >= 400 && res.status < 500 && res.status !== 401) {
    return false;
  }
  // 5. Nếu không có data.notifications hoặc schema không hợp lệ
  if (!res.data?.notifications || !isValidNotificationsContract(res.data.notifications)) {
    return true;
  }
  // 6. Nếu có inFlightChanges và các lá trong response không khớp
  if (inFlightChanges && !verifyInFlightLeaves(res.data.notifications, inFlightChanges)) {
    return true;
  }
  return false;
}

export function useNotificationSettings() {
  const { currentUser, handleUnauthorized } = useAuthContext();
  const currentUserId = currentUser?.id;
  const isPreview = isPreviewMode();

  // State quản lý dữ liệu
  const [persisted, setPersisted] = useState(() => cloneNotifications(DEFAULT_NOTIFICATIONS));
  const [draft, setDraft] = useState(() => cloneNotifications(DEFAULT_NOTIFICATIONS));
  const [timeInputs, setTimeInputs] = useState({
    startTime: DEFAULT_NOTIFICATIONS.quietHours.startTime,
    endTime: DEFAULT_NOTIFICATIONS.quietHours.endTime
  });
  const [timeErrors, setTimeErrors] = useState({});

  // Trạng thái tải & lưu
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadStatus, setLoadStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [loadError, setLoadError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = useState(null);

  // Refs điều khiển hàng đợi tuần tự và cách ly tài khoản
  const isMountedRef = useRef(true);
  const accountEpochRef = useRef(0);
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  const fetchSeqRef = useRef(0);
  const lastAppliedFetchSeqRef = useRef(0);
  const mutationSeqRef = useRef(0);

  const pendingChangesRef = useRef({});
  const inFlightChangesRef = useRef(null);
  const isSavingRef = useRef(false);

  // Cờ ghi nhận trạng thái máy chủ bất định do lỗi timeout/mạng/500/response hỏng
  const hasUncertainServerStateRef = useRef(false);

  const persistedRef = useRef(persisted);
  persistedRef.current = persisted;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const saveStatusRef = useRef(saveStatus);
  saveStatusRef.current = saveStatus;
  const timeErrorsRef = useRef(timeErrors);
  timeErrorsRef.current = timeErrors;

  // Refs nối hai hàm processQueue và reconcileWithServer tránh chu kỳ phụ thuộc
  const processQueueRef = useRef(null);
  const reconcileWithServerRef = useRef(null);

  // Hàm đối chiếu lại dữ liệu từ server khi kết quả lưu trước đó bị bất định
  const reconcileWithServer = useCallback(async () => {
    if (isSavingRef.current || !isMountedRef.current) return;

    const currentEpoch = accountEpochRef.current;
    const reqUserId = currentUserIdRef.current;

    isSavingRef.current = true;
    setIsSaving(true);
    setSaveStatus('saving');
    saveStatusRef.current = 'saving';
    setSaveError(null);

    try {
      const res = await getSettingsService();

      // Guard 1: Epoch / UserId check
      if (!isMountedRef.current || accountEpochRef.current !== currentEpoch || currentUserIdRef.current !== reqUserId) {
        return;
      }

      // Guard 2: 401 Unauthorized
      if (res.status === 401) {
        isSavingRef.current = false;
        setIsSaving(false);
        setLoadStatus('error');
        setLoadError('UNAUTHORIZED');
        setSaveStatus('error');
        saveStatusRef.current = 'error';
        setSaveError('UNAUTHORIZED');
        if (typeof handleUnauthorized === 'function') {
          handleUnauthorized(reqUserId);
        }
        return;
      }

      // Guard 3: GET failed or invalid contract
      if (!res.success || !res.data?.notifications || !isValidNotificationsContract(res.data.notifications)) {
        isSavingRef.current = false;
        setIsSaving(false);
        setSaveStatus('error');
        saveStatusRef.current = 'error';
        const errCode = (res.code && res.code !== 'OK')
          ? res.code
          : (res.isNetworkError ? (res.code || 'NETWORK_ERROR') : 'LOAD_SETTINGS_FAILED');
        setSaveError(errCode);
        return;
      }

      // GET Succeeded: server state is now confirmed
      const serverNotif = cloneNotifications(res.data.notifications);
      hasUncertainServerStateRef.current = false;
      persistedRef.current = serverNotif;
      setPersisted(serverNotif);

      // Tính delta từ draft mới nhất so với server (KHÔNG ghi đè draft)
      const diffs = computeLeafDiffs(draftRef.current, serverNotif);
      pendingChangesRef.current = diffs;
      inFlightChangesRef.current = null;

      isSavingRef.current = false;
      setIsSaving(false);

      if (Object.keys(diffs).length > 0) {
        // Có khác biệt: gửi PATCH với đúng delta cần thiết
        if (typeof processQueueRef.current === 'function') {
          processQueueRef.current();
        }
      } else {
        // Không còn khác biệt: kết thúc trạng thái bất định và báo saved nếu đủ điều kiện
        if (Object.keys(timeErrorsRef.current).length === 0) {
          setSaveStatus('saved');
          saveStatusRef.current = 'saved';
          setSaveError(null);
        } else {
          setSaveStatus('idle');
          saveStatusRef.current = 'idle';
        }
      }
    } catch (err) {
      if (!isMountedRef.current || accountEpochRef.current !== currentEpoch || currentUserIdRef.current !== reqUserId) {
        return;
      }
      isSavingRef.current = false;
      setIsSaving(false);
      setSaveStatus('error');
      saveStatusRef.current = 'error';
      setSaveError(err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR');
    }
  }, [handleUnauthorized]);

  reconcileWithServerRef.current = reconcileWithServer;

  // Thực thi hàng đợi lưu tuần tự (Single In-Flight & Chaining)
  const processQueue = useCallback(async () => {
    if (isSavingRef.current || !isMountedRef.current) return;

    // ƯU TIÊN ĐỐI CHIẾU: Nếu kết quả máy chủ chưa xác định, không được gửi PATCH ngay
    if (hasUncertainServerStateRef.current) {
      if (typeof reconcileWithServerRef.current === 'function') {
        reconcileWithServerRef.current();
      }
      return;
    }

    const currentEpoch = accountEpochRef.current;
    const reqUserId = currentUserIdRef.current;

    if (Object.keys(pendingChangesRef.current).length === 0) {
      if (saveStatusRef.current === 'saving' || (saveStatusRef.current !== 'error' && saveStatusRef.current !== 'idle')) {
        const isFullySaved = !isSavingRef.current &&
          !hasUncertainServerStateRef.current &&
          Object.keys(timeErrorsRef.current).length === 0 &&
          areNotificationsEqual(draftRef.current, persistedRef.current);

        if (isFullySaved) {
          setSaveStatus('saved');
          saveStatusRef.current = 'saved';
        } else if (Object.keys(timeErrorsRef.current).length > 0) {
          setSaveStatus('idle');
          saveStatusRef.current = 'idle';
        }
      }
      return;
    }

    // Đang ở chế độ xem trước: không gọi backend
    if (isPreview) {
      pendingChangesRef.current = {};
      setSaveStatus('idle');
      saveStatusRef.current = 'idle';
      return;
    }

    // Lấy snapshot các thay đổi cần gửi
    const changesToSend = { ...pendingChangesRef.current };
    pendingChangesRef.current = {};
    inFlightChangesRef.current = changesToSend;

    const deltaPayload = buildDeltaPayload(changesToSend);
    if (Object.keys(deltaPayload).length === 0) {
      inFlightChangesRef.current = null;
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    setSaveStatus('saving');
    saveStatusRef.current = 'saving';
    setSaveError(null);

    try {
      const res = await updateNotificationsService(deltaPayload);

      // Guard 1: Đổi phiên / tài khoản / unmount trong lúc chờ mạng
      if (!isMountedRef.current || accountEpochRef.current !== currentEpoch || currentUserIdRef.current !== reqUserId) {
        return;
      }

      // Guard 2: Xử lý 401 Unauthorized
      if (res.status === 401) {
        pendingChangesRef.current = {};
        inFlightChangesRef.current = null;
        isSavingRef.current = false;
        setIsSaving(false);
        setSaveStatus('error');
        saveStatusRef.current = 'error';
        setSaveError('UNAUTHORIZED');
        if (typeof handleUnauthorized === 'function') {
          handleUnauthorized(reqUserId);
        }
        return;
      }

      // Guard 3: Lỗi validation được backend xác nhận từ chối trước khi ghi (Definite Rejection Before Write)
      // Backend từ chối ở tầng kiểm tra tính hợp lệ trước khi chạm vào DB (ví dụ HTTP 400 CHANNEL_NOT_AVAILABLE, VALIDATION_ERROR)
      const isDefiniteValidationRejection =
        !res.success &&
        typeof res.status === 'number' &&
        res.status >= 400 &&
        res.status < 500 &&
        res.status !== 401 &&
        res.code !== 'INVALID_RESPONSE';

      if (isDefiniteValidationRejection) {
        hasUncertainServerStateRef.current = false;
        pendingChangesRef.current = { ...changesToSend, ...pendingChangesRef.current };
        inFlightChangesRef.current = null;
        isSavingRef.current = false;
        setIsSaving(false);
        setSaveStatus('error');
        saveStatusRef.current = 'error';
        const errCode = (res.code && res.code !== 'OK') ? res.code : 'VALIDATION_ERROR';
        setSaveError(errCode);
        return;
      }

      // Guard 4: Phân loại kết quả chưa xác định (Network error, 5xx, JSON hỏng, hoặc response thành công nhưng thiếu/sai contract/không khớp lá)
      if (isUncertainServerResult(res, changesToSend)) {
        hasUncertainServerStateRef.current = true;
        inFlightChangesRef.current = null;
        isSavingRef.current = false;
        setIsSaving(false);
        setSaveStatus('error');
        saveStatusRef.current = 'error';

        // Tuyệt đối không dùng code 'OK' làm mã lỗi
        let errCode = 'SAVE_NOTIFICATIONS_FAILED';
        if (res.code && res.code !== 'OK') {
          errCode = res.code;
        } else if (res.isNetworkError || res.status === 0 || res.code === 'TIMEOUT' || res.code === 'NETWORK_ERROR') {
          errCode = res.code || 'NETWORK_ERROR';
        } else if (typeof res.status === 'number' && res.status >= 500) {
          errCode = 'INTERNAL_SERVER_ERROR';
        } else if (!res.data?.notifications || !isValidNotificationsContract(res.data.notifications)) {
          errCode = 'SAVE_NOTIFICATIONS_FAILED';
        }
        setSaveError(errCode);
        return;
      }

      // Lưu thành công: cập nhật persisted từ server và xóa cờ bất định
      hasUncertainServerStateRef.current = false;
      const serverNotif = cloneNotifications(res.data.notifications);
      persistedRef.current = serverNotif;
      setPersisted(serverNotif);

      inFlightChangesRef.current = null;
      isSavingRef.current = false;
      setIsSaving(false);

      // Nếu có thay đổi mới được xếp hàng trong lúc PATCH đang bay, tiếp tục gửi lượt tiếp
      if (Object.keys(pendingChangesRef.current).length > 0) {
        processQueue();
      } else {
        const isFullySaved = !hasUncertainServerStateRef.current &&
          Object.keys(timeErrorsRef.current).length === 0 &&
          areNotificationsEqual(draftRef.current, serverNotif);

        if (isFullySaved) {
          setSaveStatus('saved');
          saveStatusRef.current = 'saved';
          setSaveError(null);
        } else {
          setSaveStatus('idle');
          saveStatusRef.current = 'idle';
        }
      }
    } catch (err) {
      if (!isMountedRef.current || accountEpochRef.current !== currentEpoch || currentUserIdRef.current !== reqUserId) {
        return;
      }

      // Lỗi ngoại lệ mạng ngoài dự kiến
      hasUncertainServerStateRef.current = true;
      inFlightChangesRef.current = null;
      isSavingRef.current = false;
      setIsSaving(false);
      setSaveStatus('error');
      saveStatusRef.current = 'error';
      setSaveError(err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR');
    }
  }, [isPreview, handleUnauthorized]);

  processQueueRef.current = processQueue;

  // Nạp dữ liệu cấu hình từ máy chủ (GET /api/settings)
  const fetchNotifications = useCallback(async (isSilent = false) => {
    if (!currentUserIdRef.current || isPreview) {
      if (isPreview) {
        setIsLoaded(true);
        setLoadStatus('success');
      }
      return;
    }

    const currentEpoch = accountEpochRef.current;
    const reqUserId = currentUserIdRef.current;
    const myFetchSeq = ++fetchSeqRef.current;
    const myMutationSeq = mutationSeqRef.current;

    if (!isSilent) {
      setLoadStatus('loading');
      setLoadError(null);
    }

    try {
      const res = await getSettingsService();

      if (!isMountedRef.current || accountEpochRef.current !== currentEpoch || currentUserIdRef.current !== reqUserId) {
        return;
      }

      if (res.status === 401) {
        if (mutationSeqRef.current > myMutationSeq) {
          return;
        }
        setLoadStatus('error');
        setLoadError('UNAUTHORIZED');
        if (typeof handleUnauthorized === 'function') {
          handleUnauthorized(reqUserId);
        }
        return;
      }

      if (myFetchSeq < lastAppliedFetchSeqRef.current) {
        return;
      }

      // Nếu đã có chỉnh sửa hoặc đang có PATCH bay sau khi GET này bắt đầu -> không ghi đè draft
      if (mutationSeqRef.current > myMutationSeq || isSavingRef.current || Object.keys(pendingChangesRef.current).length > 0) {
        return;
      }

      if (res.success && res.data?.notifications && isValidNotificationsContract(res.data.notifications)) {
        const serverNotif = cloneNotifications(res.data.notifications);
        lastAppliedFetchSeqRef.current = myFetchSeq;
        persistedRef.current = serverNotif;
        draftRef.current = cloneNotifications(serverNotif);

        setPersisted(serverNotif);
        setDraft(cloneNotifications(serverNotif));
        setTimeInputs({
          startTime: serverNotif.quietHours.startTime,
          endTime: serverNotif.quietHours.endTime
        });
        setTimeErrors({});
        timeErrorsRef.current = {};
        setIsLoaded(true);
        setLoadStatus('success');
        setLoadError(null);
      } else {
        if (!isSilent) {
          setLoadStatus('error');
          setLoadError(res.code || 'LOAD_SETTINGS_FAILED');
        }
      }
    } catch {
      if (!isMountedRef.current || accountEpochRef.current !== currentEpoch || currentUserIdRef.current !== reqUserId) {
        return;
      }
      if (myFetchSeq < lastAppliedFetchSeqRef.current || mutationSeqRef.current > myMutationSeq) {
        return;
      }
      if (!isSilent) {
        setLoadStatus('error');
        setLoadError('NETWORK_ERROR');
      }
    }
  }, [isPreview, handleUnauthorized]);

  // Quản lý vòng đời và cách ly tài khoản khi chuyển đổi phiên
  useEffect(() => {
    isMountedRef.current = true;
    accountEpochRef.current += 1;
    fetchSeqRef.current = 0;
    lastAppliedFetchSeqRef.current = 0;
    mutationSeqRef.current = 0;

    pendingChangesRef.current = {};
    inFlightChangesRef.current = null;
    isSavingRef.current = false;
    hasUncertainServerStateRef.current = false;

    setIsSaving(false);
    setSaveStatus('idle');
    setSaveError(null);
    setLoadError(null);
    setTimeErrors({});
    timeErrorsRef.current = {};

    if (currentUserId && !isPreview) {
      setIsLoaded(false);
      fetchNotifications(false);
    } else {
      const def = cloneNotifications(DEFAULT_NOTIFICATIONS);
      persistedRef.current = def;
      draftRef.current = cloneNotifications(def);
      setPersisted(def);
      setDraft(cloneNotifications(def));
      setTimeInputs({
        startTime: def.quietHours.startTime,
        endTime: def.quietHours.endTime
      });
      setIsLoaded(true);
      setLoadStatus(isPreview ? 'success' : 'idle');
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [currentUserId, isPreview, fetchNotifications]);

  // Hàm cập nhật một trường lá cụ thể
  const updateLeafField = useCallback((leafPath, newValue) => {
    if (!isLoaded && !isPreview) return;

    mutationSeqRef.current += 1;

    // 1. Cập nhật optimistic vào draft UI
    setDraft((prevDraft) => {
      const newDraft = cloneNotifications(prevDraft);
      const parts = leafPath.split('.');
      if (parts.length === 1) {
        newDraft[parts[0]] = newValue;
      } else if (parts.length === 2) {
        newDraft[parts[0]][parts[1]] = newValue;
      }
      draftRef.current = newDraft;
      return newDraft;
    });

    // 2. Nếu trạng thái server đang bất định: không được coi persisted là căn cứ so sánh,
    // và không được tự báo saved. Ưu tiên đối chiếu trước khi PATCH!
    if (hasUncertainServerStateRef.current) {
      if (!isSavingRef.current && typeof reconcileWithServerRef.current === 'function') {
        reconcileWithServerRef.current();
      }
      return;
    }

    // 3. Nếu server state không bất định, kiểm tra delta với persisted
    const persistedVal = (() => {
      const parts = leafPath.split('.');
      if (parts.length === 1) return persistedRef.current[parts[0]];
      return persistedRef.current[parts[0]]?.[parts[1]];
    })();

    const inFlightVal = (() => {
      if (!inFlightChangesRef.current) return undefined;
      return inFlightChangesRef.current[leafPath];
    })();

    if (inFlightVal === undefined && newValue === persistedVal) {
      delete pendingChangesRef.current[leafPath];
      if (Object.keys(pendingChangesRef.current).length === 0 && !isSavingRef.current) {
        if (
          Object.keys(timeErrorsRef.current).length === 0 &&
          areNotificationsEqual(draftRef.current, persistedRef.current)
        ) {
          setSaveError(null);
          setSaveStatus('saved');
          saveStatusRef.current = 'saved';
        }
      }
      return;
    }

    pendingChangesRef.current[leafPath] = newValue;
    processQueue();
  }, [isLoaded, isPreview, processQueue]);

  // Cập nhật giá trị nhập giờ
  const handleTimeInputChange = useCallback((field, rawValue) => {
    setTimeInputs((prev) => ({ ...prev, [field]: rawValue }));

    // Kiểm tra tính hợp lệ của HH:mm
    if (!isValidTimeFormat(rawValue)) {
      setTimeErrors((prev) => {
        const next = { ...prev, [field]: 'INVALID_TIME' };
        timeErrorsRef.current = next;
        return next;
      });
      // Nếu đang hiển thị saved, chuyển về idle để không gây hiểu nhầm
      if (saveStatusRef.current === 'saved') {
        setSaveStatus('idle');
        saveStatusRef.current = 'idle';
      }
      return;
    }

    // Nếu hợp lệ: xóa lỗi và đẩy vào hàng đợi cập nhật
    setTimeErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      timeErrorsRef.current = next;
      return next;
    });

    updateLeafField(`quietHours.${field}`, rawValue);
  }, [updateLeafField]);

  // Nút thử lại
  const retrySave = useCallback(async () => {
    if (isSavingRef.current || !isMountedRef.current) return;

    if (Object.keys(timeErrorsRef.current).length > 0) {
      return;
    }

    // ƯU TIÊN ĐỐI CHIẾU: Nếu kết quả máy chủ đang bất định, chạy reconcile trước
    if (hasUncertainServerStateRef.current) {
      if (typeof reconcileWithServerRef.current === 'function') {
        reconcileWithServerRef.current();
      }
      return;
    }

    if (Object.keys(pendingChangesRef.current).length > 0) {
      setSaveError(null);
      processQueue();
      return;
    }

    const diffs = computeLeafDiffs(draftRef.current, persistedRef.current);
    if (Object.keys(diffs).length > 0) {
      pendingChangesRef.current = diffs;
      setSaveError(null);
      processQueue();
    } else {
      setSaveError(null);
      setSaveStatus('saved');
      saveStatusRef.current = 'saved';
    }
  }, [processQueue]);

  const reloadSettings = useCallback(() => {
    fetchNotifications(false);
  }, [fetchNotifications]);

  return {
    persisted,
    draft,
    timeInputs,
    timeErrors,
    isLoaded,
    loadStatus,
    loadError,
    isSaving,
    saveStatus,
    saveError,
    isPreview,
    updateLeafField,
    handleTimeInputChange,
    retrySave,
    reloadSettings
  };
}
