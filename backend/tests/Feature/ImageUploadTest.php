<?php

namespace Tests\Feature;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * Uploads are public (registration happens before anyone has an account) and
 * land in a directory the web server serves, so the stored name is ours.
 */
class ImageUploadTest extends TestCase
{
    private array $written = [];

    protected function tearDown(): void
    {
        foreach ($this->written as $path) {
            File::delete(public_path($path));
        }

        parent::tearDown();
    }

    public function test_an_image_is_stored_with_an_extension_taken_from_its_own_bytes(): void
    {
        // A real PNG offered under a name that would be executed if kept.
        $file = UploadedFile::fake()->image('shell.php.png')->size(20);

        $response = $this->postJson('/api/upload', ['image' => $file, 'folder' => 'test-uploads'])
            ->assertCreated();

        $path = $response->json('path');
        $this->written[] = $path;

        $this->assertStringEndsWith('.png', $path);
        $this->assertStringNotContainsString('.php', $path);
        $this->assertFileExists(public_path($path));
    }

    public function test_svg_is_refused_because_it_can_carry_script(): void
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';

        $this->postJson('/api/upload', [
            'base64' => 'data:image/svg+xml;base64,'.base64_encode($svg),
            'folder' => 'test-uploads',
        ])->assertStatus(422);

        $this->postJson('/api/upload', ['image' => UploadedFile::fake()->createWithContent('logo.svg', $svg)])
            ->assertStatus(422);
    }

    public function test_a_base64_payload_that_is_not_an_image_is_refused(): void
    {
        $this->postJson('/api/upload', [
            'base64' => 'data:image/png;base64,'.base64_encode('not an image at all'),
            'folder' => 'test-uploads',
        ])->assertStatus(422);
    }

    public function test_a_folder_cannot_escape_the_uploads_directory(): void
    {
        $response = $this->postJson('/api/upload', [
            'image' => UploadedFile::fake()->image('logo.png')->size(10),
            'folder' => '../../routes',
        ])->assertCreated();

        $path = $response->json('path');
        $this->written[] = $path;

        $this->assertStringStartsWith('uploads/routes/', $path);
    }
}
