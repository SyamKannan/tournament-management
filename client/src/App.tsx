import React, { Suspense, lazy, useEffect, useState } from 'react';
import { PageLoader } from './components/ui/SportsLoader';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PlatformConfigProvider, usePlatformConfig } from './context/PlatformConfigContext';
import { Navbar } from './components/Navbar';
import { AssistantChat } from './components/AssistantChat';
import { Sidebar } from './components/Sidebar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PreferencesProvider } from './i18n';
import { MustChangePasswordGate } from './components/MustChangePasswordGate';
import { OfflineBanner } from './components/OfflineBanner';
import { AppInstall } from './components/AppInstall';
import { LandingPage } from './pages/LandingPage';

/**
 * Pages are split into their own chunks so a visitor on the landing page or a
 * public scoreboard doesn't download the admin, scorer and auction screens.
 */
function lazyPage<K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) {
  return lazy(() => load().then(module => ({ default: module[name] })));
}

/**
 * A route that only exists where this deployment can send WhatsApp/SMS.
 *
 * Both routes behind it are useless without a gateway: the club's message log,
 * and "forgot password", which sends a code by SMS. Typing the URL lands on
 * the sign-in page rather than a screen that cannot work. The check waits for
 * the platform config so a slow answer doesn't bounce someone out of a page
 * they are allowed to see.
 */
const MessagingRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { messagingEnabled, isLoading } = usePlatformConfig();

  if (isLoading) return <PageLoader />;

  return messagingEnabled ? <>{children}</> : <Navigate to="/login" replace />;
};

const LoginPage = lazyPage(() => import('./pages/auth/LoginPage'), 'LoginPage');
const RegisterClubPage = lazyPage(() => import('./pages/auth/RegisterClubPage'), 'RegisterClubPage');
const RegisterPlayerPage = lazyPage(() => import('./pages/auth/RegisterPlayerPage'), 'RegisterPlayerPage');
const ForgotPasswordPage = lazyPage(() => import('./pages/auth/ForgotPasswordPage'), 'ForgotPasswordPage');
const NotFoundPage = lazyPage(() => import('./pages/NotFoundPage'), 'NotFoundPage');
const PublicTournamentPage = lazyPage(() => import('./pages/public/PublicTournamentPage'), 'PublicTournamentPage');
const PublicOrganizationPage = lazyPage(() => import('./pages/public/PublicOrganizationPage'), 'PublicOrganizationPage');
const PublicPlayerSearchPage = lazyPage(() => import('./pages/public/PublicPlayerSearchPage'), 'PublicPlayerSearchPage');
const PublicTeamRegisterPage = lazyPage(() => import('./pages/public/PublicTeamRegisterPage'), 'PublicTeamRegisterPage');
const ScoreboardTVPage = lazyPage(() => import('./pages/public/ScoreboardTVPage'), 'ScoreboardTVPage');

// Player Auction & Statistics Pages
const PublicPlayerAuctionRegisterPage = lazyPage(() => import('./pages/public/PublicPlayerAuctionRegisterPage'), 'PublicPlayerAuctionRegisterPage');
const LiveAuctionArenaPage = lazyPage(() => import('./pages/auction/LiveAuctionArenaPage'), 'LiveAuctionArenaPage');
const AuctionTVPage = lazyPage(() => import('./pages/auction/AuctionTVPage'), 'AuctionTVPage');
const PlayerDashboardPage = lazyPage(() => import('./pages/player/PlayerDashboardPage'), 'PlayerDashboardPage');
const PublicPlayerProfilePage = lazyPage(() => import('./pages/public/PublicPlayerProfilePage'), 'PublicPlayerProfilePage');
const MyProfilePage = lazyPage(() => import('./pages/account/MyProfilePage'), 'MyProfilePage');

// Super Admin Pages
const AdminDashboard = lazyPage(() => import('./pages/admin/AdminDashboard'), 'AdminDashboard');
const AdminPlansPage = lazyPage(() => import('./pages/admin/AdminPlansPage'), 'AdminPlansPage');
const AdminReviewsPage = lazyPage(() => import('./pages/admin/AdminReviewsPage'), 'AdminReviewsPage');
const AdminOrganizationsPage = lazyPage(() => import('./pages/admin/AdminOrganizationsPage'), 'AdminOrganizationsPage');
const AdminSubscriptionsPage = lazyPage(() => import('./pages/admin/AdminSubscriptionsPage'), 'AdminSubscriptionsPage');
const AdminAuditLogsPage = lazyPage(() => import('./pages/admin/AdminAuditLogsPage'), 'AdminAuditLogsPage');
const AdminPlatformSettingsPage = lazyPage(() => import('./pages/admin/AdminPlatformSettingsPage'), 'AdminPlatformSettingsPage');
const AdminSportsPage = lazyPage(() => import('./pages/admin/AdminSportsPage'), 'AdminSportsPage');
const AdminUsersPage = lazyPage(() => import('./pages/admin/AdminUsersPage'), 'AdminUsersPage');

