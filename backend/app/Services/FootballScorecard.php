<?php

namespace App\Services;

use App\Models\FootballMatchState;
use App\Models\GameMatch;
use App\Models\Player;

/**
 * The football match card, derived from the event log — the counterpart of
 * CricketScorecard, and never stored for the same reason: undo only has to
 * drop a log row for the card to be right again.
 *
 * One entry per side, team A first: the goals *credited* to that side (so an
 * own goal sits under the team it counted for, marked as such), their
 * bookings, substitutions and missed penalties. The big screen shows it at
 * half time and full time, and the PDF export prints it.
 */
class FootballScorecard
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public function forMatch(GameMatch $match, ?FootballMatchState $state): array
    {
        $events = $state?->events ?? collect();

        $names = Player::query()
            ->whereIn('team_id', [$match->team_a_id, $match->team_b_id])
            ->pluck('full_name', 'id');

        $name = fn (?string $playerId) => $playerId ? ($names[$playerId] ?? null) : null;

        $sides = [
            $match->team_a_id => $this->emptySide($match->team_a_id, (int) ($state?->team_a_score ?? 0)),
            $match->team_b_id => $this->emptySide($match->team_b_id, (int) ($state?->team_b_score ?? 0)),
        ];

        foreach ($events as $event) {
            $teamId = $event->team_id;

            if (! isset($sides[$teamId])) {
                continue;
            }

            $base = [
                'event_id' => $event->id,
                'minute' => (int) $event->minute,
                'player_id' => $event->player_id ?: null,
                'name' => $name($event->player_id),
            ];

            switch ($event->event_type) {
                case 'goal':
                case 'penalty_goal':
                    $sides[$teamId]['goals'][] = [
                        ...$base,
                        'type' => $event->event_type,
                        'assist_player_id' => $event->assist_player_id,
                        'assist_name' => $name($event->assist_player_id),
                    ];
                    break;

                case 'own_goal':
                    // Scored by this side's player, counted for the other.
                    $creditedId = $teamId === $match->team_a_id ? $match->team_b_id : $match->team_a_id;
                    $sides[$creditedId]['goals'][] = [
                        ...$base,
                        'type' => 'own_goal',
                        'assist_player_id' => null,
                        'assist_name' => null,
                    ];
                    break;

                case 'yellow_card':
                case 'red_card':
                    $sides[$teamId]['cards'][] = [...$base, 'type' => $event->event_type];
                    break;

                case 'substitution':
                    $sides[$teamId]['substitutions'][] = [
                        'event_id' => $event->id,
                        'minute' => (int) $event->minute,
                        'in_player_id' => $event->sub_in_player_id,
                        'in_name' => $name($event->sub_in_player_id),
                        'out_player_id' => $event->sub_out_player_id,
                        'out_name' => $name($event->sub_out_player_id),
                    ];
                    break;

                case 'penalty_missed':
                    $sides[$teamId]['missed_penalties'][] = $base;
                    break;
            }
        }

        return array_values($sides);
    }

    /** @return array<string, mixed> */
    private function emptySide(string $teamId, int $score): array
    {
        return [
            'team_id' => $teamId,
            'score' => $score,
            'goals' => [],
            'cards' => [],
            'substitutions' => [],
            'missed_penalties' => [],
        ];
    }
}
