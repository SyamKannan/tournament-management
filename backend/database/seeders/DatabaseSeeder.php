<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Seeds what a fresh platform needs and nothing else: platform settings, the
 * sports catalogue, the subscription plans and one super admin. Outside
 * production it also adds one test club (see TestClubSeeder).
 *
 * Safe to run again: catalogue rows are upserted and an existing super admin is
 * left untouched (its password is never reset by a re-seed).
 *
 * The super admin comes from config('app.super_admin'):
 *   SUPER_ADMIN_EMAIL     (defaults to the platform owner, syamdas@gmail.com)
 *   SUPER_ADMIN_PASSWORD  (unset → a random one is generated, printed to this
 *                          console once, and must be changed at first sign-in)
 *   SUPER_ADMIN_NAME, SUPER_ADMIN_PHONE (optional)
 */
class DatabaseSeeder extends Seeder
{
    private const SUPER_ADMIN_ID = 'user-super-admin';

    public function run(): void
    {
        $path = database_path('seeders/data/platform.json');
        $data = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        DB::transaction(function () use ($data) {
            $this->seedSettings($data['platform_settings']);
            $this->upsert('sports', $data['sports']);
            $this->upsert('plans', $data['plans'], timestamps: true);
            $this->seedLegalDocuments();
        });

        $this->seedSuperAdmin();

        // Local test data; does nothing in production.
        $this->call(TestClubSeeder::class);
    }

    private function seedSettings(array $settings): void
    {
        if (DB::table('platform_settings')->exists()) {
            return;
        }

        DB::table('platform_settings')->insert([
            ...$this->onlyColumns('platform_settings', $this->encodeArrays($settings)),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function upsert(string $table, array $rows, bool $timestamps = false): void
    {
        foreach ($rows as $row) {
            $values = $this->onlyColumns($table, $this->encodeArrays($row));
            if ($timestamps) {
                $values['updated_at'] = now();
            }

            $exists = DB::table($table)->where('id', $row['id'])->exists();
            if (! $exists && $timestamps) {
                $values['created_at'] = now();
            }

            DB::table($table)->updateOrInsert(['id' => $row['id']], $values);
        }
    }

    /**
     * Version 1 of the Terms & Conditions and Privacy Policy, from
     * `data/legal/*.md` — a starting draft to be reviewed before launch. Only
     * when none exists: once published, versions change through the admin
     * console, never a re-seed.
     */
    private function seedLegalDocuments(): void
    {
        $titles = ['terms' => 'Terms & Conditions', 'privacy' => 'Privacy Policy'];

        foreach ($titles as $type => $title) {
            if (DB::table('legal_documents')->where('type', $type)->exists()) {
                continue;
            }

            DB::table('legal_documents')->insert([
                'id' => "legal-{$type}-v1",
                'type' => $type,
                'version' => 1,
                'title' => $title,
                'body' => trim((string) file_get_contents(database_path("seeders/data/legal/{$type}.md"))),
                'summary_of_changes' => 'First version.',
                'requires_reacceptance' => true,
                'published_by_name' => 'KickWick',
                'published_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function seedSuperAdmin(): void
    {
        if (User::query()->where('role', 'SUPER_ADMIN')->exists()) {
            $this->command?->info('Super admin already exists — left unchanged.');

            return;
        }

        $email = trim((string) config('app.super_admin.email'));

        $password = (string) config('app.super_admin.password');
        $generated = $password === '';
        if ($generated) {
            $password = Str::password(16, symbols: false);
        }

        DB::table('users')->insert([
            'id' => self::SUPER_ADMIN_ID,
            'name' => (string) (config('app.super_admin.name') ?: 'Platform Admin'),
            'email' => $email,
            'password_hash' => Hash::make($password),
            'phone' => (string) config('app.super_admin.phone'),
            'role' => 'SUPER_ADMIN',
            'must_change_password' => $generated,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->command?->info("Super admin created: {$email}");
        if ($generated) {
            // Shown once, only on the console running the seed — never stored in clear.
            $this->command?->warn("Temporary password: {$password}  (must be changed at first sign-in)");
        }
    }

    private function encodeArrays(array $row): array
    {
        return array_map(
            fn ($value) => is_array($value) ? json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : $value,
            $row
        );
    }

    private function onlyColumns(string $table, array $row): array
    {
        return array_intersect_key($row, array_flip(Schema::getColumnListing($table)));
    }
}
