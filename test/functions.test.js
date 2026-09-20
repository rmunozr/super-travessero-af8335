const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

process.env.DEMO_MODE = 'true';

const chatbot = require('../netlify/functions/chatbot').handler;
const whatsappModule = require('../netlify/functions/whatsapp');
const whatsapp = whatsappModule.handler;
const notifications = require('../netlify/functions/_lib/notifications');
const calendar = require('../netlify/functions/_lib/calendar');
const records = require('../netlify/functions/_lib/records');
const reminders = require('../netlify/functions/reminders').handler;

test('chatbot bootstrap returns the configured demo services', async () => {
  const result = await chatbot({
    httpMethod: 'POST',
    body: JSON.stringify({ action: 'bootstrap' })
  });

  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.demo, true);
  assert.equal(Object.keys(body.services).length, 3);
  assert.equal(body.professionals.length, 4);
});

test('chatbot rejects an unsupported action', async () => {
  const result = await chatbot({
    httpMethod: 'POST',
    body: JSON.stringify({ action: 'unsupported' })
  });

  assert.equal(result.statusCode, 400);
  assert.deepEqual(JSON.parse(result.body), { error: 'INVALID_ACTION' });
});

test('chatbot identifies, retrieves and securely cancels a booking', async () => {
  const call = async body => {
    const result = await chatbot({ httpMethod: 'POST', body: JSON.stringify(body) });
    return { status: result.statusCode, body: JSON.parse(result.body) };
  };
  const available = await call({ action: 'availability', professional: 'Professional 1', timeMin: new Date().toISOString(), timeMax: new Date(Date.now() + 21 * 86400000).toISOString() });
  const booked = await call({ action: 'book', service: 'Strategic Finance', professional: 'Professional 1', start: available.body.slots[0], name: 'Test Client', email: 'CLIENT@EXAMPLE.TEST', phone: '+56 9 1111 1111', locale: 'en' });
  assert.equal(booked.status, 201);
  assert.match(booked.body.reference, /^DFL-[A-F0-9]{32}$/);

  const found = await call({ action: 'bookings', email: 'client@example.test' });
  assert.equal(found.status, 200);
  assert.equal(found.body.bookings.some(item => item.reference === booked.body.reference), true);

  const denied = await call({ action: 'cancel', professional: 'Professional 1', reference: booked.body.reference, email: 'other@example.test' });
  assert.equal(denied.status, 400);
  assert.equal(denied.body.error, 'IDENTITY_MISMATCH');

  const cancelled = await call({ action: 'cancel', professional: 'Professional 1', reference: booked.body.reference, phone: '+56911111111' });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.cancelled, true);

  const after = await call({ action: 'bookings', email: 'client@example.test' });
  assert.equal(after.body.bookings.some(item => item.reference === booked.body.reference), false);
});

test('WhatsApp verification fails closed when the token is missing', async () => {
  delete process.env.WHATSAPP_VERIFY_TOKEN;
  const result = await whatsapp({ httpMethod: 'GET', queryStringParameters: {} });
  assert.equal(result.statusCode, 503);
});

