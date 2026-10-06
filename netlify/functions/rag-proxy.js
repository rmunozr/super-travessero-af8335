const { sessionFromEvent, sessionIdFor } = require('./_lib/rag-auth');

const ALLOWED = [
  /^\/health$/,
  /^\/api\/status$/,
  /^\/api\/parameters$/,
  /^\/api\/knowledge$/,
  /^\/api\/mode\/(rag|llm|agent)$/,
  /^\/api\/rag\/(on|off)$/,
  /^\/api\/agent\/provider\/(hermes|openclaw)$/,
  /^\/api\/session\/[A-Za-z0-9._:-]+\/reset$/,
  /^\/api\/chat$/,
  /^\/api\/turn\/[a-f0-9]+$/
];

function out(statusCode, body, contentType = 'application/json; charset=utf-8') {
  return { statusCode, headers: { 'content-type': contentType, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, body };
}

exports.handler = async event => {
  const session = sessionFromEvent(event);
  if (!session) return out(401, JSON.stringify({ error: 'UNAUTHENTICATED' }));

  const backend = String(process.env.DFL_RAG_BACKEND_URL || '').trim().replace(/\/$/, '');
  if (!backend) return out(503, JSON.stringify({ error: 'RAG_BACKEND_NOT_CONFIGURED' }));

  const rawPath = String(event.queryStringParameters?.path || '/');
  const path = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
  if (!ALLOWED.some(rx => rx.test(path))) return out(403, JSON.stringify({ error: 'ROUTE_NOT_ALLOWED' }));

  const method = event.httpMethod || 'GET';
  if (!['GET', 'POST'].includes(method)) return out(405, JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }));

  let body = event.body || undefined;
  const headers = { 'accept': 'application/json', 'content-type': 'application/json' };

  if (path === '/api/chat' && method === 'POST') {
    let parsed;
    try { parsed = JSON.parse(event.body || '{}'); }
    catch { return out(400, JSON.stringify({ error: 'INVALID_BODY' })); }
    const clientId = String(parsed.client_id || 'browser').slice(0, 128);
    body = JSON.stringify({
      message: String(parsed.message || ''),
      session_id: sessionIdFor(session.email, clientId)
    });
  }

  if (/^\/api\/status$/.test(path)) {
    const clientId = String(event.queryStringParameters?.client_id || 'browser').slice(0, 128);
    const sid = sessionIdFor(session.email, clientId);
    return forward(`${backend}${path}?session_id=${encodeURIComponent(sid)}`, method, headers, body);
  }

  if (/^\/api\/mode\//.test(path) || /^\/api\/rag\//.test(path) || /^\/api\/agent\/provider\//.test(path)) {
    const clientId = String(event.queryStringParameters?.client_id || 'browser').slice(0, 128);
    const sid = sessionIdFor(session.email, clientId);
    return forward(`${backend}${path}?session_id=${encodeURIComponent(sid)}`, method, headers, body);
  }

  return forward(backend + path, method, headers, body);
};

async function forward(url, method, headers, body) {
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method === 'GET' ? undefined : body,
      signal: AbortSignal.timeout(30000)
    });
    const text = await response.text();
    const type = response.headers.get('content-type') || 'application/json; charset=utf-8';
    return out(response.status, text, type);
  } catch (error) {
    console.error('RAG proxy error', error.message);
    return out(502, JSON.stringify({ error: 'RAG_BACKEND_UNAVAILABLE' }));
  }
}
