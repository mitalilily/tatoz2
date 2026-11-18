import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  fetchCart,
  importQuarantinedCart,
  readQuarantinedCart,
  resetCartState,
} from '../../store/slices/cartSlice';

const CartRuntime = () => {
  const dispatch = useDispatch();
  const { initialized, isAuthenticated, user, session, cartVerificationEnabled } = useSelector(state => state.auth);
  const { hydrated, id, items } = useSelector(state => state.cart);
  const importAttempt = useRef('');

  useEffect(() => {
    if (!initialized) return undefined;
    const customerRole = ['customer', 'affiliate'].includes(user?.role);
    const guestCartAllowed = cartVerificationEnabled === false;
    if ((!isAuthenticated && !guestCartAllowed) || (isAuthenticated && !customerRole)) {
      if (!hydrated || id || items.length) dispatch(resetCartState());
      importAttempt.current = '';
      return undefined;
    }

    let cancelled = false;
    const synchronize = async () => {
      await dispatch(fetchCart());
      if (cancelled || !isAuthenticated || (cartVerificationEnabled !== false && session?.otpVerified !== true) || !readQuarantinedCart()) return;
      const attemptKey = `${user._id}:${session.expiresAt || 'session'}`;
      if (importAttempt.current === attemptKey) return;
      importAttempt.current = attemptKey;
      const result = await dispatch(importQuarantinedCart());
      if (!cancelled && importQuarantinedCart.fulfilled.match(result) && result.payload?.cart) {
        toast.success('Your saved cart was securely restored');
      }
      if (!cancelled && importQuarantinedCart.rejected.match(result)) {
        toast.error('A saved cart item is no longer available; it was not imported');
      }
    };
    synchronize();
    return () => { cancelled = true; };
  }, [cartVerificationEnabled, dispatch, initialized, isAuthenticated, session?.expiresAt, session?.otpVerified, user?._id, user?.role]);

  return null;
};

export default CartRuntime;
