import { randomBytes } from 'node:crypto';

export type SessionRole = 'reader' | 'author' | 'admin';
type Session = { role: SessionRole; expiresAt: number; csrfToken: string };
const store = globalThis as typeof globalThis & { __novelDevSessions?: Map<string, Session> };
const sessions = store.__novelDevSessions ??= new Map<string, Session>();

export const NOVEL_SESSION_COOKIE = 'novel_session';
export const NOVEL_CSRF_COOKIE = 'novel_csrf';
export function developmentLoginAllowed() { return process.env.NODE_ENV !== 'production' && process.env.NOVEL_DEV_LOGIN_ENABLED !== 'false'; }
export function createDevelopmentSession(role: SessionRole) { const id=randomBytes(32).toString('base64url'); const csrfToken=randomBytes(24).toString('base64url'); sessions.set(id,{role,csrfToken,expiresAt:Date.now()+8*60*60*1000}); return {id,csrfToken}; }
export function readDevelopmentSession(id: string | undefined): Session | undefined { if(!id)return undefined;const session=sessions.get(id);if(!session||session.expiresAt<Date.now()){sessions.delete(id);return undefined;}return session; }
export function deleteDevelopmentSession(id: string | undefined) { if(id)sessions.delete(id); }
export function createCsrfToken() { return randomBytes(24).toString('base64url'); }
