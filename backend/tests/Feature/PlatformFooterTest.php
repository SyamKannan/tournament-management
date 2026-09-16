<?php

namespace Tests\Feature;

use Tests\TestCase;

class PlatformFooterTest extends TestCase
{
    public function test_public_footer_returns_defaults_with_support_contact(): void
    {
        $this->getJson('/api/footer')
            ->assertOk()
            ->assertJsonStructure(['tagline', 'links' => [['label', 'url']], 'social' => ['facebook', 'instagram', 'youtube', 'x', 'whatsapp'], 'copyright', 'show_contact', 'platform_name', 'support_email', 'support_phone'])
            ->assertJsonPath('links.0.url', '/players');
    }

    public function test_super_admin_edits_footer_and_public_endpoint_reflects_it(): void
    {
        $this->actingAsUser('syamdas@gmail.com');

        $this->putJson('/api/admin/settings', [
            'footer' => [
                'tagline' => 'Kerala village football, live.',
                'links' => [['label' => 'Privacy', 'url' => 'https://example.com/privacy']],
                'social' => ['instagram' => 'https://instagram.com/club'],
                'show_contact' => false,
                'unknown' => 'dropped',
            ],
        ])->assertOk()
            ->assertJsonPath('footer.tagline', 'Kerala village football, live.')
            ->assertJsonPath('footer.social.facebook', '');

        $response = $this->getJson('/api/footer')
            ->assertJsonPath('links', [['label' => 'Privacy', 'url' => 'https://example.com/privacy']])
            ->assertJsonPath('social.instagram', 'https://instagram.com/club')
            ->assertJsonPath('support_email', null)
            ->assertJsonPath('support_phone', null);
        $this->assertArrayNotHasKey('unknown', $response->json());
    }

    public function test_footer_rejects_script_urls(): void
    {
        $this->actingAsUser('syamdas@gmail.com');

        $this->putJson('/api/admin/settings', [
            'footer' => ['links' => [['label' => 'Bad', 'url' => 'javascript:alert(1)']]],
        ])->assertStatus(422);

        $this->putJson('/api/admin/settings', [
            'footer' => ['social' => ['x' => 'javascript:alert(1)']],
        ])->assertStatus(422);
    }

    public function test_only_super_admin_can_edit_footer(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->putJson('/api/admin/settings', ['footer' => ['tagline' => 'hijacked']])->assertStatus(403);
    }
}
