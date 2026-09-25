<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AssistantController;
use App\Http\Controllers\Api\AuctionController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ExportController;
use App\Http\Controllers\Api\LineupController;
use App\Http\Controllers\Api\MatchController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\OrganizationController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PlatformController;
use App\Http\Controllers\Api\ReviewController;
use App\Http\Controllers\Api\PlayerController;
use App\Http\Controllers\Api\PosterController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SponsorController;
use App\Http\Controllers\Api\SupportController;
use App\Http\Controllers\Api\TeamController;
use App\Http\Controllers\Api\TossController;
use App\Http\Controllers\Api\TournamentController;
use App\Http\Controllers\Api\UploadController;
use App\Http\Controllers\Api\VenueController;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Every request passes through ResolveApiUser, which identifies the caller
| without rejecting anyone — public tournament hubs, registration links and
| stadium scoreboards must stay reachable anonymously. Access is enforced
| per-route with `auth.required`, `role:` and `tenant`.
|
| Within each group, literal segments are declared before `{id}` patterns so
| paths like `/auctions/public/registration/{token}` are not swallowed by
| `/auctions/{id}`.
|
*/

/* ------------------------------------------------------------------ Platform */

Route::get('plans', [PlatformController::class, 'plans']);
Route::get('sports', [PlatformController::class, 'sports']);
Route::get('payment-methods', [PlatformController::class, 'paymentMethods']);
Route::get('features', [PlatformController::class, 'features']);
Route::get('footer', [PlatformController::class, 'footer']);
Route::get('health', [PlatformController::class, 'health']);
// Headline counts for the sign-in / sign-up pages (cached).
Route::get('platform-stats', [PlatformController::class, 'stats']);
// Landing-page reviews: what passes the admin's minimum rating and overrides.
Route::get('reviews', [ReviewController::class, 'index']);
Route::post('payments/demo/{orderId}/pay', [PaymentController::class, 'demoPay'])->middleware('throttle:demo-pay');

// Wipes the database back to plans + super admin. Local and staging only — never expose in production.
Route::post('dev/reset-seed', function () {
    if (app()->isProduction()) {
        abort(404);
    }

    Artisan::call('migrate:fresh', ['--seed' => true, '--force' => true]);

    return response()->json(['message' => 'Database reset: plans and the super admin re-seeded.']);
});

/* ---------------------------------------------------------------------- Auth */

Route::prefix('auth')->group(function () {
    // Tighter limits on credential and signup endpoints than the API default.
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('switch-demo-role', [AuthController::class, 'switchDemoRole'])->middleware('throttle:demo-switch');
    Route::post('register-org', [AuthController::class, 'registerOrganization'])->middleware('throttle:register-org');
    Route::post('register-player', [AuthController::class, 'registerPlayer'])->middleware('throttle:register-player');
    Route::get('me', [AuthController::class, 'me']);
    Route::put('me', [AuthController::class, 'updateProfile'])->middleware('auth.required');

    // Getting back in after forgetting a password. Named limiters rather than
    // an inline `throttle:5,10`, which would share its counter with the global
    // API throttle and so allow half what it says — see AppServiceProvider.
    Route::post('forgot-password', [AuthController::class, 'requestPasswordReset'])
        ->middleware('throttle:password-reset-request');
    Route::post('reset-password', [AuthController::class, 'resetPassword'])
        ->middleware('throttle:password-reset-submit');

    // Revoking the token in hand, and every token the account holds. Both need
    // a real bearer token, so they sit behind `auth.required` — the demo role
    // switcher has no token to revoke.
    Route::post('logout', [AuthController::class, 'logout'])->middleware('auth.required');
    Route::post('logout-everywhere', [AuthController::class, 'logoutEverywhere'])->middleware('auth.required');
});

/* --------------------------------------------------------------- Super admin */

