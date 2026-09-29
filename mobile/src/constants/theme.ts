/**
 * FieldFix — Design system constants.
 * Centralized colors, typography, and spacing.
 */

export const Colors = {
  // Primary brand palette
  primary: '#2563EB',        // Blue 600
  primaryDark: '#1D4ED8',    // Blue 700
  primaryLight: '#3B82F6',   // Blue 500
  primaryBg: '#EFF6FF',      // Blue 50

  // Accent
  accent: '#F59E0B',         // Amber 500
  accentDark: '#D97706',     // Amber 600
  secondary: '#8B5CF6',      // Purple 500

  // Status colors
  success: '#10B981',        // Emerald 500
  successBg: '#ECFDF5',
  warning: '#F59E0B',        // Amber 500
  warningBg: '#FFFBEB',
  error: '#EF4444',          // Red 500
  errorBg: '#FEF2F2',
  info: '#3B82F6',           // Blue 500
  infoBg: '#EFF6FF',

  // Neutrals
  white: '#FFFFFF',
  background: '#F8FAFC',     // Slate 50
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',     // Slate 100
  surfaceSecondary: '#F1F5F9', // Slate 100 alias
  border: '#E2E8F0',         // Slate 200
  borderLight: '#F1F5F9',    // Slate 100
  textPrimary: '#0F172A',    // Slate 900
  textSecondary: '#475569',  // Slate 600
  textTertiary: '#94A3B8',   // Slate 400
  textInverse: '#FFFFFF',
  disabled: '#CBD5E1',       // Slate 300
  overlay: 'rgba(15, 23, 42, 0.5)',

  // Priority colors
  priorityLow: '#10B981',
  priorityMedium: '#F59E0B',
  priorityHigh: '#EF4444',
  priorityUrgent: '#DC2626',

  // Status badge colors
  statusNew: '#3B82F6',
  statusAssigned: '#8B5CF6',
  statusAccepted: '#06B6D4',
  statusEnRoute: '#F59E0B',
  statusInProgress: '#F97316',
  statusCompleted: '#10B981',
  statusConfirmed: '#059669',
  statusClosed: '#6B7280',
};

export const Typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36 },
  h2: { fontSize: 24, fontWeight: '700' as const, lineHeight: 32 },
  h3: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
  h4: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyMedium: { fontSize: 16, fontWeight: '500' as const, lineHeight: 24 },
  bodySm: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodySmMedium: { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
  captionMedium: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  label: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
  button: { fontSize: 16, fontWeight: '600' as const, lineHeight: 24 },
  buttonSm: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
};

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  section: 40,
};

export const BorderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
};

/**
 * Get status color from status string.
 */
export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    NEW: Colors.statusNew,
    ASSIGNED: Colors.statusAssigned,
    ACCEPTED: Colors.statusAccepted,
    EN_ROUTE: Colors.statusEnRoute,
    IN_PROGRESS: Colors.statusInProgress,
    COMPLETED: Colors.statusCompleted,
    CUSTOMER_CONFIRMED: Colors.statusConfirmed,
    CLOSED: Colors.statusClosed,
  };
  return map[status] || Colors.textTertiary;
}

/**
 * Get priority color from priority string.
 */
export function getPriorityColor(priority: string): string {
  const map: Record<string, string> = {
    LOW: Colors.priorityLow,
    MEDIUM: Colors.priorityMedium,
    HIGH: Colors.priorityHigh,
    URGENT: Colors.priorityUrgent,
  };
  return map[priority] || Colors.textTertiary;
}

/**
 * Format a status string for display.
 */
export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}
