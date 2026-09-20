# Deep Finance Lab Chatbot — Checkpoint

**Last updated:** 5 September 2026
**Public site:** https://deepfinancelab.com
**Netlify project:** `super-travesseiro-af8335`
**GitHub repository:** `rmunozr/super-travessero-af8335` (`master`)

## Objective

Deploy a permanent website chatbot that can answer enquiries with Grok, check live availability across four professionals, create and cancel Google Calendar appointments, and send confirmations by Gmail and WhatsApp.

## Completed

- English is the default site language in `index.html`; Spanish is available in `index.es.html`, with reciprocal language links.
- Embedded bilingual chatbot UI and scheduling flow prepared on both language versions.
- Netlify Functions backend prepared for bootstrap, availability, booking, cancellation and conversational questions.
- Grok/xAI integration implemented through the Responses API at `https://api.x.ai/v1`.
- Netlify variables configured:
  - `XAI_API_KEY` as a secret.
  - `XAI_MODEL=grok-4.6`.
- Existing `OPENAI_API_KEY` retained but unused by the new code.
- Four Google calendars verified under `rmunozr@gmail.com`:
  - Professional 1: `e65c19104aeaa37d446e70e7a25d18d8316625a2fc5e2cd9a416460730fc4793@group.calendar.google.com`
  - Professional 2: `692f1ae38ca4012bf1872994dc6c3ee32d37779e74aeff602e8fad83d04fcacb@group.calendar.google.com`
  - Professional 3: `70907a1dad32cba947f3ad51d4de28a16737c9c7e4af5b49623ef467c3e35332@group.calendar.google.com`
  - Professional 4: `92da99225e73f0ed464f0bccca823f7f73fe769ff0e533e4ee861dc27203a2de@group.calendar.google.com`
- Working hours configured for Monday–Friday, 09:00–18:00, `America/Santiago`.
- Booking references strengthened to 128-bit random values (`DFL-` plus 32 hexadecimal characters).
- OAuth backend separated into:
  - Calendar authorization for `rmunozr@gmail.com`.
  - Gmail authorization for `dfl@deepfinancelab.com`.
- Privacy and Terms pages prepared as `privacy.html` and `terms.html`.
- JavaScript files passed syntax validation.

## Local pre-publish hardening (5 September 2026)

- WhatsApp webhook signature validation now fails closed when `WHATSAPP_APP_SECRET` is absent.
- Signature validation supports Base64-encoded Netlify request bodies.
- Meta and xAI network calls have bounded timeouts to reduce the risk of a Netlify 502.
- WhatsApp message deduplication now uses an explicit 24-hour logical expiry.
- Web cancellation accepts the complete 128-bit booking reference.
- Dependency versions were updated and locked; `npm audit` reports zero known vulnerabilities.
- Twelve local function tests pass, including webhook verification, signature, bilingual menu, private session keys, aligned calendar slots and localized Meta outbound-template cases.
- Web and WhatsApp now expose the same core capabilities: bilingual enquiries, availability, booking, cancellation and confirmations.
- Calendar, booking, cancellation, AI and email failures return a useful localized WhatsApp response instead of leaving the user without an answer.
- WhatsApp sessions use keyed hashes instead of raw phone numbers as storage keys.
- Webhook message states distinguish processing, ready-to-retry and sent events to reduce lost replies and duplicate reservations.
- `.gitignore` excludes local secrets, dependencies, Netlify state, logs and uploaded working screenshots.
- These changes are committed locally only until explicit authorization is given for the push that may trigger Netlify deployment.

## Local client records and reminders (5 September 2026)

