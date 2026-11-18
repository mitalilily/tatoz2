import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { absoluteUrl } from '../../lib/api';
import { ScreenFrame, ScreenScroll } from '../../components/Common';
import StorefrontHeader from '../../components/StorefrontHeader';
import StorefrontFooter from '../../components/StorefrontFooter';
import { useAuth } from '../../context/AuthContext';
import { useSite } from '../../context/SiteContext';
import { useCart } from '../../context/CartContext';
import { navigateToWebUrl } from '../../lib/navigation';

export default function AccountScreen() {
  const { user, signOut } = useAuth();
  const { header, theme } = useSite();
  const { refresh } = useCart();
  const links = Array.isArray(header.menuLinks) ? header.menuLinks.filter(link => link?.label && link?.url) : [];
  const quickLinks = [
    { label: 'My orders', url: '/orders', icon: 'receipt-outline' },
    { label: 'Wishlist', url: '/wishlist', icon: 'heart-outline' },
    ...links.map(link => ({ ...link, icon: 'chevron-forward-outline' })),
  ].filter((item, index, all) => all.findIndex(other => other.url === item.url) === index);

  const logout = () => Alert.alert('Sign out?', 'You can sign in again anytime.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(); await refresh().catch(() => {}); router.replace('/login'); } },
  ]);

  return <ScreenFrame><ScreenScroll contentContainerStyle={styles.content}>
    <StorefrontHeader />
    <View style={styles.profile}>
      {user?.avatar ? <Image source={{ uri: absoluteUrl(user.avatar) || user.avatar }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.brand }]}><Text style={styles.initial}>{String(user?.name || user?.phone || user?.email || '?').slice(0, 1).toUpperCase()}</Text></View>}
      <Text style={styles.name}>{user?.name || ''}</Text>
      {user?.phone ? <Text style={styles.detail}>{user.phone}</Text> : null}
      {user?.email ? <Text style={styles.detail}>{user.email}</Text> : null}
    </View>
    <View style={styles.menu}>
      {quickLinks.map((item, index) => <Pressable key={`${item.url}-${index}`} onPress={() => navigateToWebUrl(item.url)} style={styles.menuItem}><View style={styles.menuLeft}><Ionicons name={item.icon || 'chevron-forward-outline'} size={20} color={theme.brand} /><Text style={styles.menuLabel}>{item.label}</Text></View><Ionicons name="chevron-forward" size={17} color="#94a3b8" /></Pressable>)}
    </View>
    <Pressable onPress={logout} style={styles.signOut}><Ionicons name="log-out-outline" size={19} color="#b91c1c" /><Text style={styles.signOutText}>Sign out</Text></Pressable>
    <StorefrontFooter />
  </ScreenScroll></ScreenFrame>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 20 },
  profile: { alignItems: 'center', padding: 24, gap: 6 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#e2e8f0' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  name: { color: '#111827', fontSize: 20, fontWeight: '900', marginTop: 4 },
  detail: { color: '#64748b', fontSize: 12 },
  menu: { marginHorizontal: 16, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, overflow: 'hidden' },
  menuItem: { minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#ffffff' },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuLabel: { color: '#1f2937', fontSize: 13, fontWeight: '700' },
  signOut: { marginHorizontal: 16, marginVertical: 18, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#fecaca', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  signOutText: { color: '#b91c1c', fontSize: 13, fontWeight: '800' },
});

