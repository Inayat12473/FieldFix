/**
 * FieldFix — Technician Dashboard.
 * Complete field technician command center with live status toggle,
 * KPI metrics, active job banner, actionable assigned queue, and job filtering.
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
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Colors, Typography, Spacing, BorderRadius, Shadows,
  getStatusColor, getPriorityColor, formatStatus,
} from '../../constants/theme';
import Button from '../../components/Button';
import OfflineBanner from '../../components/OfflineBanner';
import { useAuthStore } from '../../store/authStore';
import { technicianService } from '../../services/technician';
import { serviceRequestService, ServiceRequestDetail } from '../../services/serviceRequests';
import { offlineQueue } from '../../services/offlineQueue';
import { TechnicianProfile, TechnicianDashboardStats, ServiceRequest } from '../../types';

interface TechnicianDashboardProps {
  onViewJob: (requestId: string) => void;
  onOpenNotifications?: () => void;
}

export default function TechnicianDashboard({
  onViewJob,
  onOpenNotifications,
}: TechnicianDashboardProps) {
  const { user, logout } = useAuthStore();

  const [profile, setProfile] = useState<TechnicianProfile | null>(null);
  const [stats, setStats] = useState<TechnicianDashboardStats | null>(null);
  const [activeJob, setActiveJob] = useState<ServiceRequestDetail | null>(null);
  const [jobs, setJobs] = useState<ServiceRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'ASSIGNED' | 'ACTIVE' | 'COMPLETED'>('ALL');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    try {
      const [profileData, statsData, activeJobData, jobsData] = await Promise.all([
        technicianService.getProfile().catch(() => null),
        technicianService.getStats().catch(() => null),
        technicianService.getActiveJob().catch(() => null),
        serviceRequestService.list({ per_page: 50 }).catch(() => ({ items: [] })),
      ]);

      if (profileData) setProfile(profileData);
      if (statsData) setStats(statsData);
      setActiveJob(activeJobData);

      if (jobsData.items && jobsData.items.length > 0) {
        setJobs(jobsData.items);
        await offlineQueue.cacheRequests(jobsData.items);
      } else if (offlineQueue.isOffline()) {
        const cached = await offlineQueue.getCachedRequests();
        if (cached && cached.length > 0) {
          setJobs(cached);
        }
      } else {
        setJobs(jobsData.items || []);
      }
    } catch {
      // If network fails, attempt to read from offline cache
      const cached = await offlineQueue.getCachedRequests();
      if (cached && cached.length > 0) {
        setJobs(cached);
      } else {
        Alert.alert('Offline Mode', 'Operating offline with local cache.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleToggleAvailability = async () => {
    if (!profile) return;
    setTogglingStatus(true);
    const newStatus = !profile.is_available;
    try {
      const updated = await technicianService.updateStatus({ is_available: newStatus });
      setProfile(updated);
      Alert.alert(
        'Status Updated',
        newStatus
          ? 'You are now Online & Available for new assignments.'
          : 'You are now Off-Duty / Busy.'
      );
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to update status.');
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleQuickAccept = async (requestId: string) => {
    setActionLoadingId(requestId);
    try {
      await serviceRequestService.updateStatus(requestId, 'ACCEPTED', 'Accepted via quick action');
      await loadDashboardData();
      Alert.alert('Accepted', `Job ${requestId} accepted!`);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to accept job.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleQuickDecline = async (requestId: string) => {
    Alert.alert(
      'Decline Job',
      `Are you sure you want to decline ${requestId}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(requestId);
            try {
              await serviceRequestService.updateStatus(requestId, 'NEW', 'Declined by technician');
              await loadDashboardData();
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.detail || 'Failed to decline job.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  // Filter jobs based on active tab
  const filteredJobs = jobs.filter((job) => {
    if (activeTab === 'ASSIGNED') return job.status === 'ASSIGNED';
    if (activeTab === 'ACTIVE') {
      return ['ACCEPTED', 'EN_ROUTE', 'IN_PROGRESS'].includes(job.status);
    }
    if (activeTab === 'COMPLETED') {
      return ['COMPLETED', 'CUSTOMER_CONFIRMED', 'CLOSED'].includes(job.status);
    }
    return true;
  });

  const assignedJobs = jobs.filter((j) => j.status === 'ASSIGNED');

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading Technician Dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOnline = profile?.is_available ?? true;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Offline Sync Banner & Dead-Zone Simulator */}
      <OfflineBanner onSyncComplete={loadDashboardData} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadDashboardData();
            }}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Header with Availability Toggle */}
        <View style={styles.headerBg}>
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View>
                <Text style={styles.greeting}>Field Operations</Text>
                <Text style={styles.userName}>
                  {user?.full_name || 'Technician'}
                </Text>
                {profile?.employee_id && (
                  <Text style={styles.employeeBadge}>ID: {profile.employee_id}</Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                {onOpenNotifications && (
                  <TouchableOpacity
                    onPress={onOpenNotifications}
                    style={styles.headerNotifBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 18 }}>🔔</Text>
                  </TouchableOpacity>
                )}

                {/* Status Toggle Button */}
                <TouchableOpacity
                  style={[
                    styles.statusToggle,
                    isOnline ? styles.statusToggleOnline : styles.statusToggleOffline,
                  ]}
                  onPress={handleToggleAvailability}
                  disabled={togglingStatus}
                >
                  {togglingStatus ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: isOnline ? Colors.success : Colors.error },
                        ]}
                      />
                      <Text style={styles.statusToggleText}>
                        {isOnline ? 'Online' : 'Off-Duty'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Skills chip row */}
            {profile?.skills && profile.skills.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.skillsRow}>
                {profile.skills.map((s) => (
                  <View key={s.id} style={styles.skillChip}>
                    <Text style={styles.skillChipText}>
                      {s.category_name} (Lvl {s.proficiency_level})
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>

        {/* KPI Metrics Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: Colors.warning }]}>
              {stats?.assigned_count ?? 0}
            </Text>
            <Text style={styles.statLabel}>Assigned</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: Colors.primary }]}>
              {stats?.active_count ?? 0}
            </Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: Colors.success }]}>
              {stats?.completed_today ?? 0}
            </Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: Colors.secondary }]}>
              ⭐ {stats?.average_rating ?? '5.0'}
            </Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>

        {/* Hero Banner: Currently Active Job */}
        {activeJob ? (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>⚡ Active Job in Progress</Text>
              <View style={[styles.liveDot, { backgroundColor: getStatusColor(activeJob.status) }]} />
            </View>

            <TouchableOpacity
              style={styles.heroCard}
              onPress={() => onViewJob(activeJob.request_id)}
              activeOpacity={0.88}
            >
              <View style={styles.heroHeader}>
                <View style={styles.heroIdGroup}>
                  <Text style={styles.heroRequestId}>{activeJob.request_id}</Text>
                  <View
                    style={[
                      styles.heroStatusBadge,
                      { backgroundColor: getStatusColor(activeJob.status) + '22' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.heroStatusText,
                        { color: getStatusColor(activeJob.status) },
                      ]}
                    >
                      {formatStatus(activeJob.status)}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.heroPriorityBadge,
                    { backgroundColor: getPriorityColor(activeJob.priority) + '20' },
                  ]}
                >
                  <Text
                    style={[
                      styles.heroPriorityText,
                      { color: getPriorityColor(activeJob.priority) },
                    ]}
                  >
                    {activeJob.priority}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroJobTitle} numberOfLines={1}>
                {activeJob.title}
              </Text>

              <View style={styles.heroInfoRow}>
                <Text style={styles.heroInfoIcon}>👤</Text>
                <Text style={styles.heroInfoText}>{activeJob.customer_name}</Text>
              </View>

              <View style={styles.heroInfoRow}>
                <Text style={styles.heroInfoIcon}>📍</Text>
                <Text style={styles.heroInfoText} numberOfLines={1}>
                  {activeJob.location_address}
                </Text>
              </View>

              {/* Action Button inside Card */}
              <View style={styles.heroActionRow}>
                <Button
                  title={
                    activeJob.status === 'ACCEPTED'
                      ? 'Start Route (En Route) 🚗'
                      : activeJob.status === 'EN_ROUTE'
                      ? 'Arrived — Start Work ⏱️'
                      : 'View & Complete Service 🛠️'
                  }
                  onPress={() => onViewJob(activeJob.request_id)}
                  size="sm"
                  style={{ flex: 1 }}
                />
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Actionable Assigned Queue */}
        {assignedJobs.length > 0 && (
          <View style={styles.section}>
            <View style={styles.assignedAlertHeader}>
              <Text style={styles.assignedAlertTitle}>
                🔔 New Assignments ({assignedJobs.length})
              </Text>
            </View>

            {assignedJobs.map((req) => (
              <View key={req.id} style={styles.assignedActionCard}>
                <TouchableOpacity
                  onPress={() => onViewJob(req.request_id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardRequestId}>{req.request_id}</Text>
                    <View
                      style={[
                        styles.priorityBadgeSmall,
                        { backgroundColor: getPriorityColor(req.priority) + '20' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.priorityTextSmall,
                          { color: getPriorityColor(req.priority) },
                        ]}
                      >
                        {req.priority}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{req.title}</Text>
                  <Text style={styles.cardLocation} numberOfLines={1}>
                    📍 {req.location_address}
                  </Text>
                </TouchableOpacity>

                {/* 1-tap Accept/Decline action buttons */}
                <View style={styles.quickActionRow}>
                  <TouchableOpacity
                    style={[styles.quickBtn, styles.quickAcceptBtn]}
                    onPress={() => handleQuickAccept(req.request_id)}
                    disabled={actionLoadingId === req.request_id}
                  >
                    {actionLoadingId === req.request_id ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.quickAcceptText}>✓ Accept Job</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.quickBtn, styles.quickDeclineBtn]}
                    onPress={() => handleQuickDecline(req.request_id)}
                    disabled={actionLoadingId === req.request_id}
                  >
                    <Text style={styles.quickDeclineText}>✕ Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Filter Tabs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Work Orders</Text>

          <View style={styles.tabBar}>
            {(['ALL', 'ACTIVE', 'ASSIGNED', 'COMPLETED'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text
                  style={[
                    styles.tabItemText,
                    activeTab === tab && styles.tabItemTextActive,
                  ]}
                >
                  {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Job List */}
          {filteredJobs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No {activeTab.toLowerCase()} jobs</Text>
              <Text style={styles.emptySubtitle}>
                Jobs assigned to you will appear in this list.
              </Text>
            </View>
          ) : (
            filteredJobs.map((job) => {
              const statusColor = getStatusColor(job.status);
              const priorityColor = getPriorityColor(job.priority);
              return (
                <TouchableOpacity
                  key={job.id}
                  style={styles.jobCard}
                  onPress={() => onViewJob(job.request_id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.requestIdGroup}>
                      <Text style={styles.cardRequestId}>{job.request_id}</Text>
                      <View
                        style={[
                          styles.statusBadgeSmall,
                          { backgroundColor: statusColor + '18' },
                        ]}
                      >
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.statusTextSmall, { color: statusColor }]}>
                          {formatStatus(job.status)}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.priorityBadgeSmall,
                        { backgroundColor: priorityColor + '18' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.priorityTextSmall,
                          { color: priorityColor },
                        ]}
                      >
                        {job.priority}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {job.title}
                  </Text>

                  <View style={styles.cardMetaRow}>
                    <Text style={styles.cardMetaText}>
                      🔧 {job.category_name} • 👤 {job.customer_name}
                    </Text>
                  </View>

                  <Text style={styles.cardLocation} numberOfLines={1}>
                    📍 {job.location_address}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Technician Profile Card & Logout */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile & Credentials</Text>
          <View style={styles.profileCard}>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Technician</Text>
              <Text style={styles.profileValue}>{user?.full_name}</Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Employee ID</Text>
              <Text style={styles.profileValue}>{profile?.employee_id || 'TEC-AUTO'}</Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Completed Jobs</Text>
              <Text style={styles.profileValue}>{profile?.completed_jobs_count ?? 0}</Text>
            </View>
            <View style={[styles.profileRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.profileLabel}>Email</Text>
              <Text style={styles.profileValue}>{user?.email}</Text>
            </View>
          </View>

          <Button
            title="Sign Out"
            onPress={logout}
            variant="outline"
            style={{ marginTop: Spacing.md }}
          />
        </View>
      </ScrollView>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  loadingText: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  scrollContent: {
    paddingBottom: Spacing.xxxl * 2,
  },
  headerBg: {
    backgroundColor: Colors.primary,
    paddingBottom: Spacing.xxl,
    borderBottomLeftRadius: BorderRadius.xl,
    borderBottomRightRadius: BorderRadius.xl,
  },
  header: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: 50,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: {
    ...Typography.bodySm,
    color: 'rgba(255,255,255,0.7)',
  },
  userName: {
    ...Typography.h2,
    color: Colors.white,
  },
  employeeBadge: {
    ...Typography.captionMedium,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  headerNotifBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  statusToggleOnline: {
    backgroundColor: 'rgba(56, 161, 105, 0.35)',
    borderWidth: 1,
    borderColor: Colors.success,
  },
  statusToggleOffline: {
    backgroundColor: 'rgba(229, 62, 62, 0.35)',
    borderWidth: 1,
    borderColor: Colors.error,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusToggleText: {
    ...Typography.captionMedium,
    color: Colors.white,
    fontWeight: '700',
  },
  skillsRow: {
    marginTop: Spacing.md,
  },
  skillChip: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.xs,
  },
  skillChipText: {
    ...Typography.caption,
    color: Colors.white,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginTop: -Spacing.md,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    ...Shadows.md,
  },
  statNumber: {
    ...Typography.h3,
    marginBottom: 2,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontSize: 11,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.textPrimary,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderLeftWidth: 5,
    borderLeftColor: Colors.primary,
    ...Shadows.md,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  heroIdGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  heroRequestId: {
    ...Typography.bodySmMedium,
    color: Colors.primary,
    fontWeight: '700',
  },
  heroStatusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  heroStatusText: {
    ...Typography.caption,
    fontWeight: '700',
  },
  heroPriorityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  heroPriorityText: {
    ...Typography.caption,
    fontWeight: '700',
  },
  heroJobTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  heroInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: Spacing.xs,
  },
  heroInfoIcon: {
    fontSize: 13,
  },
  heroInfoText: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    flex: 1,
  },
  heroActionRow: {
    marginTop: Spacing.md,
  },
  assignedAlertHeader: {
    backgroundColor: Colors.warning + '18',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  assignedAlertTitle: {
    ...Typography.bodySmMedium,
    color: Colors.warning,
    fontWeight: '700',
  },
  assignedActionCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning + '40',
    ...Shadows.sm,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAcceptBtn: {
    backgroundColor: Colors.success,
  },
  quickAcceptText: {
    ...Typography.bodySmMedium,
    color: Colors.white,
    fontWeight: '700',
  },
  quickDeclineBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickDeclineText: {
    ...Typography.bodySmMedium,
    color: Colors.textSecondary,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.md,
    padding: 4,
    marginBottom: Spacing.md,
  },
  tabItem: {
    flex: 1,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  tabItemActive: {
    backgroundColor: Colors.surface,
    ...Shadows.sm,
  },
  tabItemText: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  tabItemTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  jobCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  requestIdGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cardRequestId: {
    ...Typography.bodySmMedium,
    color: Colors.primary,
    fontWeight: '600',
  },
  statusBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  statusTextSmall: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: '600',
  },
  priorityBadgeSmall: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
  },
  priorityTextSmall: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: '700',
  },
  cardTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  cardMetaRow: {
    marginBottom: 4,
  },
  cardMetaText: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  cardLocation: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xxl,
    alignItems: 'center',
    ...Shadows.sm,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    marginBottom: Spacing.xxs,
  },
  emptySubtitle: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  profileCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  profileLabel: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
  },
  profileValue: {
    ...Typography.bodySmMedium,
    color: Colors.textPrimary,
  },
});