Route::prefix('admin')->middleware(['auth.required', 'role:SUPER_ADMIN'])->group(function () {
    Route::get('metrics', [AdminController::class, 'metrics']);

    Route::get('plans', [AdminController::class, 'listPlans']);
    Route::post('plans', [AdminController::class, 'storePlan']);
    Route::post('plans/reorder', [AdminController::class, 'reorderPlans']);
    Route::put('plans/{id}', [AdminController::class, 'updatePlan']);
    Route::delete('plans/{id}', [AdminController::class, 'destroyPlan']);

    Route::get('sports', [AdminController::class, 'listSports']);
    Route::put('sports/{id}', [AdminController::class, 'updateSport']);

    Route::get('organizations', [AdminController::class, 'listOrganizations']);
    Route::post('organizations', [AdminController::class, 'storeOrganization']);
    Route::put('organizations/{id}/status', [AdminController::class, 'updateOrganizationStatus']);

    Route::get('users', [AdminController::class, 'listUsers']);
    // A locked-out person whose SMS code cannot reach them has no other way in.
    Route::post('users/{id}/reset-password', [AdminController::class, 'resetUserPassword']);
    Route::get('notification-health', [AdminController::class, 'notificationHealth']);

    Route::get('subscriptions', [AdminController::class, 'listSubscriptions']);
    Route::get('invoices', [AdminController::class, 'listInvoices']);
    Route::get('audit-logs', [AdminController::class, 'auditLogs']);

    Route::get('reviews', [ReviewController::class, 'adminIndex']);
    Route::put('reviews/{id}', [ReviewController::class, 'adminUpdate']);

    // Support inbox: every club's tickets and the public contact form's.
    Route::get('support/tickets', [SupportController::class, 'adminIndex']);
    Route::get('support/summary', [SupportController::class, 'adminSummary']);
    Route::get('support/tickets/{ticketId}', [SupportController::class, 'adminShow']);
    Route::post('support/tickets/{ticketId}/messages', [SupportController::class, 'adminReply']);
    Route::put('support/tickets/{ticketId}', [SupportController::class, 'adminUpdate']);

    Route::get('settings', [AdminController::class, 'settings']);
    Route::put('settings', [AdminController::class, 'updateSettings']);

    Route::post('impersonate', [AdminController::class, 'impersonate']);
    Route::get('impersonate/targets', [AdminController::class, 'impersonationTargets']);
});

/* -------------------------------------------------------------- Organizations */

Route::prefix('organizations')->group(function () {
    Route::get('public/{slug}', [OrganizationController::class, 'publicProfile']);

    // `tenant:id` — the organization being addressed is the `{id}` segment itself.
    Route::middleware(['auth.required', 'tenant:id'])->group(function () {
        // Read by everyone who works here: the scorer console and the team
        // manager's pages both show the organization's name and crest.
        Route::get('{id}', [OrganizationController::class, 'show']);

        // The account itself — its profile, its plan, its money — belongs to
        // the organizer. Sharing an organization is not running it.
        Route::middleware('role:ORG_ADMIN,SUPER_ADMIN')->group(function () {
            Route::put('{id}', [OrganizationController::class, 'update']);

            // Outbound WhatsApp/SMS: what this club sends, what it has sent,
            // and which numbers asked to be left alone. The log carries team
            // managers' and players' phone numbers, so it stays with the
            // organizer — `tenant:id` above already refuses another club.
            Route::get('{id}/notification-settings', [NotificationController::class, 'settings']);
            Route::put('{id}/notification-settings', [NotificationController::class, 'updateSettings']);
            Route::get('{id}/notifications', [NotificationController::class, 'index']);
            Route::post('{id}/notifications/opt-out', [NotificationController::class, 'optOut']);
            Route::post('{id}/notifications/opt-in', [NotificationController::class, 'optIn']);
            Route::get('{id}/usage', [OrganizationController::class, 'usage']);
            // Getting a team manager or scorer back in when the SMS code can't reach them.
            Route::get('{id}/members', [OrganizationController::class, 'members']);
            Route::post('{id}/members/{userId}/reset-password', [OrganizationController::class, 'resetMemberPassword']);
            Route::post('{id}/subscribe/order', [OrganizationController::class, 'subscribeOrder']);
            Route::post('{id}/subscribe', [OrganizationController::class, 'subscribe']);
            // The club's own review of the platform, for the landing page.
            Route::get('{id}/review', [ReviewController::class, 'showOwn']);
            Route::put('{id}/review', [ReviewController::class, 'saveOwn'])->middleware('throttle:review');
            // Help & Support: the club's tickets to the platform.
            Route::get('{id}/support/tickets', [SupportController::class, 'index']);
            Route::get('{id}/support/unread', [SupportController::class, 'unreadCount']);
            Route::post('{id}/support/tickets', [SupportController::class, 'store'])->middleware('throttle:support');
            Route::get('{id}/support/tickets/{ticketId}', [SupportController::class, 'show']);
            Route::post('{id}/support/tickets/{ticketId}/messages', [SupportController::class, 'reply'])->middleware('throttle:support');
            Route::put('{id}/support/tickets/{ticketId}/status', [SupportController::class, 'updateStatus']);
        });
    });
});

