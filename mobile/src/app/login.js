import { useCallback, useEffect, useId, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { absoluteUrl, authApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/SiteContext';
import { PrimaryButton } from '../components/Common';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

function GoogleLogin({ config, onSuccess }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'tatoz', path: 'auth' });
  const nonceId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [request, response, promptAsync] = AuthSession.useAuthRequest({
    clientId: config?.androidClientId || config?.clientId,
    redirectUri,
    responseType: 'id_token',
    scopes: ['openid', 'profile', 'email'],
    usePKCE: false,
    extraParams: { nonce: `tatoz-${nonceId}` },
  }, GOOGLE_DISCOVERY);

  useEffect(() => {
    let active = true;
    const finish = async () => {
      if (response?.type !== 'success') {
        if (response?.type === 'error' && active) setError(response.error?.message || 'Google sign-in could not be completed.');
        return;
      }
      const credential = response.params?.id_token || response.authentication?.idToken;
      if (!credential) { if (active) setError('Google did not return an ID token.'); return; }
      setBusy(true);
      try { await onSuccess(await authApi.googleLogin(credential)); }
      catch (reason) { if (active) setError(reason.message || 'Google sign-in failed.'); }
      finally { if (active) setBusy(false); }
    };
    finish();
    return () => { active = false; };
  }, [response, onSuccess]);

  return <View style={{ gap: 10 }}>
    <Pressable disabled={!request || busy} onPress={() => { setError(''); setBusy(true); promptAsync().finally(() => setBusy(false)); }} style={styles.googleButton}>
      {busy ? <ActivityIndicator color="#111827" /> : <><Ionicons name="logo-google" size={18} color="#4285f4" /><Text style={styles.googleText}>Continue with Google</Text></>}
    </Pressable>
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>;
}

