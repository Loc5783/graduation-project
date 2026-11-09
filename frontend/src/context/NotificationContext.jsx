import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuthContext } from './AuthContext.jsx';
import {
  getNotificationsService,
  markNotificationAsReadService,
  markAllNotificationsAsReadService
} from '../services/notificationService.js';
import { isPreviewMode } from '../services/authService.js';

export const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { currentUser, handleUnauthorized, isAuthenticated } = useAuthContext();
  const currentUserId = currentUser?.id;
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  const isPreview = isPreviewMode();

  // 1. Trạng thái dữ liệu hộp thư
  const [notifications, setNotifications] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // 2. Trạng thái tải và thao tác
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [markingIds, setMarkingIds] = useState(new Set());
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);

  // 3. Quản lý vòng đời và đồng bộ
  const isMountedRef = useRef(true);
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  const accountGenRef = useRef(0);
  const fetchSeqRef = useRef(0);
  const lastAppliedFetchSeqRef = useRef(0);
  const fetchCycleRef = useRef(0);

  // 4. Khóa đồng bộ và tuần tự cho Load More
  const loadMoreInFlightRef = useRef(false);
  const loadMoreRequestIdRef = useRef(0);

  // 5. Quản lý Mutation Sequence và Invalidation
  const mutationSeqRef = useRef(0);
  const markSeqRef = useRef(0);
  const inFlightMarkMapRef = useRef(new Map()); // Map<id, markRequestId>
  const readOverridesRef = useRef(new Map()); // Map<id, realReadAt>
  const isMarkingAllRef = useRef(false);

  // Quản lý unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Tải danh sách thông báo mới nhất từ máy chủ (GET /api/notifications).
   * Hỗ trợ cờ isRefresh để phân biệt lần tải đầu và thao tác làm mới.
   * Trả kết quả về cho caller (bao gồm GET đối soát sau markAllAsRead).
   */
  const fetchNotifications = useCallback(async ({ isRefresh = false } = {}) => {
    const reqUserId = currentUserIdRef.current;
    if (!reqUserId || isPreview) {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
      return { success: false, code: 'NOT_AUTHENTICATED' };
    }

    const currentGen = accountGenRef.current;
    const mySeq = ++fetchSeqRef.current;
    fetchCycleRef.current++; // Tăng cycle để hủy bỏ bất kỳ lượt loadMore cũ nào

    // Khi refresh (hoặc nạp mới):
    // Vô hiệu hóa loadMore cũ, giải phóng trạng thái tải thêm và khóa đồng bộ của lượt cũ
    loadMoreInFlightRef.current = false;
    if (isMountedRef.current) {
      setIsLoadingMore(false);
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
    }

    // Ghi nhận mutation sequence tại thời điểm bắt đầu request GET này
    const reqMutationSeq = mutationSeqRef.current;

    try {
      const res = await getNotificationsService({ limit: 20 });

      // Bảo vệ: unmount, đổi account generation, hoặc đổi user
      if (
        !isMountedRef.current ||
        accountGenRef.current !== currentGen ||
        currentUserIdRef.current !== reqUserId
      ) {
        return { success: false, aborted: true };
      }

      // Xử lý 401 an toàn theo quy ước của AuthContext
      if (res.status === 401) {
        handleUnauthorized(reqUserId);
        return { success: false, status: 401, code: 'UNAUTHORIZED' };
      }

      // Kiểm tra tính tuần tự của chuỗi fetch
      if (mySeq >= lastAppliedFetchSeqRef.current) {
        lastAppliedFetchSeqRef.current = mySeq;

        if (res.success && res.data) {
          let reconciledItems = res.data.items;
          // Áp dụng readOverrides từ các mutation đơn lẻ đã xác nhận thành công
          if (readOverridesRef.current.size > 0) {
            reconciledItems = res.data.items.map((item) => {
              if (readOverridesRef.current.has(item.id)) {
                return {
                  ...item,
                  isRead: true,
                  readAt: readOverridesRef.current.get(item.id) || item.readAt || null
                };
              }
              return item;
            });
          }

          setNotifications(reconciledItems);
          setNextCursor(res.data.nextCursor);

          // KIỂM TRA MUTATION INVALIDATION:
          // Nếu có mutation đã hoàn tất thành công kể từ khi GET bắt đầu (reqMutationSeq < mutationSeqRef.current):
          // unreadCount từ máy chủ trong response này là snapshot cũ/chưa chứa mutation vừa xác nhận,
          // KHÔNG được hoàn tác unreadCount mà client đã xác nhận!
          const isStaleAfterMutation = reqMutationSeq < mutationSeqRef.current;

          if (!isStaleAfterMutation) {
            setUnreadCount(res.data.unreadCount);
          }
          setError(null);
          return { success: true, data: res.data };
        } else {
          const errCode = res.code || res.message || 'LOAD_NOTIFICATIONS_FAILED';
          setError(errCode);
          return { success: false, code: errCode, message: res.message };
        }
      } else {
        // Request này bị vượt qua bởi một refresh/fetch mới hơn (superseded)
        return { success: false, superseded: true };
      }
    } catch (err) {
      if (
        !isMountedRef.current ||
        accountGenRef.current !== currentGen ||
        currentUserIdRef.current !== reqUserId
      ) {
        return { success: false, aborted: true };
      }
      if (mySeq >= lastAppliedFetchSeqRef.current) {
        const errMsg = err.message || 'LOAD_NOTIFICATIONS_FAILED';
        setError(errMsg);
        return { success: false, code: 'LOAD_NOTIFICATIONS_FAILED', message: errMsg };
      }
      return { success: false, superseded: true };
    } finally {
      if (
        isMountedRef.current &&
        accountGenRef.current === currentGen &&
        currentUserIdRef.current === reqUserId
      ) {
        if (mySeq >= lastAppliedFetchSeqRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }
  }, [handleUnauthorized, isPreview]);

  /**
   * Tải thêm thông báo theo phân trang con trỏ (cursor)
   */
  const loadMore = useCallback(async () => {
    const reqUserId = currentUserIdRef.current;
    if (
      !reqUserId ||
      isPreview ||
      !nextCursor ||
      loadMoreInFlightRef.current ||
      isLoadingMore ||
      isLoading ||
      isRefreshing
    ) {
      return;
    }

    // Khóa đồng bộ ngay lập tức để hai lời gọi liên tiếp chỉ gửi đúng một request
    loadMoreInFlightRef.current = true;
    const myLoadMoreId = ++loadMoreRequestIdRef.current;
    const currentGen = accountGenRef.current;
    const currentCursor = nextCursor;
    const currentCycle = fetchCycleRef.current;

    // Ghi nhận mutation sequence tại thời điểm bắt đầu loadMore này
    const reqMutationSeq = mutationSeqRef.current;

    setIsLoadingMore(true);
    setActionError(null);

    try {
      const res = await getNotificationsService({ limit: 20, cursor: currentCursor });

      // Nếu unmount, tài khoản đổi hoặc một lượt refresh mới đã kích hoạt -> hủy bỏ
      if (
        !isMountedRef.current ||
        accountGenRef.current !== currentGen ||
        currentUserIdRef.current !== reqUserId ||
        fetchCycleRef.current !== currentCycle
      ) {
        return;
      }

      if (res.status === 401) {
        handleUnauthorized(reqUserId);
        return;
      }

      if (res.success && res.data) {
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const readIds = new Set(prev.filter((i) => i.isRead).map((i) => i.id));
          const newUniqueItems = res.data.items
            .filter((i) => !existingIds.has(i.id))
            .map((i) => {
              if (readOverridesRef.current.has(i.id) || readIds.has(i.id)) {
                return {
                  ...i,
                  isRead: true,
                  readAt: readOverridesRef.current.get(i.id) || i.readAt || null
                };
              }
              return i;
            });
          return [...prev, ...newUniqueItems];
        });
        setNextCursor(res.data.nextCursor);

        // KIỂM TRA MUTATION INVALIDATION:
        // Cả GET khởi chạy trước hoặc trong lúc mutation pending đều không được hoàn tác unreadCount
        const isStaleAfterMutation = reqMutationSeq < mutationSeqRef.current;

        if (!isStaleAfterMutation) {
          setUnreadCount(res.data.unreadCount);
        }
      } else {
        setActionError(res.code || res.message || 'LOAD_MORE_FAILED');
      }
    } catch (err) {
      if (
        isMountedRef.current &&
        accountGenRef.current === currentGen &&
        currentUserIdRef.current === reqUserId &&
        fetchCycleRef.current === currentCycle
      ) {
        setActionError(err.message || 'LOAD_MORE_FAILED');
      }
    } finally {
      // Chỉ giải phóng khóa nếu request này vẫn sở hữu lượt tải thêm và chưa bị refresh hủy
      if (
        accountGenRef.current === currentGen &&
        currentUserIdRef.current === reqUserId &&
        fetchCycleRef.current === currentCycle &&
        loadMoreRequestIdRef.current === myLoadMoreId
      ) {
        loadMoreInFlightRef.current = false;
        if (isMountedRef.current) {
          setIsLoadingMore(false);
        }
      }
    }
  }, [nextCursor, isLoadingMore, isLoading, isRefreshing, handleUnauthorized, isPreview]);

  /**
   * Đánh dấu đã đọc một thông báo (PATCH /api/notifications/:id/read)
   */
  const markAsRead = useCallback(async (id) => {
    const reqUserId = currentUserIdRef.current;
    if (!reqUserId || isPreview || !id) return;

    // Khóa đồng bộ chống double click trên cùng một ID
    if (inFlightMarkMapRef.current.has(id)) {
      return;
    }
    const myMarkId = ++markSeqRef.current;
    inFlightMarkMapRef.current.set(id, myMarkId);
    setMarkingIds(new Set(inFlightMarkMapRef.current.keys()));
    setActionError(null);

    // Tăng mutation sequence khi bắt đầu mutation
    mutationSeqRef.current++;

    const currentGen = accountGenRef.current;

    try {
      const res = await markNotificationAsReadService(id);

      if (
        !isMountedRef.current ||
        accountGenRef.current !== currentGen ||
        currentUserIdRef.current !== reqUserId
      ) {
        return;
      }

      if (res.status === 401) {
        handleUnauthorized(reqUserId);
        return;
      }

      if (res.success && res.data?.notification) {
        // Tăng mutation sequence khi mutation được server xác nhận thành công
        // Giúp vô hiệu hóa mọi GET đã khởi chạy trước hoặc trong lúc mutation pending
        mutationSeqRef.current++;
        const updated = res.data.notification;
        readOverridesRef.current.set(id, updated.readAt || null);

        // Tính toán wasUnread NGOÀI updater setNotifications để bảo đảm updater thuần túy (StrictMode safe)
        const currentItems = notificationsRef.current;
        const target = currentItems.find((item) => item.id === id);
        const wasUnread = target ? !target.isRead : true;

        setNotifications((prev) =>
          prev.map((item) => {
            if (item.id === id) {
              return {
                ...item,
                isRead: true,
                readAt: updated.readAt || item.readAt || null
              };
            }
            return item;
          })
        );

        if (wasUnread) {
          setUnreadCount((cnt) => Math.max(0, cnt - 1));
        }
      } else {
        setActionError(res.code || res.message || 'MARK_READ_FAILED');
      }
    } catch (err) {
      if (
        isMountedRef.current &&
        accountGenRef.current === currentGen &&
        currentUserIdRef.current === reqUserId
      ) {
        setActionError(err.message || 'MARK_READ_FAILED');
      }
    } finally {
      // Chỉ giải phóng khóa do chính request này sở hữu và cùng generation
      if (inFlightMarkMapRef.current.get(id) === myMarkId) {
        inFlightMarkMapRef.current.delete(id);
      }
      if (
        isMountedRef.current &&
        accountGenRef.current === currentGen &&
        currentUserIdRef.current === reqUserId
      ) {
        setMarkingIds(new Set(inFlightMarkMapRef.current.keys()));
      }
    }
  }, [handleUnauthorized, isPreview]);

  /**
   * Đánh dấu đã đọc tất cả thông báo hiện có (PATCH /api/notifications/read-all)
   */
  const markAllAsRead = useCallback(async () => {
    const reqUserId = currentUserIdRef.current;
    if (!reqUserId || isPreview || isMarkingAllRef.current) return;

    isMarkingAllRef.current = true;
    const currentGen = accountGenRef.current;
    setIsMarkingAll(true);
    setActionError(null);

    // Tăng mutation sequence khi bắt đầu mutation
    mutationSeqRef.current++;

    try {
      const res = await markAllNotificationsAsReadService();

      if (
        !isMountedRef.current ||
        accountGenRef.current !== currentGen ||
        currentUserIdRef.current !== reqUserId
      ) {
        return;
      }

      if (res.status === 401) {
        handleUnauthorized(reqUserId);
        return;
      }

      if (res.success) {
        // Tăng mutation sequence khi read-all được server xác nhận thành công
        mutationSeqRef.current++;
        readOverridesRef.current.clear();

        // BỎ việc tự ý khẳng định đọc tất cả trên client:
        // KHÔNG map toàn bộ danh sách client thành isRead: true
        // KHÔNG setUnreadCount(0)
        // Đưa GET đối soát sau read-all vào cùng cơ chế fetchNotifications chung:
        // Tái sử dụng cùng sequence, cycle, và không cho phép ghi đè một refresh mới hơn
        const syncRes = await fetchNotifications({ isRefresh: true });

        if (
          !isMountedRef.current ||
          accountGenRef.current !== currentGen ||
          currentUserIdRef.current !== reqUserId
        ) {
          return;
        }

        // Nếu đối soát thất bại và KHÔNG bị superseded bởi refresh mới hơn:
        // giữ dữ liệu gần nhất, hiện cảnh báo chưa đồng bộ và cho thử lại
        if (!syncRes.success && !syncRes.superseded && !syncRes.aborted) {
          setActionError(syncRes.code || syncRes.message || 'SYNC_NOTIFICATIONS_FAILED');
        } else if (syncRes.success) {
          setActionError(null);
        }
      } else {
        setActionError(res.code || res.message || 'MARK_ALL_READ_FAILED');
      }
    } catch (err) {
      if (
        isMountedRef.current &&
        accountGenRef.current === currentGen &&
        currentUserIdRef.current === reqUserId
      ) {
        setActionError(err.message || 'MARK_ALL_READ_FAILED');
      }
    } finally {
      // Chỉ reset isMarkingAllRef nếu cùng generation
      if (accountGenRef.current === currentGen && currentUserIdRef.current === reqUserId) {
        isMarkingAllRef.current = false;
        if (isMountedRef.current) {
          setIsMarkingAll(false);
        }
      }
    }
  }, [fetchNotifications, handleUnauthorized, isPreview]);

  // 6. Theo dõi chuyển đổi tài khoản (Account lifecycle)
  useEffect(() => {
    // Tăng account generation mỗi khi user ID thay đổi
    accountGenRef.current++;
    lastAppliedFetchSeqRef.current = 0;
    fetchSeqRef.current = 0;
    fetchCycleRef.current = 0;
    mutationSeqRef.current = 0;
    loadMoreInFlightRef.current = false;
    loadMoreRequestIdRef.current = 0;
    inFlightMarkMapRef.current.clear();
    readOverridesRef.current.clear();
    isMarkingAllRef.current = false;

    // Reset toàn bộ state khi đổi user
    setNotifications([]);
    setNextCursor(null);
    setUnreadCount(0);
    setIsLoading(false);
    setIsRefreshing(false);
    setIsLoadingMore(false);
    setIsMarkingAll(false);
    setMarkingIds(new Set());
    setError(null);
    setActionError(null);

    if (currentUserId && isAuthenticated && !isPreview) {
      fetchNotifications({ isRefresh: false });
    }
  }, [currentUserId, isAuthenticated, isPreview, fetchNotifications]);

  const value = {
    notifications,
    nextCursor,
    unreadCount,
    isLoading,
    isRefreshing,
    isLoadingMore,
    isMarkingAll,
    markingIds,
    error,
    actionError,
    fetchNotifications,
    refresh: () => fetchNotifications({ isRefresh: true }),
    loadMore,
    markAsRead,
    markAllAsRead,
    clearActionError: () => setActionError(null)
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    return {
      notifications: [],
      nextCursor: null,
      unreadCount: 0,
      isLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      isMarkingAll: false,
      markingIds: new Set(),
      error: null,
      actionError: null,
      fetchNotifications: () => {},
      refresh: () => {},
      loadMore: () => {},
      markAsRead: () => {},
      markAllAsRead: () => {},
      clearActionError: () => {}
    };
  }
  return context;
}

export default NotificationProvider;
