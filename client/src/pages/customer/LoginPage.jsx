import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, Phone } from 'lucide-react';
import { passwordLogin, register, sendOtp, verifyOtp, googleLogin, resetOtpState } from '../../store/slices/authSlice';
import { useSite } from '../../context/SiteContext';
import Loader from '../../components/common/Loader';
import SEO from '../../components/common/SEO';
import AnalyticsHead from '../../components/common/AnalyticsHead';
import { authAPI } from '../../services/api';

const EMPTY_OTP = ['', '', '', '', '', ''];

const LoginPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, user, isAuthenticated, otpSending, otpSent } = useSelector(state => state.auth);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(EMPTY_OTP);
  const [resendTimer, setResendTimer] = useState(0);
  const [authConfig, setAuthConfig] = useState(null);
  const [authConfigLoading, setAuthConfigLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [google, setGoogle] = useState({ enabled: false, clientId: '' });
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const otpRefs = useRef([]);
  const { site } = useSite();
  const siteLogo = site?.logo || '';
  const testOtp = import.meta.env.VITE_TEST_OTP || '';

  const isRegister = location.pathname === '/register';
  const params = new URLSearchParams(location.search);
  const from = location.state?.from?.pathname || params.get('redirect') || '/';
  const activeMode = selectedMethod || authConfig?.activeMode || '';
  const activeMethods = authConfig?.activeMethods || [authConfig?.activeMode].filter(Boolean);
  const activeModeState = authConfig?.modes?.find(mode => mode.id === activeMode);
  const isOtpMode = activeMode === 'msg91' || activeMode === 'wati';
  const isPasswordMode = activeMode === 'password';
  const isGoogleMode = activeMode === 'google';
  const modeReady = Boolean(activeModeState?.available ?? authConfig?.available);
  const providerLabel = activeMode === 'wati' ? 'WATI WhatsApp' : activeMode === 'msg91' ? 'Phone OTP' : authConfig?.activeLabel || 'selected provider';

  useEffect(() => {
    if (!isAuthenticated) return;
    const destination = from !== '/'
      ? from
      : user?.role === 'vendor'
        ? '/vendor/dashboard'
        : '/';
    navigate(destination, { replace: true });
  }, [isAuthenticated, navigate, from, user?.role]);

  useEffect(() => {
    let active = true;
    setAuthConfigLoading(true);
    authAPI.getConfig()
      .then(response => {
        if (!active) return;
        const config = response.data?.auth || null;
        setAuthConfig(config);
        setSelectedMethod(config?.activeMode || config?.activeMethods?.[0] || '');
        setGoogle(config?.google || { enabled: false, clientId: '' });
      })
      .catch(() => {
        if (active) {
          setAuthConfig(null);
          setGoogle({ enabled: false, clientId: '' });
        }
      })
      .finally(() => { if (active) setAuthConfigLoading(false); });
    return () => { active = false; };
  }, [location.host]);

  useEffect(() => {
    if (resendTimer <= 0) return undefined;
    const timer = setTimeout(() => setResendTimer(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  const handleGoogleResponse = useCallback((response) => {
    if (response.credential) dispatch(googleLogin(response.credential));
  }, [dispatch]);

  useEffect(() => {
    if (!isGoogleMode || !google.enabled || !google.clientId) return undefined;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.google?.accounts.id.initialize({ client_id: google.clientId, callback: handleGoogleResponse });
      const target = document.getElementById('google-signin-btn');
      if (target) window.google?.accounts.id.renderButton(target, { theme: 'outline', size: 'large', width: '100%', text: 'continue_with', shape: 'rectangular', logo_alignment: 'center' });
    };
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, [handleGoogleResponse, google.enabled, google.clientId, isGoogleMode]);

  const handleSendOtp = () => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length !== 10 || !isOtpMode || !modeReady) return;
    dispatch(sendOtp({ phone: cleaned, authMethod: activeMode }));
    setResendTimer(30);
  };

  const handleVerifyOtp = () => {
    const code = otp.join('');
    if (code.length !== 6) return;
    dispatch(verifyOtp({ phone: phone.replace(/\D/g, ''), otp: code, authMethod: activeMode }));
  };

  const handleOtpChange = (index, value) => {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/\d/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    if (value && index === 5 && next.every(Boolean)) setTimeout(() => dispatch(verifyOtp({ phone: phone.replace(/\D/g, ''), otp: next.join(''), authMethod: activeMode })), 100);
  };

  const handleOtpPaste = event => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length !== 6) return;
    event.preventDefault();
    setOtp(pasted.split(''));
    otpRefs.current[5]?.focus();
    setTimeout(() => dispatch(verifyOtp({ phone: phone.replace(/\D/g, ''), otp: pasted, authMethod: activeMode })), 100);
  };

  const handlePasswordSubmit = event => {
    event.preventDefault();
    if (isRegister) dispatch(register({ ...form, authMethod: activeMode }));
    else dispatch(passwordLogin({ email: form.email, password: form.password, authMethod: activeMode }));
  };

  const handleChangePhone = () => {
    dispatch(resetOtpState());
    setOtp([...EMPTY_OTP]);
  };

  return (
    <>
      <AnalyticsHead />
      <SEO title={isRegister ? 'Create account' : 'Login'} noindex={true} />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-primary-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
              <div className="card p-5 shadow-xl sm:p-8">
            <div className="text-center mb-8">
              <Link to="/" className="inline-flex items-center justify-center gap-2 mb-6">
                {siteLogo ? <img src={siteLogo} alt="Logo" className="h-10 w-auto max-w-[180px] object-contain" /> : <div className="h-10 w-[120px] rounded-lg bg-gray-100 border border-dashed border-gray-300" aria-hidden />}
              </Link>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl" data-testid="auth-mode-title">
                {otpSent ? 'Verify OTP' : isPasswordMode ? (isRegister ? 'Create your account' : 'Welcome back') : isGoogleMode ? 'Continue with Google' : 'Verify your phone'}
              </h1>
              <p className="text-gray-500 mt-1">
                {otpSent ? `OTP sent to +91 ${phone.replace(/\D/g, '')}` : isPasswordMode ? (isRegister ? 'Create an account with your email and password' : 'Sign in with your email and password') : isGoogleMode ? 'Use the active Google authentication provider' : `Sign in with ${providerLabel}`}
              </p>
              {otpSent && testOtp && <p className="text-amber-600 text-xs font-semibold mt-2">Testing mode · OTP: {testOtp}</p>}
            </div>

            {authConfigLoading ? <div className="flex justify-center py-8"><Loader size="sm" /></div> : !authConfig ? <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Authentication configuration could not be loaded. Please try again.</div> : <>
              {!otpSent && activeMethods.length > 1 && <div className="mb-5 rounded-2xl border border-gray-100 bg-gray-50 p-3" data-testid="auth-method-picker"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Choose a sign-in method</p><div className="grid gap-2 sm:grid-cols-2">{activeMethods.map(method => { const mode = authConfig.modes?.find(item => item.id === method); return <button type="button" key={method} data-testid={`auth-method-${method}`} onClick={() => setSelectedMethod(method)} className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${activeMode === method ? 'border-primary-500 bg-white text-primary-700 ring-2 ring-primary-100' : 'border-gray-200 bg-white text-gray-600 hover:border-primary-300'}`}>{mode?.label || method}</button>; })}</div></div>}
              {!modeReady && !otpSent ? <div role="alert" data-testid="auth-provider-unavailable" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-800">The active {activeModeState?.label || authConfig.activeLabel} provider is not ready. An administrator must configure and test it before customers can sign in.</div> : otpSent ? (
              <div className="space-y-4" data-testid="otp-auth-flow">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3 text-center">Enter 6-digit OTP</label>
                  <div className="flex justify-center gap-1.5 sm:gap-2" onPaste={handleOtpPaste}>
                    {otp.map((digit, index) => <input key={index} ref={element => { otpRefs.current[index] = element; }} data-testid={`login-otp-digit-${index}`} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={event => handleOtpChange(index, event.target.value)} onKeyDown={event => { if (event.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus(); }} className="h-12 w-9 rounded-xl border-2 border-gray-200 text-center text-lg font-bold outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-200 sm:h-14 sm:w-12 sm:text-xl" autoFocus={index === 0} />)}
                  </div>
                </div>
                <button onClick={handleVerifyOtp} disabled={loading || otp.some(digit => !digit)} className="btn-primary w-full py-3 flex items-center justify-center gap-2">{loading ? <Loader size="sm" /> : 'Verify & Continue'}</button>
                <div className="flex items-center justify-between text-sm">
                  <button onClick={handleChangePhone} className="text-gray-500 hover:text-gray-700 flex items-center gap-1"><ArrowLeft size={14} /> Change number</button>
                  {resendTimer > 0 ? <span className="text-gray-400">Resend in {resendTimer}s</span> : <button onClick={handleSendOtp} className="text-primary-600 font-medium hover:text-primary-700">Resend OTP</button>}
                </div>
              </div>
            ) : isPasswordMode ? (
              <form onSubmit={handlePasswordSubmit} className="space-y-4" data-testid="password-auth-form">
                {isRegister && <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700">Name</span><input data-testid="auth-name" name="name" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} className="input w-full" placeholder="Your name" autoComplete="name" /></label>}
                <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700">Email address</span><div className="relative"><Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input data-testid="auth-email" type="email" name="email" required value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} className="input w-full pl-10" placeholder="you@example.com" autoComplete="email" /></div></label>
                <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700">Password</span><div className="relative"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input data-testid="auth-password" type={showPassword ? 'text' : 'password'} name="password" required minLength={6} value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} className="input w-full pl-10 pr-10" placeholder="At least 6 characters" autoComplete={isRegister ? 'new-password' : 'current-password'} /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
                <button type="submit" disabled={loading} data-testid="auth-password-submit" className="btn-primary w-full py-3 flex items-center justify-center gap-2">{loading ? <Loader size="sm" /> : isRegister ? 'Create account' : 'Sign in'}</button>
              </form>
            ) : isOtpMode ? (
              <div className="space-y-4" data-testid="otp-auth-flow">
                <label className="block"><span className="block text-sm font-medium text-gray-700 mb-1.5">Mobile number</span><div className="relative flex"><span className="inline-flex items-center px-3 bg-gray-100 border border-r-0 border-gray-300 rounded-l-xl text-sm text-gray-600 font-medium">+91</span><div className="relative flex-1"><Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input data-testid="auth-phone" type="tel" value={phone} onChange={event => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} className="input pl-10 rounded-l-none" placeholder="98765 43210" maxLength={10} autoFocus onKeyDown={event => event.key === 'Enter' && handleSendOtp()} /></div></div></label>
                <button onClick={handleSendOtp} disabled={otpSending || phone.replace(/\D/g, '').length !== 10} data-testid="auth-otp-send" className="btn-primary w-full py-3 flex items-center justify-center gap-2">{otpSending ? <Loader size="sm" /> : <><span>Send OTP</span><ArrowRight size={16} /></>}</button>
              </div>
            ) : (
              <div data-testid="google-auth-flow" className="space-y-4">
                <div id="google-signin-btn" className="flex justify-center min-h-10" />
                {!google.enabled && <p className="text-sm text-amber-700">Google provider is not ready yet.</p>}
              </div>
            )}</>}

            {!otpSent && isPasswordMode && <p className="mt-5 text-center text-sm text-gray-500">{isRegister ? 'Already have an account?' : 'New here?'} <Link to={isRegister ? '/login' : '/register'} className="font-semibold text-primary-600 hover:underline">{isRegister ? 'Sign in' : 'Create an account'}</Link></p>}
            <div className="mt-6 pt-4 border-t border-gray-100 text-center"><Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors"><ArrowLeft size={14} />Back to Home</Link></div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;