// Organization Admin Pages
const OrgDashboard = lazyPage(() => import('./pages/organization/OrgDashboard'), 'OrgDashboard');
const OrgTournamentsPage = lazyPage(() => import('./pages/organization/OrgTournamentsPage'), 'OrgTournamentsPage');
const OrgTeamsPage = lazyPage(() => import('./pages/organization/OrgTeamsPage'), 'OrgTeamsPage');
const OrgFixturesPage = lazyPage(() => import('./pages/organization/OrgFixturesPage'), 'OrgFixturesPage');
const OrgLiveScorerPage = lazyPage(() => import('./pages/organization/OrgLiveScorerPage'), 'OrgLiveScorerPage');
const OrgSponsorsAdsPage = lazyPage(() => import('./pages/organization/OrgSponsorsAdsPage'), 'OrgSponsorsAdsPage');
const OrgAnnouncementsPage = lazyPage(() => import('./pages/organization/OrgAnnouncementsPage'), 'OrgAnnouncementsPage');
const OrgNotificationsPage = lazyPage(() => import('./pages/organization/OrgNotificationsPage'), 'OrgNotificationsPage');
const OrgMembersPage = lazyPage(() => import('./pages/organization/OrgMembersPage'), 'OrgMembersPage');
const OrgVenuesPage = lazyPage(() => import('./pages/organization/OrgVenuesPage'), 'OrgVenuesPage');
const OrgReportsPage = lazyPage(() => import('./pages/organization/OrgReportsPage'), 'OrgReportsPage');
const OrgBillingPage = lazyPage(() => import('./pages/organization/OrgBillingPage'), 'OrgBillingPage');
const OrgTournamentAuctionManagePage = lazyPage(() => import('./pages/organization/OrgTournamentAuctionManagePage'), 'OrgTournamentAuctionManagePage');
const OrgPostersPage = lazyPage(() => import('./pages/organization/OrgPostersPage'), 'OrgPostersPage');

