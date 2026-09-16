<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The public chat assistant, with the Gemini and Anthropic APIs faked: the
 * tool loop runs real lookups against the seeded data and feeds them back to
 * the model.
 */
class AssistantTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Whatever the local .env holds, each test picks its provider explicitly.
        config(['services.gemini.api_key' => null, 'services.anthropic.api_key' => null]);
    }

    private function ask(string $question)
    {
        return $this->postJson('/api/assistant/chat', [
            'messages' => [['role' => 'user', 'content' => $question]],
        ]);
    }

    public function test_answers_503_without_an_api_key(): void
    {
        $this->ask('Who is top of the table?')->assertStatus(503);
    }

    public function test_runs_tools_and_returns_the_final_reply(): void
    {
        config(['services.anthropic.api_key' => 'test-key']);

        Http::fakeSequence('api.anthropic.com/*')
            ->push([
                'stop_reason' => 'tool_use',
                'content' => [
                    ['type' => 'tool_use', 'id' => 'tu_1', 'name' => 'get_tournament', 'input' => ['tournament' => 'malappuram-7s-football-2026']],
                ],
            ])
            ->push([
                'stop_reason' => 'end_turn',
                'content' => [['type' => 'text', 'text' => 'Here is the points table.']],
            ]);

        $this->ask('Show the Malappuram 7s table')
            ->assertOk()
            ->assertJson(['reply' => 'Here is the points table.']);

        Http::assertSentCount(2);

        $second = Http::recorded()[1][0];
        $result = collect($second->data()['messages'])->last()['content'][0];
        $this->assertSame('tu_1', $result['tool_use_id']);
        $this->assertFalse($result['is_error']);

        $payload = json_decode($result['content'], true);
        $this->assertSame('tourney-football-sevens', $payload['id']);
        $this->assertNotEmpty($payload['teams']);
        // Team manager contact details never reach the model.
        $this->assertStringNotContainsString('manager_phone', $result['content']);
    }

    public function test_draft_tournaments_are_invisible_to_tools(): void
    {
        config(['services.anthropic.api_key' => 'test-key']);
        \App\Models\Tournament::query()->whereKey('tourney-football-sevens')->update(['status' => 'draft']);

        Http::fakeSequence('api.anthropic.com/*')
            ->push(['stop_reason' => 'tool_use', 'content' => [
                ['type' => 'tool_use', 'id' => 'tu_1', 'name' => 'get_tournament', 'input' => ['tournament' => 'tourney-football-sevens']],
            ]])
            ->push(['stop_reason' => 'end_turn', 'content' => [['type' => 'text', 'text' => 'Not found.']]]);

        $this->ask('Tell me about the sevens')->assertOk();

        $result = collect(Http::recorded()[1][0]->data()['messages'])->last()['content'][0];
        $this->assertTrue($result['is_error']);
    }

    public function test_upstream_failure_returns_502(): void
    {
        config(['services.anthropic.api_key' => 'test-key']);
        Http::fake(['api.anthropic.com/*' => Http::response(['error' => 'overloaded'], 529)]);

        $this->ask('Live scores?')->assertStatus(502);
    }

    public function test_conversation_must_end_with_a_user_message(): void
    {
        config(['services.anthropic.api_key' => 'test-key']);

        $this->postJson('/api/assistant/chat', ['messages' => [
            ['role' => 'user', 'content' => 'Hi'],
            ['role' => 'assistant', 'content' => 'Hello!'],
        ]])->assertStatus(422);
    }

    public function test_gemini_runs_tools_and_returns_the_final_reply(): void
    {
        config(['services.gemini.api_key' => 'test-key', 'services.anthropic.api_key' => 'also-set']);

        Http::fakeSequence('generativelanguage.googleapis.com/*')
            ->push(['candidates' => [[
                'finishReason' => 'STOP',
                'content' => ['role' => 'model', 'parts' => [
                    ['functionCall' => ['id' => 'fc_1', 'name' => 'get_tournament', 'args' => ['tournament' => 'malappuram-7s-football-2026']], 'thoughtSignature' => 'sig-abc'],
                ]],
            ]]])
            ->push(['candidates' => [[
                'finishReason' => 'STOP',
                'content' => ['role' => 'model', 'parts' => [['text' => 'Here is the table ⚽']]],
            ]]]);

        $this->ask('Show the Malappuram 7s table')
            ->assertOk()
            ->assertJson(['reply' => 'Here is the table ⚽']);

        // Gemini is preferred over Claude, and nothing went to Anthropic.
        Http::assertSentCount(2);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'anthropic.com'));

        $first = Http::recorded()[0][0];
        $this->assertSame('test-key', $first->header('x-goog-api-key')[0]);
        $this->assertStringContainsString('models/gemini', $first->url());
        $noArgs = collect($first->data()['tools'][0]['functionDeclarations'])->firstWhere('name', 'get_current_matches');
        $this->assertArrayNotHasKey('parameters', $noArgs);

        $contents = Http::recorded()[1][0]->data()['contents'];
        // The model turn is echoed back with its thought signature intact.
        $this->assertSame('sig-abc', $contents[1]['parts'][0]['thoughtSignature']);
        $response = $contents[2]['parts'][0]['functionResponse'];
        $this->assertSame(['fc_1', 'get_tournament'], [$response['id'], $response['name']]);
        $this->assertSame('tourney-football-sevens', $response['response']['result']['id']);
    }

    public function test_gemini_safety_block_returns_a_polite_reply(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['finishReason' => 'SAFETY']]])]);

        $this->ask('Something unsafe')->assertOk()->assertJson(['reply' => "Sorry, I can't help with that one."]);
    }

    public function test_gemini_rate_limit_returns_502(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['error' => ['code' => 429]], 429)]);

        $this->ask('Live scores?')->assertStatus(502);
    }
}
