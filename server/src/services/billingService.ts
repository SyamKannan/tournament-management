import { db } from '../db/database.js';
import { Plan, Subscription, Invoice } from '../types.js';

export class BillingService {
  /**
   * Check if organization has reached limit for a given resource
   */
  public static checkLimit(orgId: string, resource: 'tournaments' | 'teams' | 'players' | 'ads'): { allowed: boolean; reason?: string; current: number; max: number } {
    const sub = db.subscriptions.find(s => s.organization_id === orgId && (s.status === 'active' || s.status === 'trial'));
    if (!sub) {
      return { allowed: false, reason: 'No active subscription found. Please subscribe to a plan.', current: 0, max: 0 };
    }

    const plan = db.plans.find(p => p.id === sub.plan_id);
    if (!plan) {
      return { allowed: false, reason: 'Plan not found.', current: 0, max: 0 };
    }

    if (resource === 'tournaments') {
      const count = db.tournaments.filter(t => t.organization_id === orgId && t.status !== 'cancelled').length;
      return {
        allowed: count < plan.tournament_limit,
        reason: count >= plan.tournament_limit ? `Tournament limit reached (${count}/${plan.tournament_limit}). Upgrade your plan to host more.` : undefined,
        current: count,
        max: plan.tournament_limit
      };
    }

    if (resource === 'teams') {
      const count = db.teams.filter(t => t.organization_id === orgId && t.status !== 'withdrawn').length;
      return {
        allowed: count < plan.team_limit,
        reason: count >= plan.team_limit ? `Team limit reached (${count}/${plan.team_limit}). Upgrade your plan.` : undefined,
        current: count,
        max: plan.team_limit
      };
    }

    if (resource === 'players') {
      const count = db.players.filter(p => p.organization_id === orgId).length;
      return {
        allowed: count < plan.player_limit,
        reason: count >= plan.player_limit ? `Player limit reached (${count}/${plan.player_limit}). Upgrade your plan.` : undefined,
        current: count,
        max: plan.player_limit
      };
    }

    if (resource === 'ads') {
      const count = db.advertisements.filter(a => a.organization_id === orgId).length;
      return {
        allowed: count < plan.ad_limit,
        reason: count >= plan.ad_limit ? `Advertisement limit reached (${count}/${plan.ad_limit}). Upgrade your plan.` : undefined,
        current: count,
        max: plan.ad_limit
      };
    }

    return { allowed: true, current: 0, max: 999 };
  }

  /**
   * Check if organization has a specific feature enabled in their plan
   */
  public static hasFeature(orgId: string, feature: string): boolean {
    const sub = db.subscriptions.find(s => s.organization_id === orgId && (s.status === 'active' || s.status === 'trial'));
    if (!sub) return false;
    const plan = db.plans.find(p => p.id === sub.plan_id);
    if (!plan) return false;
    return plan.features.includes(feature);
  }

  /**
   * Get organization usage stats
   */
  public static getUsage(orgId: string) {
    const sub = db.subscriptions.find(s => s.organization_id === orgId);
    const plan = sub ? db.plans.find(p => p.id === sub.plan_id) : null;

    const tournamentsCount = db.tournaments.filter(t => t.organization_id === orgId && t.status !== 'cancelled').length;
    const teamsCount = db.teams.filter(t => t.organization_id === orgId && t.status !== 'withdrawn').length;
    const playersCount = db.players.filter(p => p.organization_id === orgId).length;
    const adsCount = db.advertisements.filter(a => a.organization_id === orgId).length;

    return {
      subscription: sub,
      plan: plan,
      usage: {
        tournaments: { current: tournamentsCount, max: plan?.tournament_limit || 1, percentage: Math.min(100, Math.round((tournamentsCount / (plan?.tournament_limit || 1)) * 100)) },
        teams: { current: teamsCount, max: plan?.team_limit || 16, percentage: Math.min(100, Math.round((teamsCount / (plan?.team_limit || 16)) * 100)) },
        players: { current: playersCount, max: plan?.player_limit || 250, percentage: Math.min(100, Math.round((playersCount / (plan?.player_limit || 250)) * 100)) },
        ads: { current: adsCount, max: plan?.ad_limit || 5, percentage: Math.min(100, Math.round((adsCount / (plan?.ad_limit || 5)) * 100)) }
      }
    };
  }