/* --------------------------------------------------------------- Tournaments */

Route::prefix('tournaments')->group(function () {
    Route::get('public/{slug}', [TournamentController::class, 'publicHub']);

    Route::middleware('auth.required')->group(function () {
        // The scorer console and the poster page both list and open tournaments.
        Route::get('/', [TournamentController::class, 'index']);
        Route::get('{id}', [TournamentController::class, 'show']);

        // Setting one up, changing it or calling it off is the organizer's.
        Route::middleware('role:ORG_ADMIN,SUPER_ADMIN')->group(function () {
            Route::post('/', [TournamentController::class, 'store'])->middleware('tenant');
            Route::put('{id}', [TournamentController::class, 'update']);
            Route::delete('{id}', [TournamentController::class, 'destroy']);
            Route::post('{id}/cancel', [TournamentController::class, 'cancel']);
            Route::put('{id}/auction', [TournamentController::class, 'configureAuction']);
            Route::post('{id}/registration-link', [TournamentController::class, 'registrationLink']);
            Route::post('{id}/poster', [TournamentController::class, 'generatePoster']);
        });
    });
});

/* --------------------------------------------------------------------- Teams */

Route::prefix('teams')->group(function () {
    Route::get('public/registration/{token}', [TeamController::class, 'registrationPage']);
    // Checked before the checkout opens, so nobody pays for an entry that would be refused.
    Route::post('public/registration/{token}/validate', [TeamController::class, 'validateRegistration'])->middleware('throttle:registration-validate');
    Route::post('public/registration/{token}/payment-order', [TeamController::class, 'paymentOrder'])->middleware('throttle:registration');
    Route::post('public/registration/{token}', [TeamController::class, 'register'])->middleware('throttle:registration');

    // Carries every team's manager contacts and fees, so it stays with the
    // people running the tournament rather than everyone in the organization.
    Route::get('tournament/{tournamentId}', [TeamController::class, 'forTournament'])
        ->middleware(['auth.required', 'role:ORG_ADMIN,SCORER,SUPER_ADMIN']);

    // The team manager's portal. Declared before `{id}` so "mine" isn't read as a team id.
    Route::middleware(['auth.required', 'role:TEAM_MANAGER'])->group(function () {
        Route::get('mine', [TeamController::class, 'mine']);
        Route::get('open-tournaments', [TeamController::class, 'openTournaments']);
        Route::get('my-payments', [TeamController::class, 'myPayments']);
        Route::post('{id}/balance/order', [TeamController::class, 'balanceOrder']);
        Route::post('{id}/balance/pay', [TeamController::class, 'payBalance']);
        Route::put('{id}/players/{playerId}', [TeamController::class, 'updateManagedPlayer']);
    });

    Route::get('{id}', [TeamController::class, 'show']);
    Route::get('{id}/receipt', [TeamController::class, 'receipt']);

    Route::middleware(['auth.required', 'role:ORG_ADMIN,SUPER_ADMIN'])->group(function () {
        Route::put('{id}/status', [TeamController::class, 'updateStatus']);
        Route::post('{id}/record-payment', [TeamController::class, 'recordPayment']);
        Route::post('{id}/players', [TeamController::class, 'addPlayer']);
    });
});

