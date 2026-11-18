import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Loader from '../common/Loader';
import { vendorAPI } from '../../services/api';

export default function VendorRoute({ children }) {
  const { user, initialized, loading } = useSelector((s) => s.auth);
  const [memberCheck, setMemberCheck] = useState(null);

  // Store owners pass on role alone. Invited team members keep their own
  // login role (customer/staff), so verify them against the seller portal:
  // the backend resolves active memberships through vendorAuth.
  useEffect(() => {
    if (!initialized || loading || !user || user.role === 'vendor') {
      setMemberCheck(null);
      return;
    }
    let cancelled = false;
    setMemberCheck('checking');
    vendorAPI.getStore()
      .then(() => { if (!cancelled) setMemberCheck('ok'); })
      .catch(() => { if (!cancelled) setMemberCheck('denied'); });
    return () => { cancelled = true; };
  }, [initialized, loading, user]);

  if (!initialized || loading) {
    return <Loader size="lg" text="Authenticating…" fullScreen />;
  }
  if (!user) return <Navigate to="/login?redirect=/vendor/dashboard" replace />;
  if (user.role === 'vendor') return children;
  if (memberCheck === 'checking' || memberCheck === null) {
    return <Loader size="lg" text="Checking team access…" fullScreen />;
  }
  if (memberCheck === 'ok') return children;
  return <Navigate to="/" replace />;
}
