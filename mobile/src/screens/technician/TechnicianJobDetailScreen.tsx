/**
 * FieldFix — Technician Job Detail Screen.
 * Complete field workflow execution screen for technicians.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  Linking,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Colors, Typography, Spacing, BorderRadius, Shadows,
  getStatusColor, getPriorityColor, formatStatus,
} from '../../constants/theme';
import Button from '../../components/Button';
import LiveTrackingCard from '../../components/LiveTrackingCard';
import OfflineBanner from '../../components/OfflineBanner';
import {
  serviceRequestService,
  ServiceRequestDetail,
  StatusHistoryItem,
  ServiceNote,
} from '../../services/serviceRequests';
import { photoService } from '../../services/photos';
import { offlineQueue } from '../../services/offlineQueue';
import { ServicePhoto, ServiceRating, PhotoType } from '../../types';

interface TechnicianJobDetailScreenProps {
  requestId: string;
  onBack: () => void;
  onJobUpdated?: () => void;
}

export default function TechnicianJobDetailScreen({
  requestId,
  onBack,
  onJobUpdated,
}: TechnicianJobDetailScreenProps) {
  const [request, setRequest] = useState<ServiceRequestDetail | null>(null);
  const [notes, setNotes] = useState<ServiceNote[]>([]);
  const [photos, setPhotos] = useState<ServicePhoto[]>([]);
  const [rating, setRating] = useState<ServiceRating | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Photo state
  const [photoFilter, setPhotoFilter] = useState<'all' | 'before' | 'after'>('all');
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [photoTypeToUpload, setPhotoTypeToUpload] = useState<PhotoType>('before');
  const [photoCaption, setPhotoCaption] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Note creation state
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Completion modal state
  const [completionModalVisible, setCompletionModalVisible] = useState(false);
  const [completionNote, setCompletionNote] = useState('');

  // Rejection modal state
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    loadData();
  }, [requestId]);

  const loadData = async () => {
    try {
      const [reqData, notesData, photosData, ratingData] = await Promise.all([
        serviceRequestService.get(requestId),
        serviceRequestService.listNotes(requestId).catch(() => []),
        photoService.listPhotos(requestId).catch(() => []),
        photoService.getRating(requestId).catch(() => null),
      ]);
      setRequest(reqData);
      setNotes(notesData);
      setPhotos(photosData);
      setRating(ratingData);
    } catch {
      Alert.alert('Error', 'Failed to load job details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleStatusTransition = async (nextStatus: string, note?: string) => {
    // Offline mode: optimistic update + queue mutation
    if (offlineQueue.isOffline()) {
      if (request) {
        setRequest({
          ...request,
          status: nextStatus as any,
          status_history: [
            ...(request.status_history || []),
            {
              id: Date.now(),
              from_status: request.status,
              to_status: nextStatus,
              changed_by_name: 'You (Offline)',
              note: note || `Offline update to ${nextStatus}`,
              created_at: new Date().toISOString(),
            },
          ],
        });
      }
      await offlineQueue.enqueue('STATUS_UPDATE', { status: nextStatus, note }, requestId);
      if (onJobUpdated) onJobUpdated();
      Alert.alert(
        'Action Queued Offline',
        `Job status updated to ${formatStatus(nextStatus)} locally. It will automatically synchronize when connectivity is restored.`
      );
      return;
    }

    setActionLoading(true);
    try {
      await serviceRequestService.updateStatus(requestId, nextStatus, note);
      await loadData();
      if (onJobUpdated) onJobUpdated();
      Alert.alert('Success', `Job status updated to ${formatStatus(nextStatus)}`);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to update job status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCallCustomer = () => {
    if (request?.assigned_technician_phone) {
      // In a real app we'd have customer phone; we fallback to tel:
      Linking.openURL(`tel:${request.assigned_technician_phone}`);
    } else {
      Alert.alert('Phone Call', `Dialing customer ${request?.customer_name}`);
    }
  };

  const handleOpenMaps = () => {
    if (!request?.location_address) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      request.location_address
    )}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open map navigation.');
    });
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    // Offline mode: optimistic note append
    if (offlineQueue.isOffline()) {
      const offlineNote = {
        id: Date.now(),
        service_request_id: request?.id || 0,
        author_id: 0,
        author_name: 'You (Offline)',
        content: newNote.trim(),
        created_at: new Date().toISOString(),
      };
      setNotes((prev) => [offlineNote, ...prev]);
      await offlineQueue.enqueue('ADD_NOTE', { content: newNote.trim() }, requestId);
      setNewNote('');
      Alert.alert('Note Queued', 'Note saved locally in offline sync queue.');
      return;
    }

    setAddingNote(true);
    try {
      const added = await serviceRequestService.addNote(requestId, newNote.trim());
      setNotes((prev) => [added, ...prev]);
      setNewNote('');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to add note.');
    } finally {
      setAddingNote(false);
    }
  };

  const handleCompleteJob = async () => {
    if (!completionNote.trim()) {
      Alert.alert('Note Required', 'Please provide a brief summary of the work performed.');
      return;
    }
    setCompletionModalVisible(false);
    await handleStatusTransition('COMPLETED', completionNote.trim());
    setCompletionNote('');
  };

  const handleRejectJob = async () => {
    setRejectModalVisible(false);
    await handleStatusTransition('NEW', rejectReason.trim() || 'Declined by technician');
    setRejectReason('');
    onBack();
  };

  const handleOpenPhotoModal = (type: PhotoType) => {
    setPhotoTypeToUpload(type);
    setPhotoCaption('');
    setPhotoModalVisible(true);
  };

  const handleConfirmPhotoUpload = async () => {
    setUploadingPhoto(true);
    try {
      const sampleUrl =
        photoTypeToUpload === 'before'
          ? 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500'
          : 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=500';

      // Offline mode: optimistic photo upload
      if (offlineQueue.isOffline()) {
        const offlinePhoto: ServicePhoto = {
          id: Date.now(),
          service_request_id: request?.id || 0,
          uploaded_by_id: 0,
          uploaded_by_name: 'You (Offline)',
          photo_type: photoTypeToUpload,
          file_name: `${photoTypeToUpload}_${Date.now()}.jpg`,
          file_url: sampleUrl,
          file_size: 102400,
          caption: photoCaption.trim() || null,
          created_at: new Date().toISOString(),
        };
        setPhotos((prev) => [offlinePhoto, ...prev]);
        await offlineQueue.enqueue(
          'UPLOAD_PHOTO',
          {
            fileUri: sampleUrl,
            photoType: photoTypeToUpload,
            caption: photoCaption.trim() || undefined,
            fileName: `${photoTypeToUpload}_${Date.now()}.jpg`,
          },
          requestId
        );
        setPhotoModalVisible(false);
        setPhotoCaption('');
        Alert.alert(
          'Photo Queued',
          'Photo recorded locally in offline queue. It will upload when back online.'
        );
        return;
      }

      const uploaded = await photoService.uploadPhoto({
        requestId,
        fileUri: sampleUrl,
        photoType: photoTypeToUpload,
        caption: photoCaption.trim() || undefined,
        fileName: `${photoTypeToUpload}_${Date.now()}.jpg`,
      });

      setPhotos((prev) => [uploaded, ...prev]);
      setPhotoModalVisible(false);
      setPhotoCaption('');
      Alert.alert('Photo Uploaded', `Successfully uploaded ${photoTypeToUpload} service photo.`);
    } catch (err: any) {
      Alert.alert('Upload Error', err?.response?.data?.detail || 'Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (photoId: number) => {
    Alert.alert(
      'Delete Photo',
      'Are you sure you want to remove this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await photoService.deletePhoto(requestId, photoId);
              setPhotos((prev) => prev.filter((p) => p.id !== photoId));
              Alert.alert('Deleted', 'Photo removed.');
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.detail || 'Could not delete photo.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorMsg}>Job details not found</Text>
          <Button title="Go Back" onPress={onBack} variant="outline" fullWidth={false} />
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getStatusColor(request.status);
  const priorityColor = getPriorityColor(request.priority);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Offline Sync Banner & Dead-Zone Simulator */}
      <OfflineBanner onSyncComplete={loadData} />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{request.request_id}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Status & Priority Ribbon */}
        <View style={styles.badgeRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {formatStatus(request.status)}
            </Text>
          </View>
          <View style={[styles.priorityBadge, { backgroundColor: priorityColor + '18' }]}>
            <Text style={[styles.priorityText, { color: priorityColor }]}>
              {request.priority} PRIORITY
            </Text>
          </View>
        </View>

        {/* Title & Category Card */}
        <View style={styles.card}>
          <View style={styles.categoryChip}>
            <Text style={styles.categoryIcon}>{request.category_icon || '🔧'}</Text>
            <Text style={styles.categoryName}>{request.category_name}</Text>
          </View>
          <Text style={styles.jobTitle}>{request.title}</Text>
          <Text style={styles.jobDescription}>{request.description}</Text>
        </View>

        {/* Customer & Location Card with Quick Actions */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Customer & Location</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Customer</Text>
            <Text style={styles.infoValue}>{request.customer_name}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={[styles.infoValue, { flex: 1, textAlign: 'right' }]}>
              {request.location_address}
            </Text>
          </View>

          {/* Quick Contact Action Buttons */}
          <View style={styles.contactActionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.callBtn]}
              onPress={handleCallCustomer}
            >
              <Text style={styles.actionBtnText}>📞 Call Customer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.mapBtn]}
              onPress={handleOpenMaps}
            >
              <Text style={styles.actionBtnText}>📍 Navigate / Map</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Transit & Waypoint Simulator (when accepted, en route, or in progress) */}
        {['ACCEPTED', 'EN_ROUTE', 'IN_PROGRESS'].includes(request.status) && (
          <LiveTrackingCard
            requestId={request.request_id}
            isTechnician={true}
            onRefreshNeeded={loadData}
          />
        )}

        {/* Workflow Action Bar */}
        <View style={styles.workflowSection}>
          <Text style={styles.sectionHeader}>Technician Workflow</Text>

          {request.status === 'ASSIGNED' && (
            <View style={styles.actionButtonGroup}>
              <Text style={styles.workflowHint}>
                You have been assigned to this service request. Accept to commit or decline to release to other technicians.
              </Text>
              <Button
                title="Accept Job"
                onPress={() => handleStatusTransition('ACCEPTED', 'Accepted by technician')}
                loading={actionLoading}
                style={{ backgroundColor: Colors.success, marginBottom: Spacing.sm }}
              />
              <Button
                title="Decline Job"
                onPress={() => setRejectModalVisible(true)}
                variant="outline"
                loading={actionLoading}
              />
            </View>
          )}

          {request.status === 'ACCEPTED' && (
            <View style={styles.actionButtonGroup}>
              <Text style={styles.workflowHint}>
                Job accepted. When you are leaving for the customer's location, tap below.
              </Text>
              <Button
                title="Start Route (En Route) 🚗"
                onPress={() => handleStatusTransition('EN_ROUTE', 'Technician is en route')}
                loading={actionLoading}
              />
            </View>
          )}

          {request.status === 'EN_ROUTE' && (
            <View style={styles.actionButtonGroup}>
              <Text style={styles.workflowHint}>
                You are marked as En Route. When you arrive at the site, tap below to begin service.
              </Text>
              <Button
                title="Arrived at Location (Start Work) ⏱️"
                onPress={() => handleStatusTransition('IN_PROGRESS', 'Technician arrived and began service')}
                loading={actionLoading}
                style={{ backgroundColor: Colors.warning }}
              />
            </View>
          )}

          {request.status === 'IN_PROGRESS' && (
            <View style={styles.actionButtonGroup}>
              <Text style={styles.workflowHint}>
                Work is currently in progress. Once all repairs and diagnostics are completed, tap below.
              </Text>
              <Button
                title="Complete Service ✅"
                onPress={() => setCompletionModalVisible(true)}
                loading={actionLoading}
                style={{ backgroundColor: Colors.success }}
              />
            </View>
          )}

          {request.status === 'COMPLETED' && (
            <View style={styles.statusNotice}>
              <Text style={styles.statusNoticeIcon}>⏳</Text>
              <Text style={styles.statusNoticeTitle}>Service Completed</Text>
              <Text style={styles.statusNoticeText}>
                Awaiting customer sign-off and confirmation.
              </Text>
            </View>
          )}

          {request.status === 'CUSTOMER_CONFIRMED' && (
            <View style={[styles.statusNotice, { backgroundColor: Colors.success + '15' }]}>
              <Text style={styles.statusNoticeIcon}>⭐</Text>
              <Text style={[styles.statusNoticeTitle, { color: Colors.success }]}>
                Customer Confirmed!
              </Text>
              <Text style={styles.statusNoticeText}>
                The customer confirmed the work has been satisfactorily completed.
              </Text>
            </View>
          )}
        </View>

        {/* Customer Review Card (if rated) */}
        {rating && (
          <View style={styles.techRatingCard}>
            <View style={styles.techRatingHeader}>
              <View style={styles.techRatingBadge}>
                <Text style={styles.techRatingBadgeText}>CUSTOMER REVIEW</Text>
              </View>
              <Text style={styles.techRatingDate}>
                {new Date(rating.created_at).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.techRatingStarsRow}>
              <Text style={styles.techRatingStars}>
                {'⭐'.repeat(rating.rating)}
              </Text>
              <Text style={styles.techRatingScore}>({rating.rating} / 5.0)</Text>
            </View>
            {rating.comment ? (
              <Text style={styles.techRatingComment}>"{rating.comment}"</Text>
            ) : null}
            <Text style={styles.techRatingAuthor}>Rated by: {rating.rated_by_name}</Text>
          </View>
        )}

        {/* Service Photos & Visual Proof Section */}
        <View style={styles.card}>
          <View style={styles.photoSectionHeader}>
            <View>
              <Text style={styles.sectionHeader}>Service Photos ({photos.length})</Text>
              <Text style={styles.photoSectionSub}>Before & after work verification</Text>
            </View>
            <View style={styles.photoActionButtons}>
              <TouchableOpacity
                onPress={() => handleOpenPhotoModal('before')}
                style={[styles.smallPhotoBtn, { backgroundColor: Colors.warning }]}
              >
                <Text style={styles.smallPhotoBtnText}>+ Before</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleOpenPhotoModal('after')}
                style={[styles.smallPhotoBtn, { backgroundColor: Colors.success }]}
              >
                <Text style={styles.smallPhotoBtnText}>+ After</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Photo filter tabs */}
          <View style={styles.photoTabsRow}>
            {(['all', 'before', 'after'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                onPress={() => setPhotoFilter(filter)}
                style={[
                  styles.photoTabChip,
                  photoFilter === filter && styles.photoTabChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.photoTabChipText,
                    photoFilter === filter && styles.photoTabChipTextActive,
                  ]}
                >
                  {filter.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {photos.filter((p) => photoFilter === 'all' || p.photo_type === photoFilter).length === 0 ? (
            <View style={styles.emptyPhotoBox}>
              <Text style={styles.emptyPhotoIcon}>📷</Text>
              <Text style={styles.emptyPhotoText}>
                No {photoFilter !== 'all' ? photoFilter : ''} photos uploaded yet. Use the buttons above to document your work.
              </Text>
            </View>
          ) : (
            <View style={styles.photosGrid}>
              {photos
                .filter((p) => photoFilter === 'all' || p.photo_type === photoFilter)
                .map((photo) => (
                  <View key={photo.id} style={styles.photoItemCard}>
                    <View style={styles.photoItemThumbnail}>
                      <Text style={styles.photoItemThumbIcon}>📸</Text>
                      <View
                        style={[
                          styles.photoItemBadge,
                          photo.photo_type === 'before'
                            ? { backgroundColor: Colors.warning }
                            : photo.photo_type === 'after'
                            ? { backgroundColor: Colors.success }
                            : { backgroundColor: Colors.info },
                        ]}
                      >
                        <Text style={styles.photoItemBadgeText}>
                          {photo.photo_type.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.photoItemDetails}>
                      <Text style={styles.photoItemFilename} numberOfLines={1}>
                        {photo.file_name}
                      </Text>
                      {photo.caption ? (
                        <Text style={styles.photoItemCaption} numberOfLines={2}>
                          {photo.caption}
                        </Text>
                      ) : null}
                      <View style={styles.photoItemBottomRow}>
                        <Text style={styles.photoItemTime}>
                          {new Date(photo.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleDeletePhoto(photo.id)}
                          style={styles.photoDeleteBtn}
                        >
                          <Text style={styles.photoDeleteBtnText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
            </View>
          )}
        </View>

        {/* Field Notes Section */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Field Notes ({notes.length})</Text>

          {/* Add note input */}
          <View style={styles.addNoteContainer}>
            <TextInput
              style={styles.noteInput}
              placeholder="Add observation, parts replaced, or diagnostic note..."
              placeholderTextColor={Colors.textTertiary}
              value={newNote}
              onChangeText={setNewNote}
              multiline
            />
            <Button
              title="Add Note"
              onPress={handleAddNote}
              loading={addingNote}
              size="sm"
              style={{ marginTop: Spacing.sm }}
            />
          </View>

          {notes.length === 0 ? (
            <Text style={styles.emptyNotesText}>No service notes logged yet.</Text>
          ) : (
            notes.map((note) => (
              <View key={note.id} style={styles.noteItem}>
                <View style={styles.noteHeader}>
                  <Text style={styles.noteAuthor}>{note.author_name}</Text>
                  <Text style={styles.noteDate}>
                    {new Date(note.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text style={styles.noteContent}>{note.content}</Text>
              </View>
            ))
          )}
        </View>

        {/* Status Timeline */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Status Timeline</Text>
          {request.status_history?.map((item: StatusHistoryItem, idx: number) => {
            const isLast = idx === (request.status_history?.length || 0) - 1;
            return (
              <View key={item.id} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View
                    style={[
                      styles.timelineDot,
                      isLast && { backgroundColor: Colors.primary },
                    ]}
                  />
                  {!isLast && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineRight}>
                  <Text style={styles.timelineStatus}>
                    {formatStatus(item.to_status)}
                  </Text>
                  <Text style={styles.timelineMeta}>
                    by {item.changed_by_name} •{' '}
                    {new Date(item.created_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  {item.note ? (
                    <Text style={styles.timelineNote}>{item.note}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Completion Modal */}
      <Modal
        visible={completionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCompletionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Complete Job</Text>
            <Text style={styles.modalSubtitle}>
              Please describe what repair, replacement, or testing was performed:
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Replaced capacitor, cleaned air filters, tested cooling pressure at 65 PSI."
              placeholderTextColor={Colors.textTertiary}
              value={completionNote}
              onChangeText={setCompletionNote}
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalButtonRow}>
              <Button
                title="Cancel"
                onPress={() => setCompletionModalVisible(false)}
                variant="outline"
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <Button
                title="Complete"
                onPress={handleCompleteJob}
                loading={actionLoading}
                style={{ flex: 1, backgroundColor: Colors.success }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Rejection Modal */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Decline Job Assignment</Text>
            <Text style={styles.modalSubtitle}>
              Please state why you are declining this job (e.g. out of service area, missing specialized tools):
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reason for declining..."
              placeholderTextColor={Colors.textTertiary}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalButtonRow}>
              <Button
                title="Cancel"
                onPress={() => setRejectModalVisible(false)}
                variant="outline"
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <Button
                title="Decline Job"
                onPress={handleRejectJob}
                loading={actionLoading}
                style={{ flex: 1, backgroundColor: Colors.error }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Photo Upload Modal */}
      <Modal
        visible={photoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Upload Service Photo</Text>
            <Text style={styles.modalSubtitle}>
              Document the condition before or after completing repairs.
            </Text>

            {/* Type selector */}
            <View style={styles.photoTypeSelectorRow}>
              <TouchableOpacity
                onPress={() => setPhotoTypeToUpload('before')}
                style={[
                  styles.photoTypeOption,
                  photoTypeToUpload === 'before' && {
                    backgroundColor: Colors.warning,
                    borderColor: Colors.warning,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.photoTypeOptionText,
                    photoTypeToUpload === 'before' && { color: Colors.white },
                  ]}
                >
                  BEFORE SERVICE
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPhotoTypeToUpload('after')}
                style={[
                  styles.photoTypeOption,
                  photoTypeToUpload === 'after' && {
                    backgroundColor: Colors.success,
                    borderColor: Colors.success,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.photoTypeOptionText,
                    photoTypeToUpload === 'after' && { color: Colors.white },
                  ]}
                >
                  AFTER SERVICE
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Add caption or explanation (e.g. Replaced faulty coil, sealed pipe)..."
              placeholderTextColor={Colors.textTertiary}
              value={photoCaption}
              onChangeText={setPhotoCaption}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalButtonRow}>
              <Button
                title="Cancel"
                onPress={() => setPhotoModalVisible(false)}
                variant="outline"
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <Button
                title="Capture & Upload"
                onPress={handleConfirmPhotoUpload}
                loading={uploadingPhoto}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
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
  errorMsg: {
    ...Typography.bodyMedium,
    color: Colors.error,
    marginBottom: Spacing.lg,
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
  backButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  backText: {
    ...Typography.bodySmMedium,
    color: Colors.white,
  },
  headerTitle: {
    ...Typography.h4,
    color: Colors.white,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl * 2,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...Typography.captionMedium,
    fontWeight: '600',
  },
  priorityBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  priorityText: {
    ...Typography.captionMedium,
    fontWeight: '700',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  categoryIcon: {
    fontSize: 14,
  },
  categoryName: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  jobTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  jobDescription: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  sectionHeader: {
    ...Typography.h4,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  infoLabel: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
  },
  infoValue: {
    ...Typography.bodySmMedium,
    color: Colors.textPrimary,
  },
  contactActionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtn: {
    backgroundColor: Colors.primary + '15',
  },
  mapBtn: {
    backgroundColor: Colors.secondary + '15',
  },
  actionBtnText: {
    ...Typography.bodySmMedium,
    color: Colors.primary,
  },
  workflowSection: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    ...Shadows.sm,
  },
  workflowHint: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },
  actionButtonGroup: {
    marginTop: Spacing.xs,
  },
  statusNotice: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  statusNoticeIcon: {
    fontSize: 32,
    marginBottom: Spacing.xs,
  },
  statusNoticeTitle: {
    ...Typography.h4,
    color: Colors.textPrimary,
    marginBottom: Spacing.xxs,
  },
  statusNoticeText: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  addNoteContainer: {
    marginBottom: Spacing.md,
  },
  noteInput: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.textPrimary,
    minHeight: 60,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  emptyNotesText: {
    ...Typography.bodySm,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  noteItem: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xxs,
  },
  noteAuthor: {
    ...Typography.captionMedium,
    color: Colors.primary,
    fontWeight: '600',
  },
  noteDate: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  noteContent: {
    ...Typography.bodySm,
    color: Colors.textPrimary,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 24,
    marginRight: Spacing.md,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.border,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.borderLight,
    marginTop: 4,
  },
  timelineRight: {
    flex: 1,
    paddingBottom: Spacing.sm,
  },
  timelineStatus: {
    ...Typography.bodySmMedium,
    color: Colors.textPrimary,
  },
  timelineMeta: {
    ...Typography.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  timelineNote: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: '100%',
    ...Shadows.lg,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  modalInput: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.textPrimary,
    minHeight: 90,
    textAlignVertical: 'top',
    fontSize: 14,
    marginBottom: Spacing.lg,
  },
  modalButtonRow: {
    flexDirection: 'row',
  },

  // Customer Review Card for Tech
  techRatingCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    ...Shadows.sm,
  },
  techRatingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  techRatingBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  techRatingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  techRatingDate: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  techRatingStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginVertical: Spacing.xs,
  },
  techRatingStars: {
    fontSize: 22,
  },
  techRatingScore: {
    ...Typography.bodyMedium,
    fontWeight: '700',
    color: '#15803D',
  },
  techRatingComment: {
    ...Typography.bodySm,
    color: Colors.textPrimary,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
    lineHeight: 20,
  },
  techRatingAuthor: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },

  // Service Photos Card
  photoSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  photoSectionSub: {
    ...Typography.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  photoActionButtons: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  smallPhotoBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  smallPhotoBtnText: {
    ...Typography.captionMedium,
    color: Colors.white,
    fontWeight: '700',
    fontSize: 11,
  },
  photoTabsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  photoTabChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceSecondary,
  },
  photoTabChipActive: {
    backgroundColor: Colors.primary,
  },
  photoTabChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  photoTabChipTextActive: {
    color: Colors.white,
  },
  emptyPhotoBox: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.md,
  },
  emptyPhotoIcon: {
    fontSize: 28,
    marginBottom: Spacing.xs,
  },
  emptyPhotoText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  photoItemCard: {
    width: '47%',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  photoItemThumbnail: {
    height: 90,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  photoItemThumbIcon: {
    fontSize: 28,
  },
  photoItemBadge: {
    position: 'absolute',
    top: Spacing.xs,
    left: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  photoItemBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 0.5,
  },
  photoItemDetails: {
    padding: Spacing.sm,
  },
  photoItemFilename: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
  },
  photoItemCaption: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  photoItemBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  photoItemTime: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  photoDeleteBtn: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  photoDeleteBtnText: {
    fontSize: 11,
    color: Colors.error,
    fontWeight: '600',
  },

  // Photo Upload Modal Specific
  photoTypeSelectorRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  photoTypeOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSecondary,
  },
  photoTypeOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
});