/* ------------------------------------------------------------------- Matches */

Route::prefix('matches')->group(function () {
    Route::get('tournament/{tournamentId}', [MatchController::class, 'forTournament']);
    // The home-page ticker. Declared before `{id}` so "current" isn't read as a match id.
    Route::get('current', [MatchController::class, 'current'])->middleware('throttle:match-current');
    Route::get('scoreboard/match/{id}', [MatchController::class, 'scoreboard']);
    // Public, like the fixture list and the table: the hub and the stadium
    // screen both show the bracket without anyone signing in.
    Route::get('bracket/{tournamentId}', [MatchController::class, 'bracket']);

    Route::post('auto-generate-fixtures', [MatchController::class, 'generateFixtures'])
        ->middleware(['auth.required', 'role:ORG_ADMIN,SUPER_ADMIN']);

    Route::get('{id}', [MatchController::class, 'show']);
    Route::get('{id}/toss', [TossController::class, 'show']);
    // Public for the same reason the toss is: the stadium display and the
    // tournament hub both show the team sheets without anyone logging in.
    Route::get('{id}/lineup', [LineupController::class, 'show']);

    Route::middleware('auth.required')->group(function () {
        // Status and result — the organizer's or the scorer's, like scoring.
        Route::put('{id}', [MatchController::class, 'update'])->middleware('role:ORG_ADMIN,SCORER,SUPER_ADMIN');
        Route::post('{id}/cancel', [MatchController::class, 'cancel'])->middleware('role:ORG_ADMIN,SUPER_ADMIN');

        // Same role list as poster generation below — the organizer, the
        // on-ground scorer, or a super admin; not a team manager, who only
        // manages their own team's roster. Scoring sits in here too: it used
        // to need nothing more than a login, so a player or a manager could
        // change any match's score. The controller adds the tenant check.
        Route::middleware('role:ORG_ADMIN,SCORER,SUPER_ADMIN')->group(function () {
            Route::post('{id}/football/event', [MatchController::class, 'recordFootballEvent']);
            Route::post('{id}/football/timer', [MatchController::class, 'controlFootballTimer']);
            Route::post('{id}/football/undo', [MatchController::class, 'undoFootballEvent']);

            Route::post('{id}/cricket/ball', [MatchController::class, 'recordCricketBall']);
            Route::post('{id}/cricket/undo', [MatchController::class, 'undoCricketBall']);
            Route::post('{id}/cricket/switch-innings', [MatchController::class, 'switchInnings']);
            Route::post('{id}/cricket/finish', [MatchController::class, 'finishCricketMatch']);

            Route::post('{id}/toss/call', [TossController::class, 'call']);
            Route::post('{id}/toss/decision', [TossController::class, 'decision']);
            Route::post('{id}/toss/manual', [TossController::class, 'manual']);
            Route::post('{id}/toss/reset', [TossController::class, 'reset']);

            // Naming the XI and driving the big screen belong to whoever is
            // running the match, the same people who record the toss.
            Route::put('{id}/lineup', [LineupController::class, 'update']);
            Route::post('{id}/scoreboard/stage', [MatchController::class, 'setScoreboardStage']);
        });
    });
});

/* ------------------------------------------------------------------- Exports */

Route::prefix('exports')->group(function () {
    // The table, the fixture list, the player stats and one match's card are all
    // already public on the hub — offering them as a file changes nothing about
    // who may see them.
    Route::get('tournaments/{tournamentId}/standings.csv', [ExportController::class, 'standings']);
    Route::get('tournaments/{tournamentId}/fixtures.csv', [ExportController::class, 'fixtures']);
    Route::get('tournaments/{tournamentId}/player-stats.csv', [ExportController::class, 'leaderboard']);
    Route::get('matches/{matchId}/scorecard', [ExportController::class, 'scorecard']);

    // Fee collection and squad lists carry managers' and players' phone numbers,
    // so they stay with the organizer — same rule as `/reports`.
    Route::middleware(['auth.required', 'role:ORG_ADMIN,SUPER_ADMIN'])->group(function () {
        Route::get('tournaments/{tournamentId}/fees.csv', [ExportController::class, 'fees']);
        Route::get('tournaments/{tournamentId}/squads.csv', [ExportController::class, 'roster']);
    });
});

