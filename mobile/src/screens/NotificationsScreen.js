import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getNotificationsApi,
  markNotificationAsReadApi,
  markAllNotificationsAsReadApi,
  deleteNotificationApi
} from '../api/notificationsApi';
import { useAlerts } from '../context/AlertContext';

export default function NotificationsScreen({ onBack }) {
  const { refreshAlerts } = useAlerts();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'UNREAD' | 'CRITICAL'

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await getNotificationsApi({ limit: 50 });
      if (res.success && Array.isArray(res.data?.notifications)) {
        setNotifications(res.data.notifications);
      }
    } catch (err) {
      console.warn('Lỗi tải thông báo:', err);
    }
  }, []);

  useEffect(() => {
    fetchNotifications().finally(() => setLoading(false));
  }, [fetchNotifications]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchNotifications(), refreshAlerts()]);
    setRefreshing(false);
  };

  const handleMarkAsRead = async (item) => {
    if (item.read) return;
    try {
      await markNotificationAsReadApi(item._id || item.id);
      setNotifications(prev =>
        prev.map(n => ((n._id || n.id) === (item._id || item.id) ? { ...n, read: true } : n))
      );
      refreshAlerts();
    } catch (err) {
      console.warn('Lỗi đánh dấu đã đọc:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsReadApi();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      refreshAlerts();
    } catch (err) {
      Alert.alert('Lỗi', 'Không thể đánh dấu tất cả đã đọc.');
    }
  };

  const handleDelete = async (item) => {
    try {
      await deleteNotificationApi(item._id || item.id);
      setNotifications(prev => prev.filter(n => (n._id || n.id) !== (item._id || item.id)));
      refreshAlerts();
    } catch {
      Alert.alert('Lỗi', 'Không thể xóa thông báo này.');
    }
  };

  // Lọc theo tab
  const filteredNotifications = notifications.filter(n => {
    if (filter === 'UNREAD') return !n.read;
    if (filter === 'CRITICAL') return n.type === 'critical' || n.priority === 'high';
    return true;
  });

  const getIconConfig = (type) => {
    switch (type) {
      case 'critical':
      case 'danger':
        return { name: 'alert-circle', color: '#ef4444' };
      case 'warning':
        return { name: 'warning', color: '#f59e0b' };
      case 'security':
        return { name: 'shield', color: '#3b82f6' };
      default:
        return { name: 'information-circle', color: '#0f766e' };
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} · ${d.getDate()}/${d.getMonth() + 1}`;
    } catch {
      return '';
    }
  };

  const renderItem = ({ item }) => {
    const isUnread = !item.read;
    const icon = getIconConfig(item.type);

    return (
      <TouchableOpacity
        style={[styles.itemCard, isUnread && styles.unreadCard]}
        onPress={() => handleMarkAsRead(item)}
        activeOpacity={0.8}
      >
        <View style={styles.itemIconContainer}>
          <Ionicons name={icon.name} size={24} color={icon.color} />
        </View>

        <View style={styles.itemContent}>
          <View style={styles.itemHeaderRow}>
            <Text style={[styles.itemTitle, isUnread && styles.unreadText]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.itemTime}>{formatTime(item.createdAt)}</Text>
          </View>
          <Text style={styles.itemMessage} numberOfLines={3}>
            {item.message}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={16} color="#94a3b8" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hộp thư thông báo</Text>
        <TouchableOpacity style={styles.readAllBtn} onPress={handleMarkAllRead}>
          <Text style={styles.readAllText}>Đọc tất cả</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs Bộ lọc */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, filter === 'ALL' && styles.activeTab]}
          onPress={() => setFilter('ALL')}
        >
          <Text style={[styles.tabText, filter === 'ALL' && styles.activeTabText]}>
            Tất cả ({notifications.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, filter === 'UNREAD' && styles.activeTab]}
          onPress={() => setFilter('UNREAD')}
        >
          <Text style={[styles.tabText, filter === 'UNREAD' && styles.activeTabText]}>
            Chưa đọc ({notifications.filter(n => !n.read).length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, filter === 'CRITICAL' && styles.activeTab]}
          onPress={() => setFilter('CRITICAL')}
        >
          <Text style={[styles.tabText, filter === 'CRITICAL' && styles.activeTabText]}>
            Khẩn cấp
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#0f766e" />
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item._id || item.id || String(Math.random())}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0f766e']} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="mail-open-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>Không có thông báo nào trong danh mục này.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  backBtn: {
    padding: 6
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a'
  },
  readAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f0fdfa',
    borderRadius: 8
  },
  readAllText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '700'
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 8
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f1f5f9'
  },
  activeTab: {
    backgroundColor: '#0f766e'
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b'
  },
  activeTabText: {
    color: '#ffffff'
  },
  listContent: {
    padding: 16,
    paddingBottom: 30
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'flex-start'
  },
  unreadCard: {
    borderColor: '#99f6e4',
    backgroundColor: '#f0fdfa'
  },
  itemIconContainer: {
    marginRight: 12,
    marginTop: 2
  },
  itemContent: {
    flex: 1
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
    marginRight: 8
  },
  unreadText: {
    fontWeight: '800',
    color: '#0f172a'
  },
  itemTime: {
    fontSize: 11,
    color: '#94a3b8'
  },
  itemMessage: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16
  },
  deleteBtn: {
    padding: 6,
    marginLeft: 6
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center'
  },
  emptyText: {
    marginTop: 12,
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center'
  }
});
