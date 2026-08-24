import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.js';
import { requireTenantAccess } from '../middleware/tenant.js';
import { wsHub } from '../websocket/server.js';
import { Sponsor, Advertisement, Announcement } from '../types.js';

export const sponsorRouter = Router();

// ============================================================================
// SPONSORS
// ============================================================================

sponsorRouter.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user!.role === 'SUPER_ADMIN' ? (req.query.orgId as string) : req.user!.organization_id;
  const list = orgId ? db.sponsors.filter(s => s.organization_id === orgId) : db.sponsors;
  return res.json(list);
});

sponsorRouter.post('/', requireAuth, requireTenantAccess(), (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.body.organization_id || req.user!.organization_id;
  const { name, logo, website, tier = 'gold', description, phone, email } = req.body;

  if (!name || !logo) return res.status(400).json({ error: 'Sponsor name and logo are required' });

  const newSponsor: Sponsor = {
    id: 'spon_' + Date.now(),
    organization_id: orgId,
    name,
    logo,
    website,
    tier,
    description,
    phone,
    email,
    created_at: new Date().toISOString()
  };

  db.sponsors.push(newSponsor);
  db.save();
  return res.status(201).json(newSponsor);
});

sponsorRouter.delete('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const index = db.sponsors.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Sponsor not found' });

  if (req.user!.role !== 'SUPER_ADMIN' && db.sponsors[index].organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.sponsors.splice(index, 1);
  db.save();
  return res.json({ message: 'Sponsor deleted' });
});

// ============================================================================
// ADVERTISEMENTS & BREAK-TIME ROTATION
// ============================================================================

sponsorRouter.get('/ads', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user!.role === 'SUPER_ADMIN' ? (req.query.orgId as string) : req.user!.organization_id;
  const list = orgId ? db.advertisements.filter(a => a.organization_id === orgId) : db.advertisements;
  return res.json(list);
});

sponsorRouter.post('/ads', requireAuth, requireTenantAccess(), (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.body.organization_id || req.user!.organization_id;
  const { 
    title, 
    business_name, 
    media_type = 'image', 
    display_placement = 'all',
    media_url, 
    logo_url, 
    description, 
    phone, 
    whatsapp, 
    website, 
    priority = 5, 
    duration_seconds = 10, 
    status = 'active' 
  } = req.body;

  if (!title || !business_name || !media_url) {
    return res.status(400).json({ error: 'Title, business name, and media URL are required' });
  }

  const newAd: Advertisement = {
    id: 'ad_' + Date.now(),
    organization_id: orgId,
    title,
    business_name,
    media_type,
    display_placement,
    media_url,
    logo_url,
    description,
    phone,
    whatsapp,
    website,
    priority: Number(priority),
    duration_seconds: Number(duration_seconds),
    status,
    created_at: new Date().toISOString()
  };

  db.advertisements.push(newAd);
  db.save();
  return res.status(201).json(newAd);
});

sponsorRouter.delete('/ads/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const index = db.advertisements.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Advertisement not found' });

  if (req.user!.role !== 'SUPER_ADMIN' && db.advertisements[index].organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.advertisements.splice(index, 1);
  db.save();
  return res.json({ message: 'Advertisement deleted' });
});

// Break-Time Ad Controller (Start/Stop Ads on big screen scoreboard)
sponsorRouter.post('/ads/control/break-mode', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { match_id, action, break_title = 'BREAK TIME', countdown_seconds = 300 } = req.body;
  const match = db.matches.find(m => m.id === match_id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const ads = db.advertisements.filter(a => a.organization_id === match.organization_id && a.status === 'active');

  // Broadcast over WebSocket to active big screen TVs
  wsHub.broadcastToRoom(`scoreboard:${match.id}`, 'BREAK_AD_ROTATION', {
    action, // 'start' | 'stop' | 'next'
    break_title,
    countdown_seconds,
    ads
  });

  return res.json({ message: `Break ad mode ${action} broadcasted to scoreboard`, adsCount: ads.length });
});

