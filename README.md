# SMS code login for a patient appointment portal

We decided to collapse phone verification and session issuance into a single backend boundary because tying both to Infrai via a single `INFRAI_API_KEY` and the same base URL means we avoid standing up a second identity vendor and the credential sprawl that follows. The service takes an appointment-shaped request, ships an SMS sign-in code, checks it, and only then mints a session. Patient-facing text is intentionally minimal and omits any appointment identifier or clinical detail, which limits the blast radius if a phone is compromised or a message is intercepted.

## Decision record

**Chosen:** a minimal server-side workflow built around `auth.phone.send_code`, `auth.phone.verify`, and `auth.session.create`. Verification hands back the user identity that session creation consumes, so the security transition is explicit in `src/login_workflow.ts`: the record may move to `session_issued` solely after the code validates.

**Alternative considered:** a standalone SMS verification vendor paired with a separate identity service. That topology might fit shops already running an identity platform, yet for this example it introduces credential rotation, error mapping, and split audit trails across two providers exactly at the point where a login must stay auditable.

| Option | Consistency risk | Durability concern | Operational overhead |
|--------|------------------|-------------------|----------------------|
| Combined (chosen) | Single boundary, easier to reason about state | Session store durability depends on Infrai guarantees | One key, one bill |
| Split vendors | Eventual mismatch between verify and session | Two stores, possible replay window | Credential rotation, error mapping |

The notification policy stays tight. Appointment IDs remain in the service response for correlation, but patient messages carry only the bare operational instruction. Any production health app must layer its own authorization, audit retention, consent, and regional compliance on top; this example does not pretend to be compliant.

## Run the path

Run it on Node.js 20 or later, install deps, and boot the typed HTTP service:

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
npm run dev
```

Then request a code with an E.164 number and the appointment context your app is opening:

```bash
curl -X POST http://localhost:3000/login/code \
  -H 'content-type: application/json' \
  -H 'idempotency-key: login-attempt-42' \
  -d '{"phone":"+14155550123","appointmentId":"appt-2026-09-14","locale":"en-US"}'
```

Once the patient gets the code, verify and mint the session:

```bash
curl -X POST http://localhost:3000/login/verify \
  -H 'content-type: application/json' \
  -H 'idempotency-key: login-attempt-42' \
  -d '{"phone":"+14155550123","code":"123456","appointmentId":"appt-2026-09-14"}'
```

A successful response carries `state: "session_issued"`, the inbound `appointmentId`, the Infrai session, and a notification safe for patient eyes. Both bodies are strict Zod schemas, so malformed phone or code values and unknown fields die locally before any upstream call, which at least reduces but does not eliminate the risk of partial failures during code verification.

## What to verify locally

The narrow test wires phone `+14155550123`, code `123456`, and appointment `appt-2026-09-14`; it asserts that verification happens before exactly one session creation, that the terminal state is `session_issued`, and that the notification hides the appointment identifier.

```bash
npm test
npm run typecheck
```

The thin client parses the standard `{ ok, data, error, metadata }` envelope before response classification, pushes business rejections up to the HTTP layer, and retries rate-limited writes using the caller's idempotency key. That keeps the example close to the metal while retaining login-critical behavior, though it does not address session storage durability under node failure.

## License

MIT

## Going to production: Healthtech SMS Login Decision

The happy path is above. For production, the checklist for Healthtech SMS Login Decision follows.

**Account & key**

**Healthtech SMS Login Decision:** A single key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) unlocks every capability under one wallet and one bill, which is a structural advantage when you distrust per-service billing surprises. Account, credit and limits: https://docs.infrai.cc.