import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { apiRequest, isPreviewMode } from '../../services/authService.js';

const MAX_HISTORY = 50;

/**
 * Custom hook quản lý vòng đời lịch sử lệnh thoại Loa thông minh (smart-speaker).
 * - Dùng apiRequest có abort, timeout và bảo vệ cookie HttpOnly.
 * - Polling tuần tự (không chồng lấn request).
 * - Hủy request và reset state lập tức khi unmount hoặc đổi tài khoản.
 * - Response của tài khoản cũ KHÔNG ghi dữ liệu, lỗi hoặc loading cho tài khoản mới.
 * - Kiểm tra chặt chẽ hợp đồng API; phản hồi sai hợp đồng sẽ hiển thị lỗi thay vì giữ trạng thái thành công.
 * - Xử lý 401 đúng tài khoản bằng handleUnauthorized(userId).
 */
export function useSmartSpeakerHistory() {
  const { currentUser, handleUnauthorized } = useAuthContext();
  const userId = currentUser?.id ?? currentUser?._id ?? null;

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(Boolean(userId && !isPreviewMode()));
  const [error, setError] = useState(null);

  const activeAccountRef = useRef(userId);
  const activeSeqRef = useRef(0);
  const activeControllerRef = useRef(null);

  // Cập nhật activeAccountRef đồng bộ
  activeAccountRef.current = userId;

  const fetchHistory = useCallback(async () => {
    if (!userId || isPreviewMode()) {
      setLoading(false);
      return;
    }

    const currentSeq = ++activeSeqRef.current;
    const currentTargetId = userId;

    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeControllerRef.current = controller;

    try {
      const res = await apiRequest('/api/live-devices/speaker-history', {
        signal: controller.signal,
        timeoutMs: 4000
      });

      // Nếu tài khoản đã đổi hoặc request mới hơn đã chạy -> bỏ qua hoàn toàn
      if (currentTargetId !== activeAccountRef.current || currentSeq !== activeSeqRef.current) {
        return;
      }

      if (res.status === 401) {
        handleUnauthorized(currentTargetId);
        return;
      }

      const rawHistory = res.data?.history;
      const isValidContract = Boolean(
        res.success === true &&
        Array.isArray(rawHistory) &&
        rawHistory.every((item) => item && typeof item === 'object')
      );

      if (!isValidContract) {
        setError('Phản hồi lịch sử loa không đúng định dạng hợp đồng.');
        setHistory([]);
      } else {
        setHistory(rawHistory.slice(0, MAX_HISTORY));
        setError(null);
      }
    } catch {
      if (currentTargetId !== activeAccountRef.current || currentSeq !== activeSeqRef.current) {
        return;
      }
      setError('Gateway chưa kết nối hoặc chưa nhận được bản ghi lệnh loa.');
      setHistory([]);
    } finally {
      if (currentTargetId === activeAccountRef.current && currentSeq === activeSeqRef.current) {
        setLoading(false);
      }
    }
  }, [userId, handleUnauthorized]);

  // Vòng đời Polling tuần tự & Quản lý tài khoản
  useEffect(() => {
    let active = true;
    let pollTimer = null;
    activeAccountRef.current = userId;

    // Reset ngay lập tức khi đổi tài khoản
    setHistory([]);
    setError(null);
    setLoading(Boolean(userId && !isPreviewMode()));

    if (!userId || isPreviewMode()) {
      return () => {
        active = false;
        if (activeControllerRef.current) activeControllerRef.current.abort();
        if (pollTimer) clearTimeout(pollTimer);
      };
    }

    const poll = async () => {
      if (!active || userId !== activeAccountRef.current) return;

      const currentSeq = ++activeSeqRef.current;
      const currentTargetId = userId;

      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
      const controller = new AbortController();
      activeControllerRef.current = controller;

      try {
        const res = await apiRequest('/api/live-devices/speaker-history', {
          signal: controller.signal,
          timeoutMs: 4000
        });

        if (!active || currentTargetId !== activeAccountRef.current || currentSeq !== activeSeqRef.current) {
          return;
        }

        if (res.status === 401) {
          handleUnauthorized(currentTargetId);
          return;
        }

        const rawHistory = res.data?.history;
        const isValidContract = Boolean(
          res.success === true &&
          Array.isArray(rawHistory) &&
          rawHistory.every((item) => item && typeof item === 'object')
        );

        if (!isValidContract) {
          setError('Phản hồi lịch sử loa không đúng định dạng hợp đồng.');
          setHistory([]);
        } else {
          setHistory(rawHistory.slice(0, MAX_HISTORY));
          setError(null);
        }
      } catch {
        if (!active || currentTargetId !== activeAccountRef.current || currentSeq !== activeSeqRef.current) {
          return;
        }
        setError('Gateway chưa kết nối hoặc chưa nhận được bản ghi lệnh loa.');
        setHistory([]);
      } finally {
        if (active && currentTargetId === activeAccountRef.current && currentSeq === activeSeqRef.current) {
          setLoading(false);
          // Lên lịch poll kế tiếp tuần tự (không setInterval chồng chéo)
          pollTimer = setTimeout(poll, 5000);
        }
      }
    };

    void poll();

    return () => {
      active = false;
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [userId, handleUnauthorized]);

  // Thống kê phân loại lệnh
  const stats = useMemo(() => {
    let binCount = 0;
    let doorCount = 0;
    let windowCount = 0;
    let gasCount = 0;
    let plugCount = 0;
    let lightCount = 0;

    for (const item of history) {
      const cmd = item.command || '';
      if (cmd.startsWith('BIN_')) binCount++;
      else if (cmd.startsWith('DOOR_')) doorCount++;
      else if (cmd.startsWith('WINDOW_')) windowCount++;
      else if (cmd.startsWith('ENV_')) gasCount++;
      else if (cmd.startsWith('PLUG_') || cmd.startsWith('FAN_')) plugCount++;
      else if (cmd.startsWith('LIGHT_')) lightCount++;
    }

    return {
      total: history.length,
      latest: history[0] || null,
      binCount,
      doorCount,
      windowCount,
      gasCount,
      plugCount,
      lightCount
    };
  }, [history]);

  return {
    history,
    stats,
    loading,
    error,
    refresh: fetchHistory
  };
}
