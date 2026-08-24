import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './components/ui/ConfirmDialog';

import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterClubPage } from './pages/auth/RegisterClubPage';
import { PublicTournamentPage } from './pages/public/PublicTournamentPage';
import { PublicOrganizationPage } from './pages/public/PublicOrganizationPage';
import { PublicTeamRegisterPage } from './pages/public/PublicTeamRegisterPage';
import { ScoreboardTVPage } from './pages/public/ScoreboardTVPage';

// Player Auction & Statistics Pages
import { PublicPlayerAuctionRegisterPage } from './pages/public/PublicPlayerAuctionRegisterPage';
import { LiveAuctionArenaPage } from './pages/auction/LiveAuctionArenaPage';
import { AuctionTVPage } from './pages/auction/AuctionTVPage';
import { PlayerDashboardPage } from './pages/player/PlayerDashboardPage';
import { PublicPlayerProfilePage } from './pages/public/PublicPlayerProfilePage';

// Super Admin Pages
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminPlansPage } from './pages/admin/AdminPlansPage';
import { AdminOrganizationsPage } from './pages/admin/AdminOrganizationsPage';
import { AdminSubscriptionsPage } from './pages/admin/AdminSubscriptionsPage';
import { AdminAuditLogsPage } from './pages/admin/AdminAuditLogsPage';

// Organization Admin Pages
import { OrgDashboard } from './pages/organization/OrgDashboard';
import { OrgTournamentsPage } from './pages/organization/OrgTournamentsPage';
import { OrgTeamsPage } from './pages/organization/OrgTeamsPage';
import { OrgFixturesPage } from './pages/organization/OrgFixturesPage';
import { OrgLiveScorerPage } from './pages/organization/OrgLiveScorerPage';
import { OrgSponsorsAdsPage } from './pages/organization/OrgSponsorsAdsPage';
import { OrgAnnouncementsPage } from './pages/organization/OrgAnnouncementsPage';
import { OrgReportsPage } from './pages/organization/OrgReportsPage';
import { OrgTournamentAuctionManagePage } from './pages/organization/OrgTournamentAuctionManagePage';

// Team Manager Workspace
import { TeamAuctionPage, TeamAuctionsListPage } from './pages/team/TeamAuctionPage';

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Big-screen scoreboard and auction TV routes render edge to edge, with no
  // application chrome around them.
  const isTVMode = location.pathname.startsWith('/scoreboard') || location.pathname.startsWith('/auction/tv');
  const isAdmin = location.pathname.startsWith('/admin');
  const isOrg = location.pathname.startsWith('/organization');
  const hasSidebar = isAdmin || isOrg;

  // Route changes close the mobile drawer and return the reader to the top.
  useEffect(() => {
    setSidebarOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (isTVMode) {
    return <main className="min-h-screen bg-slate-950 text-slate-100">{children}</main>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <a href="#main-content" className="skip-link">Skip to content</a>

      <Navbar showMenuButton={hasSidebar} onMenuClick={() => setSidebarOpen(true)} />

      <div className="flex-1 flex w-full">
        {hasSidebar && (
          <Sidebar
            type={isAdmin ? 'admin' : 'organization'}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        )}

        <main
          id="main-content"
          // `min-w-0` lets the flex child shrink below its content width, which
          // is what stops wide tables from pushing the whole page sideways.
          className={`flex-1 min-w-0 ${hasSidebar ? 'p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full' : ''}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppLayout>
              <Routes>
                {/* Public Hub & Landing */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register-club" element={<RegisterClubPage />} />
                <Route path="/tournaments/:slug" element={<PublicTournamentPage />} />
                <Route path="/organizations/:slug" element={<PublicOrganizationPage />} />
                <Route path="/register/team/:token" element={<PublicTeamRegisterPage />} />
                <Route path="/scoreboard/match/:id" element={<ScoreboardTVPage />} />

                {/* Public Player Auction & Player Profiles */}
                <Route path="/register/player-auction/:token" element={<PublicPlayerAuctionRegisterPage />} />
                <Route path="/auction/:id" element={<LiveAuctionArenaPage />} />
                <Route path="/auction/tv/:id" element={<AuctionTVPage />} />
                <Route path="/players/:id" element={<PublicPlayerProfilePage />} />

                {/* Player Personal Dashboard (Protected) */}
                <Route path="/player/dashboard" element={
                  <ProtectedRoute allowedRoles={['PLAYER', 'ORG_ADMIN', 'SUPER_ADMIN']}>
                    <PlayerDashboardPage />
                  </ProtectedRoute>
                } />

                {/* Super Admin Workspace (Protected) */}
                <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="/admin/dashboard" element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/admin/plans" element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                    <AdminPlansPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/organizations" element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                    <AdminOrganizationsPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/subscriptions" element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                    <AdminSubscriptionsPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/settings" element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                    <AdminAuditLogsPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/audit-logs" element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                    <AdminAuditLogsPage />
                  </ProtectedRoute>
                } />

                {/* Organization Workspace (Protected) */}
                <Route path="/organization" element={<Navigate to="/organization/dashboard" replace />} />
                <Route path="/organization/dashboard" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SUPER_ADMIN']}>
                    <OrgDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/organization/tournaments" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SUPER_ADMIN']}>
                    <OrgTournamentsPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/auction/:id" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SUPER_ADMIN']}>
                    <LiveAuctionArenaPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/tournaments/:tournamentId/auction" element={
              <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SUPER_ADMIN']}>
                <OrgTournamentAuctionManagePage />
              </ProtectedRoute>
            } />
            <Route path="/organization/teams" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SUPER_ADMIN']}>
                    <OrgTeamsPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/fixtures" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SUPER_ADMIN']}>
                    <OrgFixturesPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/scorer/:matchId" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SUPER_ADMIN', 'SCORER']}>
                    <OrgLiveScorerPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/scorer" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SUPER_ADMIN', 'SCORER']}>
                    <OrgLiveScorerPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/sponsors" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SUPER_ADMIN']}>
                    <OrgSponsorsAdsPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/announcements" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SUPER_ADMIN']}>
                    <OrgAnnouncementsPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/reports" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SUPER_ADMIN']}>
                    <OrgReportsPage />
                  </ProtectedRoute>
                } />

                {/* Team Manager Workspace (Protected) */}
            <Route path="/team" element={<Navigate to="/team/auctions" replace />} />
            <Route path="/team/auctions" element={
              <ProtectedRoute allowedRoles={['TEAM_MANAGER', 'ORG_ADMIN', 'SUPER_ADMIN']}>
                <TeamAuctionsListPage />
              </ProtectedRoute>
            } />
            <Route path="/team/auction/:id" element={
              <ProtectedRoute allowedRoles={['TEAM_MANAGER', 'ORG_ADMIN', 'SUPER_ADMIN']}>
                <TeamAuctionPage />
              </ProtectedRoute>
            } />

            {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppLayout>
          </BrowserRouter>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
};

export default App;