- Added a Google Sheets repository for `Clients`, `Appointments`, `Reminders` and `Audit` tabs.
- Added deterministic client identifiers using `DATA_HASH_SECRET`; raw contact details are never used as row keys.
- Booking now records the client, appointment and unique 24-hour/2-hour email and WhatsApp reminder jobs.
- Cancellation requires matching email or phone, updates the appointment and cancels pending reminders.
- Web and WhatsApp can retrieve active bookings using the contact identity; WhatsApp uses the sender number.
- Added a Netlify Scheduled Function that checks due reminders every 15 minutes, sends them and records attempts/errors.
- Failed reminders retry up to three times; deterministic reminder IDs prevent duplicate jobs.
- Added bilingual Gmail reminder content and separate Meta reminder template configuration for English and Spanish.
- Added `scripts/setup-sheets.js` to create/initialize the required tabs after explicit authorization.
- Fourteen local tests pass and `npm audit --omit=dev` reports zero known vulnerabilities.
- A private native Google Sheet named **Deep Finance Lab Operations** was created under the `rmunozr@gmail.com` Drive account, inside the private `ChatGPT` folder.
- The spreadsheet contains the verified tabs `Clients`, `Appointments`, `Reminders` and `Audit`, with the exact headers expected by the Functions.
- Netlify now contains `GOOGLE_SHEETS_SPREADSHEET_ID` and `DATA_HASH_SECRET` as secret production values, scoped to Builds, Functions and Runtime.
- No production deployment was triggered while adding these variables.

Additional variables required before production:

- `GOOGLE_SHEETS_REFRESH_TOKEN`
- `WHATSAPP_REMINDER_TEMPLATE_NAME_EN`
- `WHATSAPP_REMINDER_TEMPLATE_LANGUAGE_EN`
- `WHATSAPP_REMINDER_TEMPLATE_NAME_ES`
- `WHATSAPP_REMINDER_TEMPLATE_LANGUAGE_ES`

## Google Cloud status

Project created:

- Name: **Deep Finance Lab Chatbot**
- Project ID: `deep-finance-lab-chatbot`
- Project number: `522896436091`
- Organization: none

Enabled APIs:

- Google Calendar API
- Gmail API

Pending API:

- Google Sheets API. The Google Cloud console currently returns **Site Unavailable** in the controlled cloud browser and has not been enabled or reported as enabled.

OAuth branding configured:

- App name: **Deep Finance Lab Appointment Assistant**
- Support/developer email: `rmunozr@gmail.com`
- Audience: External
- Status: Testing
- Homepage: `https://deepfinancelab.com`
- Privacy: `https://deepfinancelab.com/privacy.html`
- Terms: `https://deepfinancelab.com/terms.html`
- Authorized domain: `deepfinancelab.com`

## Exact resume point

Open the Google Cloud project `deep-finance-lab-chatbot`, enable **Google Sheets API**, then prepare an OAuth authorization that includes the Sheets scope. Stop for immediate confirmation before enabling the API, changing OAuth permissions or creating a persistent refresh token. Do not publish the OAuth application yet.

## Remaining work

1. Confirm the required OAuth test users are present.
2. Enable Google Sheets API and configure least-privilege scopes:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.freebusy`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/spreadsheets`
3. Generate a Sheets-capable refresh token only after immediate authorization and store it as `GOOGLE_SHEETS_REFRESH_TOKEN`.
4. Retain the already configured Calendar and Gmail authorizations as:
   - `GOOGLE_CALENDAR_REFRESH_TOKEN`
   - `GOOGLE_GMAIL_REFRESH_TOKEN`
5. Configure Meta WhatsApp Cloud API, approved templates and the remaining Netlify secrets. On 7 September 2026, the existing Meta business portfolio `Antonio Arroyo` (ID intentionally omitted here) was renamed to **Deep Finance Lab** after explicit authorization. It already owns two WhatsApp Business accounts named `Nacional Libertario` and `Antonio Arroyo`; neither WABA was renamed or otherwise modified. Meta phone-number setup remains blocked by the Account Center security restriction previously shown.
6. Recheck the HTTP 502 paths after all external variables are present.
7. Request immediate confirmation, then push local commits `520ba41` and `20ceefa` to `master`; this may trigger Netlify deployment.
8. Verify the Netlify deployment and run an end-to-end test: identification → live availability → booking → Sheets record → Calendar event → email/WhatsApp reminders → cancellation.
9. Move OAuth out of Testing for permanent refresh-token operation and complete any Google verification requirements.

## Git and deployment state

- Local commits prepared: `520ba41` and `20ceefa`.
- The local working tree was clean before this checkpoint update.
- The remote repository still contains the older published version; neither local commit has been pushed.
- No Netlify deployment, Meta webhook registration, credential creation or permission change was performed after the latest explicit restriction.

## Security note

The xAI key and Google OAuth secrets/tokens appeared previously in conversation captures. Their values are intentionally omitted from this checkpoint. Rotate the xAI key and the exposed Google OAuth credentials before production.
