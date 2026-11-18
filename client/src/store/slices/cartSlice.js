import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import toast from 'react-hot-toast';
import { bundleAPI, cartAPI, orderAPI, trackingAPI } from '../../services/api';
import { trackGoogleAdsConversion } from '../../utils/googleAds';
import { trackMetaPixel } from '../../utils/metaPixel';
import { setCartOpen } from './uiSlice';

const LEGACY_CART_KEY = 'tatoz_cart';
const QUARANTINED_CART_KEY = 'tatoz_cart_quarantine_v1';

const mutationKey = (prefix = 'cart') => {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `${prefix}-${random}`.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 128);
};

const safeVariant = (variant) => {
  if (!variant || typeof variant !== 'object' || Array.isArray(variant)) return {};
  return Object.entries(variant).reduce((result, [name, value]) => {
    if (typeof name !== 'string' || !name.trim()) return result;
    const selected = value && typeof value === 'object' && !Array.isArray(value)
      ? (value._id || value.id || value.value)
      : value;
    if (['string', 'number'].includes(typeof selected)) result[name] = String(selected);
    return result;
  }, {});
};

const sanitizeLegacyItems = (items) => (Array.isArray(items) ? items : [])
  .slice(0, 50)
  .map((item) => {
    const productId = item?.product?._id || item?.productId || item?.product;
    const quantity = Number(item?.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null;
    return { productId: String(productId), quantity, variant: safeVariant(item.variant) };
  })
  .filter(Boolean);

// Old browser carts are untrusted input. Move only the minimum identifiers to
// a quarantine record and remove the renderable local cart immediately. The
// server validates every line after OTP before anything becomes a real cart.
export const quarantineLegacyCart = () => {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(LEGACY_CART_KEY);
    if (!raw) return Boolean(localStorage.getItem(QUARANTINED_CART_KEY));
    const items = sanitizeLegacyItems(JSON.parse(raw));
    const existing = localStorage.getItem(QUARANTINED_CART_KEY);
    if (!existing && items.length) {
      localStorage.setItem(QUARANTINED_CART_KEY, JSON.stringify({
        version: 1,
        quarantinedAt: new Date().toISOString(),
        idempotencyKey: mutationKey('legacy-import'),
        items,
      }));
    }
    localStorage.removeItem(LEGACY_CART_KEY);
    return Boolean(existing || items.length);
  } catch (_) {
    // Preserve the old record if quarantine persistence itself failed.
    return false;
  }
};

export const readQuarantinedCart = () => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(QUARANTINED_CART_KEY) || 'null');
    const items = sanitizeLegacyItems(parsed?.items);
    if (!items.length) return null;
    return {
      items,
      idempotencyKey: /^[A-Za-z0-9._:-]{8,128}$/.test(String(parsed.idempotencyKey || ''))
        ? parsed.idempotencyKey
        : mutationKey('legacy-import'),
    };
  } catch (_) { return null; }
};

export const removeQuarantinedCart = () => {
  if (typeof window !== 'undefined') localStorage.removeItem(QUARANTINED_CART_KEY);
};

