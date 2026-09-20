const crypto = require('node:crypto');
const { CALENDARS, TIMEZONE, OPEN_HOUR, CLOSE_HOUR, SLOT_MINUTES, DEMO_MODE } = require('./config');
const demoBookings = new Map();

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const normalizePhone = value => String(value || '').replace(/[^\d+]/g, '');

function contactIdentity(contact = {}) {
  return { email: normalizeEmail(contact.email), phone: normalizePhone(contact.phone) };
}

function identityMatches(stored, supplied) {
  const a = contactIdentity(stored), b = contactIdentity(supplied);
  return Boolean((b.email && a.email === b.email) || (b.phone && a.phone === b.phone));
}

function calendarId(professional) {
  const id = CALENDARS[professional];
  if (!id) throw new Error('CALENDAR_NOT_CONFIGURED');
  return id;
}

function client() {
  if (DEMO_MODE) return null;
  const { google } = require('googleapis');
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALENDAR_REFRESH_TOKEN) {
    throw new Error('CALENDAR_NOT_CONFIGURED');
  }
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GOOGLE_CALENDAR_REFRESH_TOKEN });
  return google.calendar({ version: 'v3', auth });
}

function validSlot(start) {
  const date = new Date(start);
  if (Number.isNaN(date.getTime()) || date <= new Date()) return false;
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, weekday: 'short', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).reduce((a, x) => ({ ...a, [x.type]: x.value }), {});
  const hour = Number(local.hour);
  return !['Sat', 'Sun'].includes(local.weekday) && hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}

function demoSlots() {
  const result = [];
  const cursor = new Date();
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  cursor.setUTCHours(13, 0, 0, 0);
  while (result.length < 9) {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'short' }).format(cursor);
    if (!['Sat', 'Sun'].includes(weekday)) {
      [13, 16, 20].forEach(hour => {
        const slot = new Date(cursor);
        slot.setUTCHours(hour, 0, 0, 0);
        result.push(slot.toISOString());
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result.slice(0, 9);
}

function alignToNextHour(value) {
  const result = new Date(value);
  const needsRounding = result.getUTCMinutes() !== 0 || result.getUTCSeconds() !== 0 || result.getUTCMilliseconds() !== 0;
  if (needsRounding) result.setUTCHours(result.getUTCHours() + 1, 0, 0, 0);
  else result.setUTCSeconds(0, 0);
  return result;
}

async function availability(professional, timeMin, timeMax) {
  if (DEMO_MODE) return demoSlots().filter(start => ![...demoBookings.values()].some(item => item.professional === professional && item.start === start));
  const id = calendarId(professional);
  const api = client();
  const { data } = await api.freebusy.query({ requestBody: { timeMin, timeMax, timeZone: TIMEZONE, items: [{ id }] } });
  const busy = data.calendars[id].busy || [];
  const slots = [];
  const firstSlot = alignToNextHour(timeMin);
  for (let cursor = firstSlot; cursor < new Date(timeMax); cursor = new Date(cursor.getTime() + SLOT_MINUTES * 60000)) {
    const end = new Date(cursor.getTime() + SLOT_MINUTES * 60000);
    if (validSlot(cursor.toISOString()) && !busy.some(x => cursor < new Date(x.end) && end > new Date(x.start))) slots.push(cursor.toISOString());
  }
  return slots.slice(0, 15);
}

function reference() {
  return `DFL-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
}

async function book(data) {
  if (!validSlot(data.start)) throw new Error('INVALID_SLOT');
  const ref = reference();
  const end = new Date(new Date(data.start).getTime() + SLOT_MINUTES * 60000).toISOString();
  if (DEMO_MODE) {
    if ([...demoBookings.values()].some(item => item.professional === data.professional && item.start === data.start)) throw new Error('SLOT_UNAVAILABLE');
    demoBookings.set(ref, { ...data, reference: ref, eventId: `demo-${ref}`, end });
    return { reference: ref, eventId: `demo-${ref}`, start: data.start, end, demo: true };
  }
  const api = client();
  const id = calendarId(data.professional);
  const open = await availability(data.professional, data.start, end);
  if (!open.includes(data.start)) throw new Error('SLOT_UNAVAILABLE');
  const { data: event } = await api.events.insert({
    calendarId: id,
    sendUpdates: 'none',
    requestBody: {
      summary: `${data.service} — ${data.name}`,
      description: `Deep Finance Lab booking\nReference: ${ref}\nEmail: ${data.email || '-'}\nWhatsApp: ${data.phone || '-'}`,
      start: { dateTime: data.start, timeZone: TIMEZONE },
      end: { dateTime: end, timeZone: TIMEZONE },
      extendedProperties: { private: Object.fromEntries(Object.entries({
        dflReference: ref, dflEmail: normalizeEmail(data.email), dflPhone: normalizePhone(data.phone)
      }).filter(([, value]) => value)) }
    }
  });
  return { reference: ref, eventId: event.id, start: data.start, end, demo: false };
}

function eventContact(event) {
  const privateData = event.extendedProperties?.private || {};
  const description = event.description || '';
  const line = label => description.match(new RegExp(`^${label}:\\s*(.+)$`, 'mi'))?.[1]?.trim() || '';
  return { email: privateData.dflEmail || line('Email'), phone: privateData.dflPhone || line('WhatsApp') };
}

async function findBookings(contact) {
  const identity = contactIdentity(contact);
  if (!identity.email && !identity.phone) throw new Error('IDENTITY_REQUIRED');
  if (DEMO_MODE) return [...demoBookings.values()].filter(item => identityMatches(item, identity)).map(item => ({
    reference: item.reference, professional: item.professional, service: item.service, start: item.start, end: item.end, demo: true
  }));
  const api = client();
  const results = [];
  for (const [professional, id] of Object.entries(CALENDARS)) {
    if (!id) continue;
    const { data } = await api.events.list({ calendarId: id, timeMin: new Date().toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 50 });
    for (const event of data.items || []) {
      const ref = event.extendedProperties?.private?.dflReference;
      if (!ref || !identityMatches(eventContact(event), identity)) continue;
      results.push({ reference: ref, professional, service: event.summary || '', start: event.start?.dateTime, end: event.end?.dateTime, demo: false });
    }
  }
  return results.sort((a, b) => new Date(a.start) - new Date(b.start));
}

async function cancel(professional, referenceCode, contact) {
  if (DEMO_MODE) {
    const event = demoBookings.get(referenceCode);
    if (!event || event.professional !== professional) throw new Error('BOOKING_NOT_FOUND');
    if (!identityMatches(event, contact)) throw new Error('IDENTITY_MISMATCH');
    demoBookings.delete(referenceCode);
    return { reference: referenceCode, cancelled: true, demo: true };
  }
  const api = client();
  const id = calendarId(professional);
  const { data } = await api.events.list({ calendarId: id, privateExtendedProperty: `dflReference=${referenceCode}`, maxResults: 1, singleEvents: true });
  const event = data.items?.[0];
  if (!event) throw new Error('BOOKING_NOT_FOUND');
  if (!identityMatches(eventContact(event), contact)) throw new Error('IDENTITY_MISMATCH');
  await api.events.delete({ calendarId: id, eventId: event.id, sendUpdates: 'none' });
  return { reference: referenceCode, cancelled: true, demo: false };
}

module.exports = { availability, book, cancel, findBookings, _test: { alignToNextHour, validSlot, contactIdentity, identityMatches, demoBookings } };
