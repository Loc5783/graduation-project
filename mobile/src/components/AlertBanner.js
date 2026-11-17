import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAlerts } from '../context/AlertContext';

export default function AlertBanner({ onOpenAlerts }) {
  const { activeAlerts, dismissAlert } = useAlerts();

  if (!activeAlerts || activeAlerts.length === 0) {
    return null;
  }

  // Ưu tiên cảnh báo Critical nhất
  const topAlert = activeAlerts.find(a => a.severity === 'CRITICAL') || activeAlerts[0];
  const isCritical = topAlert.severity === 'CRITICAL';

  return (
    <View style={[styles.container, isCritical ? styles.criticalBg : styles.warningBg]}>
      <View style={styles.iconContainer}>
        <Ionicons
          name={isCritical ? 'flame' : 'warning'}
          size={24}
          color="#ffffff"
        />
      </View>
      <TouchableOpacity
        style={styles.textContainer}
        activeOpacity={0.8}
        onPress={onOpenAlerts}
      >
        <Text style={styles.title} numberOfLines={1}>
          {topAlert.title}
        </Text>
        <Text style={styles.message} numberOfLines={2}>
          {topAlert.message}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={() => dismissAlert(topAlert.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close" size={20} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6
  },
  criticalBg: {
    backgroundColor: '#dc2626' // Đỏ khẩn cấp
  },
  warningBg: {
    backgroundColor: '#d97706' // Vàng hổ phách cảnh báo
  },
  iconContainer: {
    marginRight: 10
  },
  textContainer: {
    flex: 1
  },
  title: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2
  },
  message: {
    color: '#fee2e2',
    fontSize: 12,
    lineHeight: 16
  },
  closeBtn: {
    marginLeft: 8,
    padding: 4
  }
});
