import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, role, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-400 font-medium">Verifying authorization...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    const requiredRole = allowedRoles?.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : 'ORG_ADMIN';
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}&role=${requiredRole}`} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    // If Super Admin accesses Org dashboard or vice versa
    if (role === 'SUPER_ADMIN') {
      return <>{children}</>;
    }
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
