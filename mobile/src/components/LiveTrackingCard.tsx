/**
 * FieldFix — Live Tracking & ETA Card.
 * Real-time map, distance, and transit ETA card for customers & technicians.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import {
  Colors, Typography, Spacing, BorderRadius, Shadows,
} from '../constants/theme';
import { locationService } from '../services/location';
import { TrackingInfo } from '../types';

interface LiveTrackingCardProps {
  requestId: string;
  isTechnician?: boolean;
  onRefreshNeeded?: () => void;
}

export default function LiveTrackingCard({
  requestId,
  isTechnician = false,
  onRefreshNeeded,
}: LiveTrackingCardProps) {
  const [tracking, setTracking] = useState<TrackingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinging, setPinging] = useState(false);
  const pollTimerRef = useRef<any>(null);

  const fetchTracking = async () => {
    try {
      const data = await locationService.getTracking(requestId);
      setTracking(data);
    } catch {
      // Quiet fail on polling error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();

    // Auto-poll every 12 seconds when tracking is active
    pollTimerRef.current = setInterval(() => {
      fetchTracking();
    }, 12000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [requestId]);

  const handleCall = () => {
    if (tracking?.technician_phone) {
      Linking.openURL(`tel:${tracking.technician_phone}`);
    } else {
      Alert.alert('Phone Call', `Dialing ${tracking?.technician_name || 'technician'}`);
    }
  };

  const handleOpenMap = () => {
    if (!tracking) return;
    let url = '';
    if (tracking.destination_lat && tracking.destination_lng) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${tracking.destination_lat},${tracking.destination_lng}`;
      if (tracking.technician_lat && tracking.technician_lng) {
        url += `&origin=${tracking.technician_lat},${tracking.technician_lng}`;
      }
    } else {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        tracking.destination_address
      )}`;
    }
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open map directions.');
    });
  };

  const handleSimulateMovement = async () => {
    if (!tracking) return;
    const destLat = tracking.destination_lat || 28.6139;
    const destLng = tracking.destination_lng || 77.2090;
    const currentLat = tracking.technician_lat || destLat + 0.04;
    const currentLng = tracking.technician_lng || destLng + 0.04;

    const waypoint = locationService.calculateNextWaypoint(
      currentLat,
      currentLng,
      destLat,
      destLng,
      0.35 // Move 35% closer
    );

    setPinging(true);
    try {
      await locationService.pingLocation(waypoint.lat, waypoint.lng);
      await fetchTracking();
      if (onRefreshNeeded) onRefreshNeeded();
    } catch (err: any) {
      Alert.alert('Ping Error', err?.response?.data?.detail || 'Failed to ping location.');
    } finally {
      setPinging(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={styles.loadingText}>Fetching live location...</Text>
      </View>
    );
  }

  if (!tracking || !tracking.technician_name) {
    return null;
  }

  const isEnRoute = tracking.is_en_route;

  return (
    <View style={styles.card}>
      {/* Live Header with Pulsing Dot */}
      <View style={styles.headerRow}>
        <View style={styles.liveIndicatorGroup}>
          <View style={[styles.pulseDot, isEnRoute && styles.pulseDotActive]} />
          <Text style={styles.liveTitle}>
            {isEnRoute ? 'Live Technician Transit' : 'Technician Assigned'}
          </Text>
        </View>
        <Text style={styles.statusTag}>
          {tracking.status === 'EN_ROUTE' ? '🚗 ON THE WAY' : tracking.status}
        </Text>
      </View>

      {/* Transit Radar Diagram */}
      <View style={styles.transitDiagram}>
        {/* Origin (Technician) */}
        <View style={styles.transitNode}>
          <View style={styles.techIconBubble}>
            <Text style={{ fontSize: 18 }}>🚗</Text>
          </View>
          <Text style={styles.transitNodeLabel}>Technician</Text>
          <Text style={styles.transitNodeSub} numberOfLines={1}>
            {tracking.technician_name}
          </Text>
        </View>

        {/* Route Line & Live Meters */}
        <View style={styles.transitLineContainer}>
          <View style={styles.transitLine} />
          <View style={styles.distanceBadge}>
            <Text style={styles.distanceText}>
              {tracking.distance_km !== null
                ? `${tracking.distance_km} km`
                : 'Tracking...'}
            </Text>
          </View>
        </View>

        {/* Destination (Customer Site) */}
        <View style={styles.transitNode}>
          <View style={styles.destIconBubble}>
            <Text style={{ fontSize: 18 }}>📍</Text>
          </View>
          <Text style={styles.transitNodeLabel}>Site Location</Text>
          <Text style={styles.transitNodeSub} numberOfLines={1}>
            {tracking.destination_address.split(',')[0]}
          </Text>
        </View>
      </View>

      {/* Metrics Row: ETA & Distance */}
      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>ESTIMATED ARRIVAL</Text>
          <Text style={styles.metricValue}>
            {tracking.estimated_duration_minutes !== null
              ? `~${tracking.estimated_duration_minutes} mins`
              : 'Estimating...'}
          </Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>DISTANCE</Text>
          <Text style={styles.metricValue}>
            {tracking.distance_km !== null
              ? `${tracking.distance_km} km`
              : 'In Range'}
          </Text>
        </View>
      </View>

      {/* Actions: Contact & Navigation */}
      <View style={styles.actionsRow}>
        {!isTechnician && tracking.technician_phone && (
          <TouchableOpacity style={[styles.actionBtn, styles.callBtn]} onPress={handleCall}>
            <Text style={styles.actionBtnText}>📞 Call {tracking.technician_name.split(' ')[0]}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.actionBtn, styles.mapBtn]} onPress={handleOpenMap}>
          <Text style={styles.actionBtnText}>🗺️ Open Navigation</Text>
        </TouchableOpacity>
      </View>

      {/* Technician Simulation Control */}
      {isTechnician && isEnRoute && (
        <TouchableOpacity
          style={styles.simulateBtn}
          onPress={handleSimulateMovement}
          disabled={pinging}
        >
          {pinging ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.simulateBtnText}>
              🚗 Ping Next Waypoint (Drive Simulation)
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '25',
    ...Shadows.md,
  },
  loadingText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  liveIndicatorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.textTertiary,
  },
  pulseDotActive: {
    backgroundColor: Colors.success,
  },
  liveTitle: {
    ...Typography.bodySmMedium,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  statusTag: {
    ...Typography.captionMedium,
    color: Colors.primary,
    fontWeight: '700',
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  transitDiagram: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.md,
  },
  transitNode: {
    alignItems: 'center',
    width: 85,
  },
  techIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  destIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.error + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  transitNodeLabel: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  transitNodeSub: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.textTertiary,
  },
  transitLineContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  transitLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.primaryLight,
  },
  distanceBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    zIndex: 1,
  },
  distanceText: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.white,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  metricLabel: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: '700',
    marginBottom: 2,
  },
  metricValue: {
    ...Typography.h3,
    color: Colors.primaryDark,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtn: {
    backgroundColor: Colors.primaryBg,
  },
  mapBtn: {
    backgroundColor: Colors.primary,
  },
  actionBtnText: {
    ...Typography.bodySmMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  simulateBtn: {
    backgroundColor: Colors.secondary,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  simulateBtnText: {
    ...Typography.captionMedium,
    color: Colors.white,
    fontWeight: '700',
  },
});
