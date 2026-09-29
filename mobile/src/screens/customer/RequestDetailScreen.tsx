/**
 * FieldFix — Service Request Detail Screen.
 * Shows full request info, status timeline, live tracking, photo documentation, and customer rating/review.
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
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Colors, Typography, Spacing, BorderRadius, Shadows,
  getStatusColor, getPriorityColor, formatStatus,
} from '../../constants/theme';
import Button from '../../components/Button';
import LiveTrackingCard from '../../components/LiveTrackingCard';
import { serviceRequestService, ServiceRequestDetail, StatusHistoryItem } from '../../services/serviceRequests';
import { photoService } from '../../services/photos';
import { ServicePhoto, ServiceRating } from '../../types';
import { useAuthStore } from '../../store/authStore';

interface RequestDetailScreenProps {
  requestId: string;
  onBack: () => void;
}

export default function RequestDetailScreen({ requestId, onBack }: RequestDetailScreenProps) {
  const [request, setRequest] = useState<ServiceRequestDetail | null>(null);
  const [photos, setPhotos] = useState<ServicePhoto[]>([]);
  const [ratingData, setRatingData] = useState<ServiceRating | null>(null);
  const [selectedStars, setSelectedStars] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState<string>('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [selectedPhotoFilter, setSelectedPhotoFilter] = useState<'all' | 'before' | 'after' | 'issue'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    loadRequest();
  }, [requestId]);

  const loadRequest = async () => {
    try {
      const [reqData, photoList, ratingRes] = await Promise.all([
        serviceRequestService.get(requestId),
        photoService.listPhotos(requestId).catch(() => []),
        photoService.getRating(requestId).catch(() => null),
      ]);
      setRequest(reqData);
      setPhotos(photoList);
      setRatingData(ratingRes);
      if (ratingRes) {
        setSelectedStars(ratingRes.rating);
        if (ratingRes.comment) setRatingComment(ratingRes.comment);
      }
    } catch {
      Alert.alert('Error', 'Failed to load service request.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSubmitRating = async () => {
    if (selectedStars < 1 || selectedStars > 5) {
      Alert.alert('Rating Required', 'Please select a star rating between 1 and 5.');
      return;
    }

    setSubmittingRating(true);
    try {
      const result = await photoService.submitRating(requestId, selectedStars, ratingComment);
      setRatingData(result);
      Alert.alert('Thank You!', 'Your rating & review have been submitted successfully. Service is now confirmed.');
      await loadRequest();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to submit rating.');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleSimulateCustomerPhotoUpload = async () => {
    Alert.prompt
      ? Alert.prompt(
          'Attach Issue Photo',
          'Enter a description/caption for this photo:',
          async (caption) => {
            try {
              // Simulated photo for demo
              await photoService.uploadPhoto({
                requestId,
                fileUri: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500',
                photoType: 'issue',
                caption: caption || 'Issue photo attached by customer',
                fileName: `issue_${Date.now()}.jpg`,
              });
              Alert.alert('Success', 'Photo uploaded successfully.');
              loadRequest();
            } catch (err: any) {
              Alert.alert('Upload Failed', err?.response?.data?.detail || 'Could not upload photo.');
            }
          }
        )
      : Alert.alert(
          'Attach Issue Photo',
          'Upload simulated diagnostic photo?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Upload',
              onPress: async () => {
                try {
                  await photoService.uploadPhoto({
                    requestId,
                    fileUri: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500',
                    photoType: 'issue',
                    caption: 'Diagnostic photo attached by customer',
                    fileName: `issue_${Date.now()}.jpg`,
                  });
                  Alert.alert('Success', 'Photo uploaded successfully.');
                  loadRequest();
                } catch (err: any) {
                  Alert.alert('Upload Failed', err?.response?.data?.detail || 'Could not upload photo.');
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
          <Text style={styles.errorMsg}>Request not found</Text>
          <Button title="Go Back" onPress={onBack} variant="outline" fullWidth={false} />
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getStatusColor(request.status);
  const priorityColor = getPriorityColor(request.priority);

  const filteredPhotos = photos.filter((p) => {
    if (selectedPhotoFilter === 'all') return true;
    return p.photo_type === selectedPhotoFilter;
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{request.request_id}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusText}>{formatStatus(request.status)}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRequest(); }} />
        }
      >
        {/* Title & Priority */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.requestTitle}>{request.title}</Text>
            <View style={[styles.priorityBadge, { backgroundColor: priorityColor }]}>
              <Text style={styles.priorityText}>{request.priority}</Text>
            </View>
          </View>
          <Text style={styles.description}>{request.description}</Text>
        </View>

        {/* Live Technician Tracking (when assigned and active) */}
        {['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'IN_PROGRESS'].includes(request.status) && (
          <LiveTrackingCard
            requestId={request.request_id}
            onRefreshNeeded={loadRequest}
          />
        )}

        {/* Interactive Customer Rating & Review Box when COMPLETED */}
        {user?.role === 'customer' && request.status === 'COMPLETED' && !ratingData && (
          <View style={styles.ratingCard}>
            <View style={styles.ratingHeader}>
              <Text style={styles.ratingBadge}>ACTION REQUIRED</Text>
              <Text style={styles.ratingTitle}>Rate & Confirm Service</Text>
            </View>
            <Text style={styles.ratingSubtitle}>
              The technician has completed the requested work. Please rate the service quality and confirm completion.
            </Text>

            {/* Interactive Stars */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setSelectedStars(star)}
                  style={styles.starTouch}
                >
                  <Text style={[styles.starIcon, selectedStars >= star ? styles.starFilled : styles.starEmpty]}>
                    ★
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.ratingLabelText}>
              {selectedStars === 5 && 'Outstanding ⭐⭐⭐⭐⭐'}
              {selectedStars === 4 && 'Very Good ⭐⭐⭐⭐'}
              {selectedStars === 3 && 'Average ⭐⭐⭐'}
              {selectedStars === 2 && 'Needs Improvement ⭐⭐'}
              {selectedStars === 1 && 'Poor Service ⭐'}
            </Text>

            {/* Comment input */}
            <TextInput
              style={styles.commentInput}
              placeholder="Write feedback about the technician and service quality (optional)..."
              placeholderTextColor={Colors.textTertiary}
              value={ratingComment}
              onChangeText={setRatingComment}
              multiline
              numberOfLines={3}
            />

            <Button
              title="Submit Review & Confirm Completion"
              onPress={handleSubmitRating}
              loading={submittingRating}
              style={{ marginTop: Spacing.md }}
            />
          </View>
        )}

        {/* Display Rating Card when already rated */}
        {ratingData && (
          <View style={styles.ratedCard}>
            <View style={styles.ratedHeader}>
              <Text style={styles.ratedBadge}>CUSTOMER REVIEW</Text>
              <Text style={styles.ratedDate}>
                {new Date(ratingData.created_at).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.ratedStarsRow}>
              <Text style={styles.ratedStars}>
                {'⭐'.repeat(ratingData.rating)}
              </Text>
              <Text style={styles.ratedScore}>({ratingData.rating} / 5)</Text>
            </View>
            {ratingData.comment ? (
              <Text style={styles.ratedComment}>"{ratingData.comment}"</Text>
            ) : (
              <Text style={styles.ratedNoComment}>Confirmed without written comments.</Text>
            )}
            {ratingData.technician_name && (
              <Text style={styles.ratedTech}>Technician: {ratingData.technician_name}</Text>
            )}
          </View>
        )}

        {/* Photos & Visual Proof Section */}
        <View style={styles.card}>
          <View style={styles.cardSectionHeader}>
            <View>
              <Text style={styles.cardSectionTitle}>Service Photos & Proof</Text>
              <Text style={styles.photoCountText}>{photos.length} photo{photos.length !== 1 ? 's' : ''} attached</Text>
            </View>
            {user?.role === 'customer' && !['COMPLETED', 'CUSTOMER_CONFIRMED', 'CLOSED'].includes(request.status) && (
              <TouchableOpacity
                onPress={handleSimulateCustomerPhotoUpload}
                style={styles.addPhotoBtn}
              >
                <Text style={styles.addPhotoBtnText}>+ Add Photo</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Tabs */}
          <View style={styles.photoFilterRow}>
            {(['all', 'before', 'after', 'issue'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                onPress={() => setSelectedPhotoFilter(filter)}
                style={[
                  styles.photoFilterChip,
                  selectedPhotoFilter === filter && styles.photoFilterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.photoFilterText,
                    selectedPhotoFilter === filter && styles.photoFilterTextActive,
                  ]}
                >
                  {filter.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredPhotos.length === 0 ? (
            <View style={styles.noPhotosBox}>
              <Text style={styles.noPhotosIcon}>📷</Text>
              <Text style={styles.noPhotosText}>No {selectedPhotoFilter !== 'all' ? selectedPhotoFilter : ''} photos uploaded yet.</Text>
            </View>
          ) : (
            <View style={styles.photoGrid}>
              {filteredPhotos.map((photo) => (
                <View key={photo.id} style={styles.photoCard}>
                  <View style={styles.photoThumbnailBox}>
                    <Text style={styles.photoThumbPlaceholder}>📸</Text>
                    <View
                      style={[
                        styles.photoTypeBadge,
                        photo.photo_type === 'before'
                          ? { backgroundColor: Colors.warning }
                          : photo.photo_type === 'after'
                          ? { backgroundColor: Colors.success }
                          : { backgroundColor: Colors.info },
                      ]}
                    >
                      <Text style={styles.photoTypeBadgeText}>
                        {photo.photo_type.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.photoMeta}>
                    <Text style={styles.photoName} numberOfLines={1}>{photo.file_name}</Text>
                    {photo.caption && (
                      <Text style={styles.photoCaption} numberOfLines={2}>{photo.caption}</Text>
                    )}
                    <Text style={styles.photoUploader}>By {photo.uploaded_by_name}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Info Grid */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Request Details</Text>
          <InfoRow label="Category" value={request.category_name} icon={request.category_icon} />
          <InfoRow label="Location" value={request.location_address} />
          <InfoRow label="Created" value={new Date(request.created_at).toLocaleString()} />
          <InfoRow label="Updated" value={new Date(request.updated_at).toLocaleString()} />
          {request.assigned_technician_name && (
            <InfoRow label="Technician" value={request.assigned_technician_name} />
          )}
          {request.assigned_technician_phone && (
            <InfoRow label="Tech Phone" value={request.assigned_technician_phone} />
          )}
        </View>

        {/* Status Timeline */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Status Timeline</Text>
          {request.status_history.map((item, idx) => (
            <TimelineItem
              key={item.id}
              item={item}
              isLast={idx === request.status_history.length - 1}
            />
          ))}
        </View>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: string | null }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>
        {icon ? `${icon} ` : ''}{value}
      </Text>
    </View>
  );
}

function TimelineItem({ item, isLast }: { item: StatusHistoryItem; isLast: boolean }) {
  const color = getStatusColor(item.to_status);
  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineDotColumn}>
        <View style={[styles.timelineDot, { backgroundColor: color }]} />
        {!isLast && <View style={styles.timelineLine} />}
      </View>
      <View style={styles.timelineContent}>
        <View style={styles.timelineHeader}>
          <Text style={[styles.timelineStatus, { color }]}>{formatStatus(item.to_status)}</Text>
          <Text style={styles.timelineTime}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <Text style={styles.timelineBy}>by {item.changed_by_name}</Text>
        {item.note && <Text style={styles.timelineNote}>{item.note}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  errorMsg: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingTop: 50,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 20, color: Colors.textPrimary },
  headerTitle: { ...Typography.h4, color: Colors.textPrimary, flex: 1 },
  statusBadge: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusText: { ...Typography.captionMedium, color: Colors.white },

  scrollContent: { padding: Spacing.lg },

  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, marginBottom: Spacing.lg, ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: Spacing.md,
  },
  cardSectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.md,
  },
  requestTitle: { ...Typography.h4, color: Colors.textPrimary, flex: 1, marginRight: Spacing.md },
  priorityBadge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  priorityText: { ...Typography.captionMedium, color: Colors.white, fontSize: 11 },
  description: { ...Typography.bodySm, color: Colors.textSecondary, lineHeight: 22 },
  cardSectionTitle: {
    ...Typography.label, color: Colors.textPrimary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  photoCountText: {
    ...Typography.caption, color: Colors.textTertiary, marginTop: 2,
  },
  addPhotoBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.full,
  },
  addPhotoBtnText: {
    ...Typography.captionMedium, color: Colors.primary,
  },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  infoLabel: { ...Typography.bodySm, color: Colors.textSecondary },
  infoValue: { ...Typography.bodySmMedium, color: Colors.textPrimary, maxWidth: '60%', textAlign: 'right' },

  // Rating input card
  ratingCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    ...Shadows.md,
  },
  ratingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  ratingBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    letterSpacing: 0.5,
  },
  ratingTitle: {
    ...Typography.bodyMedium,
    color: '#92400E',
    fontWeight: '700',
  },
  ratingSubtitle: {
    ...Typography.bodySm,
    color: '#78350F',
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
    marginVertical: Spacing.sm,
  },
  starTouch: {
    padding: Spacing.xs,
  },
  starIcon: {
    fontSize: 36,
  },
  starFilled: {
    color: '#F59E0B',
  },
  starEmpty: {
    color: '#D1D5DB',
  },
  ratingLabelText: {
    ...Typography.bodySmMedium,
    color: '#92400E',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  commentInput: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#FCD34D',
    ...Typography.bodySm,
    color: Colors.textPrimary,
    minHeight: 70,
    textAlignVertical: 'top',
  },

  // Display submitted rating card
  ratedCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    ...Shadows.sm,
  },
  ratedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  ratedBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.success,
    letterSpacing: 0.5,
  },
  ratedDate: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  ratedStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.xs,
  },
  ratedStars: {
    fontSize: 20,
  },
  ratedScore: {
    ...Typography.bodyMedium,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  ratedComment: {
    ...Typography.bodySm,
    color: Colors.textPrimary,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
    lineHeight: 20,
  },
  ratedNoComment: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  ratedTech: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },

  // Photos Gallery
  photoFilterRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  photoFilterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  photoFilterChipActive: {
    backgroundColor: Colors.primary,
  },
  photoFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  photoFilterTextActive: {
    color: Colors.white,
  },
  noPhotosBox: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: BorderRadius.md,
  },
  noPhotosIcon: {
    fontSize: 28,
    marginBottom: Spacing.xs,
  },
  noPhotosText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  photoCard: {
    width: '47%',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  photoThumbnailBox: {
    height: 100,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  photoThumbPlaceholder: {
    fontSize: 32,
  },
  photoTypeBadge: {
    position: 'absolute',
    top: Spacing.xs,
    left: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  photoTypeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 0.5,
  },
  photoMeta: {
    padding: Spacing.sm,
  },
  photoName: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
  },
  photoCaption: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  photoUploader: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 4,
  },

  // Timeline
  timelineItem: { flexDirection: 'row', marginBottom: Spacing.xs },
  timelineDotColumn: { alignItems: 'center', width: 24, marginRight: Spacing.md },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  timelineLine: { width: 2, flex: 1, backgroundColor: Colors.border, marginVertical: 2 },
  timelineContent: { flex: 1, paddingBottom: Spacing.lg },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timelineStatus: { ...Typography.bodySmMedium },
  timelineTime: { ...Typography.caption, color: Colors.textTertiary },
  timelineBy: { ...Typography.caption, color: Colors.textTertiary, marginTop: 2 },
  timelineNote: { ...Typography.caption, color: Colors.textSecondary, marginTop: 4, fontStyle: 'italic' },
});