// Team Manager Workspace
const TeamAuctionPage = lazyPage(() => import('./pages/team/TeamAuctionPage'), 'TeamAuctionPage');
const TeamAuctionsListPage = lazyPage(() => import('./pages/team/TeamAuctionPage'), 'TeamAuctionsListPage');
const TeamDashboardPage = lazyPage(() => import('./pages/team/TeamDashboardPage'), 'TeamDashboardPage');
const TeamPaymentsPage = lazyPage(() => import('./pages/team/TeamPaymentsPage'), 'TeamPaymentsPage');
const TeamSquadPage = lazyPage(() => import('./pages/team/TeamSquadPage'), 'TeamSquadPage');
const TeamFixturesPage = lazyPage(() => import('./pages/team/TeamFixturesPage'), 'TeamFixturesPage');
const TeamJoinPage = lazyPage(() => import('./pages/team/TeamJoinPage'), 'TeamJoinPage');

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Big-screen scoreboard and auction TV routes render edge to edge, with no
  // application chrome around them.
  const isTVMode = location.pathname.startsWith('/scoreboard') || location.pathname.startsWith('/auction/tv');
  const isAdmin = location.pathname.startsWith('/admin');
  const isOrg = location.pathname.startsWith('/organization');
  // The team manager's workspace; the live auction room keeps its own full-width layout.
  const isTeam = /^\/team\/(dashboard|squad|fixtures|join|payments)/.test(location.pathname);
  const hasSidebar = isAdmin || isOrg || isTeam;

  // Route changes close the mobile drawer and return the reader to the top.
  useEffect(() => {
    setSidebarOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (isTVMode) {
    return (
      <main data-theme="dark" className="min-h-screen bg-slate-950 text-slate-100">
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageLoader />}>{children}</Suspense>
        </ErrorBoundary>
      </main>
    );
  }

  return (
    <div className={`min-h-screen text-slate-100 flex flex-col font-sans ${hasSidebar ? 'app-shell' : 'bg-slate-950'}`}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <OfflineBanner />
      <AppInstall />
      <MustChangePasswordGate />

      <Navbar showMenuButton={hasSidebar} onMenuClick={() => setSidebarOpen(true)} />

      <div className="flex-1 flex w-full">
        {hasSidebar && (
          <Sidebar
            type={isAdmin ? 'admin' : isTeam ? 'team' : 'organization'}
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
          <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageLoader />}>{children}</Suspense>
        </ErrorBoundary>
        </main>
      </div>

      <AssistantChat />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <PreferencesProvider>
    <ToastProvider>
      <ConfirmProvider>
        <PlatformConfigProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppLayout>
              <Routes>
                {/* Public Hub & Landing */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register-club" element={<RegisterClubPage />} />
                <Route path="/register-player" element={<RegisterPlayerPage />} />
                <Route path="/forgot-password" element={
                  <MessagingRoute>
                    <ForgotPasswordPage />
                  </MessagingRoute>
                } />
                <Route path="/tournaments/:slug" element={<PublicTournamentPage />} />
                <Route path="/organizations/:slug" element={<PublicOrganizationPage />} />
                <Route path="/register/team/:token" element={<PublicTeamRegisterPage />} />
                <Route path="/scoreboard/match/:id" element={<ScoreboardTVPage />} />

                {/* Public Player Auction & Player Profiles */}
                <Route path="/register/player-auction/:token" element={<PublicPlayerAuctionRegisterPage />} />
                <Route path="/auction/:id" element={<LiveAuctionArenaPage />} />
                <Route path="/auction/tv/:id" element={<AuctionTVPage />} />
                <Route path="/players" element={<PublicPlayerSearchPage />} />
                <Route path="/players/:id" element={<PublicPlayerProfilePage />} />

                {/* Account Settings — every authenticated role manages their own profile here */}
                <Route path="/account/profile" element={
                  <ProtectedRoute>
                    <MyProfilePage />
                  </ProtectedRoute>
                } />

                {/* Player Personal Dashboard (Protected) — a club/org account has no
                    personal player identity, so only an actual player role (or an
                    admin/org session that has impersonated one, which swaps the
                    session's role to PLAYER) can land here. */}
                <Route path="/player/dashboard" element={
                  <ProtectedRoute allowedRoles={['PLAYER']}>
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
                <Route path="/admin/reviews" element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                    <AdminReviewsPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/sports" element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                    <AdminSportsPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/users" element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                    <AdminUsersPage />
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
                    <AdminPlatformSettingsPage />
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
                  <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                    <OrgDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/organization/tournaments" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                    <OrgTournamentsPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/auction/:id" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                    <LiveAuctionArenaPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/tournaments/:tournamentId/auction" element={
              <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                <OrgTournamentAuctionManagePage />
              </ProtectedRoute>
            } />
            <Route path="/organization/teams" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                    <OrgTeamsPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/tournaments/:tournamentId/teams" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                    <OrgTeamsPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/fixtures" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                    <OrgFixturesPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/tournaments/:tournamentId/fixtures" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                    <OrgFixturesPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/scorer/:matchId" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SCORER']}>
                    <OrgLiveScorerPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/scorer" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SCORER']}>
                    <OrgLiveScorerPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/posters" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN', 'SCORER']}>
                    <OrgPostersPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/sponsors" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                    <OrgSponsorsAdsPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/announcements" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                    <OrgAnnouncementsPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/venues" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                    <OrgVenuesPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/notifications" element={
                  <MessagingRoute>
                    <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                      <OrgNotificationsPage />
                    </ProtectedRoute>
                  </MessagingRoute>
                } />
                <Route path="/organization/members" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                    <OrgMembersPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/reports" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                    <OrgReportsPage />
                  </ProtectedRoute>
                } />
                <Route path="/organization/billing" element={
                  <ProtectedRoute allowedRoles={['ORG_ADMIN']}>
                    <OrgBillingPage />
                  </ProtectedRoute>
                } />

                {/* Team Manager Workspace (Protected) */}
            <Route path="/team" element={<Navigate to="/team/dashboard" replace />} />
            <Route path="/team/dashboard" element={
              <ProtectedRoute allowedRoles={['TEAM_MANAGER']}>
                <TeamDashboardPage />
              </ProtectedRoute>
            } />
            <Route path="/team/payments" element={
              <ProtectedRoute allowedRoles={['TEAM_MANAGER']}>
                <TeamPaymentsPage />
              </ProtectedRoute>
            } />
            <Route path="/team/squad" element={
              <ProtectedRoute allowedRoles={['TEAM_MANAGER']}>
                <TeamSquadPage />
              </ProtectedRoute>
            } />
            <Route path="/team/fixtures" element={
              <ProtectedRoute allowedRoles={['TEAM_MANAGER']}>
                <TeamFixturesPage />
              </ProtectedRoute>
            } />
            <Route path="/team/join" element={
              <ProtectedRoute allowedRoles={['TEAM_MANAGER']}>
                <TeamJoinPage />
              </ProtectedRoute>
            } />
            <Route path="/team/auctions" element={
              <ProtectedRoute allowedRoles={['TEAM_MANAGER', 'ORG_ADMIN']}>
                <TeamAuctionsListPage />
              </ProtectedRoute>
            } />
            <Route path="/team/auction/:id" element={
              <ProtectedRoute allowedRoles={['TEAM_MANAGER', 'ORG_ADMIN']}>
                <TeamAuctionPage />
              </ProtectedRoute>
            } />

                {/* Fallback */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </AppLayout>
          </BrowserRouter>
        </AuthProvider>
        </PlatformConfigProvider>
      </ConfirmProvider>
    </ToastProvider>
    </PreferencesProvider>
  );
};

export default App;