/* -------------------------------------------------------------------- Venues */

Route::prefix('venues')->group(function () {
    // Reading is open — fixtures, the public hub and the big screen all name the
    // ground. Changing the list is the organizer's.
    Route::get('/', [VenueController::class, 'index']);

    Route::middleware(['auth.required', 'role:ORG_ADMIN,SUPER_ADMIN'])->group(function () {
        Route::post('/', [VenueController::class, 'store'])->middleware('tenant');
        Route::put('{id}', [VenueController::class, 'update']);
        Route::delete('{id}', [VenueController::class, 'destroy']);
    });
});

/* ------------------------------------------------------------------- Posters */

Route::prefix('posters')->group(function () {
    // Share-ready promotional images — same visibility as the public hub.
    Route::get('/', [PosterController::class, 'index']);

    // ORG_ADMIN (the organizer) and SCORER (running the match on the ground,
    // best placed to trigger a toss/result poster) — not TEAM_MANAGER, who
    // only manages their own team's roster, not tournament-wide promotion.
    Route::middleware(['auth.required', 'role:ORG_ADMIN,SCORER,SUPER_ADMIN'])->group(function () {
        Route::post('generate', [PosterController::class, 'generate']);
        Route::get('jobs/{jobId}', [PosterController::class, 'jobStatus']);
    });

    Route::delete('{id}', [PosterController::class, 'destroy'])->middleware(['auth.required', 'role:ORG_ADMIN,SUPER_ADMIN']);
});

/* ------------------------------------------------------------------ Auctions */

Route::prefix('auctions')->group(function () {
    Route::get('public/registration/{token}', [AuctionController::class, 'publicRegistrationPage']);
    Route::post('public/registration/{token}', [AuctionController::class, 'publicRegister'])->middleware('throttle:registration');

    Route::get('tournament/{tournamentId}', [AuctionController::class, 'forTournament']);

    // A team manager's own view of the room: their purse, squad and bid state.
    Route::middleware(['auth.required', 'role:TEAM_MANAGER,ORG_ADMIN,SUPER_ADMIN'])->group(function () {
        Route::get('mine', [AuctionController::class, 'myAuctions']);
        Route::get('{id}/my-team', [AuctionController::class, 'myTeam']);
    });

    Route::post('/', [AuctionController::class, 'store'])->middleware(['auth.required', 'role:ORG_ADMIN,SUPER_ADMIN']);
    Route::put('players/{playerId}/status', [AuctionController::class, 'updatePlayerStatus'])->middleware('auth.required');

    Route::get('{id}', [AuctionController::class, 'show']);
    Route::get('{id}/summary', [AuctionController::class, 'summary']);
    Route::get('{id}/payment-report', [AuctionController::class, 'paymentReport']);

    Route::middleware('auth.required')->group(function () {
        Route::post('{id}/status', [AuctionController::class, 'updateStatus']);
        Route::post('{id}/call-player', [AuctionController::class, 'callPlayer']);
        Route::post('{id}/place-bid', [AuctionController::class, 'placeBid']);
        Route::post('{id}/sell-player', [AuctionController::class, 'sellPlayer']);
        Route::post('{id}/unsold-player', [AuctionController::class, 'unsoldPlayer']);
        // Undo the latest sold/unsold call while that player is still on the hammer.
        Route::post('{id}/reopen-hammer', [AuctionController::class, 'reopenHammer']);
        Route::post('{id}/accelerated-round', [AuctionController::class, 'acceleratedRound']);

        Route::post('{id}/players/{playerId}/approve', [AuctionController::class, 'approvePlayer']);
        Route::post('{id}/players/{playerId}/reject', [AuctionController::class, 'rejectPlayer']);
        Route::delete('{id}/players/{playerId}', [AuctionController::class, 'removePlayer']);
        Route::post('{id}/players/{playerId}/payment', [AuctionController::class, 'updatePlayerPayment']);
        Route::post('{id}/payments/bulk-update', [AuctionController::class, 'bulkUpdatePayments']);
    });
});

