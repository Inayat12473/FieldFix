/**
 * FieldFix — Login Screen.
 * Professional login with email/password, validation, and error handling.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import TextInput from '../../components/TextInput';
import Button from '../../components/Button';
import { useAuthStore } from '../../store/authStore';

interface LoginScreenProps {
  onNavigateToRegister: () => void;
}

export default function LoginScreen({ onNavigateToRegister }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const { login, isLoading, error, clearError } = useAuthStore();

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Enter a valid email address';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    clearError();
    if (!validate()) return;

    try {
      await login({ email: email.trim().toLowerCase(), password });
    } catch {
      // Error is set in the store
    }
  };

  const fillDemoCredentials = (role: 'customer' | 'technician' | 'admin') => {
    clearError();
    setErrors({});
    switch (role) {
      case 'customer':
        setEmail('customer@fieldfix.com');
        setPassword('Customer@123');
        break;
      case 'technician':
        setEmail('raj.kumar@fieldfix.com');
        setPassword('Tech@123');
        break;
      case 'admin':
        setEmail('admin@fieldfix.com');
        setPassword('Admin@123');
        break;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoIcon}>🔧</Text>
          </View>
          <Text style={styles.title}>FieldFix</Text>
          <Text style={styles.subtitle}>Field Service Management</Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome Back</Text>
          <Text style={styles.cardSubtitle}>
            Sign in to your account to continue
          </Text>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          )}

          <TextInput
            label="Email"
            placeholder="Enter your email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            required
          />

          <TextInput
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            error={errors.password}
            isPassword
            autoComplete="password"
            required
          />

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={isLoading}
            style={styles.loginButton}
          />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity onPress={onNavigateToRegister}>
            <Text style={styles.registerLink}>
              Don't have an account?{' '}
              <Text style={styles.registerLinkBold}>Create Account</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Demo Credentials */}
        <View style={styles.demoSection}>
          <Text style={styles.demoTitle}>Quick Demo Login</Text>
          <View style={styles.demoButtons}>
            <TouchableOpacity
              style={[styles.demoButton, styles.demoCustomer]}
              onPress={() => fillDemoCredentials('customer')}
            >
              <Text style={styles.demoButtonIcon}>👤</Text>
              <Text style={styles.demoButtonText}>Customer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.demoButton, styles.demoTech]}
              onPress={() => fillDemoCredentials('technician')}
            >
              <Text style={styles.demoButtonIcon}>🔧</Text>
              <Text style={styles.demoButtonText}>Technician</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.demoButton, styles.demoAdmin]}
              onPress={() => fillDemoCredentials('admin')}
            >
              <Text style={styles.demoButtonIcon}>⚙️</Text>
              <Text style={styles.demoButtonText}>Admin</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xxl,
    paddingTop: 60,
    paddingBottom: Spacing.xxxl,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  logoIcon: {
    fontSize: 36,
  },
  title: {
    ...Typography.h1,
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    ...Shadows.md,
  },
  cardTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  cardSubtitle: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xxl,
  },

  // Error banner
  errorBanner: {
    backgroundColor: Colors.errorBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  errorBannerText: {
    ...Typography.bodySm,
    color: Colors.error,
  },

  loginButton: {
    marginTop: Spacing.sm,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    ...Typography.caption,
    color: Colors.textTertiary,
    marginHorizontal: Spacing.lg,
  },

  // Register link
  registerLink: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  registerLinkBold: {
    color: Colors.primary,
    fontWeight: '600',
  },

  // Demo section
  demoSection: {
    marginTop: Spacing.xxl,
    alignItems: 'center',
  },
  demoTitle: {
    ...Typography.captionMedium,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  demoButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  demoCustomer: {
    backgroundColor: Colors.infoBg,
  },
  demoTech: {
    backgroundColor: Colors.warningBg,
  },
  demoAdmin: {
    backgroundColor: Colors.surfaceAlt,
  },
  demoButtonIcon: {
    fontSize: 14,
  },
  demoButtonText: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
});
