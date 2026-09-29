/**
 * FieldFix — Customer Dashboard.
 * Shows real stats, recent service requests, and quick actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Colors, Typography, Spacing, BorderRadius, Shadows,
  getStatusColor, getPriorityColor, formatStatus,
} from '../../constants/theme';
import Button from '../../components/Button';
import { useAuthStore } from '../../store/authStore';
import {
  serviceRequestService,
  DashboardStats,
  ServiceRequestListResponse,
} from '../../services/serviceRequests';
import { ServiceRequest } from '../../types';

interface CustomerDashboardProps {
  onCreateRequest: () => void;
  onViewRequest: (requestId: string) => void;
  onOpenNotifications?: () => void;
}

export default function CustomerDashboard({
  onCreateRequest,
  onViewRequest,
  onOpenNotifications,
}: CustomerDashboardProps) {
  const { user, logout } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [totalRequests, setTotalRequests] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [statsData, requestsData] = await Promise.all([
        serviceRequestService.getDashboardStats(),
        serviceRequestService.list({ page: 1, per_page: 10 }),
      ]);
      setStats(statsData);
      setRequests(requestsData.items);
      setTotalRequests(requestsData.total);
    } catch {
      // Silently handle — user can pull to refresh
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>Welcome back,</Text>
              <Text style={styles.userName}>{user?.full_name || 'Customer'}</Text>
            </View>
            <View style={styles.headerActions}>
              {onOpenNotifications && (
                <TouchableOpacity
                  onPress={onOpenNotifications}
                  style={styles.notifBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.notifIcon}>🔔</Text>
                  {(stats?.unread_notifications ?? 0) > 0 && (
                    <View style={styles.notifBadge}>
                      <Text style={styles.notifBadgeText}>
                        {stats?.unread_notifications}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    user?.full_name || 'My Account',
                    `Email: ${user?.email || 'N/A'}\nRole: Customer\nPhone: ${user?.phone || 'Not provided'}`,
                    [{ text: 'Close' }]
                  );
                }}
                style={styles.avatar}
                activeOpacity={0.8}
              >
                <Text style={styles.avatarText}>
                  {user?.full_name?.charAt(0)?.toUpperCase() || 'C'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Stats Overview */}
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.xxl }} />
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard
                number={stats?.open_requests ?? 0}
                label="Open"
                color={Colors.statusNew}
                bgColor={Colors.infoBg}
              />
              <StatCard
                number={stats?.in_progress_requests ?? 0}
                label="In Progress"
                color={Colors.statusInProgress}
                bgColor={Colors.warningBg}
              />
              <StatCard
                number={stats?.completed_requests ?? 0}
                label="Completed"
                color={Colors.success}
                bgColor={Colors.successBg}
              />
            </View>

            {/* Quick Action */}
            <TouchableOpacity style={styles.actionCard} onPress={onCreateRequest}>
              <Text style={styles.actionIcon}>🛠️</Text>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>New Service Request</Text>
                <Text style={styles.actionSubtitle}>
                  Report a maintenance issue
                </Text>
              </View>
              <Text style={styles.actionArrow}>→</Text>
            </TouchableOpacity>

            {/* Recent Requests */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Requests</Text>
                {totalRequests > 0 && (
                  <Text style={styles.sectionCount}>{totalRequests} total</Text>
                )}
              </View>

              {requests.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>📋</Text>
                  <Text style={styles.emptyTitle}>No Service Requests Yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Tap "New Service Request" above to get started.
                  </Text>
                </View>
              ) : (
                requests.map(req => (
                  <RequestCard
                    key={req.id}
                    request={req}
                    onPress={() => onViewRequest(req.request_id)}
                  />
                ))
              )}
            </View>

            {/* Profile card */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your Profile</Text>
              <View style={styles.infoCard}>
                <InfoRow label="Name" value={user?.full_name || '-'} />
                <InfoRow label="Email" value={user?.email || '-'} />
                <InfoRow label="Phone" value={user?.phone || 'Not set'} />
              </View>
            </View>

            <Button
              title="Sign Out"
              onPress={logout}
              variant="outline"
              style={styles.logoutButton}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ number, label, color, bgColor }: {
  number: number; label: string; color: string; bgColor: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: bgColor }]}>
      <Text style={[styles.statNumber, { color }]}>{number}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RequestCard({ request, onPress }: { request: ServiceRequest; onPress: () => void }) {
  const statusColor = getStatusColor(request.status);
  const priorityColor = getPriorityColor(request.priority);

  return (
    <TouchableOpacity style={styles.requestCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.requestCardTop}>
        <View style={styles.requestMeta}>
          <Text style={styles.requestId}>{request.request_id}</Text>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.requestStatus, { color: statusColor }]}>
            {formatStatus(request.status)}
          </Text>
        </View>
        <View style={[styles.priorityBadge, { backgroundColor: priorityColor }]}>
          <Text style={styles.priorityText}>{request.priority}</Text>
        </View>
      </View>
      <Text style={styles.requestTitle} numberOfLines={1}>{request.title}</Text>
      <View style={styles.requestBottom}>
        <Text style={styles.requestCategory}>{request.category_name}</Text>
        <Text style={styles.requestDate}>
          {new Date(request.created_at).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.xxl, paddingTop: 50 },

  header: { marginBottom: Spacing.xxl },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  greeting: { ...Typography.bodySm, color: Colors.textSecondary },
  userName: { ...Typography.h2, color: Colors.textPrimary },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  notifIcon: {
    fontSize: 20,
  },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: Colors.error,
    borderRadius: BorderRadius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    ...Typography.caption,
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  avatar: {
    width: 48, height: 48, borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { ...Typography.h4, color: Colors.white },

  // Stats
  statsRow: {
    flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xxl,
  },
  statCard: {
    flex: 1, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center',
  },
  statNumber: { ...Typography.h2, marginBottom: Spacing.xs },
  statLabel: { ...Typography.captionMedium, color: Colors.textSecondary },

  // Action
  actionCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, flexDirection: 'row', alignItems: 'center',
    marginBottom: Spacing.xxl, ...Shadows.md,
  },
  actionIcon: { fontSize: 28, marginRight: Spacing.md },
  actionContent: { flex: 1 },
  actionTitle: { ...Typography.bodyMedium, color: Colors.textPrimary },
  actionSubtitle: { ...Typography.caption, color: Colors.textSecondary },
  actionArrow: { ...Typography.h3, color: Colors.textTertiary },

  // Section
  section: { marginBottom: Spacing.xxl },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: { ...Typography.h4, color: Colors.textPrimary },
  sectionCount: { ...Typography.caption, color: Colors.textTertiary },

  // Empty state
  emptyState: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.xxxl, alignItems: 'center', ...Shadows.sm,
  },
  emptyIcon: { fontSize: 40, marginBottom: Spacing.md },
  emptyTitle: { ...Typography.bodyMedium, color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptySubtitle: { ...Typography.bodySm, color: Colors.textSecondary, textAlign: 'center' },

  // Request card
  requestCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.sm,
  },
  requestCardTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  requestMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  requestId: { ...Typography.captionMedium, color: Colors.textTertiary },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  requestStatus: { ...Typography.captionMedium },
  priorityBadge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full,
  },
  priorityText: { ...Typography.captionMedium, color: Colors.white, fontSize: 10 },
  requestTitle: { ...Typography.bodyMedium, color: Colors.textPrimary, marginBottom: Spacing.sm },
  requestBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  requestCategory: { ...Typography.caption, color: Colors.textSecondary },
  requestDate: { ...Typography.caption, color: Colors.textTertiary },

  // Info card
  infoCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, ...Shadows.sm,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  infoLabel: { ...Typography.bodySm, color: Colors.textSecondary },
  infoValue: { ...Typography.bodySmMedium, color: Colors.textPrimary },

  logoutButton: { marginTop: Spacing.sm, marginBottom: Spacing.xxxl },
});
