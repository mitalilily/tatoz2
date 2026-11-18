import { Stack } from 'expo-router';

export default function TabLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#ffffff' } }}>
    <Stack.Screen name="home" />
    <Stack.Screen name="shop" />
    <Stack.Screen name="cart" />
    <Stack.Screen name="chat" />
    <Stack.Screen name="account" />
  </Stack>;
}
