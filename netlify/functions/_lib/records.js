const crypto = require('node:crypto');
const { DEMO_MODE } = require('./config');

const TABS = {
  clients: 'Clients', appointments: 'Appointments', reminders: 'Reminders', audit: 'Audit'
};
const HEADERS = {
  clients: ['client_id','name','email','phone','locale','email_consent','whatsapp_consent','created_at','updated_at'],
  appointments: ['reference','client_id','service','professional','start','end','status','google_event_id','created_at','updated_at'],
  reminders: ['reminder_id','reference','channel','scheduled_at','status','attempts','last_error','sent_at','created_at','locale'],
  audit: ['event_id','action','reference','client_id','timestamp','metadata']
};
const demo = { clients: new Map(), appointments: new Map(), reminders: new Map(), audit: [] };

const email = value => String(value || '').trim().toLowerCase();
const phone = value => String(value || '').replace(/\D/g, '');
const nowIso = () => new Date().toISOString();
const reminderId = (reference, channel, offset) => `${reference}:${channel}:${offset}`;

function clientId(contact) {
  const key = process.env.DATA_HASH_SECRET || (DEMO_MODE ? 'local-demo-only' : '');
  if (!key) throw new Error('DATA_STORE_NOT_CONFIGURED');
  const identity = email(contact.email) || phone(contact.phone);
  if (!identity) throw new Error('IDENTITY_REQUIRED');
  return crypto.createHmac('sha256', key).update(identity).digest('hex');
}

function sheetsClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_SHEETS_REFRESH_TOKEN, GOOGLE_CALENDAR_REFRESH_TOKEN, GOOGLE_SHEETS_SPREADSHEET_ID } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !(GOOGLE_SHEETS_REFRESH_TOKEN || GOOGLE_CALENDAR_REFRESH_TOKEN) || !GOOGLE_SHEETS_SPREADSHEET_ID) throw new Error('DATA_STORE_NOT_CONFIGURED');
  const { google } = require('googleapis');
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GOOGLE_SHEETS_REFRESH_TOKEN || GOOGLE_CALENDAR_REFRESH_TOKEN });
  return { api: google.sheets({ version: 'v4', auth }), spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID };
}

const toObject = (headers, row) => Object.fromEntries(headers.map((key, index) => [key, row[index] ?? '']));
const toRow = (headers, object) => headers.map(key => object[key] ?? '');

async function readTable(name) {
  const { api, spreadsheetId } = sheetsClient();
  const { data } = await api.spreadsheets.values.get({ spreadsheetId, range: `${TABS[name]}!A:Z` });
  const rows = data.values || [];
  if (!rows.length) return [];
  return rows.slice(1).map((row, index) => ({ ...toObject(HEADERS[name], row), _row: index + 2 }));
}

