/**
 * FieldFix — Notifications Screen.
 * Full in-app notification center with read status management,
 * filter tabs, and direct navigation to referenced requests.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Colors, Typography, Spacing, BorderRadius, Shadows,
} from '../../constants/theme';
import { notificationService } from '../../services/notifications';
import { AppNotification } from '../../types';

interface NotificationsScreenProps {
  onBack: () => void;
  onSelectRequest?: (requestId: string) => void;
}

export default function NotificationsScreen({
  onBack,
  onSelectRequest,
}: NotificationsScreenProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNREAD'>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await notificationService.list(activeTab === 'UNREAD');
      setNotifications(data);
    } catch {
      Alert.alert('Error', 'Failed to load notifications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkAsRead = async (item: AppNotification) => {
    if (!item.is_read) {
      try {
        await notificationService.markAsRead(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
        );
      } catch {
        // Quiet fail
      }
    }

    if (item.reference_id && onSelectRequest) {
      // In our backend reference_id stores the numeric ID or we can format or query SR ID
      // If reference_id is an ID like 1, we can pass formatted e.g. `SR-${item.reference_id + 1000}` or direct
      onSelectRequest(`SR-${item.reference_id + 1000}`);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await notificationService.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      Alert.alert('Error', 'Failed to mark all as read.');
    } finally {
      setMarkingAll(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'assignment':
        return { icon: '🔧', bg: Colors.primaryBg, color: Colors.primary };
      case 'status_update':
        return { icon: '🚗', bg: Colors.warningBg, color: Colors.warning };
      case 'rating':
        return { icon: '⭐', bg: Colors.successBg, color: Colors.success };
      default:
        return { icon: '🔔', bg: Colors.surfaceAlt, color: Colors.textSecondary };
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backArrow}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity
          onPress={handleMarkAllRead}
          disabled={markingAll || unreadCount === 0}
          style={styles.markAllBtn}
        >
          {markingAll ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text
              style={[
                styles.markAllText,
                unreadCount === 0 && { opacity: 0.5 },
              ]}
            >
              Read All
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'ALL' && styles.tabItemActive]}
          onPress={() => setActiveTab('ALL')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'ALL' && styles.tabTextActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'UNREAD' && styles.tabItemActive]}
          onPress={() => setActiveTab('UNREAD')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'UNREAD' && styles.tabTextActive,
            ]}
          >
            Unread ({unreadCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadNotifications();
              }}
              tintColor={Colors.primary}
            />
          }
        >
          {notifications.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔕</Text>
              <Text style={styles.emptyTitle}>
                {activeTab === 'UNREAD'
                  ? 'No unread notifications'
                  : 'No notifications yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                Alerts about your service requests and assignments will show up here.
              </Text>
            </View>
          ) : (
            notifications.map((item) => {
              const meta = getNotificationIcon(item.notification_type);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.notificationCard,
                    !item.is_read && styles.unreadCard,
                  ]}
                  onPress={() => handleMarkAsRead(item)}
                  activeOpacity={0.8}
                >
                  {/* Icon Bubble */}
                  <View style={[styles.iconBubble, { backgroundColor: meta.bg }]}>
                    <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
                  </View>

                  {/* Message Body */}
                  <View style={styles.textContainer}>
                    <View style={styles.cardTopRow}>
                      <Text style={styles.notificationTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {!item.is_read && <View style={styles.unreadDot} />}
                    </View>

                    <Text style={styles.notificationMessage}>{item.message}</Text>

                    <Text style={styles.timestamp}>
                      {new Date(item.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: 45,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.primary,
  },
  backBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  backArrow: {
    ...Typography.bodySmMedium,
    color: Colors.white,
  },
  headerTitle: {
    ...Typography.h4,
    color: Colors.white,
  },
  markAllBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  markAllText: {
    ...Typography.captionMedium,
    color: Colors.white,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  tabItem: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  tabItemActive: {
    backgroundColor: Colors.primaryBg,
  },
  tabText: {
    ...Typography.bodySmMedium,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl * 2,
  },
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxxl,
    alignItems: 'center',
    marginTop: Spacing.xl,
    ...Shadows.sm,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    ...Typography.h4,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  emptySubtitle: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  notificationTitle: {
    ...Typography.bodySmMedium,
    color: Colors.textPrimary,
    fontWeight: '700',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginLeft: Spacing.xs,
  },
  notificationMessage: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: Spacing.xs,
  },
  timestamp: {
    ...Typography.caption,
    color: Colors.textTertiary,
    fontSize: 11,
  },
});