  /**
   * Subscribe or change organization plan
   */
  public static subscribePlan(orgId: string, planId: string, paymentMethod: 'upi' | 'razorpay' | 'stripe' | 'bank_transfer' = 'upi') {
    const plan = db.plans.find(p => p.id === planId);
    const org = db.organizations.find(o => o.id === orgId);
    if (!plan || !org) throw new Error('Plan or Organization not found');

    const now = new Date();
    const isRecurring = plan.billing_type === 'recurring';
    const durationDays = plan.billing_interval === 'yearly' ? 365 : plan.billing_interval === 'quarterly' ? 90 : 30;
    const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    // Check existing subscription
    let sub = db.subscriptions.find(s => s.organization_id === orgId);
    if (sub) {
      sub.plan_id = plan.id;
      sub.status = 'active';
      sub.start_date = now.toISOString();
      sub.end_date = endDate;
      sub.next_billing_date = isRecurring ? endDate : undefined;
      sub.amount_paid = plan.price;
      sub.auto_renew = isRecurring;
      sub.updated_at = now.toISOString();
    } else {
      sub = {
        id: 'sub_' + Date.now(),
        organization_id: orgId,
        plan_id: plan.id,
        status: 'active',
        start_date: now.toISOString(),
        end_date: endDate,
        next_billing_date: isRecurring ? endDate : undefined,
        auto_renew: isRecurring,
        amount_paid: plan.price,
        currency: plan.currency,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };
      db.subscriptions.push(sub);
    }

    // Generate SaaS platform invoice
    const invNumber = 'INV-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
    const invoice: Invoice = {
      id: 'inv_' + Date.now(),
      organization_id: orgId,
      subscription_id: sub.id,
      invoice_number: invNumber,
      amount: plan.price,
      currency: plan.currency,
      status: 'paid',
      payment_method: paymentMethod,
      transaction_reference: 'TXN-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
      billing_name: org.name,
      billing_email: org.email,
      billing_address: `${org.address}, ${org.district}, ${org.state}`,
      created_at: now.toISOString()
    };
    db.invoices.push(invoice);

    // If org was pending, activate it
    if (org.status === 'pending') {
      org.status = 'active';
    }

    db.logAudit({
      organization_id: orgId,
      user_id: 'system',
      user_name: 'Platform Billing System',
      user_role: 'SUPER_ADMIN',
      action: 'SUBSCRIBED_PLAN',
      entity_type: 'Subscription',
      entity_id: sub.id,
      details: `Organization subscribed to [${plan.name}] (${plan.currency}${plan.price}) via ${paymentMethod.toUpperCase()}`
    });

    db.save();
    return { subscription: sub, invoice };
  }

  /**
   * Calculate Platform-wide SaaS Revenue Metrics for Super Admin
   */
  public static getPlatformMetrics() {
    const totalOrgs = db.organizations.length;
    const activeOrgs = db.organizations.filter(o => o.status === 'active').length;
    const pendingOrgs = db.organizations.filter(o => o.status === 'pending').length;
    const suspendedOrgs = db.organizations.filter(o => o.status === 'suspended').length;

    const activeSubs = db.subscriptions.filter(s => s.status === 'active');
    const trialSubs = db.subscriptions.filter(s => s.status === 'trial');
    const expiredSubs = db.subscriptions.filter(s => s.status === 'expired');
    const cancelledSubs = db.subscriptions.filter(s => s.status === 'cancelled');

    // Calculate MRR & ARR
    let mrr = 0;
    let oneTimeRevenue = 0;
    activeSubs.forEach(sub => {
      const plan = db.plans.find(p => p.id === sub.plan_id);
      if (!plan) return;
      if (plan.billing_type === 'recurring') {
        if (plan.billing_interval === 'monthly') mrr += plan.price;
        else if (plan.billing_interval === 'quarterly') mrr += plan.price / 3;
        else if (plan.billing_interval === 'yearly') mrr += plan.price / 12;
      } else {
        oneTimeRevenue += plan.price;
      }
    });

    const arr = mrr * 12;
    const totalPlatformRevenue = db.invoices.filter(i => i.status === 'paid').reduce((acc, i) => acc + i.amount, 0);

    const totalTournaments = db.tournaments.length;
    const totalTeams = db.teams.length;
    const totalPlayers = db.players.length;
    const liveMatches = db.matches.filter(m => m.status === 'in_progress').length;

    return {
      organizations: { total: totalOrgs, active: activeOrgs, pending: pendingOrgs, suspended: suspendedOrgs },
      subscriptions: { active: activeSubs.length, trial: trialSubs.length, expired: expiredSubs.length, cancelled: cancelledSubs.length },
      revenue: {
        mrr: Math.round(mrr),
        arr: Math.round(arr),
        oneTimeRevenue,
        totalPlatformRevenue
      },
      activity: {
        totalTournaments,
        totalTeams,
        totalPlayers,
        liveMatches
      }
    };
  }
}
