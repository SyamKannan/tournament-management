import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.js';
import { requireTenantAccess } from '../middleware/tenant.js';
import { BillingService } from '../services/billingService.js';

export const organizationRouter = Router();

// Public Organization Profile (No login required)
organizationRouter.get('/public/:slug', (req: Request, res: Response) => {
  const org = db.organizations.find(o => o.slug === req.params.slug && o.status === 'active');
  if (!org) return res.status(404).json({ error: 'Organization not found or inactive' });

  const activeTournaments = db.tournaments.filter(t => t.organization_id === org.id && t.status !== 'cancelled' && t.status !== 'draft');
  const pastTournaments = db.tournaments.filter(t => t.organization_id === org.id && t.status === 'completed');
  const sponsors = db.sponsors.filter(s => s.organization_id === org.id);

  return res.json({
    organization: org,
    active_tournaments: activeTournaments,
    past_tournaments: pastTournaments,
    sponsors
  });
});

// Organization Profile (Tenant isolated)
organizationRouter.get('/:id', requireAuth, requireTenantAccess(), (req: AuthenticatedRequest, res: Response) => {
  const org = db.organizations.find(o => o.id === req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  return res.json(org);
});

// Update Organization Profile
organizationRouter.put('/:id', requireAuth, requireTenantAccess(), (req: AuthenticatedRequest, res: Response) => {
  const org = db.organizations.find(o => o.id === req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found' });

  Object.assign(org, req.body, { updated_at: new Date().toISOString() });

  db.logAudit({
    organization_id: org.id,
    user_id: req.user!.id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: 'UPDATED_ORGANIZATION_PROFILE',
    entity_type: 'Organization',
    entity_id: org.id,
    details: `Updated organization details for [${org.name}]`
  });

  db.save();
  return res.json(org);
});

// Organization Usage & Plan Dashboard
organizationRouter.get('/:id/usage', requireAuth, requireTenantAccess(), (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.params.id as string;
  const usage = BillingService.getUsage(orgId);
  const invoices = db.invoices.filter(i => i.organization_id === orgId);
  return res.json({ ...usage, invoices });
});

// Upgrade / Change SaaS Subscription Plan
organizationRouter.post('/:id/subscribe', requireAuth, requireTenantAccess(), (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.params.id as string;
  const { plan_id, payment_method = 'upi' } = req.body;
  if (!plan_id) return res.status(400).json({ error: 'Plan ID is required' });

  try {
    const result = BillingService.subscribePlan(orgId, plan_id, payment_method);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});
