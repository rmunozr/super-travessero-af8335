const CALENDARS = {
  'Professional 1': process.env.CALENDAR_PROFESSIONAL_1,
  'Professional 2': process.env.CALENDAR_PROFESSIONAL_2,
  'Professional 3': process.env.CALENDAR_PROFESSIONAL_3,
  'Professional 4': process.env.CALENDAR_PROFESSIONAL_4
};

const SERVICES = {
  'Strategic Finance': ['Professional 1', 'Professional 2'],
  'Quantitative Analytics': ['Professional 1', 'Professional 3'],
  'AI Advisory': ['Professional 2', 'Professional 4']
};

module.exports = {
  CALENDARS,
  SERVICES,
  TIMEZONE: 'America/Santiago',
  OPEN_HOUR: 9,
  CLOSE_HOUR: 18,
  SLOT_MINUTES: 60,
  DEMO_MODE: process.env.DEMO_MODE !== 'false'
};