/* ------------------------------------------------------- Sponsors & scoreboard */

Route::prefix('sponsors')->group(function () {
    Route::get('announcements', [SponsorController::class, 'listAnnouncements']);

    // Sponsor deals and ad inventory belong to the organizer; the scorer sees
    // and times what is queued for the screen they are driving.
    Route::middleware(['auth.required', 'role:ORG_ADMIN,SCORER,SUPER_ADMIN'])->group(function () {
        // Ads and announcements each belong to one match. Putting them on the
        // big screen is `POST /matches/{id}/scoreboard/stage`, not anything here.
        Route::get('ads', [SponsorController::class, 'listAds']);

        Route::middleware('role:ORG_ADMIN,SUPER_ADMIN')->group(function () {
            Route::post('ads', [SponsorController::class, 'storeAd'])->middleware('tenant');
            Route::post('ads/{id}/copy', [SponsorController::class, 'copyAd']);
            Route::delete('ads/{id}', [SponsorController::class, 'destroyAd']);

            Route::post('announcements', [SponsorController::class, 'storeAnnouncement'])->middleware('tenant');
            Route::delete('announcements/{id}', [SponsorController::class, 'destroyAnnouncement']);
        });

        // Adjusting on-screen time happens from the scorer console, so the
        // same people who drive the big screen may do it.
        Route::put('ads/{id}', [SponsorController::class, 'updateAd']);
        Route::put('announcements/{id}', [SponsorController::class, 'updateAnnouncement']);

        Route::get('/', [SponsorController::class, 'index']);

        Route::middleware('role:ORG_ADMIN,SUPER_ADMIN')->group(function () {
            Route::post('/', [SponsorController::class, 'store'])->middleware('tenant');
            Route::delete('{id}', [SponsorController::class, 'destroy']);
        });
    });
});

/* ------------------------------------------------------------------- Media Uploads */

Route::post('upload', [UploadController::class, 'upload'])->middleware('throttle:upload');

/* ------------------------------------------------------------------- Players */

Route::prefix('players')->group(function () {
    Route::get('me/dashboard', [PlayerController::class, 'dashboard'])->middleware('auth.required');
    Route::post('me/profile', [PlayerController::class, 'updateProfile'])->middleware('auth.required');

    // Public, read-only statistics — no login, so share links and outside
    // sites can read them. Throttled because each one is computed on request.
    Route::middleware('throttle:public-stats')->group(function () {
        Route::get('search', [PlayerController::class, 'search']);
        Route::get('code/{code}', [PlayerController::class, 'byCode']);
        Route::get('tournament/{tournamentId}/leaderboard', [PlayerController::class, 'leaderboard']);
        Route::get('tournament/{tournament}/stats', [PlayerController::class, 'tournamentStats']);
        Route::get('{id}/profile', [PlayerController::class, 'profile']);
        Route::get('{id}/matches', [PlayerController::class, 'matches']);
        Route::get('{id}/career', [PlayerController::class, 'career']);
    });
});

/* ----------------------------------------------------------------- Assistant */

// Public AI chat about tournaments, scores and stats. Each turn is a paid model
// call with several lookups, so it is throttled well below the API default.
Route::post('assistant/chat', [AssistantController::class, 'chat'])->middleware('throttle:assistant');

/* ------------------------------------------------------------------- Support */

// For someone who can't sign in at all. Club tickets live under organizations.
Route::post('support/contact', [SupportController::class, 'contact'])->middleware('throttle:support-contact');

/* ------------------------------------------------------------------- Reports */

// Ground-fee collection and squad rosters, with manager contacts — the
// organizer's books, not shared with everyone in the organization.
Route::prefix('reports')->middleware(['auth.required', 'role:ORG_ADMIN,SUPER_ADMIN'])->group(function () {
    Route::get('financials/{tournamentId}', [ReportController::class, 'financials']);
    Route::get('teams-roster/{tournamentId}', [ReportController::class, 'teamsRoster']);
});
