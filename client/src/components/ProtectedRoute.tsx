import React from 'react';
import { PageLoader } from './ui/SportsLoader';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';
import { roleHome } from '../lib/roleHome';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, role, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <PageLoader label="Checking your access…" />
    );
  }

  if (!isAuthenticated || !user) {
    const requiredRole = allowedRoles?.length === 1 && allowedRoles[0] === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ORG_ADMIN';
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}&role=${requiredRole}`} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    // Signed in, just not for this page (e.g. right after impersonating from an admin page):
    // go to their own workspace rather than bouncing through the login screen.
    return <Navigate to={roleHome(role)} replace />;
  }

  return <>{children}</>;
};
