const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');
const { SERVICES, CALENDARS } = require('./_lib/config');
const { availability, book, cancel, findBookings } = require('./_lib/calendar');
const { sendEmail } = require('./_lib/notifications');
const { answerQuestion } = require('./_lib/ai');
const { recordBooking, markCancelled } = require('./_lib/records');

const store = () => getStore('whatsapp-sessions');
const professionals = Object.keys(CALENDARS);
const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
const PROCESSING_TTL_MS = 60 * 1000;
const WHATSAPP_TIMEOUT_MS = 8000;

function bodyBuffer(event) {
  return event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : Buffer.from(event.body || '', 'utf8');
}

function sessionKey(from) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) throw new Error('WHATSAPP_NOT_CONFIGURED');
  return `session-${crypto.createHmac('sha256', secret).update(from).digest('hex')}`;
}

function verifySignature(event) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return false;
  const headers = event.headers || {};
  const received = headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'];
  if (!received) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(bodyBuffer(event)).digest('hex')}`;
  return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

async function sendText(to, body) {
  const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION = 'v23.0' } = process.env;
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) throw new Error('WHATSAPP_NOT_CONFIGURED');
  const response = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST', headers: { authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body } }),
    signal: AbortSignal.timeout(WHATSAPP_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`WHATSAPP_SEND_FAILED_${response.status}`);
}

const tr = (state, es, en) => state.locale === 'en' ? en : es;
const menu = state => tr(state,
  '¿Cómo puedo ayudarte?\n1. Reservar una reunión\n2. Ver mis reservas\n3. Cancelar una reserva\n4. Hacer una consulta\n\nEscribe English para cambiar el idioma.',
  'How can I help?\n1. Book a meeting\n2. View my bookings\n3. Cancel a booking\n4. Ask a question\n\nType Español to change language.');
const parseChoice = (text, choices) => {
  const index = Number(text.trim()) - 1;
  if (Number.isInteger(index) && choices[index]) return choices[index];
  return choices.find(value => value.toLowerCase() === text.trim().toLowerCase());
};
const formatSlot = (iso, locale) => new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-CL', {
  timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
}).format(new Date(iso));

async function route(from, incoming) {
  const sessions = store();
  const key = sessionKey(from);
  let state = await sessions.get(key, { type: 'json' }) || { step: 'menu', locale: 'es', booking: {}, updatedAt: Date.now() };
  if (Date.now() - (state.updatedAt || 0) > 86400000) state = { step: 'menu', locale: state.locale || 'es', booking: {} };
  const text = incoming.trim();
  if (/^(english|ingl[eé]s)$/i.test(text)) { state = { step: 'menu', locale: 'en', booking: {} }; await sessions.setJSON(key, state); return menu(state); }
  if (/^(espa[nñ]ol|spanish)$/i.test(text)) { state = { step: 'menu', locale: 'es', booking: {} }; await sessions.setJSON(key, state); return menu(state); }
  if (/^(menu|menú|inicio|start|hola|hello)$/i.test(text)) state = { step: 'menu', locale: state.locale || 'es', booking: {} };

  let reply;
  if (state.step === 'menu') {
    const choice = parseChoice(text, ['1','2','3','4']);
    if (choice === '1') { state.step = 'service'; reply = tr(state, 'Elige un servicio:\n1. Finanzas estratégicas\n2. Analítica cuantitativa\n3. Asesoría en IA', 'Choose a service:\n1. Strategic Finance\n2. Quantitative Analytics\n3. AI Advisory'); }
    else if (choice === '2') {
      try {
        const bookings = await findBookings({ phone: `+${from}` });
        reply = bookings.length ? bookings.map(item => `${formatSlot(item.start,state.locale)} — ${item.professional} — ${item.reference}`).join('\n') : tr(state, 'No encontramos reservas activas asociadas a este WhatsApp.', 'No active bookings were found for this WhatsApp number.');
      } catch (error) {
        console.error('WhatsApp booking lookup error', error.message);
        reply = tr(state, 'No se pudieron consultar tus reservas.', 'Your bookings could not be retrieved.');
      }
    }
    else if (choice === '3') { state.step = 'cancel-professional'; reply = tr(state, 'Elige el profesional: 1, 2, 3 o 4.', 'Choose professional 1, 2, 3 or 4.'); }
    else if (choice === '4') { state.step = 'question'; reply = tr(state, 'Escribe tu consulta.', 'Type your question.'); }
    else reply = menu(state);
  } else if (state.step === 'service') {
    const keys = Object.keys(SERVICES), selected = keys[Number(text) - 1];
    if (!selected) reply = tr(state, 'Responde 1, 2 o 3.', 'Reply 1, 2 or 3.');
    else { state.booking.service = selected; state.allowed = SERVICES[selected]; state.step = 'professional'; reply = `${tr(state,'Elige un profesional','Choose a professional')}:\n${state.allowed.map((p,i)=>`${i+1}. ${p}`).join('\n')}`; }
  } else if (state.step === 'professional') {
    const selected = state.allowed?.[Number(text) - 1];
    if (!selected) reply = tr(state, 'Selecciona una opción válida.', 'Choose a valid option.');
    else {
      state.booking.professional = selected;
      try {
        const slots = await availability(selected, new Date().toISOString(), new Date(Date.now()+21*86400000).toISOString());
        state.slots = slots.slice(0, 8); state.step = 'slot';
        reply = state.slots.length ? `${tr(state,'Horas disponibles','Available times')}:\n${state.slots.map((s,i)=>`${i+1}. ${formatSlot(s,state.locale)}`).join('\n')}` : tr(state,'No hay horas disponibles. Escribe menú para volver.','No times are available. Type menu to return.');
      } catch (error) {
        console.error('WhatsApp availability error', error.message);
        state = { step: 'menu', locale: state.locale, booking: {} };
        reply = tr(state, 'El calendario no está disponible en este momento. Inténtalo nuevamente más tarde.', 'The calendar is temporarily unavailable. Please try again later.');
      }
    }
  } else if (state.step === 'slot') {
    const selected = state.slots?.[Number(text) - 1];
    if (!selected) reply = tr(state, 'Selecciona un número válido.', 'Choose a valid number.');
    else { state.booking.start = selected; state.step = 'name'; reply = tr(state, 'Escribe tu nombre completo.', 'Type your full name.'); }
  } else if (state.step === 'name') { state.booking.name = text.slice(0,160); state.step = 'email'; reply = tr(state, 'Escribe tu correo electrónico.', 'Type your email address.');
  } else if (state.step === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) reply = tr(state,'Escribe un correo válido.','Type a valid email address.');
    else { state.booking.email = text; state.step = 'confirm'; reply = tr(state, `Responde CONFIRMAR para reservar ${formatSlot(state.booking.start,state.locale)}.`, `Reply CONFIRM to book ${formatSlot(state.booking.start,state.locale)}.`); }
  } else if (state.step === 'confirm') {
    if (!/^(confirmar|confirm)$/i.test(text)) reply = tr(state,'Escribe CONFIRMAR o menú.','Type CONFIRM or menu.');
    else {
      const contact = { ...state.booking, locale: state.locale, phone: `+${from}` };
      try {
        const result = await book(contact);
        try { await recordBooking(result, contact); }
        catch (error) {
          await cancel(contact.professional, result.reference, contact).catch(() => {});
          throw error;
        }
        await sendEmail({ ...result, professional: state.booking.professional }, contact).catch(error => console.error('WhatsApp confirmation email error', error.message));
        reply = tr(state, `Cita confirmada. Referencia: ${result.reference}`, `Appointment confirmed. Reference: ${result.reference}`);
      } catch (error) {
        console.error('WhatsApp booking error', error.message);
        reply = error.message === 'SLOT_UNAVAILABLE'
          ? tr(state, 'Esa hora acaba de ser ocupada. Inicia nuevamente la reserva.', 'That time was just taken. Please start the booking again.')
          : tr(state, 'No se pudo completar la reserva. Inténtalo nuevamente más tarde.', 'The booking could not be completed. Please try again later.');
      }
      state = { step:'menu', locale:state.locale, booking:{} };
    }
  } else if (state.step === 'cancel-professional') {
    const selected = professionals[Number(text)-1]; if (!selected) reply=tr(state,'Elige 1, 2, 3 o 4.','Choose 1, 2, 3 or 4.'); else { state.booking.professional=selected; state.step='cancel-reference'; reply=tr(state,'Escribe la referencia de la reserva.','Type the booking reference.'); }
  } else if (state.step === 'cancel-reference') {
    const ref=text.toUpperCase(); if(!/^DFL-[A-F0-9]{32}$/.test(ref)) reply=tr(state,'La referencia no es válida.','The reference is not valid.'); else { state.booking.reference=ref; state.step='cancel-confirm'; reply=tr(state,'Escribe CANCELAR para confirmar.','Type CANCEL to confirm.'); }
  } else if (state.step === 'cancel-confirm') {
    if(!/^(cancelar|cancel)$/i.test(text)) reply=tr(state,'Escribe CANCELAR o menú.','Type CANCEL or menu.'); else {
      try {
        const result=await cancel(state.booking.professional,state.booking.reference,{ phone:`+${from}` });
        await markCancelled(result.reference).catch(error => console.error('WhatsApp booking record cancellation error', error.message));
        reply=tr(state,`Cita cancelada. Referencia: ${result.reference}`,`Appointment cancelled. Reference: ${result.reference}`);
      } catch (error) {
        console.error('WhatsApp cancellation error', error.message);
        reply = error.message === 'IDENTITY_MISMATCH'
          ? tr(state, 'Esta reserva no pertenece a este número de WhatsApp.', 'This booking does not belong to this WhatsApp number.')
          : error.message === 'BOOKING_NOT_FOUND'
          ? tr(state, 'No encontramos una reserva con esa referencia.', 'No booking was found with that reference.')
          : tr(state, 'No se pudo completar la cancelación. Inténtalo nuevamente más tarde.', 'The cancellation could not be completed. Please try again later.');
      }
      state={step:'menu',locale:state.locale,booking:{}};
    }
  } else if (state.step === 'question') {
    try {
      const result=await answerQuestion(text.slice(0,800));
      reply=result.text;
    } catch (error) {
      console.error('WhatsApp AI error', error.message);
      reply=tr(state, 'No pude responder ahora. Inténtalo nuevamente más tarde.', 'I could not answer right now. Please try again later.');
    }
    state={step:'menu',locale:state.locale,booking:{}};
  }
  state.updatedAt = Date.now(); await sessions.setJSON(key, state); return `${reply}\n\n${state.step==='menu'?'':tr(state,'Escribe menú para volver al inicio.','Type menu to return to the start.')}`.trim();
}

exports.handler = async event => {
  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!verifyToken) return { statusCode: 503, body: 'Webhook not configured' };
    return q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === verifyToken
      ? { statusCode: 200, body: q['hub.challenge'] || '' } : { statusCode: 403, body: 'Forbidden' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  if (!verifySignature(event)) return { statusCode: 401, body: 'Invalid signature' };
  try {
    const payload = JSON.parse(bodyBuffer(event).toString('utf8') || '{}');
    const messages = payload.entry?.flatMap(e => e.changes || []).flatMap(c => c.value?.messages || []) || [];
    for (const message of messages) {
      if (message.type !== 'text' || !message.id || !message.from || !message.text?.body) continue;
      const dedupe = store(); const id = `message-${message.id}`;
      const previous = await dedupe.get(id, { type: 'json' });
      if (previous?.expiresAt > Date.now() && previous.status === 'sent') continue;
      if (previous?.expiresAt > Date.now() && previous.status === 'processing') continue;
      if (previous?.expiresAt > Date.now() && previous.status === 'ready' && previous.reply) {
        await sendText(message.from, previous.reply);
        await dedupe.setJSON(id, { status: 'sent', expiresAt: Date.now() + MESSAGE_TTL_MS });
        continue;
      }
      await dedupe.setJSON(id, { status: 'processing', expiresAt: Date.now() + PROCESSING_TTL_MS });
      const reply = await route(message.from, message.text.body);
      await dedupe.setJSON(id, { status: 'ready', reply, expiresAt: Date.now() + MESSAGE_TTL_MS });
      await sendText(message.from, reply);
      await dedupe.setJSON(id, { status: 'sent', expiresAt: Date.now() + MESSAGE_TTL_MS });
    }
    return { statusCode: 200, body: 'EVENT_RECEIVED' };
  } catch (error) {
    console.error('WhatsApp webhook error', error.message);
    return { statusCode: 500, body: 'RETRY_EVENT' };
  }
};

exports._test = { bodyBuffer, menu, sendText, sessionKey, verifySignature };
