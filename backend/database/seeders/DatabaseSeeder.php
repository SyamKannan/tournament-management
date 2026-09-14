<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

/**
 * Loads the demonstration dataset: three organizations on different plans,
 * football and cricket tournaments, approved squads, a live match of each sport
 * mid-play, two player auctions and the supporting billing records.
 *
 * The fixture in `data/seed.json` was captured at a fixed instant. Every date it
 * contains is shifted by the gap between that instant and the moment you seed,
 * so "a live match happening now" stays live and subscription windows stay
 * current no matter when the seeder runs.
 */
class DatabaseSeeder extends Seeder
{
    /** The instant the bundled fixture was captured. */
    private const FIXTURE_ANCHOR = '2026-08-24T02:47:55.943Z';

    /** Columns that are real timestamps rather than ISO strings. */
    private const TIMESTAMP_COLUMNS = ['created_at', 'updated_at'];

    private int $shiftSeconds = 0;

    public function run(): void
    {
        $seed = $this->loadFixture();

        $this->withoutForeignKeyChecks(function () use ($seed) {
            $this->truncateAll();

            $this->seedPlatform($seed);
            $this->seedTournaments($seed);
            $this->seedMatches($seed);
            $this->seedAuctions($seed);
            $this->seedMedia($seed);
        });

        $this->command?->info('Seeded demo platform data ('.count($seed['organizations']).' organizations, '
            .count($seed['tournaments']).' tournaments, '.count($seed['teams']).' teams).');
    }

    /* ---------------------------------------------------------------------
     | Fixture loading and date rebasing
     * -------------------------------------------------------------------*/

    private function loadFixture(): array
    {
        $path = database_path('seeders/data/seed.json');

        if (! is_file($path)) {
            throw new \RuntimeException("Seed fixture missing at {$path}");
        }

        $seed = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        $this->shiftSeconds = Carbon::now('UTC')->getTimestamp() - Carbon::parse(self::FIXTURE_ANCHOR)->getTimestamp();

        return $this->rebaseDates($seed);
    }

    /**
     * Recursively shift every ISO-8601 timestamp and bare `YYYY-MM-DD` date in
     * the fixture forward by the same offset, preserving the original format.
     */
    private function rebaseDates(mixed $value): mixed
    {
        if (is_array($value)) {
            return array_map(fn ($item) => $this->rebaseDates($item), $value);
        }

        if (! is_string($value)) {
            return $value;
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/', $value)) {
            return Carbon::parse($value)->addSeconds($this->shiftSeconds)->format('Y-m-d\TH:i:s.v\Z');
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return Carbon::parse($value)->addSeconds($this->shiftSeconds)->format('Y-m-d');
        }

        return $value;
    }

    /* ---------------------------------------------------------------------
     | Table groups
     * -------------------------------------------------------------------*/

