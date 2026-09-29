/**
 * FieldFix — Main Application Entry Point.
 * Handles auth state, role-based routing, and screen navigation.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from './src/store/authStore';
import { Colors, Typography, Spacing, BorderRadius } from './src/constants/theme';
import Button from './src/components/Button';
import { BASE_URL } from './src/services/api';
import LoginScreen from './src/screens/auth/LoginScreen';
import RegisterScreen from './src/screens/auth/RegisterScreen';
import CustomerDashboard from './src/screens/customer/CustomerDashboard';
import CreateRequestScreen from './src/screens/customer/CreateRequestScreen';
import RequestDetailScreen from './src/screens/customer/RequestDetailScreen';
import TechnicianDashboard from './src/screens/technician/TechnicianDashboard';
import TechnicianJobDetailScreen from './src/screens/technician/TechnicianJobDetailScreen';
import NotificationsScreen from './src/screens/common/NotificationsScreen';

type AuthScreen = 'login' | 'register';
type CustomerScreen =
  | { name: 'dashboard' }
  | { name: 'createRequest' }
  | { name: 'requestDetail'; requestId: string }
  | { name: 'notifications' };
type TechnicianScreen =
  | { name: 'dashboard' }
  | { name: 'jobDetail'; requestId: string }
  | { name: 'notifications' };

export default function App() {
  const { user, isInitialized, initialize } = useAuthStore();
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [customerScreen, setCustomerScreen] = useState<CustomerScreen>({ name: 'dashboard' });
  const [technicianScreen, setTechnicianScreen] = useState<TechnicianScreen>({ name: 'dashboard' });

  useEffect(() => {
    initialize();
  }, []);

  // Reset to dashboard when user changes (login/logout)
  useEffect(() => {
    setCustomerScreen({ name: 'dashboard' });
    setTechnicianScreen({ name: 'dashboard' });
  }, [user?.id]);

  // Loading / Splash
  if (!isInitialized) {
    return (
      <View style={styles.splash}>
        <StatusBar style="dark" />
        <View style={styles.splashLogo}>
          <Text style={styles.splashIcon}>🔧</Text>
        </View>
        <Text style={styles.splashTitle}>FieldFix</Text>
        <Text style={styles.splashSubtitle}>Field Service Management</Text>
        <ActivityIndicator
          color={Colors.primary}
          size="large"
          style={styles.splashSpinner}
        />
      </View>
    );
  }

  // Not authenticated — show auth screens
  if (!user) {
    if (authScreen === 'register') {
      return (
        <RegisterScreen onNavigateToLogin={() => setAuthScreen('login')} />
      );
    }
    return (
      <LoginScreen onNavigateToRegister={() => setAuthScreen('register')} />
    );
  }

  // Authenticated — role-based routing
  switch (user.role) {
    case 'customer':
      switch (customerScreen.name) {
        case 'createRequest':
          return (
            <CreateRequestScreen
              onBack={() => setCustomerScreen({ name: 'dashboard' })}
              onCreated={() => setCustomerScreen({ name: 'dashboard' })}
            />
          );
        case 'requestDetail':
          return (
            <RequestDetailScreen
              requestId={customerScreen.requestId}
              onBack={() => setCustomerScreen({ name: 'dashboard' })}
            />
          );
        case 'notifications':
          return (
            <NotificationsScreen
              onBack={() => setCustomerScreen({ name: 'dashboard' })}
              onSelectRequest={(requestId) =>
                setCustomerScreen({ name: 'requestDetail', requestId })
              }
            />
          );
        default:
          return (
            <CustomerDashboard
              onCreateRequest={() => setCustomerScreen({ name: 'createRequest' })}
              onViewRequest={(requestId) =>
                setCustomerScreen({ name: 'requestDetail', requestId })
              }
              onOpenNotifications={() =>
                setCustomerScreen({ name: 'notifications' })
              }
            />
          );
      }

    case 'technician':
      if (technicianScreen.name === 'jobDetail') {
        return (
          <TechnicianJobDetailScreen
            requestId={technicianScreen.requestId}
            onBack={() => setTechnicianScreen({ name: 'dashboard' })}
            onJobUpdated={() => {}}
          />
        );
      }
      if (technicianScreen.name === 'notifications') {
        return (
          <NotificationsScreen
            onBack={() => setTechnicianScreen({ name: 'dashboard' })}
            onSelectRequest={(requestId) =>
              setTechnicianScreen({ name: 'jobDetail', requestId })
            }
          />
        );
      }
      return (
        <TechnicianDashboard
          onViewJob={(requestId) =>
            setTechnicianScreen({ name: 'jobDetail', requestId })
          }
          onOpenNotifications={() =>
            setTechnicianScreen({ name: 'notifications' })
          }
        />
      );

    case 'admin': {
      const adminWebUrl = `${BASE_URL.replace('/api/v1', '')}/admin/`;
      return (
        <View style={styles.adminFallback}>
          <StatusBar style="dark" />
          <Text style={styles.adminIcon}>⚙️</Text>
          <Text style={styles.adminTitle}>Admin Dispatcher Console</Text>
          <Text style={styles.adminSubtitle}>
            The FieldFix Fleet Operations & Dispatcher Console is optimized for desktop browsers at:{'\n'}
            {adminWebUrl}
          </Text>
          <View style={styles.adminInfo}>
            <Text style={styles.adminInfoLabel}>Logged in as Administrator</Text>
            <Text style={styles.adminInfoValue}>{user.full_name}</Text>
            <Text style={[styles.adminInfoValue, { color: Colors.textSecondary, marginTop: Spacing.xs }]}>{user.email}</Text>
          </View>
          <View style={{ width: '100%', marginTop: Spacing.xxl }}>
            <Button
              title="Launch Web Console"
              onPress={() => Linking.openURL(adminWebUrl)}
              variant="primary"
              fullWidth
              style={{ marginBottom: Spacing.md }}
            />
            <Button
              title="Sign Out"
              onPress={() => useAuthStore.getState().logout()}
              variant="outline"
              fullWidth
            />
          </View>
        </View>
      );
    }

    default:
      return (
        <View style={styles.splash}>
          <Text style={styles.splashTitle}>Unknown Role</Text>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  splashIcon: {
    fontSize: 42,
  },
  splashTitle: {
    ...Typography.h1,
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  splashSubtitle: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  splashSpinner: {
    marginTop: Spacing.xxxl,
  },

  adminFallback: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
  },
  adminIcon: { fontSize: 48, marginBottom: Spacing.lg },
  adminTitle: { ...Typography.h2, color: Colors.textPrimary, marginBottom: Spacing.sm },
  adminSubtitle: {
    ...Typography.bodySm, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 22,
  },
  adminInfo: { marginTop: Spacing.xxl, alignItems: 'center' },
  adminInfoLabel: {
    ...Typography.captionMedium, color: Colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.xs,
  },
  adminInfoValue: { ...Typography.bodyMedium, color: Colors.textPrimary },
  signOutLink: { ...Typography.bodyMedium, color: Colors.error, marginTop: Spacing.xxl },
});
