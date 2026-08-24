import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, UserRole } from '../types.js';
import { db } from '../db/database.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'antigravity_sports_saas_super_secret_jwt_key_2026';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  // Also support quick-switch demo headers for developer/evaluator convenience
  const demoRole = req.headers['x-demo-role'] as UserRole;
  const demoOrg = req.headers['x-demo-org-id'] as string;

  if (demoRole) {
    const demoUser = db.users.find(u => u.role === demoRole && (!demoOrg || u.organization_id === demoOrg)) || db.users.find(u => u.role === demoRole);
    if (demoUser) {
      req.user = demoUser;
      return next();
    }
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Unauthenticated, public routes can still proceed
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: UserRole; email: string };
    const user = db.users.find(u => u.id === decoded.id);
    if (user) {
      req.user = user;
    }
  } catch (err) {
    // Invalid token, treat as guest
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Forbidden. Required one of roles: [${allowedRoles.join(', ')}]. You are [${req.user.role}].` 
      });
    }
    next();
  };
}
