import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AlertProvider, useAlerts } from './src/context/AlertContext';
import { DevicesProvider } from './src/context/DevicesContext';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import DeviceDetailScreen from './src/screens/DeviceDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';

function MainApp() {
  const { isAuthenticated, isLoading } = useAuth();
  const { criticalCount, unreadNotificationsCount } = useAlerts();

  // Màn hình hiện tại: 'dashboard' | 'alerts' | 'notifications' | 'settings' | 'device-detail' | 'register'
  const [currentScreen, setCurrentScreen] = useState('dashboard');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [verificationEmail, setVerificationEmail] = useState('');

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Đang khởi động SmartHome Privacy...</Text>
      </View>
    );
  }

  // Khi chưa đăng nhập
  if (!isAuthenticated) {
    if (currentScreen === 'register') {
      return <RegisterScreen initialVerificationEmail={verificationEmail} onNavigateLogin={() => { setVerificationEmail(''); setCurrentScreen('dashboard'); }} />;
    }
    return <LoginScreen onNavigateRegister={(email = '') => { setVerificationEmail(typeof email === 'string' ? email : ''); setCurrentScreen('register'); }} />;
  }

  // Render màn hình con nếu đang ở trang chi tiết thiết bị
  if (currentScreen === 'device-detail' && selectedDevice) {
    return (
      <DeviceDetailScreen
        device={selectedDevice}
        onBack={() => {
          setSelectedDevice(null);
          setCurrentScreen('dashboard');
        }}
      />
    );
  }

  const renderActiveScreen = () => {
    switch (currentScreen) {
      case 'alerts':
        return <AlertsScreen onBack={() => setCurrentScreen('dashboard')} />;
      case 'notifications':
        return <NotificationsScreen onBack={() => setCurrentScreen('dashboard')} />;
      case 'settings':
        return <SettingsScreen onBack={() => setCurrentScreen('dashboard')} />;
      case 'dashboard':
      default:
        return (
          <DashboardScreen
            onSelectDevice={(dev) => {
              setSelectedDevice(dev);
              setCurrentScreen('device-detail');
            }}
            onOpenNotifications={() => setCurrentScreen('notifications')}
            onOpenAlerts={() => setCurrentScreen('alerts')}
          />
        );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Nội dung màn hình chính */}
      <View style={styles.screenArea}>
        {renderActiveScreen()}
      </View>

      {/* Thanh điều hướng đáy (Bottom Navigation Bar) */}
      <SafeAreaView style={styles.bottomNavSafeArea}>
        <View style={styles.bottomNav}>
          {/* Tab 1: Tổng quan / Thiết bị */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setCurrentScreen('dashboard')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={currentScreen === 'dashboard' ? 'grid' : 'grid-outline'}
              size={22}
              color={currentScreen === 'dashboard' ? '#0f766e' : '#64748b'}
            />
            <Text style={[styles.navLabel, currentScreen === 'dashboard' && styles.activeNavLabel]}>
              Thiết bị
            </Text>
          </TouchableOpacity>

          {/* Tab 2: Cảnh báo trực tiếp (Live Alerts) */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setCurrentScreen('alerts')}
            activeOpacity={0.7}
          >
            <View style={styles.iconWithBadge}>
              <Ionicons
                name={currentScreen === 'alerts' ? 'flame' : 'flame-outline'}
                size={24}
                color={criticalCount > 0 ? '#ef4444' : currentScreen === 'alerts' ? '#0f766e' : '#64748b'}
              />
              {criticalCount > 0 && (
                <View style={styles.alertDotBadge}>
                  <Text style={styles.dotBadgeText}>{criticalCount}</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.navLabel,
                currentScreen === 'alerts' && styles.activeNavLabel,
                criticalCount > 0 && { color: '#ef4444', fontWeight: '800' }
              ]}
            >
              Cảnh báo
            </Text>
          </TouchableOpacity>

          {/* Tab 3: Thông báo (Notifications) */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setCurrentScreen('notifications')}
            activeOpacity={0.7}
          >
            <View style={styles.iconWithBadge}>
              <Ionicons
                name={currentScreen === 'notifications' ? 'notifications' : 'notifications-outline'}
                size={23}
                color={currentScreen === 'notifications' ? '#0f766e' : '#64748b'}
              />
              {unreadNotificationsCount > 0 && (
                <View style={styles.unreadDotBadge}>
                  <Text style={styles.dotBadgeText}>
                    {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.navLabel, currentScreen === 'notifications' && styles.activeNavLabel]}>
              Thông báo
            </Text>
          </TouchableOpacity>

          {/* Tab 4: Cài đặt (Settings) */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setCurrentScreen('settings')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={currentScreen === 'settings' ? 'settings' : 'settings-outline'}
              size={22}
              color={currentScreen === 'settings' ? '#0f766e' : '#64748b'}
            />
            <Text style={[styles.navLabel, currentScreen === 'settings' && styles.activeNavLabel]}>
              Cài đặt
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AlertProvider>
        <DevicesProvider>
          <MainApp />
        </DevicesProvider>
      </AlertProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b'
  },
  screenArea: {
    flex: 1
  },
  bottomNavSafeArea: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  bottomNav: {
    flexDirection: 'row',
    height: 58,
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#ffffff'
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4
  },
  iconWithBadge: {
    position: 'relative'
  },
  alertDotBadge: {
    position: 'absolute',
    top: -3,
    right: -8,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center'
  },
  unreadDotBadge: {
    position: 'absolute',
    top: -3,
    right: -8,
    backgroundColor: '#0f766e',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center'
  },
  dotBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800'
  },
  navLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2
  },
  activeNavLabel: {
    color: '#0f766e',
    fontWeight: '700'
  }
});
