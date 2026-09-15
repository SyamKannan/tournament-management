<?php

namespace App\Services;

use App\Models\GameMatch;
use Illuminate\Support\Facades\DB;

/**
 * The pre-match coin toss: who calls it, the server-generated flip, the
 * winner's decision, and the side it puts first.
 *
 * The decision depends on the sport. In cricket the winner bats or bowls,
 * which sets `batting_first_team_id`. In football the winner takes the
 * kick-off or picks an end (and the other side then kicks off), which sets
 * `kick_off_team_id`. Each sport's column is left null for the other.
 *
 * Recorded directly on `matches` (like `winner_team_id`) rather than folded
 * into ScoringEngine's ball-by-ball state — it's a one-time fact set before
 * scoring exists, not part of the event-log/undo machinery.
 *
 * Every write locks the match row for the duration of the transaction so two
 * scorers tapping at once can't both record a toss for the same match.
 */
class TossService
{
    private const CALLS = ['heads', 'tails'];

    /** The decisions open to the toss winner, per sport. */
    public const DECISIONS = [
        'cricket' => ['bat', 'bowl'],
        'football' => ['kick_off', 'ends'],
    ];

    /** Every decision any sport accepts, for request validation. */
    public static function allDecisions(): array
    {
        return array_merge(...array_values(self::DECISIONS));
    }

    /**
     * The decision as a phrase that follows "elected to", for the posters and
     * anything else that says the toss out loud.
     */
    public static function decisionPhrase(?string $decision): string
    {
        return match ($decision) {
            'kick_off' => 'take the kick-off',
            'ends' => 'choose ends',
            'bowl' => 'bowl',
            default => 'bat',
        };
    }

    /**
     * The away-team captain (or whichever side didn't get the option to bat/
     * bowl first automatically) calls it; the server flips and resolves the
     * winner from the call.
     *
     * @throws \RuntimeException when the match doesn't exist, the caller isn't
     *                            one of the two teams, the call is invalid, or
     *                            a toss has already been recorded
     */
    public function call(string $matchId, string $callerTeamId, string $call): GameMatch
    {
        if (! in_array($call, self::CALLS, true)) {
            throw new \RuntimeException('Call must be heads or tails');
        }

        return DB::transaction(function () use ($matchId, $callerTeamId, $call) {
            $match = GameMatch::query()->whereKey($matchId)->lockForUpdate()->first();

            if (! $match) {
                throw new \RuntimeException('Match not found');
            }

            $this->assertNotAlreadyTossed($match);
            $this->assertTeamIsInMatch($match, $callerTeamId);

            $result = random_int(0, 1) === 0 ? 'heads' : 'tails';
            $winnerTeamId = $call === $result ? $callerTeamId : $this->otherTeam($match, $callerTeamId);

            $match->toss_caller_team_id = $callerTeamId;
            $match->toss_call = $call;
            $match->toss_result = $result;
            $match->toss_winner_team_id = $winnerTeamId;
            $match->toss_decision = null;
            $match->toss_method = 'digital';
            $match->toss_time = now();
            $match->batting_first_team_id = null;
            $match->kick_off_team_id = null;
            $match->save();

            return $match;
        });
    }

    /**
     * The toss winner's decision. Derives the side that goes first.
     *
     * @throws \RuntimeException when the match doesn't exist, the decision
     *                            isn't one this sport has, no one has won the
     *                            toss yet, or a decision is already recorded
     */
    public function decide(string $matchId, string $decision): GameMatch
    {
        return DB::transaction(function () use ($matchId, $decision) {
            $match = GameMatch::query()->whereKey($matchId)->lockForUpdate()->first();

            if (! $match) {
                throw new \RuntimeException('Match not found');
            }

            $this->assertDecisionFitsSport($match, $decision);

            if (! $match->toss_winner_team_id) {
                throw new \RuntimeException('Flip the coin before recording a decision');
            }

            if ($match->toss_decision) {
                throw new \RuntimeException('The toss decision has already been recorded');
            }

            $match->toss_decision = $decision;
            $this->applyDecision($match, $decision);
            $match->save();

            return $match;
        });
    }