const normalizeServerCart = (cart) => {
  const items = (Array.isArray(cart?.items) ? cart.items : []).map(item => {
    const isBundle = item.itemType === 'bundle' || item.bundle;
    const bundle = item.bundle && typeof item.bundle === 'object' ? item.bundle : {};
    const price = Number(item.unitPrice ?? item.price ?? item.product?.price ?? 0);
    const bundleTitle = bundle.title || bundle.name || item.bundleName || 'Bundle';
    const bundleImage = bundle.image || bundle.thumbnail || bundle.gallery?.[0]?.url || item.image || '';
    return {
      ...item,
      id: String(item.id || item._id),
      key: String(item.id || item._id),
      itemType: isBundle ? 'bundle' : 'product',
      price,
      product: isBundle ? {
        _id: bundle._id || item.bundle?._id || item.bundle,
        title: bundleTitle,
        slug: bundle.slug || '',
        thumbnail: bundleImage,
        image: bundleImage,
        price,
        comparePrice: Number(item.comparePrice ?? bundle.comparePrice ?? item.bundleSnapshot?.comparePrice ?? 0),
      } : {
        ...(item.product || {}),
        thumbnail: item.product?.image || item.product?.thumbnail || '',
        price,
      },
      bundle: isBundle ? (item.bundle || { _id: item.bundle }) : item.bundle,
      variant: safeVariant(item.variant),
    };
  });
  return {
    id: cart?.id || null,
    revision: Number(cart?.revision) || 0,
    items,
    distinctItemCount: Number(cart?.distinctItemCount ?? items.length),
    itemCount: Number(cart?.itemCount ?? items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)),
    subtotal: Number(cart?.subtotal ?? items.reduce((sum, item) => sum + item.price * Number(item.quantity || 0), 0)),
    hasUnavailableItems: Boolean(cart?.hasUnavailableItems),
    updatedAt: cart?.updatedAt || null,
  };
};

const cartFailure = error => ({
  message: error?.message || 'Cart request failed',
  code: error?.code || '',
  status: error?.status || 0,
});

export const fetchCart = createAsyncThunk('cart/fetch', async (_, { rejectWithValue }) => {
  try { return (await cartAPI.get()).data; }
  catch (error) { return rejectWithValue(cartFailure(error)); }
});

const addServerItem = createAsyncThunk('cart/addServerItem', async (intent, { rejectWithValue }) => {
  try {
    return (await cartAPI.addItem({
      productId: intent.productId,
      quantity: intent.quantity,
      variant: intent.variant,
      source: intent.source,
    }, intent.idempotencyKey)).data;
  } catch (error) { return rejectWithValue(cartFailure(error)); }
});

const addServerBundle = createAsyncThunk('cart/addServerBundle', async (intent, { rejectWithValue }) => {
  try {
    return (await bundleAPI.addToCart({ bundleId: intent.bundleId, quantity: intent.quantity, selections: intent.selections, source: intent.source }, intent.idempotencyKey)).data;
  } catch (error) { return rejectWithValue(cartFailure(error)); }
});

const reorderServer = createAsyncThunk('cart/reorderServer', async (intent, { rejectWithValue }) => {
  try {
    return (await orderAPI.reorder(intent.orderId, intent.idempotencyKey)).data;
  } catch (error) { return rejectWithValue(cartFailure(error)); }
});

const updateServerItem = createAsyncThunk('cart/updateServerItem', async (intent, { rejectWithValue }) => {
  try {
    return (await cartAPI.updateItem(intent.itemId, {
      quantity: intent.quantity,
      revision: intent.revision,
    }, intent.idempotencyKey)).data;
  } catch (error) { return rejectWithValue(cartFailure(error)); }
});

const removeServerItem = createAsyncThunk('cart/removeServerItem', async (intent, { rejectWithValue }) => {
  try { return (await cartAPI.removeItem(intent.itemId, intent.revision, intent.idempotencyKey)).data; }
  catch (error) { return rejectWithValue(cartFailure(error)); }
});

const clearServerCart = createAsyncThunk('cart/clearServerCart', async (intent, { rejectWithValue }) => {
  try { return (await cartAPI.clear(intent.revision, intent.idempotencyKey)).data; }
  catch (error) { return rejectWithValue(cartFailure(error)); }
});

export const importQuarantinedCart = createAsyncThunk('cart/importQuarantined', async (_, { rejectWithValue }) => {
  const quarantined = readQuarantinedCart();
  if (!quarantined) return null;
  try {
    const response = await cartAPI.import(quarantined.items, quarantined.idempotencyKey);
    removeQuarantinedCart();
    return response.data;
  } catch (error) { return rejectWithValue(cartFailure(error)); }
});

