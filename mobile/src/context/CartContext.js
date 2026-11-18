import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { cartApi } from '../lib/api';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);
const emptyCart = { items: [], itemCount: 0, distinctItemCount: 0, subtotal: 0, revision: 0, currency: 'INR' };

export function CartProvider({ children }) {
  const { ready, isAuthenticated } = useAuth();
  const [cart, setCart] = useState(emptyCart);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return emptyCart;
    try {
      const result = await cartApi.get();
      const next = result.cart || emptyCart;
      setCart(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!ready) return;
    void Promise.resolve().then(() => {
      if (!isAuthenticated) {
        setCart(emptyCart);
        setLoading(false);
        return;
      }
      return refresh().catch(() => {});
    });
  }, [ready, isAuthenticated, refresh]);

  const applyMutation = useCallback(async promise => {
    const result = await promise;
    if (result.cart) setCart(result.cart);
    return result.cart;
  }, []);

  const addItem = useCallback(data => applyMutation(cartApi.add(data)), [applyMutation]);
  const updateItem = useCallback((id, quantity) => applyMutation(cartApi.update(id, quantity, cart.revision)), [applyMutation, cart.revision]);
  const removeItem = useCallback(id => applyMutation(cartApi.remove(id, cart.revision)), [applyMutation, cart.revision]);
  const clear = useCallback(() => applyMutation(cartApi.clear(cart.revision)), [applyMutation, cart.revision]);
  const value = useMemo(() => ({ cart, loading, refresh, addItem, updateItem, removeItem, clear }), [cart, loading, refresh, addItem, updateItem, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside CartProvider');
  return value;
}
