const { response, parseBody } = require('./_lib/http');
const { SERVICES, CALENDARS, DEMO_MODE } = require('./_lib/config');
const { availability, book, cancel, findBookings } = require('./_lib/calendar');
const { sendEmail, sendWhatsApp } = require('./_lib/notifications');
const { answerQuestion } = require('./_lib/ai');
const { recordBooking, markCancelled } = require('./_lib/records');

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function validateProfessional(value) {
  if (!Object.prototype.hasOwnProperty.call(CALENDARS, value)) throw new Error('INVALID_PROFESSIONAL');
  return value;
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return response(204, {});
  if (event.httpMethod !== 'POST') return response(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const body = parseBody(event);
    const action = clean(body.action, 40);

    if (action === 'bootstrap') return response(200, { demo: DEMO_MODE, services: SERVICES, professionals: Object.keys(CALENDARS) });

    if (action === 'availability') {
      const professional = validateProfessional(clean(body.professional));
      const timeMin = clean(body.timeMin, 40);
      const timeMax = clean(body.timeMax, 40);
      return response(200, { slots: await availability(professional, timeMin, timeMax), demo: DEMO_MODE });
    }

    if (action === 'ask') {
      const question = clean(body.question, 800);
      if (question.length < 2) throw new Error('INVALID_QUESTION');
      return response(200, await answerQuestion(question));
    }

    if (action === 'book') {
      const data = {
        service: clean(body.service), professional: validateProfessional(clean(body.professional)),
        start: clean(body.start, 40), name: clean(body.name), email: clean(body.email), phone: clean(body.phone, 30),
        locale: clean(body.locale, 5) === 'es' ? 'es' : 'en'
      };
      if (!data.name || (!data.email && !data.phone) || !SERVICES[data.service]?.includes(data.professional)) throw new Error('INVALID_BOOKING');
      const booking = await book(data);
      try { await recordBooking(booking, data); }
      catch (error) {
        await cancel(data.professional, booking.reference, data).catch(() => {});
        throw error;
      }
      const notificationPayload = { ...booking, professional: data.professional };
      const [email, whatsapp] = await Promise.allSettled([sendEmail(notificationPayload, data), sendWhatsApp(notificationPayload, data)]);
      return response(201, { ...booking, notifications: { email: email.status === 'fulfilled' ? email.value : { sent: false }, whatsapp: whatsapp.status === 'fulfilled' ? whatsapp.value : { sent: false } } });
    }

    if (action === 'bookings') {
      const contact = { email: clean(body.email), phone: clean(body.phone, 30) };
      if (!contact.email && !contact.phone) throw new Error('IDENTITY_REQUIRED');
      return response(200, { bookings: await findBookings(contact), demo: DEMO_MODE });
    }

    if (action === 'cancel') {
      const professional = validateProfessional(clean(body.professional));
      const reference = clean(body.reference, 40).toUpperCase();
      if (!/^DFL-[A-F0-9]{32}$/.test(reference)) throw new Error('INVALID_REFERENCE');
      const contact = { email: clean(body.email), phone: clean(body.phone, 30) };
      if (!contact.email && !contact.phone) throw new Error('IDENTITY_REQUIRED');
      const result = await cancel(professional, reference, contact);
      await markCancelled(reference).catch(error => console.error('Booking record cancellation error', error.message));
      return response(200, result);
    }

    return response(400, { error: 'INVALID_ACTION' });
  } catch (error) {
    const publicErrors = ['INVALID_BODY','INVALID_PROFESSIONAL','INVALID_SLOT','SLOT_UNAVAILABLE','INVALID_BOOKING','INVALID_REFERENCE','INVALID_QUESTION','BOOKING_NOT_FOUND','IDENTITY_REQUIRED','IDENTITY_MISMATCH','CALENDAR_NOT_CONFIGURED','DATA_STORE_NOT_CONFIGURED'];
    const code = publicErrors.includes(error.message) ? error.message : 'INTERNAL_ERROR';
    return response(code === 'SLOT_UNAVAILABLE' ? 409 : 400, { error: code });
  }
};
