import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Loader from './Loader';

const ADMIN_ROLES = ['staff', 'admin', 'superadmin'];

/**
 * AdminRoute – wraps routes that require an admin or superadmin user.
 *
 * Behaviour
 * ---------
 * 1. While auth is initialising → full-screen loader.
 * 2. Not authenticated → redirect to /admin/login.
 * 3. Authenticated staff must still pass the server-side tenant membership and
 * permission gate on every API request.
 * 4. Valid admin/staff → renders children.
 */
const AdminRoute = ({ children }) => {
 const location = useLocation();
 const { isAuthenticated, initialized, loading, user } = useSelector((state) => state.auth);

 if (!initialized || loading) {
 return <Loader size="lg" text="Verifying access…" fullScreen />;
 }

 const isAdmin = isAuthenticated && user && ADMIN_ROLES.includes(user.role);

 if (!isAdmin) {
 return (
 <Navigate
 to="/admin/login"
 state={{ from: location }}
 replace
 />
 );
 }

 return children;
};

export default AdminRoute;
