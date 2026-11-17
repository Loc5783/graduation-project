import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAlerts } from '../context/AlertContext';

export default function Header({ title = 'SmartHome Privacy', onOpenNotifications, onOpenAlerts }) {
  const { unreadNotificationsCount, criticalCount, isLiveConnected } = useAlerts();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.brandTitle}>{title}</Text>
          <View style={styles.statusIndicator}>
            <View style={[styles.statusDot, isLiveConnected ? styles.onlineDot : styles.offlineDot]} />
            <Text style={styles.statusText}>
              {isLiveConnected ? 'Trực tuyến' : 'Chưa kết nối Hub'}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          {/* Nút Cảnh báo khẩn cấp */}
          {criticalCount > 0 && (
            <TouchableOpacity
              style={styles.alertBtn}
              onPress={onOpenAlerts}
              activeOpacity={0.8}
            >
              <Ionicons name="flame" size={22} color="#ffffff" />
              <View style={styles.alertBadge}>
                <Text style={styles.badgeText}>{criticalCount}</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Chuông thông báo */}
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={onOpenNotifications}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={24} color="#1f2937" />
            {unreadNotificationsCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.badgeText}>
                  {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  titleContainer: {
    flex: 1
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f766e' // Màu xanh mòng két đặc trưng của SmartHome Privacy
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  onlineDot: {
    backgroundColor: '#10b981'
  },
  offlineDot: {
    backgroundColor: '#9ca3af'
  },
  statusText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500'
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  alertBtn: {
    backgroundColor: '#ef4444',
    padding: 8,
    borderRadius: 20,
    position: 'relative',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4
  },
  alertBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#b91c1c',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff'
  },
  bellBtn: {
    padding: 6,
    position: 'relative'
  },
  unreadBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff'
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700'
  }
});
