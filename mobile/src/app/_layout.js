import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { SiteProvider, useSite } from '../context/SiteContext';
import { CartProvider } from '../context/CartContext';

function RouteGuard() {
  const { user, ready } = useAuth();
  const { theme } = useSite();
  const segments = useSegments();
  const route = segments[0];

  useEffect(() => {
    if (!ready) return;
    if (!user && route !== 'login') router.replace('/login');
    if (user && route === 'login') router.replace('/home');
  }, [ready, user, route]);

  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}><ActivityIndicator size="large" color={theme.brand} /></View>;
  return <>
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#ffffff' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="product/[slug]" />
      <Stack.Screen name="page/[...slug]" />
      <Stack.Screen name="orders" />
      <Stack.Screen name="orders/[id]" />
      <Stack.Screen name="wishlist" />
      <Stack.Screen name="checkout" />
    </Stack>
  </>;
}

export default function RootLayout() {
  return <AuthProvider><SiteProvider><CartProvider><RouteGuard /></CartProvider></SiteProvider></AuthProvider>;
}
