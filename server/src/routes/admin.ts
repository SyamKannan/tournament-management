import { Router, Response } from 'express';
import { db } from '../db/database.js';
import { AuthenticatedRequest, requireAuth, requireRole } from '../middleware/auth.js';
import { BillingService } from '../services/billingService.js';
import { Plan, Organization, User } from '../types.js';

export const adminRouter = Router();

// Protect all routes with Super Admin role
adminRouter.use(requireAuth);
adminRouter.use(requireRole(['SUPER_ADMIN']));

// 1. Platform Metrics & Revenue Dashboard
adminRouter.get('/metrics', (req: AuthenticatedRequest, res: Response) => {
  const metrics = BillingService.getPlatformMetrics();
  return res.json(metrics);
});

// 2. SaaS Plans Management
adminRouter.get('/plans', (req: AuthenticatedRequest, res: Response) => {
  return res.json(db.plans);
});

adminRouter.post('/plans', (req: AuthenticatedRequest, res: Response) => {
  const {
    name,
    description,
    price,
    currency = '₹',
    billing_type,
    billing_interval,
    trial_days = 0,
    tournament_limit = 1,
    team_limit = 16,
    player_limit = 250,
    storage_limit_mb = 1024,
    ad_limit = 5,
    features = []
  } = req.body;

  if (!name || price === undefined || !billing_type) {
    return res.status(400).json({ error: 'Plan name, price, and billing type are required' });
  }

  const now = new Date().toISOString();
  const newPlan: Plan = {
    id: 'plan_' + Date.now(),
    name,
    description: description || '',
    price: Number(price),
    currency,
    billing_type,
    billing_interval: billing_type === 'recurring' ? (billing_interval || 'monthly') : undefined,
    trial_days: Number(trial_days),
    tournament_limit: Number(tournament_limit),
    team_limit: Number(team_limit),
    player_limit: Number(player_limit),
    storage_limit_mb: Number(storage_limit_mb),
    ad_limit: Number(ad_limit),
    features: Array.isArray(features) ? features : [],
    status: 'active',
    created_at: now,
    updated_at: now
  };

  db.plans.push(newPlan);

  db.logAudit({
    user_id: req.user!.id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: 'CREATED_PLAN',
    entity_type: 'Plan',
    entity_id: newPlan.id,
    details: `Created plan [${newPlan.name}] with price ${newPlan.currency}${newPlan.price}`
  });

  db.save();
  return res.status(201).json(newPlan);
});

