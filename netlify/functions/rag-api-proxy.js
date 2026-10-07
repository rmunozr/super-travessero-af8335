const { sessionFromEvent } = require('./_lib/rag-auth');

const HOP_BY_HOP = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailers','transfer-encoding','upgrade','host','content-length']);

function response(statusCode, body, headers = {}, isBase64Encoded = false) {
  return {
    statusCode,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers
    },
    body,
    isBase64Encoded
  };
}

function fail(statusCode, code) {
  return response(statusCode, JSON.stringify({ error: code }), { 'content-type': 'application/json; charset=utf-8' });
}

function targetUrl(base, rawPath, rawQuery) {
  const clean = String(rawPath || '').replace(/^\/+/, '');
  if (clean.includes('..') || clean.includes('://')) throw new Error('INVALID_PATH');
  const url = new URL(clean, base.replace(/\/$/, '') + '/');
  for (const [k,v] of Object.entries(rawQuery || {})) {
    if (k === 'path' || v == null) continue;
    url.searchParams.set(k, String(v));
  }
  return url;
}

function rewriteText(text) {
  return text;
}

exports.handler = async event => {
  const session = sessionFromEvent(event);
  if (!session) return fail(401, 'UNAUTHENTICATED');

  const rawPath = String(event.queryStringParameters?.path || '');
  const cleanPath = rawPath.replace(/^\/+/, '');
  if (!cleanPath) return fail(404, 'API_ONLY_GATEWAY');

  // Public /api/* is stripped by Netlify. Map exactly once to the backend contract.
  // health is the only backend endpoint outside /api.
  const upstreamPath = cleanPath === 'health' ? 'health' : `api/${cleanPath}`;

  const backend = String(process.env.DFL_RAG_BACKEND_URL || '').trim();
  if (!backend) return fail(503, 'RAG_BACKEND_NOT_CONFIGURED');
  const originSecret = String(process.env.DFL_RAG_ORIGIN_SECRET || '').trim();
  if (!originSecret) return fail(503, 'RAG_ORIGIN_SECRET_NOT_CONFIGURED');

  const method = String(event.httpMethod || 'GET').toUpperCase();
  if (!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(method)) return fail(405, 'METHOD_NOT_ALLOWED');

  let url;
  try { url = targetUrl(backend, upstreamPath, event.queryStringParameters); }
  catch { return fail(400, 'INVALID_PATH'); }

  const headers = {};
  for (const [k,v] of Object.entries(event.headers || {})) {
    const key = String(k).toLowerCase();
    if (HOP_BY_HOP.has(key) || key === 'cookie' || key === 'authorization') continue;
    if (v != null) headers[key] = String(v);
  }
  headers['x-dfl-authenticated-user'] = session.email;
  headers['x-dfl-rag-origin-secret'] = originSecret;

  let body;
  if (!['GET','HEAD'].includes(method) && event.body != null) {
    body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
  }

  try {
    const upstream = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(30000)
    });

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const outHeaders = { 'content-type': contentType };
    const location = upstream.headers.get('location');
    if (location) {
      try {
        const loc = new URL(location, url);
        const base = new URL(backend);
        if (loc.origin === base.origin) outHeaders.location = '/api/' + loc.pathname.replace(/^\/?api\/?/, '') + loc.search;
        else outHeaders.location = location;
      } catch { outHeaders.location = location; }
    }

    const textual = /^(text\/|application\/(json|javascript|xml|xhtml\+xml)|image\/svg\+xml)/i.test(contentType);
    if (textual) {
      const text = await upstream.text();
      return response(upstream.status, rewriteText(text, contentType), outHeaders, false);
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    return response(upstream.status, buf.toString('base64'), outHeaders, true);
  } catch (error) {
    console.error('Mini RAG app gateway error:', error.message);
    return fail(502, 'RAG_BACKEND_UNAVAILABLE');
  }
};