// Instant Sponsor Popup Trigger (e.g. Broadcast specific sponsor or goal ad to scoreboard)
sponsorRouter.post('/ads/control/push-popup', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { match_id, ad_id, custom_title, custom_message, duration_seconds = 8 } = req.body;
  const match = db.matches.find(m => m.id === match_id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  let ad = ad_id ? db.advertisements.find(a => a.id === ad_id) : null;
  if (!ad) {
    ad = db.advertisements.find(a => a.organization_id === match.organization_id && a.status === 'active') || null;
  }

  // Broadcast popup event to scoreboard
  wsHub.broadcastToRoom(`scoreboard:${match.id}`, 'SCOREBOARD_AD_POPUP', {
    ad,
    custom_title: custom_title || 'FEATURED TOURNAMENT SPONSOR',
    custom_message,
    duration_seconds: Number(duration_seconds)
  });

  return res.json({ message: 'Sponsor pop-up broadcasted to live scoreboard', ad });
});

// Live Scoreboard Advertisement Configuration Settings
sponsorRouter.post('/ads/control/settings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { match_id, live_ticker_enabled = true, ticker_interval_seconds = 12, goal_popup_enabled = true } = req.body;
  const match = db.matches.find(m => m.id === match_id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  // Broadcast settings change to scoreboard
  wsHub.broadcastToRoom(`scoreboard:${match.id}`, 'SCOREBOARD_AD_SETTINGS_CHANGED', {
    live_ticker_enabled: Boolean(live_ticker_enabled),
    ticker_interval_seconds: Number(ticker_interval_seconds) || 12,
    goal_popup_enabled: Boolean(goal_popup_enabled)
  });

  return res.json({ message: 'Scoreboard ad settings updated and broadcasted' });
});

// ============================================================================
// ANNOUNCEMENTS & EMERGENCY OVERLAYS
// ============================================================================

sponsorRouter.get('/announcements', (req: Request, res: Response) => {
  const orgId = req.query.orgId as string;
  const tourneyId = req.query.tournamentId as string;

  let list = db.announcements;
  if (orgId) list = list.filter(a => a.organization_id === orgId);
  if (tourneyId) list = list.filter(a => a.tournament_id === tourneyId || !a.tournament_id);
  return res.json(list);
});

sponsorRouter.post('/announcements', requireAuth, requireTenantAccess(), (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.body.organization_id || req.user!.organization_id;
  const { tournament_id, title, message, type = 'general', is_active_on_scoreboard = false } = req.body;

  if (!title || !message) return res.status(400).json({ error: 'Title and message are required' });

  const newAnn: Announcement = {
    id: 'ann_' + Date.now(),
    organization_id: orgId,
    tournament_id,
    title,
    message,
    type,
    is_active_on_scoreboard: Boolean(is_active_on_scoreboard),
    created_at: new Date().toISOString()
  };

  db.announcements.unshift(newAnn);

  // If active on scoreboard, broadcast immediately
  if (is_active_on_scoreboard) {
    wsHub.broadcastGlobal('EMERGENCY_ANNOUNCEMENT', { announcement: newAnn });
  }

  db.save();
  return res.status(201).json(newAnn);
});

sponsorRouter.put('/announcements/:id/scoreboard-toggle', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const ann = db.announcements.find(a => a.id === req.params.id);
  if (!ann) return res.status(404).json({ error: 'Announcement not found' });

  ann.is_active_on_scoreboard = Boolean(req.body.is_active_on_scoreboard);

  // Broadcast toggle
  wsHub.broadcastGlobal('EMERGENCY_ANNOUNCEMENT', { announcement: ann.is_active_on_scoreboard ? ann : null });

  db.save();
  return res.json(ann);
});

sponsorRouter.delete('/announcements/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const index = db.announcements.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Announcement not found' });

  db.announcements.splice(index, 1);
  db.save();
  return res.json({ message: 'Announcement deleted' });
});
