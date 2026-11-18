import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { absoluteUrl } from '../lib/api';
import { navigateToWebUrl } from '../lib/navigation';
import { useSite } from '../context/SiteContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

export default function StorefrontHeader() {
  const { site, settings, header = {}, theme } = useSite();
  const { cart } = useCart();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const tint = header.textColor || '#111827';
  const menuLinks = Array.isArray(header.menuLinks) ? header.menuLinks.filter(link => link?.label && link?.url) : [];
  const logo = absoluteUrl(site?.logo);
  const menuBackground = header.menuBackgroundColor || '#ffffff';

  const openUrl = url => {
    setMenuOpen(false);
    navigateToWebUrl(url);
  };

  const submitSearch = () => {
    const query = menuSearch.trim();
    setMenuOpen(false);
    router.push(query ? `/shop?q=${encodeURIComponent(query)}` : '/shop');
  };

  const logout = async () => {
    setMenuOpen(false);
    await signOut();
    router.replace('/login');
  };

  return <View style={[styles.wrap, { backgroundColor: header.backgroundColor || '#ffffff' }]}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={settings.siteName || 'Home'} onPress={() => router.replace('/home')} style={styles.brand}>
        {logo ? <Image source={{ uri: logo }} resizeMode="contain" style={styles.logo} /> : <Text numberOfLines={1} style={[styles.brandText, { color: tint }]}>{settings.siteName || ''}</Text>}
      </Pressable>
      {header.show?.search !== false ? <Pressable accessibilityRole="button" accessibilityLabel={header.searchPlaceholder || 'Search'} onPress={() => router.push('/shop')} style={styles.iconButton}><Ionicons name="search-outline" size={22} color={tint} /></Pressable> : null}
      {header.show?.cart !== false ? <Pressable accessibilityRole="button" accessibilityLabel="Cart" onPress={() => router.push('/cart')} style={styles.iconButton}>
        <Ionicons name="bag-handle-outline" size={22} color={tint} />
        {cart.itemCount > 0 ? <View style={[styles.badge, { backgroundColor: header.accentColor || theme.brand }]}><Text style={styles.badgeText}>{cart.itemCount > 99 ? '99+' : cart.itemCount}</Text></View> : null}
      </Pressable> : null}
      {header.show?.mobileMenu !== false ? <Pressable accessibilityRole="button" accessibilityLabel="Open menu" onPress={() => setMenuOpen(true)} style={styles.iconButton}><Ionicons name="menu-outline" size={25} color={tint} /></Pressable> : null}
    </View>
    <Modal visible={menuOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuOpen(false)}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close menu" style={styles.backdrop} onPress={() => setMenuOpen(false)} />
        <SafeAreaView edges={['top', 'bottom']} style={[styles.drawer, { backgroundColor: menuBackground }]}>
          <View style={styles.drawerHeader}>
            <View style={styles.profileMark}><Text style={styles.profileInitial}>{String(user?.name || user?.phone || user?.email || settings.siteName || 'T').slice(0, 1).toUpperCase()}</Text></View>
            <View style={styles.profileInfo}><Text numberOfLines={1} style={styles.profileName}>{user?.name || settings.siteName || ''}</Text><Text numberOfLines={1} style={styles.profileSub}>{user?.phone || user?.email || ''}</Text></View>
            <Pressable accessibilityLabel="Close menu" onPress={() => setMenuOpen(false)} style={styles.closeButton}><Ionicons name="close" size={21} color="#64748b" /></Pressable>
          </View>
          {header.show?.search !== false ? <View style={styles.drawerSearchRow}><TextInput value={menuSearch} onChangeText={setMenuSearch} onSubmitEditing={submitSearch} returnKeyType="search" placeholder={header.searchPlaceholder || 'Search products'} style={styles.drawerSearch} /><Pressable onPress={submitSearch} style={[styles.searchSubmit, { backgroundColor: header.accentColor || theme.brand }]}><Ionicons name="search" size={17} color="#ffffff" /></Pressable></View> : null}
          <ScrollView style={styles.drawerScroll} contentContainerStyle={styles.drawerLinks}>
            {menuLinks.map((link, index) => <Pressable key={`${link.url}-${index}`} onPress={() => openUrl(link.url)} style={styles.drawerLink}><Text numberOfLines={1} style={styles.drawerLabel}>{link.label}</Text><Ionicons name="chevron-forward" size={16} color="#94a3b8" /></Pressable>)}
            <View style={styles.drawerDivider} />
            <Pressable onPress={() => openUrl('/orders')} style={styles.drawerLink}><View style={styles.drawerItemLeft}><Ionicons name="receipt-outline" size={18} color="#64748b" /><Text style={styles.drawerLabel}>Order tracking</Text></View><Ionicons name="chevron-forward" size={16} color="#94a3b8" /></Pressable>
            <Pressable onPress={() => openUrl('/wishlist')} style={styles.drawerLink}><View style={styles.drawerItemLeft}><Ionicons name="heart-outline" size={18} color="#64748b" /><Text style={styles.drawerLabel}>Wishlist</Text></View><Ionicons name="chevron-forward" size={16} color="#94a3b8" /></Pressable>
            <Pressable onPress={() => openUrl('/account')} style={styles.drawerLink}><View style={styles.drawerItemLeft}><Ionicons name="person-outline" size={18} color="#64748b" /><Text style={styles.drawerLabel}>My account</Text></View><Ionicons name="chevron-forward" size={16} color="#94a3b8" /></Pressable>
          </ScrollView>
          {user ? <Pressable onPress={logout} style={styles.signOut}><Ionicons name="log-out-outline" size={18} color="#b91c1c" /><Text style={styles.signOutText}>Sign out</Text></Pressable> : <Pressable onPress={() => openUrl('/login')} style={[styles.loginLink, { backgroundColor: header.accentColor || theme.brand }]}><Text style={styles.loginText}>Login / Sign up</Text></Pressable>}
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  row: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { flex: 1, minWidth: 0, justifyContent: 'center' },
  logo: { width: 142, height: 38, alignSelf: 'flex-start' },
  brandText: { fontSize: 17, fontWeight: '800' },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  badge: { position: 'absolute', right: -1, top: 0, minWidth: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#ffffff', fontSize: 9, fontWeight: '800' },
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.48)' },
  drawer: { width: '84%', maxWidth: 360, height: '100%', paddingHorizontal: 16, paddingBottom: 12, elevation: 12 },
  drawerHeader: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 12 },
  profileMark: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  profileInitial: { color: '#334155', fontSize: 16, fontWeight: '900' },
  profileInfo: { flex: 1, minWidth: 0, gap: 3 },
  profileName: { color: '#111827', fontSize: 13, fontWeight: '800' },
  profileSub: { color: '#64748b', fontSize: 11 },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  drawerSearchRow: { flexDirection: 'row', marginTop: 14, marginBottom: 8 },
  drawerSearch: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: '#cbd5e1', borderRightWidth: 0, borderTopLeftRadius: 9, borderBottomLeftRadius: 9, paddingHorizontal: 11, fontSize: 12, color: '#111827' },
  searchSubmit: { width: 44, alignItems: 'center', justifyContent: 'center', borderTopRightRadius: 9, borderBottomRightRadius: 9 },
  drawerScroll: { flex: 1 },
  drawerLinks: { paddingTop: 5, paddingBottom: 16 },
  drawerLink: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  drawerItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  drawerLabel: { flex: 1, color: '#334155', fontSize: 13, fontWeight: '600' },
  drawerDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 9 },
  signOut: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 11, marginTop: 10 },
  signOutText: { color: '#b91c1c', fontSize: 12, fontWeight: '800' },
  loginLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11, marginTop: 10 },
  loginText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
});
