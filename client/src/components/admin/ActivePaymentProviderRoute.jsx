import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import Loader from '../common/Loader';
import { adminAPI } from '../../services/api';

const PAYMENT_PROVIDERS = new Set(['razorpay', 'cashfree', 'stripe']);

const normalizeProviders = settings => {
 const configured = Array.isArray(settings?.active_payment_providers)
  ? settings.active_payment_providers
  : settings?.active_payment_provider ? [settings.active_payment_provider] : [];
 return [...new Set(configured.map(value => String(value || '').toLowerCase()).filter(value => PAYMENT_PROVIDERS.has(value)))];
};

const providerPath = provider => provider === 'razorpay'
 ? '/admin/razorpay'
 : `/admin/payments/${provider}`;

export default function ActivePaymentProviderRoute({ provider: fixedProvider, children }) {
 const params = useParams();
 const requestedProvider = String(fixedProvider || params.provider || '').toLowerCase();
 const [activeProviders, setActiveProviders] = useState(undefined);
 const [failed, setFailed] = useState(false);

 useEffect(() => {
  let mounted = true;
  adminAPI.getSettings().then(response => {
   const providers = normalizeProviders(response.data?.settings);
   if (mounted) setActiveProviders(providers);
  }).catch(() => {
   if (mounted) setFailed(true);
  });

  const handleProviderUpdate = event => {
   if (mounted) setActiveProviders(normalizeProviders({ active_payment_providers: event.detail?.providers }));
  };
  window.addEventListener('active-payment-providers-updated', handleProviderUpdate);
  return () => {
   mounted = false;
   window.removeEventListener('active-payment-providers-updated', handleProviderUpdate);
  };
 }, []);

 if (failed) return <Navigate to="/admin/modules" replace />;
 if (activeProviders === undefined) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
 if (!activeProviders.length) return <Navigate to="/admin/modules" replace />;
 if (!activeProviders.includes(requestedProvider)) return <Navigate to={providerPath(activeProviders[0])} replace />;
 return children;
}
