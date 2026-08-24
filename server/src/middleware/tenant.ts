import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { db } from '../db/database.js';

/**
 * Strict Tenant Isolation Middleware:
 * Validates that an organization user can only access resources belonging to their own organization.
 * Super Admin has platform-wide access and bypasses the tenant restriction.
 * If a tenant tries to access another tenant's data, returns 403 Forbidden with audit logging.
 */
export function requireTenantAccess(extractOrgId?: (req: AuthenticatedRequest) => string | undefined) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Super Admin has global platform-wide access
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    // Determine target organization ID from custom extractor, route params, request body, or query
    let targetOrgId: string | undefined;
    if (extractOrgId) {
      targetOrgId = extractOrgId(req);
    }
    
    if (!targetOrgId) {
      targetOrgId = (req.params.orgId || req.params.organizationId || req.body?.organization_id || req.query.orgId || req.query.organization_id) as string;
    }

    // If resource is tied to tournament ID, resolve organization ID
    if (!targetOrgId && req.params.tournamentId) {
      const tournament = db.tournaments.find(t => t.id === req.params.tournamentId);
      if (tournament) {
        targetOrgId = tournament.organization_id;
      }
    }

    // If resource is tied to team ID, resolve organization ID
    if (!targetOrgId && req.params.teamId) {
      const team = db.teams.find(t => t.id === req.params.teamId);
      if (team) {
        targetOrgId = team.organization_id;
      }
    }

    // If resource is tied to match ID, resolve organization ID
    if (!targetOrgId && req.params.matchId) {
      const match = db.matches.find(m => m.id === req.params.matchId);
      if (match) {
        targetOrgId = match.organization_id;
      }
    }

    // If user has no organization or target org is different from user's organization
    if (!req.user.organization_id || (targetOrgId && req.user.organization_id !== targetOrgId)) {
      // Log security violation attempt
      db.logAudit({
        organization_id: req.user.organization_id,
        user_id: req.user.id,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'SECURITY_TENANT_VIOLATION_BLOCKED',
        entity_type: 'TenantIsolation',
        entity_id: targetOrgId || 'UNKNOWN',
        details: `User from org [${req.user.organization_id || 'NONE'}] attempted unauthorized access to org [${targetOrgId}] on path ${req.originalUrl}`,
        ip_address: req.ip
      });

      return res.status(403).json({ 
        error: '403 Forbidden: Strict Tenant Isolation Violation. You do not have permission to access data belonging to another organization.',
        code: 'TENANT_ISOLATION_VIOLATION'
      });
    }

    next();
  };
}

/**
 * Helper to ensure queries always scope to the user's organization unless Super Admin
 */
export function getTenantScopedOrgId(req: AuthenticatedRequest): string | undefined {
  if (req.user?.role === 'SUPER_ADMIN') {
    return (req.query.orgId || req.params.orgId || req.params.organizationId) as string | undefined;
  }
  return req.user?.organization_id;
}
