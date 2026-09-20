const { google } = require('googleapis');
const { HEADERS, TABS } = require('../netlify/functions/_lib/records');

async function main() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_SHEETS_REFRESH_TOKEN, GOOGLE_SHEETS_SPREADSHEET_ID } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_SHEETS_REFRESH_TOKEN || !GOOGLE_SHEETS_SPREADSHEET_ID) throw new Error('Missing Google Sheets configuration');
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token:GOOGLE_SHEETS_REFRESH_TOKEN });
  const api = google.sheets({ version:'v4', auth });
  const { data } = await api.spreadsheets.get({ spreadsheetId:GOOGLE_SHEETS_SPREADSHEET_ID, fields:'sheets.properties.title' });
  const existing = new Set((data.sheets || []).map(sheet => sheet.properties.title));
  const missing = Object.values(TABS).filter(title => !existing.has(title));
  if (missing.length) await api.spreadsheets.batchUpdate({ spreadsheetId:GOOGLE_SHEETS_SPREADSHEET_ID, requestBody:{ requests:missing.map(title => ({ addSheet:{ properties:{ title } } })) } });
  for (const [name, title] of Object.entries(TABS)) await api.spreadsheets.values.update({ spreadsheetId:GOOGLE_SHEETS_SPREADSHEET_ID, range:`${title}!A1`, valueInputOption:'RAW', requestBody:{ values:[HEADERS[name]] } });
  console.log(`Google Sheets schema ready: ${Object.values(TABS).join(', ')}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