const initialState = {
  id: null,
  revision: 0,
  items: [],
  distinctItemCount: 0,
  itemCount: 0,
  subtotal: 0,
  hasUnavailableItems: false,
  updatedAt: null,
  hydrated: false,
  loading: false,
  activeMutations: 0,
  error: null,
  coupon: null,
  discount: 0,
  referralCode: null,
  pendingIntent: null,
  otpGateOpen: false,
  resumeStatus: 'idle',
  resumeError: null,
  hasQuarantinedCart: quarantineLegacyCart(),
};

const resetServerCartData = (state, hydrated = false) => {
  state.id = null;
  state.revision = 0;
  state.items = [];
  state.distinctItemCount = 0;
  state.itemCount = 0;
  state.subtotal = 0;
  state.hasUnavailableItems = false;
  state.updatedAt = null;
  state.hydrated = hydrated;
  state.loading = false;
  state.activeMutations = 0;
  state.error = null;
  state.coupon = null;
  state.discount = 0;
};

const applyServerCart = (state, cart) => {
  if (!cart) return;
  const incoming = normalizeServerCart(cart);
  // GET/add/import can overlap after login. A slow older response must never
  // roll a newer cart revision back in Redux.
  if (state.id && incoming.id === state.id && incoming.revision < state.revision) return;
  state.id = incoming.id;
  state.revision = incoming.revision;
  state.items = incoming.items;
  state.distinctItemCount = incoming.distinctItemCount;
  state.itemCount = incoming.itemCount;
  state.subtotal = incoming.subtotal;
  state.hasUnavailableItems = incoming.hasUnavailableItems;
  state.updatedAt = incoming.updatedAt;
  state.hydrated = true;
  state.error = null;
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    applyCoupon: (state, action) => {
      state.coupon = action.payload.coupon;
      state.discount = action.payload.discount;
    },
    removeCoupon: (state) => { state.coupon = null; state.discount = 0; },
    setReferralCode: (state, action) => { state.referralCode = action.payload; },
    queueCartIntent: (state, action) => {
      state.pendingIntent = action.payload;
      state.otpGateOpen = true;
      state.resumeStatus = 'idle';
      state.resumeError = null;
    },
    cancelCartIntent: (state) => {
      state.pendingIntent = null;
      state.otpGateOpen = false;
      state.resumeStatus = 'idle';
      state.resumeError = null;
    },
    beginCartResume: (state) => { state.resumeStatus = 'pending'; state.resumeError = null; },
    failCartResume: (state, action) => { state.resumeStatus = 'failed'; state.resumeError = action.payload || 'Cart update failed'; },
    completeCartResume: (state) => {
      state.pendingIntent = null;
      state.otpGateOpen = false;
      state.resumeStatus = 'completed';
      state.resumeError = null;
    },
    resetCartState: (state) => {
      resetServerCartData(state, true);
      state.pendingIntent = null;
      state.otpGateOpen = false;
      state.resumeStatus = 'idle';
      state.resumeError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCart.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchCart.fulfilled, (state, action) => {
        state.loading = false;
        applyServerCart(state, action.payload?.cart);
      })
      .addCase(fetchCart.rejected, (state, action) => {
        state.loading = false;
        state.hydrated = true;
        state.error = action.payload || { message: 'Unable to load cart' };
      })
      .addCase(importQuarantinedCart.fulfilled, (state, action) => {
        if (action.payload?.cart) applyServerCart(state, action.payload.cart);
        state.hasQuarantinedCart = false;
      })
      .addCase(importQuarantinedCart.rejected, (state, action) => {
        state.hasQuarantinedCart = true;
        state.error = action.payload || { message: 'Saved cart could not be restored' };
      });

    for (const thunk of [addServerItem, addServerBundle, reorderServer, updateServerItem, removeServerItem, clearServerCart]) {
      builder
        .addCase(thunk.pending, (state) => { state.activeMutations += 1; state.error = null; })
        .addCase(thunk.fulfilled, (state, action) => {
          state.activeMutations = Math.max(0, state.activeMutations - 1);
          applyServerCart(state, action.payload?.cart);
        })
        .addCase(thunk.rejected, (state, action) => {
          state.activeMutations = Math.max(0, state.activeMutations - 1);
          state.error = action.payload || { message: 'Cart update failed' };
        });
    }

    // A different authenticated account always gets a fresh server-cart view.
    for (const actionType of ['auth/verifyOtp/fulfilled', 'auth/googleLogin/fulfilled', 'auth/passwordLogin/fulfilled', 'auth/register/fulfilled', 'auth/adminLogin/fulfilled', 'auth/getMe/fulfilled']) {
      builder.addCase(actionType, (state) => resetServerCartData(state, false));
    }
    builder.addCase('auth/logout/fulfilled', (state) => {
      resetServerCartData(state, true);
      state.pendingIntent = null;
      state.otpGateOpen = false;
      state.resumeStatus = 'idle';
      state.resumeError = null;
    });
    builder.addCase('auth/getMe/rejected', (state) => resetServerCartData(state, true));
  },
});

