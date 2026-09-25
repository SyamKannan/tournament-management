<?php

namespace Database\Seeders;

use App\Models\Organization;
use App\Models\Subscription;
use App\Models\User;
use App\Models\Venue;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;

/**
 * One ready-to-use club for local testing: an organizer account, a premium
 * subscription (so plan limits never get in the way), a ground, and two
 * tournaments of 10 approved teams each — football and cricket — with squads
 * and fixtures, built by `demo:tournament`.
 *
 * Never runs in production, and SEED_TEST_CLUB=false turns it off. Skipped when
 * the club already exists, so a re-seed adds nothing twice.
 *
 * Sign in as testclub@kickwick.local / 12345678.
 */
class TestClubSeeder extends Seeder
{
    private const ORG_ID = 'org-test-club';

    private const ADMIN_EMAIL = 'testclub@kickwick.local';

    private const PASSWORD = '12345678';

    public function run(): void
    {
        if (app()->environment('production') || ! filter_var(env('SEED_TEST_CLUB', true), FILTER_VALIDATE_BOOL)) {
            return;
        }

        if (Organization::query()->whereKey(self::ORG_ID)->exists()) {
            $this->command?->info('Test club already exists — left unchanged.');

            return;
        }

        Organization::create([
            'id' => self::ORG_ID,
            'name' => 'Test Sports Club',
            'slug' => 'test-sports-club',
            'logo' => 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=150&auto=format&fit=crop&q=80',
            'banner' => 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1200&auto=format&fit=crop&q=80',
            'type' => 'Sports Club',
            'description' => 'Test data for local development.',
            'contact_person' => 'Test Organizer',
            'phone' => '919000000000',
            'whatsapp' => '919000000000',
            'email' => self::ADMIN_EMAIL,
            'address' => 'Test Ground Road, Testpuram',
            'village' => 'Testpuram',
            'panchayat' => '',
            'municipality' => '',
            'district' => 'Malappuram',
            'state' => 'Kerala',
            'country' => 'India',
            'website' => '',
            'social_media' => [],
            'status' => 'active',
        ]);

        User::create([
            'id' => 'user-test-club-admin',
            'name' => 'Test Organizer',
            'email' => self::ADMIN_EMAIL,
            'password_hash' => Hash::make(self::PASSWORD),
            'phone' => '919000000000',
            'role' => 'ORG_ADMIN',
            'organization_id' => self::ORG_ID,
        ]);

        Subscription::create([
            'id' => 'sub-test-club',
            'organization_id' => self::ORG_ID,
            'plan_id' => 'plan-premium',
            'status' => 'active',
            'start_date' => now()->format('Y-m-d\TH:i:s.v\Z'),
            'end_date' => now()->addYears(5)->format('Y-m-d\TH:i:s.v\Z'),
            'next_billing_date' => null,
            'auto_renew' => false,
            'amount_paid' => 0,
            'currency' => '₹',
        ]);

        Venue::create([
            'id' => 'venue-test-ground',
            'organization_id' => self::ORG_ID,
            'name' => 'Testpuram Panchayat Ground',
            'address' => 'Test Ground Road, Testpuram',
            'village' => 'Testpuram',
            'district' => 'Malappuram',
        ]);

        foreach ([
            ['--sport' => 'football', '--format' => 'league_knockout', '--name' => 'Test Football Cup'],
            ['--sport' => 'cricket', '--format' => 'league', '--name' => 'Test Cricket League'],
        ] as $options) {
            Artisan::call('demo:tournament', [
                ...$options,
                '--teams' => 10,
                '--squad' => 11,
                '--org' => self::ORG_ID,
            ]);
        }

        $this->command?->info('Test club created: '.self::ADMIN_EMAIL.' / '.self::PASSWORD.' (2 tournaments, 10 teams each)');
    }
}
