<?php

namespace Tests\Feature;

use App\Models\Plan;
use Tests\TestCase;

class PlanOrderTest extends TestCase
{
    public function test_super_admin_reorder_is_the_order_everyone_sees(): void
    {
        $reversed = Plan::query()->ordered()->pluck('id')->reverse()->values()->all();

        $this->withHeaders($this->demoHeaders('SUPER_ADMIN'))
            ->postJson('/api/admin/plans/reorder', ['ids' => $reversed])
            ->assertOk()
            ->assertJsonPath('*.id', $reversed);

        $activeInOrder = Plan::query()->whereIn('id', $reversed)->where('status', 'active')->pluck('id')->all();
        $expectedPublic = array_values(array_filter($reversed, fn ($id) => in_array($id, $activeInOrder, true)));

        $this->getJson('/api/plans')->assertOk()->assertJsonPath('*.id', $expectedPublic);
    }

    public function test_reorder_must_list_every_plan_exactly_once(): void
    {
        $ids = Plan::query()->ordered()->pluck('id')->all();
        $headers = $this->demoHeaders('SUPER_ADMIN');

        $this->withHeaders($headers)
            ->postJson('/api/admin/plans/reorder', ['ids' => array_slice($ids, 1)])
            ->assertStatus(422);

        $this->withHeaders($headers)
            ->postJson('/api/admin/plans/reorder', ['ids' => [...$ids, 'plan-missing']])
            ->assertStatus(422);

        $this->withHeaders($headers)
            ->postJson('/api/admin/plans/reorder', ['ids' => [$ids[0], ...$ids]])
            ->assertStatus(422);

        $this->assertSame($ids, Plan::query()->ordered()->pluck('id')->all());
    }

    public function test_only_super_admins_can_reorder(): void
    {
        $ids = Plan::query()->ordered()->pluck('id')->reverse()->values()->all();

        $this->withHeaders($this->demoHeaders('ORG_ADMIN', 'org-green-valley'))
            ->postJson('/api/admin/plans/reorder', ['ids' => $ids])
            ->assertForbidden();
    }

    public function test_a_new_plan_is_listed_last(): void
    {
        $plan = $this->withHeaders($this->demoHeaders('SUPER_ADMIN'))
            ->postJson('/api/admin/plans', ['name' => 'Late Addition', 'price' => 1, 'billing_type' => 'one_time'])
            ->assertCreated()
            ->json();

        $this->assertSame($plan['id'], Plan::query()->ordered()->pluck('id')->last());
    }

    public function test_each_badge_moves_to_the_plan_it_is_given_to(): void
    {
        $headers = $this->demoHeaders('SUPER_ADMIN');

        $this->withHeaders($headers)->putJson('/api/admin/plans/plan-basic', ['is_popular' => true])
            ->assertOk()->assertJsonPath('is_popular', true);
        $this->withHeaders($headers)->putJson('/api/admin/plans/plan-premium', ['is_popular' => true])->assertOk();
        $this->withHeaders($headers)->putJson('/api/admin/plans/plan-premium', ['is_best_value' => true])->assertOk();

        $this->assertSame(['plan-premium'], Plan::query()->where('is_popular', true)->pluck('id')->all());
        $this->assertSame(['plan-premium'], Plan::query()->where('is_best_value', true)->pluck('id')->all());

        $this->getJson('/api/plans')->assertOk()->assertJsonFragment(['id' => 'plan-premium', 'is_popular' => true, 'is_best_value' => true]);

        $this->withHeaders($headers)->putJson('/api/admin/plans/plan-premium', ['is_popular' => false])->assertOk();
        $this->assertFalse(Plan::query()->where('is_popular', true)->exists());
        $this->assertTrue(Plan::find('plan-premium')->is_best_value);
    }
}
