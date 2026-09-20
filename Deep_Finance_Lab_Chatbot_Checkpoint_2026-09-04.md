# Deep Finance Lab Chatbot — Persistent Checkpoint

**Last updated:** 20 September 2026
**Public site:** https://deepfinancelab.com
**Netlify project:** `super-travesseiro-af8335`
**GitHub repository:** `rmunozr/super-travessero-af8335`
**Production branch:** `master`
**Current remote master:** `521c8d1`

## Current production state

- The new bilingual website and chatbot are deployed through Netlify.
- Spanish is the default language at `/` (`index.html`).
- The language switch offers **English** and opens `/index.en` (`index.en.html`).
- The English page offers **Español** and returns to `/`.
- The legacy `/index.es` route remains available and points to the English version through its switch.
- The chatbot is loaded on both languages through `chatbot-es.js` and selects its language from the page `lang` attribute.
- GitHub PR #1 published the complete bilingual chatbot release.
- GitHub PR #2 changed the production default language to Spanish.
- Netlify checks passed before both merges.
- Production bootstrap and AI requests return HTTP 200; the earlier chatbot HTTP 502 is not currently reproducible.
- Fourteen local function tests pass and the dependency audit reports no known production vulnerabilities.

## Bot architecture

The system is deliberately hybrid:

1. Deterministic workflows handle availability, booking identification, booking creation, booking lookup and cancellation.
2. xAI handles only bounded free-form questions about Deep Finance Lab.
3. The web channel and WhatsApp channel share the calendar, AI, records and notification libraries.

### Current free-text routing

- A random message entered while the bot is at the main menu is not automatically sent to Grok.
- At the menu, unrecognized text causes the bot to show the available options again.
- The user must currently select **Ask a question / Hacer una consulta**; the next message is then sent to Grok with the system instructions.
- Text entered during booking, lookup or cancellation is interpreted exclusively by the deterministic state machine.
- The direct backend action `ask` is the only web action that invokes the AI question-answering service.

### Optional future conversational improvement — not implemented

- A future version could add intent routing so ordinary informational questions reach Grok without requiring the user to select option 4 first.
- Messages about booking, availability, existing reservations or cancellation must continue through deterministic workflows.
- Ambiguous messages should trigger a clarification instead of an irreversible action.
- Grok must never create, change or cancel an appointment directly.
- Expand the approved Deep Finance Lab knowledge/instructions to explicitly describe implementation of bilingual web and WhatsApp bots, calendar integration, client records, email/WhatsApp notifications and internal workflow automation.
- Expected example: “¿Qué ofrecen en implementación de bots?” should receive a direct commercial answer about these services, followed by a useful qualification question.

### AI configuration

- Provider: xAI, using its OpenAI-compatible endpoint `https://api.x.ai/v1`.
- Default model in code: `grok-4.6`; `XAI_MODEL` can override it.
- Maximum output: 350 tokens.
- Request timeout: 8 seconds.
- Automatic retries: disabled.
- Provider-side storage request: `store: false`.
- Production AI is configured and returned `demo: false` during the latest verification.
- Scope is limited to Deep Finance Lab services and appointment guidance.
- Personalized investment, legal, tax and medical advice is prohibited.
- Free-form AI cannot create, change or cancel appointments.

### Scheduling configuration

- Time zone: `America/Santiago`.
- Business hours: 09:00–18:00.
- Appointment duration: 60 minutes.
- Availability horizon presented by the channels: 21 days.
- Four configurable professional calendars.
- Current service groups: Strategic Finance, Quantitative Analytics and AI Advisory.
- Production reports `demo: false`.
- Booking references use `DFL-` plus 32 hexadecimal characters.
- Cancellation requires both the reference and matching contact identity.

## Client records and reminders

- Google Sheets-backed repositories exist for `Clients`, `Appointments`, `Reminders` and `Audit`.
- Client identifiers are derived with `DATA_HASH_SECRET`; raw contact details are not used as record keys.
- Successful bookings create appointment records and reminder jobs.
- Cancellation updates the appointment and cancels pending reminder jobs.
- A scheduled Netlify Function processes due reminders every 15 minutes.
- Email and WhatsApp reminder paths support Spanish and English templates.
- Reminder failures are recorded and can retry up to three times.
- The private operations spreadsheet already exists; its identifier and credentials are intentionally omitted here.

## WhatsApp implementation

The code in `netlify/functions/whatsapp.js` provides:

- Spanish as the initial language.
- Switching with `English` or `Español`.
- The same core menu as the web chatbot: book, view bookings, cancel and ask a question.
- Netlify Blobs session storage.
- HMAC-derived session keys that do not expose phone numbers.
- Meta `X-Hub-Signature-256` validation that fails closed.
- Base64 webhook payload support.
- 24-hour message deduplication and session expiry.
- Processing/ready/sent states to reduce duplicate bookings and lost replies.
- An 8-second outbound Meta timeout.
- Meta API version fallback `v23.0`.

### WhatsApp connectivity status

- The webhook is deployed at `https://deepfinancelab.com/.netlify/functions/whatsapp`.
- It currently returns HTTP 503 `Webhook not configured` because the required Meta variables have not been completed in production.
- The webhook has not yet been registered and verified in Meta.
- No real inbound/outbound WhatsApp end-to-end test has been completed.
- The previously proposed personal mobile number is used by normal WhatsApp. An exclusive Cloud API number or an explicitly planned migration is required.

Required WhatsApp variables:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_API_VERSION`
- Approved confirmation and reminder template names/languages as applicable.

## Next safe resume point

1. Obtain or select a phone number dedicated to WhatsApp Cloud API, or explicitly approve a migration plan.
2. Immediately before changing external systems, request confirmation from the user.
3. Enter the Meta values directly in Netlify without exposing them in chat or GitHub.
4. Register the callback URL and verify token in Meta.
5. Subscribe the WhatsApp Business Account to message events.
6. Run an end-to-end test: inbound message → bilingual menu → availability → booking → Calendar/Sheets → email/WhatsApp confirmation → lookup → cancellation → reminders.
7. Verify logs and confirm that retries do not create duplicate appointments.

## Security and authorization rules

- Never display, reconstruct or commit secret values.
- Do not read existing secret values unless strictly necessary.
- Do not create credentials, permanent access, deploy keys or permission changes without immediate authorization.
- Do not register the Meta webhook or modify Netlify production variables without immediate authorization.
- Temporary deploy keys used during earlier work were removed.
- Temporary GitHub publication branches were intentionally left in place because deletion was not authorized.
- Previously exposed Google OAuth credentials/tokens must be rotated before final production use.
- The previously exposed xAI credential should also be rotated.

## Repository note

- The authoritative published state is GitHub `master` at `521c8d1` or its successor.
- The local scratch repository may have branches that diverge from remote history because publication was completed through the authenticated GitHub web interface.
- Before future work, fetch `origin/master` and base new changes on the current remote branch; do not force-push or overwrite history.
- This scratch directory is temporary. GitHub is the durable source of the deployed code.
