function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': 'https://deepfinancelab.com',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

function parseBody(event) {
  if (!event.body || event.body.length > 12000) throw new Error('INVALID_BODY');
  return JSON.parse(event.body);
}

module.exports = { response, parseBody };
