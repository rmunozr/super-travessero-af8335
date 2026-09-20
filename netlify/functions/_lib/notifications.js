async function sendEmail(booking, contact) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_GMAIL_REFRESH_TOKEN, EMAIL_FROM } = process.env;
  if (!contact.email || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_GMAIL_REFRESH_TOKEN || !EMAIL_FROM) {
    return { sent: false, reason: 'not_configured' };
  }
  const { google } = require('googleapis');
  const oauth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: GOOGLE_GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: 'v1', auth: oauth });
  const spanish = contact.locale === 'es';
  const date = new Intl.DateTimeFormat(spanish ? 'es-CL' : 'en-US', {
    timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short'
  }).format(new Date(booking.start));
  const subject = spanish ? `Confirmación de cita ${booking.reference}` : `Appointment confirmation ${booking.reference}`;
  const message = [
    `From: Deep Finance Lab <${EMAIL_FROM}>`,
    `To: ${contact.email}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    `<p>${spanish ? 'Hola' : 'Hello'} ${escapeHtml(contact.name)},</p>`,
    `<p>${spanish ? 'Tu cita con Deep Finance Lab está confirmada.' : 'Your Deep Finance Lab appointment is confirmed.'}</p>`,
    `<p><strong>${spanish ? 'Profesional' : 'Professional'}:</strong> ${escapeHtml(booking.professional)}<br>`,
    `<strong>${spanish ? 'Fecha' : 'Date'}:</strong> ${escapeHtml(date)}<br>`,
    `<strong>${spanish ? 'Referencia' : 'Reference'}:</strong> ${escapeHtml(booking.reference)}</p>`,
    `<p>${spanish ? 'Guarda la referencia si necesitas cancelar tu cita.' : 'Keep the reference if you need to cancel your appointment.'}</p>`
  ].join('\r\n');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(message).toString('base64url') } });
  return { sent: true, provider: 'gmail' };
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

async function sendWhatsApp(booking, contact) {
  const {
    WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_API_VERSION = 'v23.0', WHATSAPP_TEMPLATE_NAME = 'appointment_confirmation',
    WHATSAPP_TEMPLATE_LANGUAGE = 'en_US', WHATSAPP_TEMPLATE_NAME_ES,
    WHATSAPP_TEMPLATE_LANGUAGE_ES = 'es', WHATSAPP_TEMPLATE_NAME_EN,
    WHATSAPP_TEMPLATE_LANGUAGE_EN = 'en_US'
  } = process.env;
  if (!contact.phone || !WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_API_VERSION) {
    return { sent: false, reason: 'not_configured' };
  }
  const to = contact.phone.replace(/[^0-9]/g, '');
  const spanish = contact.locale === 'es';
  const templateName = spanish ? (WHATSAPP_TEMPLATE_NAME_ES || WHATSAPP_TEMPLATE_NAME) : (WHATSAPP_TEMPLATE_NAME_EN || WHATSAPP_TEMPLATE_NAME);
  const templateLanguage = spanish ? WHATSAPP_TEMPLATE_LANGUAGE_ES : (WHATSAPP_TEMPLATE_NAME_EN ? WHATSAPP_TEMPLATE_LANGUAGE_EN : WHATSAPP_TEMPLATE_LANGUAGE);
  const response = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: contact.name },
            { type: 'text', text: booking.professional },
            { type: 'text', text: booking.start },
            { type: 'text', text: booking.reference }
          ]
        }]
      }
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`WHATSAPP_FAILED_${response.status}`);
  const result = await response.json();
  return { sent: true, provider: 'meta', messageId: result.messages?.[0]?.id };
}

async function sendReminderEmail(booking, contact) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_GMAIL_REFRESH_TOKEN, EMAIL_FROM } = process.env;
  if (!contact.email || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_GMAIL_REFRESH_TOKEN || !EMAIL_FROM) return { sent:false, reason:'not_configured' };
  const { google } = require('googleapis');
  const oauth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: GOOGLE_GMAIL_REFRESH_TOKEN });
  const spanish = contact.locale === 'es';
  const date = new Intl.DateTimeFormat(spanish ? 'es-CL' : 'en-US', { timeZone:'America/Santiago', dateStyle:'full', timeStyle:'short' }).format(new Date(booking.start));
  const message = [`From: Deep Finance Lab <${EMAIL_FROM}>`,`To: ${contact.email}`,`Subject: ${spanish?'Recordatorio de cita':'Appointment reminder'} ${booking.reference}`,'MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','',`<p>${spanish?'Hola':'Hello'} ${escapeHtml(contact.name)},</p>`,`<p>${spanish?'Te recordamos tu próxima cita con Deep Finance Lab.':'This is a reminder of your upcoming appointment with Deep Finance Lab.'}</p>`,`<p><strong>${spanish?'Fecha':'Date'}:</strong> ${escapeHtml(date)}<br><strong>${spanish?'Profesional':'Professional'}:</strong> ${escapeHtml(booking.professional)}<br><strong>${spanish?'Referencia':'Reference'}:</strong> ${escapeHtml(booking.reference)}</p>`].join('\r\n');
  const gmail = google.gmail({ version:'v1', auth:oauth });
  await gmail.users.messages.send({ userId:'me', requestBody:{ raw:Buffer.from(message).toString('base64url') } });
  return { sent:true, provider:'gmail' };
}

async function sendReminderWhatsApp(booking, contact) {
  const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION='v23.0', WHATSAPP_REMINDER_TEMPLATE_NAME_EN='appointment_reminder', WHATSAPP_REMINDER_TEMPLATE_LANGUAGE_EN='en_US', WHATSAPP_REMINDER_TEMPLATE_NAME_ES='appointment_reminder_es', WHATSAPP_REMINDER_TEMPLATE_LANGUAGE_ES='es' } = process.env;
  if (!contact.phone || !WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) return { sent:false, reason:'not_configured' };
  const spanish = contact.locale === 'es';
  const response = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, { method:'POST', headers:{ authorization:`Bearer ${WHATSAPP_ACCESS_TOKEN}`,'content-type':'application/json' }, body:JSON.stringify({ messaging_product:'whatsapp', to:contact.phone.replace(/\D/g,''), type:'template', template:{ name:spanish?WHATSAPP_REMINDER_TEMPLATE_NAME_ES:WHATSAPP_REMINDER_TEMPLATE_NAME_EN, language:{ code:spanish?WHATSAPP_REMINDER_TEMPLATE_LANGUAGE_ES:WHATSAPP_REMINDER_TEMPLATE_LANGUAGE_EN }, components:[{ type:'body', parameters:[{type:'text',text:contact.name},{type:'text',text:booking.professional},{type:'text',text:booking.start},{type:'text',text:booking.reference}] }] } }), signal:AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`WHATSAPP_FAILED_${response.status}`);
  const result = await response.json();
  return { sent:true, provider:'meta', messageId:result.messages?.[0]?.id };
}

module.exports = { sendEmail, sendWhatsApp, sendReminderEmail, sendReminderWhatsApp };