test('WhatsApp verification returns the Meta challenge', async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'local-test-token';
  const result = await whatsapp({
    httpMethod: 'GET',
    queryStringParameters: {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'local-test-token',
      'hub.challenge': '12345'
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body, '12345');
});

test('WhatsApp accepts a correctly signed Base64 payload', async () => {
  process.env.WHATSAPP_APP_SECRET = 'local-test-secret';
  const raw = Buffer.from(JSON.stringify({ entry: [] }));
  const signature = `sha256=${crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(raw).digest('hex')}`;
  const result = await whatsapp({
    httpMethod: 'POST',
    headers: { 'x-hub-signature-256': signature },
    body: raw.toString('base64'),
    isBase64Encoded: true
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body, 'EVENT_RECEIVED');
});

test('WhatsApp rejects an invalid signature', async () => {
  process.env.WHATSAPP_APP_SECRET = 'local-test-secret';
  const result = await whatsapp({
    httpMethod: 'POST',
    headers: { 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` },
    body: JSON.stringify({ entry: [] })
  });

  assert.equal(result.statusCode, 401);
});

test('WhatsApp menus are bilingual', () => {
  assert.match(whatsappModule._test.menu({ locale: 'es' }), /Reservar una reunión/);
  assert.match(whatsappModule._test.menu({ locale: 'en' }), /Book a meeting/);
});

test('WhatsApp session keys do not expose phone numbers', () => {
  process.env.WHATSAPP_APP_SECRET = 'local-test-secret';
  const key = whatsappModule._test.sessionKey('56911111111');
  assert.match(key, /^session-[a-f0-9]{64}$/);
  assert.doesNotMatch(key, /56911111111/);
});

test('calendar availability starts on a complete hour', () => {
  const result = calendar._test.alignToNextHour('2026-09-10T13:27:45.000Z');
  assert.equal(result.toISOString(), '2026-09-10T14:00:00.000Z');
  const secondsOnly = calendar._test.alignToNextHour('2026-09-10T13:00:45.000Z');
  assert.equal(secondsOnly.toISOString(), '2026-09-10T14:00:00.000Z');
});

test('booking records schedule email and WhatsApp reminders', () => {
  const rows = records._test.reminderRows({ reference:`DFL-${'C'.repeat(32)}`, start:new Date(Date.now() + 30 * 3600000).toISOString() }, { email:'client@example.test', phone:'+56911111111', locale:'en' });
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map(item => item.reminder_id)).size, 4);
  assert.equal(rows.every(item => item.status === 'pending'), true);
});

test('reminder processor records a failed attempt when a channel is not configured', async () => {
  const reference = `DFL-${'D'.repeat(32)}`, clientId = 'demo-client', reminderId = `${reference}:email:test`;
  records._test.demo.clients.set(clientId, { client_id:clientId, name:'Test Client', email:'client@example.test', locale:'en' });
  records._test.demo.appointments.set(reference, { reference, client_id:clientId, professional:'Professional 1', start:new Date(Date.now() + 3600000).toISOString(), status:'confirmed' });
  records._test.demo.reminders.set(reminderId, { reminder_id:reminderId, reference, channel:'email', scheduled_at:new Date(Date.now() - 1000).toISOString(), status:'pending', attempts:'0', locale:'en' });
  const result = await reminders();
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).failed, 1);
  assert.equal(records._test.demo.reminders.get(reminderId).status, 'failed');
  await reminders();
  assert.equal(records._test.demo.reminders.get(reminderId).attempts, '2');
});

test('WhatsApp sends text through the configured Meta endpoint', async () => {
  const originalFetch = global.fetch;
  process.env.WHATSAPP_ACCESS_TOKEN = 'local-placeholder-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
  process.env.WHATSAPP_API_VERSION = 'v23.0';
  let request;

  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200 };
  };

  try {
    await whatsappModule._test.sendText('56911111111', 'Mensaje de prueba');
  } finally {
    global.fetch = originalFetch;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_API_VERSION;
  }

  assert.equal(request.url, 'https://graph.facebook.com/v23.0/123456789/messages');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.authorization, 'Bearer local-placeholder-token');
  assert.deepEqual(JSON.parse(request.options.body), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '56911111111',
    type: 'text',
    text: { preview_url: false, body: 'Mensaje de prueba' }
  });
});

test('WhatsApp selects the Spanish confirmation template', async () => {
  const originalFetch = global.fetch;
  process.env.WHATSAPP_ACCESS_TOKEN = 'local-placeholder-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
  process.env.WHATSAPP_API_VERSION = 'v23.0';
  process.env.WHATSAPP_TEMPLATE_NAME_ES = 'appointment_confirmation_es';
  process.env.WHATSAPP_TEMPLATE_LANGUAGE_ES = 'es';
  let request;

  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.local' }] }) };
  };

  try {
    const result = await notifications.sendWhatsApp({
      reference: `DFL-${'B'.repeat(32)}`,
      professional: 'Professional 1',
      start: '2026-09-10T13:00:00.000Z'
    }, {
      name: 'Persona de prueba',
      phone: '+56911111111',
      locale: 'es'
    });
    assert.equal(result.sent, true);
  } finally {
    global.fetch = originalFetch;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_API_VERSION;
    delete process.env.WHATSAPP_TEMPLATE_NAME_ES;
    delete process.env.WHATSAPP_TEMPLATE_LANGUAGE_ES;
  }

  const body = JSON.parse(request.options.body);
  assert.equal(body.template.name, 'appointment_confirmation_es');
  assert.equal(body.template.language.code, 'es');
});