adminRouter.put('/plans/:id', (req: AuthenticatedRequest, res: Response) => {
  const plan = db.plans.find(p => p.id === req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const fields = req.body;
  Object.assign(plan, fields, { updated_at: new Date().toISOString() });

  db.logAudit({
    user_id: req.user!.id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: 'UPDATED_PLAN',
    entity_type: 'Plan',
    entity_id: plan.id,
    details: `Updated plan [${plan.name}] settings`
  });

  db.save();
  return res.json(plan);
});

adminRouter.delete('/plans/:id', (req: AuthenticatedRequest, res: Response) => {
  const index = db.plans.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Plan not found' });

  const deleted = db.plans.splice(index, 1)[0];

  db.logAudit({
    user_id: req.user!.id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: 'DELETED_PLAN',
    entity_type: 'Plan',
    entity_id: req.params.id as string,
    details: `Deleted plan [${deleted.name}]`
  });

  db.save();
  return res.json({ message: 'Plan deleted successfully' });
});

// 3. Organization Management by Super Admin
adminRouter.get('/organizations', (req: AuthenticatedRequest, res: Response) => {
  const orgsWithDetails = db.organizations.map(org => {
    const sub = db.subscriptions.find(s => s.organization_id === org.id);
    const plan = sub ? db.plans.find(p => p.id === sub.plan_id) : null;
    const tournaments = db.tournaments.filter(t => t.organization_id === org.id);
    const teams = db.teams.filter(t => t.organization_id === org.id);
    const adminUser = db.users.find(u => u.organization_id === org.id && u.role === 'ORG_ADMIN');

    return {
      ...org,
      subscription: sub,
      plan: plan,
      tournaments_count: tournaments.length,
      teams_count: teams.length,
      admin_user: adminUser ? { id: adminUser.id, name: adminUser.name, email: adminUser.email, phone: adminUser.phone } : null
    };
  });

  return res.json(orgsWithDetails);
});

adminRouter.post('/organizations', (req: AuthenticatedRequest, res: Response) => {
  const {
    name,
    type,
    contact_person,
    phone,
    whatsapp,
    email,
    address,
    village,
    panchayat,
    district,
    state,
    plan_id,
    admin_name,
    admin_email,
    admin_password
  } = req.body;

  if (!name || !email || !contact_person || !plan_id) {
    return res.status(400).json({ error: 'Organization name, contact email, contact person, and plan ID are required' });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const orgId = 'org_' + Date.now();
  const userId = 'user_' + Date.now();
  const now = new Date().toISOString();

  const newOrg: Organization = {
    id: orgId,
    name,
    slug: slug + '-' + Math.random().toString(36).substring(2, 5),
    logo: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=150&auto=format&fit=crop&q=80',
    banner: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1200&auto=format&fit=crop&q=80',
    type: type || 'Sports Club',
    description: `Organization: ${name}`,
    contact_person,
    phone: phone || '',
    whatsapp: whatsapp || phone || '',
    email,
    address: address || '',
    village: village || '',
    panchayat: panchayat || '',
    municipality: '',
    district: district || '',
    state: state || 'Kerala',
    country: 'India',
    website: '',
    social_media: {},
    status: 'active',
    created_at: now,
    updated_at: now
  };

  const newUser: User = {
    id: userId,
    name: admin_name || contact_person,
    email: admin_email || email,
    password_hash: admin_password || 'admin123',
    phone: phone || '',
    role: 'ORG_ADMIN',
    organization_id: orgId,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
    created_at: now,
    updated_at: now
  };

  db.organizations.push(newOrg);
  db.users.push(newUser);

  // Assign and activate plan
  BillingService.subscribePlan(orgId, plan_id, 'upi');

  db.logAudit({
    user_id: req.user!.id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: 'SUPER_ADMIN_CREATED_ORGANIZATION',
    entity_type: 'Organization',
    entity_id: orgId,
    details: `Super Admin manually onboarded organization [${name}] with plan [${plan_id}]`
  });

  db.save();
  return res.status(201).json(newOrg);
});

adminRouter.put('/organizations/:id/status', (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body;
  const org = db.organizations.find(o => o.id === req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found' });

  org.status = status;
  org.updated_at = new Date().toISOString();

  db.logAudit({
    user_id: req.user!.id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: 'CHANGED_ORGANIZATION_STATUS',
    entity_type: 'Organization',
    entity_id: org.id,
    details: `Changed organization [${org.name}] status to [${status}]`
  });

  db.save();
  return res.json(org);
});

// 4. Subscriptions & Invoices Overview
adminRouter.get('/subscriptions', (req: AuthenticatedRequest, res: Response) => {
  const subs = db.subscriptions.map(s => {
    const org = db.organizations.find(o => o.id === s.organization_id);
    const plan = db.plans.find(p => p.id === s.plan_id);
    return { ...s, organization_name: org?.name, plan_name: plan?.name, plan_price: plan?.price };
  });
  return res.json(subs);
});

adminRouter.get('/invoices', (req: AuthenticatedRequest, res: Response) => {
  return res.json(db.invoices);
});

// 5. Audit Logs
adminRouter.get('/audit-logs', (req: AuthenticatedRequest, res: Response) => {
  return res.json(db.audit_logs);
});

// 6. Platform Settings
adminRouter.get('/settings', (req: AuthenticatedRequest, res: Response) => {
  return res.json(db.platform_settings);
});

adminRouter.put('/settings', (req: AuthenticatedRequest, res: Response) => {
  Object.assign(db.platform_settings, req.body);
  db.save();
  return res.json(db.platform_settings);
});
