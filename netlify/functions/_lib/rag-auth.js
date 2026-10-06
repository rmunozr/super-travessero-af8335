const crypto = require('crypto');

const COOKIE = 'dfl_rag_session';
const TTL_SECONDS = 8 * 60 * 60;

function env(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`MISSING_${name}`);
  return value;
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function unb64url(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(payload) {
  return crypto.createHmac('sha256', env('DFL_RAG_SESSION_SECRET')).update(payload).digest('hex');
}

function parseAllowedUsers() {
  return new Set(
    String(process.env.DFL_RAG_ALLOWED_USERS || '')
      .split(',')
      .map(v => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

function parsePasswordHash() {
  const raw = env('DFL_RAG_PASSWORD_HASH');
  const parts = raw.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') throw new Error('INVALID_DFL_RAG_PASSWORD_HASH');
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100000) throw new Error('INVALID_DFL_RAG_PASSWORD_HASH');
  return { iterations, salt: parts[2], hash: parts[3] };
}

function verifyPassword(password) {
  const { iterations, salt, hash } = parsePasswordHash();
  const actual = crypto.pbkdf2Sync(String(password || ''), salt, iterations, 32, 'sha256').toString('hex');
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createToken(email) {
  const payload = b64url(JSON.stringify({
    email: String(email).trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    v: 1
  }));
  return `${payload}.${sign(payload)}`;
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.', 2);
  const expected = sign(payload);
  const a = Buffer.from(signature || '', 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(unb64url(payload)); } catch { return null; }
  if (!data?.email || !Number.isFinite(data.exp) || data.exp <= Math.floor(Date.now() / 1000)) return null;
  if (!parseAllowedUsers().has(String(data.email).toLowerCase())) return null;
  return data;
}

function sessionFromEvent(event) {
  const cookies = parseCookies(event?.headers?.cookie || event?.headers?.Cookie);
  return verifyToken(cookies[COOKIE]);
}

function cookieFor(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL_SECONDS}`;
}

function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function sessionIdFor(email, clientId = 'browser') {
  const material = `${String(email).toLowerCase()}|${String(clientId).slice(0,128)}`;
  const digest = crypto.createHmac('sha256', env('DFL_RAG_SESSION_SECRET')).update(material).digest('hex');
  return `web-${digest.slice(0, 40)}`;
}

module.exports = {
  COOKIE,
  clearCookie,
  cookieFor,
  createToken,
  parseAllowedUsers,
  sessionFromEvent,
  sessionIdFor,
  verifyPassword
};
