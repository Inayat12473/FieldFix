/**
 * FieldFix — Create Service Request Screen.
 * Full form for customers to submit a new maintenance request.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Colors, Typography, Spacing, BorderRadius, Shadows, getPriorityColor } from '../../constants/theme';
import TextInput from '../../components/TextInput';
import Button from '../../components/Button';
import { ServiceCategory } from '../../types';
import { serviceRequestService, CreateServiceRequestData } from '../../services/serviceRequests';

interface CreateRequestScreenProps {
  onBack: () => void;
  onCreated: () => void;
}

const PRIORITIES = [
  { value: 'LOW', label: 'Low', icon: '🟢' },
  { value: 'MEDIUM', label: 'Medium', icon: '🟡' },
  { value: 'HIGH', label: 'High', icon: '🟠' },
  { value: 'URGENT', label: 'Urgent', icon: '🔴' },
];

const CATEGORY_ICONS: Record<string, string> = {
  snowflake: '❄️',
  zap: '⚡',
  'arrow-up': '🛗',
  'battery-charging': '🔋',
  droplet: '💧',
  wifi: '📡',
  flame: '🔥',
  camera: '📷',
  settings: '🔧',
  thermometer: '🌡️',
};

export default function CreateRequestScreen({ onBack, onCreated }: CreateRequestScreenProps) {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [locationAddress, setLocationAddress] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await serviceRequestService.getCategories();
      setCategories(data);
    } catch {
      Alert.alert('Error', 'Failed to load service categories.');
    } finally {
      setLoadingCategories(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!categoryId) newErrors.category = 'Please select a service category';
    if (!title.trim() || title.trim().length < 5) newErrors.title = 'Title must be at least 5 characters';
    if (!description.trim() || description.trim().length < 10) newErrors.description = 'Description must be at least 10 characters';
    if (!locationAddress.trim() || locationAddress.trim().length < 5) newErrors.location = 'Location must be at least 5 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !categoryId) return;
    setSubmitting(true);

    try {
      const data: CreateServiceRequestData = {
        category_id: categoryId,
        title: title.trim(),
        description: description.trim(),
        priority,
        location_address: locationAddress.trim(),
      };

      await serviceRequestService.create(data);
      Alert.alert('Success', 'Service request created successfully!', [
        { text: 'OK', onPress: onCreated },
      ]);
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Failed to create request.';
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  const clearError = (field: string) => {
    if (errors[field]) {
      setErrors(prev => { const u = { ...prev }; delete u[field]; return u; });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Service Request</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Category Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Category</Text>
          {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}

          {loadingCategories ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.lg }} />
          ) : (
            <View style={styles.categoryGrid}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryCard,
                    categoryId === cat.id && styles.categorySelected,
                  ]}
                  onPress={() => { setCategoryId(cat.id); clearError('category'); }}
                >
                  <Text style={styles.categoryIcon}>
                    {CATEGORY_ICONS[cat.icon || ''] || '🔧'}
                  </Text>
                  <Text style={[
                    styles.categoryName,
                    categoryId === cat.id && styles.categoryNameSelected,
                  ]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Priority */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Priority</Text>
          <View style={styles.priorityRow}>
            {PRIORITIES.map(p => (
              <TouchableOpacity
                key={p.value}
                style={[
                  styles.priorityChip,
                  priority === p.value && {
                    backgroundColor: getPriorityColor(p.value),
                    borderColor: getPriorityColor(p.value),
                  },
                ]}
                onPress={() => setPriority(p.value)}
              >
                <Text style={styles.priorityIcon}>{p.icon}</Text>
                <Text style={[
                  styles.priorityLabel,
                  priority === p.value && { color: Colors.white },
                ]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>

          <TextInput
            label="Title"
            placeholder="Brief summary of the issue"
            value={title}
            onChangeText={t => { setTitle(t); clearError('title'); }}
            error={errors.title}
            required
          />

          <TextInput
            label="Description"
            placeholder="Describe the problem in detail..."
            value={description}
            onChangeText={t => { setDescription(t); clearError('description'); }}
            error={errors.description}
            multiline
            numberOfLines={4}
            style={{ minHeight: 100, textAlignVertical: 'top' }}
            required
          />
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>

          <TextInput
            label="Address / Location"
            placeholder="Building, floor, room number"
            value={locationAddress}
            onChangeText={t => { setLocationAddress(t); clearError('location'); }}
            error={errors.location}
            required
          />
        </View>

        {/* Submit */}
        <Button
          title="Submit Request"
          onPress={handleSubmit}
          loading={submitting}
          style={styles.submitBtn}
        />

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingTop: 50,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 20,
    color: Colors.textPrimary,
  },
  headerTitle: {
    ...Typography.h4,
    color: Colors.textPrimary,
  },

  scrollContent: {
    padding: Spacing.xxl,
  },

  section: {
    marginBottom: Spacing.xxl,
  },
  sectionTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    marginBottom: Spacing.sm,
  },

  // Categories
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  categoryCard: {
    width: '30%',
    flexGrow: 1,
    minWidth: 95,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  categorySelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  categoryIcon: {
    fontSize: 24,
    marginBottom: Spacing.xs,
  },
  categoryName: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  categoryNameSelected: {
    color: Colors.primary,
  },

  // Priority
  priorityRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  priorityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
  },
  priorityIcon: {
    fontSize: 12,
  },
  priorityLabel: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },

  submitBtn: {
    marginTop: Spacing.md,
  },
});