    /**
     * The toss happened at the ground; the scorer records the outcome
     * directly — winner and decision in one step, no server flip involved.
     *
     * `$result` is the face of the real coin, if the scorer noted it. It is
     * only ever recorded alongside `toss_method = 'manual'`, so a chosen face
     * can never be presented as the outcome of a digital flip.
     *
     * @throws \RuntimeException when the match doesn't exist, the winner isn't
     *                            one of the two teams, the decision or recorded
     *                            face is invalid, or a toss already exists
     */
    public function recordManual(string $matchId, string $winnerTeamId, string $decision, ?string $result = null): GameMatch
    {
        if ($result !== null && ! in_array($result, self::CALLS, true)) {
            throw new \RuntimeException('The recorded coin face must be heads or tails');
        }

        return DB::transaction(function () use ($matchId, $winnerTeamId, $decision, $result) {
            $match = GameMatch::query()->whereKey($matchId)->lockForUpdate()->first();

            if (! $match) {
                throw new \RuntimeException('Match not found');
            }

            $this->assertDecisionFitsSport($match, $decision);
            $this->assertNotAlreadyTossed($match);
            $this->assertTeamIsInMatch($match, $winnerTeamId);

            $match->toss_caller_team_id = null;
            $match->toss_call = null;
            $match->toss_result = $result;
            $match->toss_winner_team_id = $winnerTeamId;
            $match->toss_decision = $decision;
            $match->toss_method = 'manual';
            $match->toss_time = now();
            $this->applyDecision($match, $decision);
            $match->save();

            return $match;
        });
    }

    /**
     * Undo a mis-recorded toss (wrong team tapped, wrong call, etc.) so it can
     * be run again. Deliberately narrower than "just record over it": once a
     * ball has been bowled (match no longer `scheduled`), the toss is locked
     * for good — this only clears mistakes made before the match went live.
     *
     * @throws \RuntimeException when the match doesn't exist, scoring has
     *                            already started, or there's no toss to reset
     */
    public function reset(string $matchId): GameMatch
    {
        return DB::transaction(function () use ($matchId) {
            $match = GameMatch::query()->whereKey($matchId)->lockForUpdate()->first();

            if (! $match) {
                throw new \RuntimeException('Match not found');
            }

            if ($match->status !== 'scheduled') {
                throw new \RuntimeException('The toss can only be reset before scoring starts');
            }

            if (! $match->toss_winner_team_id) {
                throw new \RuntimeException('There is no toss to reset');
            }

            $match->toss_caller_team_id = null;
            $match->toss_call = null;
            $match->toss_result = null;
            $match->toss_winner_team_id = null;
            $match->toss_decision = null;
            $match->toss_method = null;
            $match->toss_time = null;
            $match->batting_first_team_id = null;
            $match->kick_off_team_id = null;
            $match->save();

            return $match;
        });
    }

    private function assertNotAlreadyTossed(GameMatch $match): void
    {
        if ($match->toss_winner_team_id) {
            throw new \RuntimeException('The toss has already been recorded for this match');
        }
    }

    private function assertTeamIsInMatch(GameMatch $match, string $teamId): void
    {
        if (! in_array($teamId, [$match->team_a_id, $match->team_b_id], true)) {
            throw new \RuntimeException('That team is not playing in this match');
        }
    }

    private function otherTeam(GameMatch $match, string $teamId): string
    {
        return $teamId === $match->team_a_id ? $match->team_b_id : $match->team_a_id;
    }

    private function assertDecisionFitsSport(GameMatch $match, string $decision): void
    {
        $allowed = self::DECISIONS[$match->sport_code] ?? self::DECISIONS['cricket'];

        if (! in_array($decision, $allowed, true)) {
            throw new \RuntimeException('Decision must be '.implode(' or ', $allowed));
        }
    }

    /**
     * Set the side the decision puts first. Batting or taking the kick-off
     * puts the winner first; bowling or choosing an end puts the other side
     * first.
     */
    private function applyDecision(GameMatch $match, string $decision): void
    {
        $winnerTeamId = $match->toss_winner_team_id;
        $first = in_array($decision, ['bat', 'kick_off'], true)
            ? $winnerTeamId
            : $this->otherTeam($match, $winnerTeamId);

        if ($match->sport_code === 'football') {
            $match->kick_off_team_id = $first;
            $match->batting_first_team_id = null;
        } else {
            $match->batting_first_team_id = $first;
            $match->kick_off_team_id = null;
        }
    }
}
