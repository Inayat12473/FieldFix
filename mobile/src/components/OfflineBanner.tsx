/**
 * FieldFix — Offline Sync Banner Component.
 * Provides visual feedback for connection status, pending sync queue count,
 * and a one-tap toggle for simulating dead-zone connectivity in field demos.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { offlineQueue, QueuedAction } from '../services/offlineQueue';

interface OfflineBannerProps {
  onSyncComplete?: () => void;
}

export default function OfflineBanner({ onSyncComplete }: OfflineBannerProps) {
  const [isOffline, setIsOffline] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queueModalVisible, setQueueModalVisible] = useState(false);
  const [queuedItems, setQueuedItems] = useState<QueuedAction[]>([]);

  useEffect(() => {
    const unsubscribe = offlineQueue.addListener((offline, count) => {
      setIsOffline(offline);
      setQueueCount(count);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleToggleOffline = async () => {
    const nextState = !isOffline;
    await offlineQueue.setOffline(nextState);
    if (!nextState && queueCount > 0) {
      handleManualSync();
    }
  };

  const handleManualSync = async () => {
    if (isOffline) {
      Alert.alert(
        'Offline Mode Active',
        'You are currently in simulated offline mode. Switch back online to synchronize pending actions?',
        [
          { text: 'Stay Offline', style: 'cancel' },
          {
            text: 'Go Online & Sync',
            onPress: async () => {
              await offlineQueue.setOffline(false);
              triggerSync();
            },
          },
        ]
      );
      return;
    }

    triggerSync();
  };

  const triggerSync = async () => {
    setIsSyncing(true);
    try {
      const result = await offlineQueue.processQueue();
      if (result.synced > 0) {
        Alert.alert(
          'Synchronization Complete',
          `Successfully synchronized ${result.synced} action${result.synced !== 1 ? 's' : ''} to server.`
        );
      } else if (result.failed > 0) {
        Alert.alert('Sync Alert', `${result.failed} item(s) could not be synchronized.`);
      }
      if (onSyncComplete) onSyncComplete();
    } catch (err: any) {
      Alert.alert('Sync Error', err?.message || 'Failed to sync queue.');
    } finally {
      setIsSyncing(false);
    }
  };

  const openQueueModal = async () => {
    const items = await offlineQueue.getQueue();
    setQueuedItems(items);
    setQueueModalVisible(true);
  };

  return (
    <>
      <View
        style={[
          styles.container,
          isOffline ? styles.offlineContainer : styles.onlineContainer,
        ]}
      >
        <View style={styles.leftRow}>
          <View
            style={[
              styles.statusDot,
              isOffline ? styles.offlineDot : styles.onlineDot,
            ]}
          />
          <Text style={[styles.statusText, isOffline && styles.offlineText]}>
            {isOffline ? 'OFFLINE MODE (Dead Zone)' : 'ONLINE'}
          </Text>
          {queueCount > 0 && (
            <TouchableOpacity onPress={openQueueModal} style={styles.queueBadge}>
              <Text style={styles.queueBadgeText}>
                {queueCount} QUEUED
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.actionRow}>
          {queueCount > 0 && !isOffline && (
            <TouchableOpacity
              onPress={triggerSync}
              disabled={isSyncing}
              style={styles.syncBtn}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.syncBtnText}>Sync Now</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleToggleOffline}
            style={[
              styles.toggleBtn,
              isOffline ? styles.goOnlineBtn : styles.goOfflineBtn,
            ]}
          >
            <Text
              style={[
                styles.toggleBtnText,
                isOffline ? styles.goOnlineBtnText : styles.goOfflineBtnText,
              ]}
            >
              {isOffline ? 'Go Online' : 'Simulate Offline'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Queue Inspector Modal */}
      <Modal
        visible={queueModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setQueueModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Offline Sync Queue</Text>
                <Text style={styles.modalSubtitle}>
                  {queuedItems.length} mutation{queuedItems.length !== 1 ? 's' : ''} stored locally
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setQueueModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.queueList} showsVerticalScrollIndicator={false}>
              {queuedItems.length === 0 ? (
                <Text style={styles.emptyQueueText}>Queue is empty.</Text>
              ) : (
                queuedItems.map((item, idx) => (
                  <View key={item.id} style={styles.queueItem}>
                    <View style={styles.queueItemHeader}>
                      <View style={styles.queueTypeBadge}>
                        <Text style={styles.queueTypeBadgeText}>
                          #{idx + 1} {item.type}
                        </Text>
                      </View>
                      <Text style={styles.queueItemTime}>
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    {item.requestId && (
                      <Text style={styles.queueRequestId}>Request: {item.requestId}</Text>
                    )}
                    <Text style={styles.queuePayload} numberOfLines={3}>
                      {JSON.stringify(item.payload, null, 2)}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={async () => {
                  await offlineQueue.clearQueue();
                  setQueuedItems([]);
                  setQueueModalVisible(false);
                }}
                style={styles.clearBtn}
              >
                <Text style={styles.clearBtnText}>Clear Queue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  setQueueModalVisible(false);
                  if (isOffline) {
                    await offlineQueue.setOffline(false);
                  }
                  triggerSync();
                }}
                style={styles.modalSyncBtn}
              >
                <Text style={styles.modalSyncBtnText}>Sync All Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
  },
  onlineContainer: {
    backgroundColor: '#F8FAFC',
    borderBottomColor: Colors.borderLight,
  },
  offlineContainer: {
    backgroundColor: '#FFFBEB',
    borderBottomColor: '#FDE68A',
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineDot: {
    backgroundColor: Colors.success,
  },
  offlineDot: {
    backgroundColor: '#D97706',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  offlineText: {
    color: '#B45309',
  },
  queueBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginLeft: Spacing.xs,
  },
  queueBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  syncBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  syncBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.white,
  },
  toggleBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  toggleBtnText: {
    fontSize: 10,
    fontWeight: '600',
  },
  goOfflineBtn: {
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  goOfflineBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  goOnlineBtn: {
    borderColor: '#D97706',
    backgroundColor: '#FEF3C7',
  },
  goOnlineBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    maxHeight: '80%',
    ...Shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  queueList: {
    maxHeight: 350,
  },
  emptyQueueText: {
    ...Typography.bodySm,
    color: Colors.textTertiary,
    textAlign: 'center',
    paddingVertical: Spacing.xxl,
  },
  queueItem: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  queueItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xxs,
  },
  queueTypeBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  queueTypeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.white,
  },
  queueItemTime: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  queueRequestId: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  queuePayload: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
    marginTop: Spacing.xxs,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  clearBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.error,
  },
  clearBtnText: {
    ...Typography.bodySmMedium,
    color: Colors.error,
  },
  modalSyncBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  modalSyncBtnText: {
    ...Typography.bodySmMedium,
    color: Colors.white,
  },
});
