/**
 * 认证：scrypt 口令哈希 + 服务端会话（httpOnly Cookie）
 * 说明：不引入第三方依赖，全部使用 node:crypto。
 */
import crypto from 'node:crypto';
import { get, run, all, uid, nowISO } from './db.mjs';

export const COOKIE = 'sp_session';
const SESSION_DAYS = 30;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(pw, stored) {
  const [algo, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const calc = crypto.scryptSync(String(pw), salt, 64);
  const want = Buffer.from(hash, 'hex');
  return calc.length === want.length && crypto.timingSafeEqual(calc, want);
}

export const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');

/* ---------------- 校验规则 ---------------- */
export const RE_USER = /^[\u4e00-\u9fa5A-Za-z0-9_]{3,20}$/;
export const passOk = p => typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

/* ---------------- Cookie ---------------- */
export function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export function sessionCookie(token, secure) {
  const max = SESSION_DAYS * 86400;
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${max}${secure ? '; Secure' : ''}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/* ---------------- 会话 ---------------- */
export function createSession(userId, req) {
  const token = newToken();
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  run(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?)',
    uid('s_'), userId, sha256(token), exp, nowISO()
  );
  return token;
}

export function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const row = get('SELECT * FROM sessions WHERE token_hash = ?', sha256(token));
  if (!row) return null;
  if (row.expires_at < nowISO()) {
    run('DELETE FROM sessions WHERE id = ?', row.id);
    return null;
  }
  return get('SELECT id, username, timezone FROM users WHERE id = ?', row.user_id) || null;
}

export function destroySession(req) {
  const token = parseCookies(req)[COOKIE];
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

/* ---------------- 简易限流（单机内存版） ---------------- */
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { buckets.set(key, arr); return false; }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 5000) buckets.clear();
  return true;
}
