import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.js';

export const COOKIE_NAME = 'angela_session';
export const hashToken = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('base64url');

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ message: 'Debes iniciar sesión' });
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt <= new Date() || !session.user.active) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ message: 'Tu sesión venció. Ingresa nuevamente.' });
  }
  req.auth = { user: session.user, sessionId: session.id, csrfToken: session.csrfToken };
  return next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.user.role !== 'ADMIN') return res.status(403).json({ message: 'No tienes permiso para realizar esta acción' });
  return next();
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path === '/auth/login') return next();
  if (!req.auth || req.get('x-csrf-token') !== req.auth.csrfToken) {
    return res.status(403).json({ message: 'La solicitud de seguridad venció. Recarga la página.' });
  }
  return next();
}

export function cleanJson(value: unknown): any {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item));
}

export async function audit(userId: number, action: string, entity: string, entityId: string | number, beforeData?: unknown, afterData?: unknown, reason?: string) {
  await db.auditLog.create({ data: { userId, action, entity, entityId: String(entityId), beforeData: beforeData ? cleanJson(beforeData) : undefined, afterData: afterData ? cleanJson(afterData) : undefined, reason } });
}
