import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import Loader from '../common/Loader';
import { adminAPI } from '../../services/api';

const SHIPPING_PROVIDERS = new Set(['shiprocket', 'delhivery', 'xpressbees', 'bluedart', 'dtdc']);

const normalizeProvider = (value) => {
 const provider = String(value || '').trim().toLowerCase();
 return SHIPPING_PROVIDERS.has(provider) ? provider : null;
};

const providerPath = (provider) => provider === 'shiprocket'
 ? '/admin/shiprocket'
 : `/admin/shipping/${provider}`;

export default function ActiveShippingProviderRoute({ provider: fixedProvider, children }) {
 const params = useParams();
 const requestedProvider = String(fixedProvider || params.provider || '').toLowerCase();
 const [activeProvider, setActiveProvider] = useState(undefined);
 const [failed, setFailed] = useState(false);

 useEffect(() => {
  let mounted = true;
  adminAPI.getSettings().then((response) => {
   if (mounted) setActiveProvider(normalizeProvider(response.data?.settings?.active_shipping_provider));
  }).catch(() => {
   if (mounted) setFailed(true);
  });

  const handleProviderUpdate = (event) => {
   if (mounted) setActiveProvider(normalizeProvider(event.detail?.provider));
  };
  window.addEventListener('active-shipping-provider-updated', handleProviderUpdate);
  return () => {
   mounted = false;
   window.removeEventListener('active-shipping-provider-updated', handleProviderUpdate);
  };
 }, []);

 if (failed) return <Navigate to="/admin/settings" replace />;
 if (activeProvider === undefined) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
 if (activeProvider === null) return <Navigate to="/admin/modules" replace />;
 if (activeProvider !== requestedProvider) return <Navigate to={providerPath(activeProvider)} replace />;
 return children;
}