const isOtpQualified = state => Boolean(
  state.auth?.cartVerificationEnabled === false
  || (state.auth?.isAuthenticated && state.auth?.session?.otpVerified === true),
);

const publicAddIntent = (payload = {}) => {
  const product = payload.product || {};
  const quantity = Number(payload.quantity ?? 1);
  const productId = product._id || payload.productId;
  if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null;
  return {
    type: 'add',
    intentId: mutationKey('intent'),
    idempotencyKey: payload.idempotencyKey || mutationKey('cart-add'),
    productId: String(productId),
    productTitle: String(product.title || payload.productTitle || 'this product').slice(0, 160),
    productSlug: String(product.slug || payload.productSlug || '').slice(0, 180),
    quantity,
    variant: safeVariant(payload.variant),
    source: String(payload.source || 'unknown').slice(0, 64),
    afterSuccessPath: payload.afterSuccessPath ? String(payload.afterSuccessPath).slice(0, 300) : '',
  };
};

const publicAddBundleIntent = (payload = {}) => {
  const bundle = payload.bundle || {};
  const quantity = Number(payload.quantity ?? 1);
  const bundleId = bundle._id || payload.bundleId;
  if (!bundleId || !/^[a-f\d]{24}$/i.test(String(bundleId)) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null;
  return {
    type: 'add-bundle',
    intentId: mutationKey('intent'),
    idempotencyKey: payload.idempotencyKey || mutationKey('bundle-add'),
    bundleId: String(bundleId),
    productTitle: String(bundle.name || bundle.title || payload.bundleTitle || 'Bundle').slice(0, 160),
    productSlug: String(bundle.slug || payload.bundleSlug || '').slice(0, 180),
    quantity,
    selections: payload.selections && typeof payload.selections === 'object' ? payload.selections : {},
    source: String(payload.source || 'bundle').slice(0, 64),
    afterSuccessPath: payload.afterSuccessPath ? String(payload.afterSuccessPath).slice(0, 300) : '',
  };
};

const publicReorderIntent = (payload = {}) => {
  const orderId = String(payload.orderId || '').trim();
  if (!/^[a-f\d]{24}$/i.test(orderId)) return null;
  return {
    type: 'reorder',
    intentId: mutationKey('intent'),
    idempotencyKey: payload.idempotencyKey || mutationKey('order-reorder'),
    orderId,
    orderNumber: String(payload.orderNumber || '').slice(0, 100),
    afterSuccessPath: payload.afterSuccessPath ? String(payload.afterSuccessPath).slice(0, 300) : '/cart',
  };
};

const successfulAddSideEffects = (intent, cart) => {
  const item = intent.type === 'add-bundle'
    ? cart?.items?.find(candidate => String(candidate.bundle?._id) === String(intent.bundleId))
    : cart?.items?.find(candidate => String(candidate.product?._id) === String(intent.productId));
  const price = Number(item?.unitPrice ?? item?.product?.price ?? 0);
  toast.success(`${intent.productTitle} added to cart`);
  trackGoogleAdsConversion('add_to_cart', {
    value: price * intent.quantity,
    items: [{ item_id: intent.productId, item_name: intent.productTitle, price, quantity: intent.quantity }],
  });
  trackMetaPixel('AddToCart', {
    content_ids: [String(intent.bundleId || intent.productId)],
    content_type: intent.type === 'add-bundle' ? 'product_group' : 'product',
    content_name: intent.productTitle,
    contents: [{ id: String(intent.bundleId || intent.productId), quantity: intent.quantity, item_price: price }],
    value: price * intent.quantity,
    currency: 'INR',
  });
  trackingAPI.track({
    eventType: 'add_to_cart',
    target: intent.productSlug,
    targetId: intent.bundleId || intent.productId,
    page: window.location.pathname,
  }).catch(() => {});
};

const executeCartIntent = async (dispatch, getState, intent) => {
  let action;
  if (intent.type === 'add') {
    action = await dispatch(addServerItem(intent));
    if (addServerItem.fulfilled.match(action)) successfulAddSideEffects(intent, action.payload?.cart);
  } else if (intent.type === 'add-bundle') {
    action = await dispatch(addServerBundle(intent));
    if (addServerBundle.fulfilled.match(action)) successfulAddSideEffects(intent, action.payload?.cart);
  } else if (intent.type === 'reorder') {
    action = await dispatch(reorderServer(intent));
  } else if (intent.type === 'set-quantity') {
    const state = getState().cart;
    const item = state.items.find(candidate => candidate.key === intent.itemId);
    if (!item) return { success: false, error: { message: 'Cart item no longer exists', code: 'CART_ITEM_NOT_FOUND' } };
    action = await dispatch(updateServerItem({ ...intent, revision: state.revision }));
  } else if (intent.type === 'remove') {
    action = await dispatch(removeServerItem({ ...intent, revision: getState().cart.revision }));
    if (removeServerItem.fulfilled.match(action)) toast.success('Item removed');
  } else if (intent.type === 'clear') {
    action = await dispatch(clearServerCart({ ...intent, revision: getState().cart.revision }));
  } else {
    return { success: false, error: { message: 'Unsupported cart action', code: 'CART_ACTION_INVALID' } };
  }

  if (action.meta.requestStatus === 'fulfilled') return { success: true, cart: action.payload?.cart, afterSuccessPath: intent.afterSuccessPath || '' };
  const error = action.payload || { message: 'Cart update failed' };
  if (error.code === 'CART_REVISION_CONFLICT') dispatch(fetchCart());
  return { success: false, error };
};

const queueIfNeeded = (dispatch, getState, intent) => {
  if (isOtpQualified(getState())) return false;
  if (getState().cart.pendingIntent) {
    toast('Complete phone verification for the pending cart action');
    return true;
  }
  dispatch(cartSlice.actions.queueCartIntent(intent));
  return true;
};

export const requestAddToCart = payload => async (dispatch, getState) => {
  const intent = publicAddIntent(payload);
  if (!intent) {
    toast.error('This product is no longer available');
    return { added: false, error: { message: 'Invalid product or quantity' } };
  }
  if (queueIfNeeded(dispatch, getState, intent)) return { added: false, requiresOtp: true };
  const result = await executeCartIntent(dispatch, getState, intent);
  if (!result.success && [401, 403].includes(Number(result.error?.status))) {
    dispatch(cartSlice.actions.queueCartIntent(intent));
    return { added: false, requiresOtp: true };
  }
  if (!result.success) toast.error(result.error?.message || 'Could not add this product');
  // Open the cart drawer the moment a product lands in the cart — unless the
  // caller opts out (e.g. Buy Now navigates straight to checkout).
  if (result.success && payload.openCart !== false) dispatch(setCartOpen(true));
  return { ...result, added: result.success };
};

export const requestAddBundleToCart = payload => async (dispatch, getState) => {
  const intent = publicAddBundleIntent(payload);
  if (!intent) {
    toast.error('This bundle is no longer available');
    return { added: false, error: { message: 'Invalid bundle or quantity' } };
  }
  if (queueIfNeeded(dispatch, getState, intent)) return { added: false, requiresOtp: true };
  const result = await executeCartIntent(dispatch, getState, intent);
  if (!result.success && [401, 403].includes(Number(result.error?.status))) {
    dispatch(cartSlice.actions.queueCartIntent(intent));
    return { added: false, requiresOtp: true };
  }
  if (!result.success) toast.error(result.error?.message || 'Could not add this bundle');
  if (result.success && payload.openCart !== false) dispatch(setCartOpen(true));
  return { ...result, added: result.success };
};

export const requestReorder = payload => async (dispatch, getState) => {
  const intent = publicReorderIntent(payload);
  if (!intent) {
    toast.error('This order cannot be reordered');
    return { success: false, error: { message: 'Invalid order identifier' } };
  }
  if (queueIfNeeded(dispatch, getState, intent)) return { success: false, requiresOtp: true };
  const result = await executeCartIntent(dispatch, getState, intent);
  if (!result.success && [401, 403].includes(Number(result.error?.status))) {
    dispatch(cartSlice.actions.queueCartIntent(intent));
    return { success: false, requiresOtp: true };
  }
  if (!result.success) toast.error(result.error?.message || 'Could not reorder this order');
  return result;
};

export const resumePendingCartIntent = () => async (dispatch, getState) => {
  const { pendingIntent, resumeStatus } = getState().cart;
  if (!pendingIntent) return { success: false, error: { message: 'No pending cart action' } };
  if (resumeStatus === 'pending') return { success: false, inProgress: true };
  if (!isOtpQualified(getState())) return { success: false, error: { message: 'Cart verification is still required' } };
  dispatch(cartSlice.actions.beginCartResume());
  const result = await executeCartIntent(dispatch, getState, pendingIntent);
  if (result.success) dispatch(cartSlice.actions.completeCartResume());
  else dispatch(cartSlice.actions.failCartResume(result.error?.message || 'Cart update failed'));
  return result;
};

export const updateQuantity = ({ key, quantity }) => async (dispatch, getState) => {
  if (Number(quantity) <= 0) return dispatch(removeFromCart(key));
  const intent = {
    type: 'set-quantity', itemId: String(key), quantity: Number(quantity),
    idempotencyKey: mutationKey('cart-quantity'), source: 'cart-quantity',
  };
  if (queueIfNeeded(dispatch, getState, intent)) return { updated: false, requiresOtp: true };
  const result = await executeCartIntent(dispatch, getState, intent);
  if (!result.success) toast.error(result.error?.message || 'Could not update quantity');
  return { ...result, updated: result.success };
};

export const removeFromCart = key => async (dispatch, getState) => {
  const intent = { type: 'remove', itemId: String(key), idempotencyKey: mutationKey('cart-remove'), source: 'cart-remove' };
  if (queueIfNeeded(dispatch, getState, intent)) return { removed: false, requiresOtp: true };
  const result = await executeCartIntent(dispatch, getState, intent);
  if (!result.success) toast.error(result.error?.message || 'Could not remove item');
  return { ...result, removed: result.success };
};

export const clearCart = () => async (dispatch, getState) => {
  if (!getState().cart.items.length) return { success: true };
  const intent = { type: 'clear', idempotencyKey: mutationKey('cart-clear'), source: 'cart-clear' };
  if (queueIfNeeded(dispatch, getState, intent)) return { success: false, requiresOtp: true };
  const result = await executeCartIntent(dispatch, getState, intent);
  if (!result.success) toast.error(result.error?.message || 'Could not clear cart');
  return result;
};

export const {
  applyCoupon,
  removeCoupon,
  setReferralCode,
  cancelCartIntent,
  resetCartState,
} = cartSlice.actions;

export const selectCartItems = state => state.cart?.items || [];
export const selectCartTotal = state => Number(state.cart?.subtotal || 0);
export const selectCartCount = state => Number(state.cart?.itemCount || 0);

export default cartSlice.reducer;
