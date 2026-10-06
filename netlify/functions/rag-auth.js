const { sessionFromEvent, createToken, cookieFor, clearCookie, parseAllowedUsers, verifyPassword } = require('./_lib/rag-auth');

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async event => {
  const method = event.httpMethod || 'GET';
  if (method === 'GET') {
    const session = sessionFromEvent(event);
    return json(session ? 200 : 401, {
      authenticated: Boolean(session),
      email: session?.email || null,
      allowedUsersConfigured: parseAllowedUsers().size > 0
    });
  }

  if (method === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return json(400, { error: 'INVALID_BODY' }); }

    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const allowed = parseAllowedUsers();

    if (!email || !password || !allowed.has(email) || !verifyPassword(password)) {
      return json(401, { error: 'INVALID_CREDENTIALS' });
    }

    const token = createToken(email);
    return json(200, { authenticated: true, email }, { 'set-cookie': cookieFor(token) });
  }

  if (method === 'DELETE') {
    return json(200, { authenticated: false }, { 'set-cookie': clearCookie() });
  }

  return json(405, { error: 'METHOD_NOT_ALLOWED' });
};