async function append(name, object) {
  const { api, spreadsheetId } = sheetsClient();
  await api.spreadsheets.values.append({ spreadsheetId, range: `${TABS[name]}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [toRow(HEADERS[name], object)] } });
}

async function update(name, row, object) {
  const { api, spreadsheetId } = sheetsClient();
  const end = String.fromCharCode(64 + HEADERS[name].length);
  await api.spreadsheets.values.update({ spreadsheetId, range: `${TABS[name]}!A${row}:${end}${row}`, valueInputOption: 'RAW', requestBody: { values: [toRow(HEADERS[name], object)] } });
}

function reminderRows(booking, contact) {
  const start = new Date(booking.start).getTime(), createdAt = nowIso(), rows = [];
  for (const hours of [24, 2]) for (const channel of ['email','whatsapp']) {
    if (channel === 'email' && !contact.email) continue;
    if (channel === 'whatsapp' && !contact.phone) continue;
    const scheduled = new Date(start - hours * 3600000);
    if (scheduled <= new Date()) continue;
    rows.push({ reminder_id: reminderId(booking.reference, channel, `${hours}h`), reference: booking.reference, channel, scheduled_at: scheduled.toISOString(), status: 'pending', attempts: '0', last_error: '', sent_at: '', created_at: createdAt, locale: contact.locale || 'en' });
  }
  return rows;
}

async function recordBooking(booking, contact) {
  const id = clientId(contact), timestamp = nowIso();
  const client = { client_id:id, name:contact.name || '', email:email(contact.email), phone:phone(contact.phone), locale:contact.locale || 'en', email_consent:String(Boolean(contact.email)), whatsapp_consent:String(Boolean(contact.phone)), created_at:timestamp, updated_at:timestamp };
  const appointment = { reference:booking.reference, client_id:id, service:contact.service || '', professional:contact.professional || booking.professional || '', start:booking.start, end:booking.end, status:'confirmed', google_event_id:booking.eventId || '', created_at:timestamp, updated_at:timestamp };
  const reminders = reminderRows(booking, contact);
  if (DEMO_MODE) {
    demo.clients.set(id, client); demo.appointments.set(booking.reference, appointment);
    reminders.forEach(item => demo.reminders.set(item.reminder_id, item));
    demo.audit.push({ action:'booked', reference:booking.reference, client_id:id, timestamp });
    return { clientId:id, reminders:reminders.length, demo:true };
  }
  const [clients, appointments, existingReminders] = await Promise.all([readTable('clients'), readTable('appointments'), readTable('reminders')]);
  const existingClient = clients.find(item => item.client_id === id);
  if (existingClient) await update('clients', existingClient._row, { ...existingClient, ...client, created_at:existingClient.created_at || timestamp });
  else await append('clients', client);
  if (!appointments.some(item => item.reference === booking.reference)) await append('appointments', appointment);
  for (const item of reminders) if (!existingReminders.some(existing => existing.reminder_id === item.reminder_id)) await append('reminders', item);
  await append('audit', { event_id:crypto.randomUUID(), action:'booked', reference:booking.reference, client_id:id, timestamp, metadata:'{}' });
  return { clientId:id, reminders:reminders.length, demo:false };
}

async function markCancelled(reference) {
  const timestamp = nowIso();
  if (DEMO_MODE) {
    const item = demo.appointments.get(reference); if (item) demo.appointments.set(reference, { ...item, status:'cancelled', updated_at:timestamp });
    for (const [id, reminder] of demo.reminders) if (reminder.reference === reference && reminder.status === 'pending') demo.reminders.set(id, { ...reminder, status:'cancelled' });
    return;
  }
  const [appointments, reminders] = await Promise.all([readTable('appointments'), readTable('reminders')]);
  const appointment = appointments.find(item => item.reference === reference);
  if (appointment) await update('appointments', appointment._row, { ...appointment, status:'cancelled', updated_at:timestamp });
  for (const reminder of reminders.filter(item => item.reference === reference && item.status === 'pending')) await update('reminders', reminder._row, { ...reminder, status:'cancelled' });
}

async function dueReminders(at = new Date(), limit = 50) {
  const rows = DEMO_MODE ? [...demo.reminders.values()] : await readTable('reminders');
  return rows.filter(item => ['pending','failed'].includes(item.status) && Number(item.attempts || 0) < 3 && new Date(item.scheduled_at) <= at).slice(0, limit);
}

async function reminderContext(reference) {
  if (DEMO_MODE) {
    const appointment = demo.appointments.get(reference); if (!appointment) return null;
    return { appointment, client:demo.clients.get(appointment.client_id) };
  }
  const [appointments, clients] = await Promise.all([readTable('appointments'), readTable('clients')]);
  const appointment = appointments.find(item => item.reference === reference);
  return appointment ? { appointment, client:clients.find(item => item.client_id === appointment.client_id) } : null;
}

async function markReminder(reminder, status, error = '') {
  const changed = { ...reminder, status, attempts:String(Number(reminder.attempts || 0) + 1), last_error:String(error).slice(0, 240), sent_at:status === 'sent' ? nowIso() : reminder.sent_at || '' };
  if (DEMO_MODE) demo.reminders.set(reminder.reminder_id, changed); else await update('reminders', reminder._row, changed);
}

module.exports = { HEADERS, TABS, clientId, recordBooking, markCancelled, dueReminders, reminderContext, markReminder, _test:{ demo, reminderRows, toObject, toRow } };
