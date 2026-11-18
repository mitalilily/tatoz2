import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { LockKeyhole, Mail, Phone, ShieldCheck, X } from 'lucide-react';
import { resetOtpState, sendOtp, verifyOtp } from '../../store/slices/authSlice';
import {
  cancelCartIntent,
  fetchCart,
  importQuarantinedCart,
  readQuarantinedCart,
  resumePendingCartIntent,
} from '../../store/slices/cartSlice';
import Loader from '../common/Loader';

const EMPTY_OTP = ['', '', '', '', '', ''];

const OtpCartGate = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { otpGateOpen, pendingIntent, resumeStatus, resumeError } = useSelector(state => state.cart);
  const { user, otpSending, loading, cartVerificationProvider } = useSelector(state => state.auth);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(EMPTY_OTP);
  const [step, setStep] = useState('phone');
  const [localError, setLocalError] = useState('');
  const otpRefs = useRef([]);
  const submitting = useRef(false);

  useEffect(() => {
    if (!otpGateOpen) return undefined;
    dispatch(resetOtpState());
    setPhone(String(user?.phone || '').replace(/\D/g, '').slice(-10));
    setEmail(String(user?.email || '').trim().toLowerCase());
    setOtp([...EMPTY_OTP]);
    setStep('phone');
    setLocalError('');
    submitting.current = false;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = priorOverflow; };
  // Do not reset the modal when OTP verification updates auth.user.phone.
  // The intent id is the lifecycle boundary for a fresh verification attempt.
  }, [dispatch, otpGateOpen, pendingIntent?.intentId]);

  useEffect(() => {
    if (!otpGateOpen) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape' && resumeStatus !== 'pending' && !loading) dispatch(cancelCartIntent());
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dispatch, loading, otpGateOpen, resumeStatus]);

  if (!otpGateOpen || !pendingIntent) return null;

  const cleanPhone = phone.replace(/\D/g, '');
  const cleanEmail = email.trim().toLowerCase();
  const emailMode = cartVerificationProvider === 'email';
  const contactReady = emailMode ? /^\S+@\S+\.\S+$/.test(cleanEmail) : cleanPhone.length === 10;
  const close = () => {
    if (resumeStatus === 'pending' || loading) return;
    dispatch(cancelCartIntent());
    dispatch(resetOtpState());
  };

  const handleSend = async () => {
    if (!contactReady || otpSending) return;
    setLocalError('');
    const action = await dispatch(sendOtp(emailMode
      ? { email: cleanEmail, channel: 'email', purpose: 'cart_step_up' }
      : { phone: cleanPhone, channel: 'phone', purpose: 'cart_step_up' }));
    if (sendOtp.fulfilled.match(action)) {
      setStep('otp');
      setTimeout(() => otpRefs.current[0]?.focus(), 0);
    } else setLocalError(action.payload || 'Could not send OTP');
  };

  const handleVerify = async (code = otp.join('')) => {
    if (code.length !== 6 || submitting.current) return;
    submitting.current = true;
    setLocalError('');
    const verified = await dispatch(verifyOtp(emailMode
      ? { email: cleanEmail, channel: 'email', otp: code, purpose: 'cart_step_up' }
      : { phone: cleanPhone, channel: 'phone', otp: code, purpose: 'cart_step_up' }));
    if (!verifyOtp.fulfilled.match(verified)) {
      submitting.current = false;
      setLocalError(verified.payload || 'OTP verification failed');
      return;
    }

    // Establish the account's latest server cart first. A quarantined legacy
    // cart is imported through its stable key, then the original click resumes
    // through its own stable key exactly once.
    await dispatch(fetchCart());
    if (readQuarantinedCart()) await dispatch(importQuarantinedCart());
    const result = await dispatch(resumePendingCartIntent());
    submitting.current = false;
    if (result?.success && result.afterSuccessPath) navigate(result.afterSuccessPath);
    if (!result?.success && !result?.inProgress) setLocalError(result?.error?.message || 'Could not update cart');
  };

  const handleDigit = (index, value) => {
    const digit = String(value).replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
    if (digit && index === 5 && next.every(Boolean)) setTimeout(() => handleVerify(next.join('')), 0);
  };

  const handlePaste = event => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length !== 6) return;
    event.preventDefault();
    setOtp(pasted.split(''));
    otpRefs.current[5]?.focus();
    setTimeout(() => handleVerify(pasted), 0);
  };

  const busy = otpSending || loading || resumeStatus === 'pending';
  const intentLabel = pendingIntent.type === 'add'
    ? `${pendingIntent.quantity} × ${pendingIntent.productTitle}`
    : pendingIntent.type === 'reorder'
      ? `items from order #${pendingIntent.orderNumber || 'your previous order'}`
      : 'your cart change';

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4" data-testid="cart-otp-gate">
      <button className="absolute inset-0 bg-gray-950/60 backdrop-blur-sm" aria-label="Cancel cart verification" onClick={close} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-otp-title"
        className="relative my-3 max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-white/40 bg-white p-4 shadow-2xl sm:my-0 sm:max-h-[calc(100dvh-2rem)] sm:p-8"
      >
        <button
          type="button"
          onClick={close}
          disabled={busy}
          data-testid="cart-otp-close"
          aria-label="Close cart verification"
          className="absolute right-4 top-4 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
        >
          <X size={19} />
        </button>

        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          {step === 'phone' ? (emailMode ? <Mail size={23} /> : <Phone size={23} />) : <ShieldCheck size={24} />}
        </div>
        <h2 id="cart-otp-title" className="break-anywhere pr-8 text-xl font-bold text-gray-950">Verify {emailMode ? 'email' : 'phone'} before adding to cart</h2>
        <p className="mt-2 break-anywhere text-sm leading-6 text-gray-500">
          This protects your cart from automated and unauthorized changes. After verification, we will add {intentLabel} exactly once.
        </p>

        {step === 'phone' ? (
          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-gray-700">{emailMode ? 'Email address' : 'Mobile number'}</span>
              <div className="flex rounded-xl border border-gray-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
                {!emailMode && <span className="flex items-center border-r border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-600">+91</span>}
                {emailMode && <Mail size={17} className="ml-3 self-center text-gray-400" />}
                <input
                  data-testid={emailMode ? 'cart-otp-email' : 'cart-otp-phone'}
                  type={emailMode ? 'email' : 'tel'}
                  inputMode={emailMode ? 'email' : 'numeric'}
                  autoComplete={emailMode ? 'email' : 'tel-national'}
                  autoFocus
                  value={emailMode ? email : phone}
                  onChange={event => emailMode ? setEmail(event.target.value.slice(0, 160)) : setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
                  onKeyDown={event => { if (event.key === 'Enter') handleSend(); }}
                  className="min-w-0 flex-1 rounded-r-xl px-3 py-3 outline-none"
                  placeholder={emailMode ? 'you@example.com' : '10-digit mobile'}
                  aria-label={emailMode ? 'Email address' : '10-digit mobile number'}
                />
              </div>
            </label>
            <button
              type="button"
              data-testid="cart-otp-send"
              onClick={handleSend}
              disabled={!contactReady || otpSending}
              className="btn-primary flex w-full items-center justify-center gap-2 py-3 disabled:opacity-50"
            >
              {otpSending ? <Loader size="sm" /> : <><LockKeyhole size={16} /> Send {emailMode ? 'email OTP' : 'OTP'}</>}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div>
              <p className="mb-3 text-center text-sm font-medium text-gray-600">Enter the 6-digit code sent to {emailMode ? cleanEmail.replace(/^(.{2}).*(@.*)$/, '$1••••$2') : `+91 ••••••${cleanPhone.slice(-4)}`}</p>
              <div className="flex justify-center gap-1.5 sm:gap-2" onPaste={handlePaste}>
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={element => { otpRefs.current[index] = element; }}
                    data-testid={`cart-otp-digit-${index}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    value={digit}
                    onChange={event => handleDigit(index, event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
                    }}
                    className="h-12 w-9 rounded-xl border-2 border-gray-200 text-center text-lg font-bold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:h-14 sm:w-12"
                    aria-label={`OTP digit ${index + 1}`}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              data-testid="cart-otp-verify"
              onClick={() => handleVerify()}
              disabled={busy || otp.some(digit => !digit)}
              className="btn-primary flex w-full items-center justify-center gap-2 py-3 disabled:opacity-50"
            >
              {loading || resumeStatus === 'pending' ? <><Loader size="sm" /> Verifying & adding…</> : 'Verify & add to cart'}
            </button>
            <button
              type="button"
              onClick={() => { dispatch(resetOtpState()); setStep('phone'); setOtp([...EMPTY_OTP]); setLocalError(''); }}
              disabled={busy}
              className="w-full text-sm font-medium text-gray-500 hover:text-gray-800"
            >
              Change {emailMode ? 'email address' : 'mobile number'}
            </button>
          </div>
        )}

        {(localError || resumeError) && (
          <p role="alert" data-testid="cart-otp-error" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {localError || resumeError}
          </p>
        )}
        <p data-testid="cart-otp-status" aria-live="polite" className="sr-only">
          {busy ? 'Verification in progress' : step === 'otp' ? 'OTP entry ready' : `${emailMode ? 'Email' : 'Phone'} entry ready`}
        </p>
      </section>
    </div>
  );
};

export default OtpCartGate;