    private function seedPlatform(array $seed): void
    {
        DB::table('platform_settings')->insert([
            ...$seed['platform_settings'],
            'enabled_payment_methods' => json_encode($seed['platform_settings']['enabled_payment_methods']),
            'subscription_payment_methods' => json_encode($seed['platform_settings']['subscription_payment_methods']),
            'payment_gateways' => json_encode($seed['platform_settings']['payment_gateways']),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->insert('sports', $seed['sports']);
        $this->insert('plans', $seed['plans'], json: ['features']);
        $this->insert('organizations', $seed['organizations'], json: ['social_media']);
        $this->insert('users', $this->hashPasswords($seed['users']));
        $this->insert('subscriptions', $seed['subscriptions']);
        $this->insert('invoices', $seed['invoices']);
        $this->insert('audit_logs', $seed['audit_logs']);
    }

    private function seedTournaments(array $seed): void
    {
        $this->insert('tournaments', $seed['tournaments'], json: ['payment_config', 'settings']);
        $this->insert('registration_links', $seed['registration_links']);
        $this->insert('venues', $seed['venues']);
        $this->insert('teams', $seed['teams']);
        $this->insert('players', $seed['players']);
        $this->insert('registration_payments', $seed['registration_payments']);
        $this->insert('registration_receipts', $seed['registration_receipts'], json: ['receipt_data']);
    }

    private function seedMatches(array $seed): void
    {
        $this->insert('matches', $seed['matches']);

        [$footballStates, $footballEvents] = $this->extractLog($seed['football_matches'], 'events');
        $this->insert('football_match_states', $footballStates);
        $this->insert('football_events', $footballEvents);

        [$cricketStates, $cricketDeliveries] = $this->extractLog($seed['cricket_matches'], 'deliveries');
        $this->insert('cricket_match_states', $cricketStates);
        $this->insert('cricket_deliveries', $cricketDeliveries);

        $this->insert('standings', $seed['standings'], json: ['form']);
    }

    private function seedAuctions(array $seed): void
    {
        $auctions = [];
        $bids = [];

        foreach ($seed['auctions'] as $auction) {
            $history = $auction['bid_history'] ?? [];
            unset($auction['bid_history']);
            $auctions[] = $auction;

            // The fixture lists bids newest-first; store a descending sequence so
            // the API replays them in that same order.
            $sequence = count($history);
            foreach ($history as $bid) {
                $bids[] = [...$bid, 'sequence' => $sequence--];
            }
        }

        $this->insert('auctions', $auctions, json: ['base_prices']);
        $this->insert('auction_bids', $bids);
        $this->insert('auction_players', $seed['auction_players']);
    }

    private function seedMedia(array $seed): void
    {
        $this->insert('sponsors', $seed['sponsors']);
        $this->insert('advertisements', $seed['advertisements']);
        $this->insert('announcements', $seed['announcements']);
        $this->insert('player_stats', $seed['player_stats'], json: ['cricket', 'football', 'recent_performances', 'awards']);
    }

    /* ---------------------------------------------------------------------
     | Helpers
     * -------------------------------------------------------------------*/

    /**
     * The fixture stores demo passwords in the clear so they stay readable;
     * they are hashed on the way into the database. Every demo account uses
     * `12345678`.
     *
     * @param  array<int, array<string, mixed>>  $users
     * @return array<int, array<string, mixed>>
     */
    private function hashPasswords(array $users): array
    {
        return array_map(
            fn (array $user) => [...$user, 'password_hash' => Hash::make((string) $user['password_hash'])],
            $users
        );
    }

    /**
     * Split embedded append-only logs (football events, cricket deliveries) out
     * of their parent state object into their own ordered rows.
     *
     * @return array{0: array<int, array<string, mixed>>, 1: array<int, array<string, mixed>>}
     */
    private function extractLog(array $states, string $logKey): array
    {
        $parents = [];
        $entries = [];

        foreach ($states as $state) {
            $log = $state[$logKey] ?? [];
            unset($state[$logKey]);
            $parents[] = $state;

            foreach (array_values($log) as $index => $entry) {
                $entries[] = [...$entry, 'sequence' => $index + 1];
            }
        }

        return [$parents, $entries];
    }

    /**
     * Insert fixture rows, encoding the named columns as JSON and filling any
     * column the fixture omits with the schema default.
     *
     * @param  array<int, array<string, mixed>>  $rows
     * @param  array<int, string>  $json
     */
    private function insert(string $table, array $rows, array $json = []): void
    {
        if ($rows === []) {
            return;
        }

        $columns = Schema::getColumnListing($table);

        $prepared = array_map(function (array $row) use ($columns, $json) {
            foreach ($json as $key) {
                if (array_key_exists($key, $row)) {
                    $row[$key] = json_encode($row[$key], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                }
            }

            $normalised = [];
            foreach ($columns as $column) {
                if (! array_key_exists($column, $row)) {
                    continue;
                }

                $value = $row[$column];

                if (is_array($value)) {
                    $normalised[$column] = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

                    continue;
                }

                // The fixture stores ISO-8601 throughout. SQLite accepts that in
                // a timestamp column; MySQL does not, so real timestamp columns
                // get converted while the many string date columns keep their
                // ISO form.
                if (in_array($column, self::TIMESTAMP_COLUMNS, true) && is_string($value) && $value !== '') {
                    $normalised[$column] = Carbon::parse($value)->format('Y-m-d H:i:s');

                    continue;
                }

                $normalised[$column] = $value;
            }

            return $normalised;
        }, $rows);

        // Fixture rows legitimately omit optional columns (a one-time plan has no
        // billing interval), and a batched insert needs every row in the batch to
        // share a column list — so group by signature and let omitted columns fall
        // back to their schema defaults.
        $batches = [];
        foreach ($prepared as $row) {
            $batches[implode('|', array_keys($row))][] = $row;
        }

        foreach ($batches as $batch) {
            foreach (array_chunk($batch, 100) as $chunk) {
                DB::table($table)->insert($chunk);
            }
        }
    }

    private function truncateAll(): void
    {
        $tables = [
            'player_stats', 'announcements', 'advertisements', 'sponsors',
            'auction_bids', 'auction_players', 'auctions',
            'standings', 'cricket_deliveries', 'cricket_match_states',
            'football_events', 'football_match_states', 'matches',
            'registration_receipts', 'registration_payments', 'players', 'teams',
            'venues', 'registration_links', 'tournaments',
            'audit_logs', 'invoices', 'subscriptions', 'users', 'organizations',
            'plans', 'sports', 'platform_settings',
        ];

        foreach ($tables as $table) {
            DB::table($table)->delete();
        }
    }

    private function withoutForeignKeyChecks(callable $callback): void
    {
        Schema::withoutForeignKeyConstraints(fn () => $callback());
    }
}