export default function LoginScreen() {
  const { acceptLogin } = useAuth();
  const { site, settings, theme } = useSite();
  const [config, setConfig] = useState(null);
  const [google, setGoogle] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [mode, setMode] = useState('');
  const [registering, setRegistering] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [timer, setTimer] = useState(0);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const methods = (config?.activeMethods || [config?.activeMode].filter(Boolean)).filter(Boolean);
  const currentMode = mode || config?.activeMode || methods[0] || '';
  const modeInfo = config?.modes?.find(item => item.id === currentMode);
  const phoneCode = settings.phoneCode || '+91';
  const logo = absoluteUrl(site?.logo);

  const loadConfig = useCallback(async () => {
    try {
      const result = await authApi.config();
      const auth = result.auth || {};
      setConfig(auth);
      setMode(auth.activeMode || auth.activeMethods?.[0] || '');
      const googleConfig = await authApi.googleConfig().catch(() => null);
      setGoogle({ ...(googleConfig?.google || {}), ...(auth.google || {}) });
    } catch (reason) { setError(reason.message || 'Authentication settings could not be loaded.'); }
    finally { setConfigLoading(false); }
  }, []);

  useEffect(() => { void Promise.resolve().then(loadConfig); }, [loadConfig]);
  useEffect(() => {
    if (!timer) return undefined;
    const id = setTimeout(() => setTimer(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  const finishLogin = useCallback(async payload => {
    await acceptLogin(payload);
    router.replace('/home');
  }, [acceptLogin]);

  const sendOtp = async () => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 8 || !['msg91', 'wati'].includes(currentMode)) return;
    setBusy(true); setError('');
    try {
      await authApi.sendOtp(cleaned, currentMode);
      setOtpSent(true); setOtp(''); setTimer(30);
    } catch (reason) { setError(reason.message || 'Could not send OTP.'); }
    finally { setBusy(false); }
  };

  const verifyOtp = async () => {
    const cleaned = phone.replace(/\D/g, '');
    if (otp.replace(/\D/g, '').length !== 6) return;
    setBusy(true); setError('');
    try { await finishLogin(await authApi.verifyOtp(cleaned, otp.replace(/\D/g, ''), currentMode)); }
    catch (reason) { setError(reason.message || 'OTP verification failed.'); }
    finally { setBusy(false); }
  };

  const submitPassword = async () => {
    setBusy(true); setError('');
    try {
      const result = registering
        ? await authApi.register(form, currentMode)
        : await authApi.passwordLogin(form.email, form.password, currentMode);
      await finishLogin(result);
    } catch (reason) { setError(reason.message || 'Sign-in failed.'); }
    finally { setBusy(false); }
  };

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.loginCard}>
        <View style={styles.brandArea}>{logo ? <Image source={{ uri: logo }} resizeMode="contain" style={styles.logo} /> : null}<Text style={[styles.title, { color: theme.text }]}>{otpSent ? 'Verify OTP' : registering ? 'Create your account' : 'Welcome'}</Text><Text style={styles.subtitle}>{otpSent ? `Code sent to ${phoneCode} ${phone.replace(/\D/g, '')}` : modeInfo?.description || modeInfo?.label || 'Sign in to continue'}</Text></View>
        {configLoading ? <ActivityIndicator color={theme.brand} size="large" style={{ marginVertical: 28 }} /> : !config ? <View style={{ gap: 14 }}><Text style={styles.error}>{error || 'Authentication settings could not be loaded.'}</Text><PrimaryButton title="Retry" onPress={() => { setConfigLoading(true); loadConfig(); }} loading={configLoading} /></View> : <>
          {!otpSent && methods.length > 1 ? <View style={styles.modeRow}>{methods.map(method => {
            const info = config.modes?.find(item => item.id === method);
            return <Pressable key={method} onPress={() => { setMode(method); setRegistering(false); setError(''); }} style={[styles.modeChip, currentMode === method && { borderColor: theme.brand, backgroundColor: `${theme.brand}12` }]}><Text style={[styles.modeText, currentMode === method && { color: theme.brand }]}>{info?.label || method}</Text></Pressable>;
          })}</View> : null}
          {modeInfo?.available === false ? <Text style={styles.error}>This sign-in provider is not ready. Contact the store administrator.</Text> : null}
          {!otpSent && ['msg91', 'wati'].includes(currentMode) ? <View style={styles.form}>
            <Text style={styles.label}>Mobile number</Text>
            <View style={styles.phoneRow}><Text style={styles.phoneCode}>{phoneCode}</Text><TextInput value={phone} onChangeText={value => setPhone(value.replace(/\D/g, '').slice(0, 14))} keyboardType="phone-pad" autoComplete="tel" placeholder="Mobile number" style={styles.input} maxLength={14} /></View>
            <PrimaryButton title="Send OTP" onPress={sendOtp} disabled={phone.replace(/\D/g, '').length < 8} loading={busy} />
          </View> : null}
          {otpSent ? <View style={styles.form}>
            <Text style={styles.label}>Enter 6-digit OTP</Text>
            <TextInput value={otp} onChangeText={value => setOtp(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} style={styles.otpInput} placeholder="••••••" textContentType="oneTimeCode" />
            <PrimaryButton title="Verify and continue" onPress={verifyOtp} disabled={otp.length !== 6} loading={busy} />
            <View style={styles.otpActions}><Pressable onPress={() => { setOtpSent(false); setOtp(''); setError(''); }}><Text style={styles.link}>Change number</Text></Pressable><Pressable disabled={timer > 0 || busy} onPress={sendOtp}><Text style={[styles.link, timer > 0 && styles.disabledLink]}>{timer > 0 ? `Resend in ${timer}s` : 'Resend OTP'}</Text></Pressable></View>
          </View> : null}
          {!otpSent && currentMode === 'password' ? <View style={styles.form}>
            {registering ? <><Text style={styles.label}>Name</Text><TextInput value={form.name} onChangeText={name => setForm(current => ({ ...current, name }))} style={styles.input} autoComplete="name" /></> : null}
            <Text style={styles.label}>Email</Text><TextInput value={form.email} onChangeText={email => setForm(current => ({ ...current, email }))} style={styles.input} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Text style={styles.label}>Password</Text><TextInput value={form.password} onChangeText={password => setForm(current => ({ ...current, password }))} style={styles.input} secureTextEntry autoComplete={registering ? 'new-password' : 'current-password'} />
            <PrimaryButton title={registering ? 'Create account' : 'Sign in'} onPress={submitPassword} loading={busy} />
            <Pressable onPress={() => { setRegistering(value => !value); setError(''); }}><Text style={styles.link}>{registering ? 'Already have an account? Sign in' : 'New here? Create an account'}</Text></Pressable>
          </View> : null}
          {!otpSent && currentMode === 'google' ? google?.androidClientId || process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ? <GoogleLogin config={{ ...google, androidClientId: google?.androidClientId || process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID }} onSuccess={finishLogin} /> : <Text style={styles.error}>Android Google sign-in is not configured for this store. Phone OTP sign-in remains available.</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>}
      </View>
      <Text style={styles.footer}>{settings.siteName || ''}</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8fafc' },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 28 },
  loginCard: { width: '100%', alignSelf: 'center', maxWidth: 460, backgroundColor: '#ffffff', borderRadius: 24, padding: 22, borderWidth: 1, borderColor: '#e5e7eb', gap: 18 },
  brandArea: { alignItems: 'center', gap: 8, paddingBottom: 4 },
  logo: { width: 170, height: 55, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#64748b', textAlign: 'center', fontSize: 13, lineHeight: 19 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeChip: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  modeText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  form: { gap: 10 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 3 },
  phoneRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, overflow: 'hidden' },
  phoneCode: { paddingHorizontal: 13, color: '#475569', fontWeight: '700', borderRightWidth: 1, borderRightColor: '#e2e8f0', lineHeight: 50 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 14, color: '#111827', backgroundColor: '#ffffff', flex: 1 },
  otpInput: { minHeight: 62, borderWidth: 2, borderColor: '#cbd5e1', borderRadius: 14, paddingHorizontal: 12, color: '#111827', textAlign: 'center', fontSize: 24, fontWeight: '800', letterSpacing: 12 },
  otpActions: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { color: '#4f46e5', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  disabledLink: { color: '#94a3b8' },
  error: { color: '#b91c1c', backgroundColor: '#fef2f2', padding: 11, borderRadius: 10, fontSize: 12, lineHeight: 18 },
  footer: { marginTop: 18, textAlign: 'center', color: '#94a3b8', fontSize: 11 },
  googleButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, backgroundColor: '#ffffff' },
  googleText: { color: '#111827', fontSize: 14, fontWeight: '700' },
});
