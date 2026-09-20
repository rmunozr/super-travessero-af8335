const { dueReminders, reminderContext, markReminder } = require('./_lib/records');
const { sendReminderEmail, sendReminderWhatsApp } = require('./_lib/notifications');

exports.handler = async () => {
  const due = await dueReminders(new Date(), 50);
  const summary = { checked: due.length, sent: 0, failed: 0, skipped: 0 };
  for (const reminder of due) {
    try {
      const context = await reminderContext(reminder.reference);
      if (!context || context.appointment.status !== 'confirmed') {
        await markReminder(reminder, 'cancelled'); summary.skipped += 1; continue;
      }
      const booking = { ...context.appointment, reference:reminder.reference };
      const contact = { ...context.client, locale:reminder.locale || context.client?.locale || 'en' };
      const result = reminder.channel === 'email' ? await sendReminderEmail(booking, contact) : await sendReminderWhatsApp(booking, contact);
      if (!result.sent) throw new Error(result.reason || 'REMINDER_NOT_SENT');
      await markReminder(reminder, 'sent'); summary.sent += 1;
    } catch (error) {
      await markReminder(reminder, 'failed', error.message).catch(() => {}); summary.failed += 1;
    }
  }
  return { statusCode: 200, body: JSON.stringify(summary) };
};
