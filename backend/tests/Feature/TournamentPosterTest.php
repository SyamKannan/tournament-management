<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\RegistrationLink;
use App\Models\Tournament;
use App\Services\PosterService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Tournament poster templates render the real tournament details and the
 * registration QR. Checked at the HTML stage — the Chrome screenshot itself
 * isn't exercised here.
 */
class TournamentPosterTest extends TestCase
{
    public function test_every_template_renders_details_and_registration_qr(): void
    {
        Http::fake(['*' => Http::response('', 404)]);
        config(['app.frontend_url' => 'https://play.example.com', 'services.openai.api_key' => null, 'services.gemini.api_key' => null]);

        $tournament = Tournament::find('tourney-football-sevens');
        $organization = Organization::find($tournament->organization_id);
        $token = RegistrationLink::query()->where('tournament_id', $tournament->id)->value('token');
        $this->assertNotEmpty($token);

        foreach (PosterService::TEMPLATES as $template) {
            $poster = app(PosterService::class)->tournamentHtml($tournament, $organization, true, null, $template);

            $this->assertSame($template, $poster['template']);
            $this->assertFalse($poster['used_ai']);
            $this->assertStringContainsString(e($tournament->name), $poster['html']);
            $this->assertStringContainsString('₹50,000', $poster['html']);
            $this->assertStringStartsWith('data:image/svg+xml;base64,', $poster['qr']);
            $this->assertStringContainsString($poster['qr'], $poster['html']);
        }

        $this->assertStringContainsString(
            "https://play.example.com/register/team/{$token}",
            \App\Support\RegistrationQr::url($tournament)
        );
    }

    public function test_cancelled_tournament_poster_has_no_registration_qr(): void
    {
        Http::fake(['*' => Http::response('', 404)]);

        $tournament = Tournament::find('tourney-football-sevens');
        $tournament->status = 'cancelled';

        $poster = app(PosterService::class)->tournamentHtml($tournament, null, false, null, 'classic');

        $this->assertNull($poster['qr']);
        $this->assertStringNotContainsString('class="qr-img"', $poster['html']);
    }

    /**
     * Regenerating has to produce something the organizer can see is different,
     * so the design on screen is never the one drawn next — within one layout
     * (a new colorway) and across "Surprise me" (a new layout or colorway).
     */
    public function test_regenerating_never_redraws_the_design_on_screen(): void
    {
        Http::fake(['*' => Http::response('', 404)]);
        config(['services.openai.api_key' => null, 'services.gemini.api_key' => null]);

        $tournament = Tournament::find('tourney-football-sevens');
        $service = app(PosterService::class);

        $design = $service->tournamentHtml($tournament, null, false, null, 'split')['design'];
        $this->assertStringStartsWith('split:', $design);

        foreach (['split', 'auto'] as $request) {
            for ($i = 0; $i < 12; $i++) {
                $next = $service->tournamentHtml($tournament, null, false, null, $request, $design);
                $this->assertNotSame($design, $next['design']);
                if ($request === 'split') {
                    $this->assertSame('split', $next['template']);
                }
                $design = $next['design'];
            }
        }
    }

    public function test_every_colorway_of_every_template_renders(): void
    {
        Http::fake(['*' => Http::response('', 404)]);
        config(['services.openai.api_key' => null, 'services.gemini.api_key' => null]);

        $tournament = Tournament::find('tourney-football-sevens');
        $service = app(PosterService::class);

        $seen = [];
        // Enough draws to hit all three colorways of each layout with certainty
        // to spare; the pick is random, not a rotation.
        for ($i = 0; $i < 200; $i++) {
            $poster = $service->tournamentHtml($tournament, null, false, null, 'auto');
            $seen[$poster['design']] = true;
            $this->assertStringContainsString(e($tournament->name), $poster['html']);
        }

        $this->assertCount(count(PosterService::TEMPLATES) * 3, $seen);
    }

    public function test_poster_endpoint_rejects_unknown_template(): void
    {
        $this->withHeaders(['x-demo-role' => 'ORG_ADMIN', 'x-demo-org-id' => Tournament::find('tourney-football-sevens')->organization_id])
            ->postJson('/api/tournaments/tourney-football-sevens/poster', ['template' => 'nope'])
            ->assertStatus(422);
    }
}
