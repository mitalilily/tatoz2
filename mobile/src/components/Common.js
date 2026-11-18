import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSite } from '../context/SiteContext';

export function ScreenFrame({ children, backgroundColor = '#ffffff' }) {
  return <SafeAreaView edges={['top', 'left', 'right']} style={[styles.frame, { backgroundColor }]}>{children}</SafeAreaView>;
}

export function ScreenScroll({ children, contentContainerStyle, ...props }) {
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scrollContent, contentContainerStyle]} {...props}>{children}</ScrollView>;
}

export function LoadingView({ label = 'Loading…' }) {
  const { theme } = useSite();
  return <View style={styles.center}><ActivityIndicator color={theme.brand} size="large" /><Text style={styles.muted}>{label}</Text></View>;
}

export function ErrorView({ message, onRetry }) {
  const { theme } = useSite();
  return <View style={styles.center}><Text style={styles.errorText}>{message || 'Could not load this content.'}</Text>{onRetry ? <Pressable onPress={onRetry} style={[styles.retry, { borderColor: theme.brand }]}><Text style={{ color: theme.brand, fontWeight: '700' }}>Try again</Text></Pressable> : null}</View>;
}

export function PrimaryButton({ title, onPress, disabled, loading, style, textStyle }) {
  const { theme } = useSite();
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || loading} style={[styles.primaryButton, { backgroundColor: theme.brand, opacity: disabled || loading ? 0.55 : 1 }, style]}><Text style={[styles.primaryButtonText, textStyle]}>{loading ? 'Please wait…' : title}</Text></Pressable>;
}

export function formatPrice(value, settings = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  const currency = settings.currency || settings.baseCurrency || 'INR';
  try {
    return new Intl.NumberFormat(settings.locale || 'en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: Number(settings.currencyDecimals ?? 0),
      maximumFractionDigits: Number(settings.currencyDecimals ?? 2),
    }).format(amount);
  } catch (_) {
    return `${settings.currencySymbol || '₹'}${Math.round(amount).toLocaleString('en-IN')}`;
  }
}

export function SectionHeading({ title, action, onAction }) {
  if (!title && !action) return null;
  return <View style={styles.headingRow}>{title ? <Text style={styles.heading}>{title}</Text> : <View />}{action ? <Pressable onPress={onAction}><Text style={styles.headingAction}>{action}</Text></Pressable> : null}</View>;
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  center: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  muted: { color: '#64748b', fontSize: 14 },
  errorText: { color: '#b91c1c', textAlign: 'center', fontSize: 14, lineHeight: 21 },
  retry: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  primaryButton: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  heading: { flex: 1, color: '#111827', fontWeight: '800', fontSize: 20 },
  headingAction: { color: '#4f46e5', fontWeight: '700', fontSize: 13 },
});

