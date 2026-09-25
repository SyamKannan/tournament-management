import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { useToast } from './ui/Toast';
import { label } from '../lib/labels';

export const ImpersonationBanner: React.FC = () => {
  const { isImpersonating, user, organization, role, stopImpersonating } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [isExiting, setIsExiting] = useState(false);

  if (!isImpersonating) {
    return null;
  }

  const handleExit = async () => {
    try {
      setIsExiting(true);
      await stopImpersonating();
      toast.success('Exited impersonation. Restored Platform Super Admin session.');
      navigate('/admin/dashboard');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to exit impersonation');
    } finally {
      setIsExiting(false);
    }
  };

  // Logged in as a club: the club is who you are, not its admin user.
  const isClub = role === 'ORG_ADMIN' && !!organization;

  const roleLabel = 
    role === 'ORG_ADMIN' ? 'Club / Org Admin' :
    role === 'PLAYER' ? 'Player / Athlete' :
    role === 'TEAM_MANAGER' ? 'Team Manager' :
    role === 'SCORER' ? 'Official Scorer' : label(role);

  return (
    <aside
      aria-label="Impersonation Mode Active"
      className="w-full bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white shadow-xl shadow-amber-950/40 border-b border-amber-400/30 backdrop-blur-md transition-all animate-in slide-in-from-top-2 duration-300"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-black/25 border border-white/20 flex items-center justify-center flex-shrink-0 animate-pulse">
            <ShieldAlert className="w-4 h-4 text-amber-200" />
          </div>
          <div className="truncate">
            <span className="font-bold tracking-wide uppercase text-xs bg-black/30 px-2 py-0.5 rounded-full border border-white/10 mr-2 text-amber-200 inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> {isClub ? 'Viewing as club' : 'Viewing as'}
            </span>
            <span className="font-semibold text-white truncate">
              {isClub ? organization.name : (user?.name || 'User')}
            </span>
            {!isClub && (
              <span className="text-amber-100/90 ml-1.5 hidden sm:inline text-xs">
                ({roleLabel}{organization ? ` • ${organization.name}` : ''})
              </span>
            )}
          </div>
        </div>

        <button
          onClick={handleExit}
          disabled={isExiting}
          className="px-3.5 py-1.5 rounded-xl bg-slate-950/90 hover:bg-black text-amber-300 hover:text-amber-200 font-bold text-xs shadow-md border border-amber-400/40 transition-all flex items-center gap-2 flex-shrink-0 active:scale-95 disabled:opacity-50"
        >
          {isExiting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Restoring Admin...</span>
            </>
          ) : (
            <>
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Exit Impersonation</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
