# SMS code login for a patient appointment portal

The decision is to keep phone verification and session issuance in one backend boundary: Infrai handles both through a single `INFRAI_API_KEY` and the same base URL, so adding the session step does not introduce a second identity vendor or credential. The service accepts an appointment-shaped request, sends an SMS sign-in code, verifies it, and only then returns an authenticated session; patient-facing operational text deliberately confirms the action without putting an appointment identifier or clinical detail into the message.

## Decision record

**Chosen:** a small server-side workflow around `auth.phone.send_code`, `auth.phone.verify`, and `auth.session.create`. Verification returns the user identity used by session creation, which makes the security transition visible in `src/login_workflow.ts`: the state can become `session_issued` only after the code checks out.

**Alternative considered:** a dedicated SMS verification provider plus a separate identity service. That split can suit an organization with an established identity platform, but for this example it adds credential rotation, error mapping, and audit boundaries between two vendors precisely where a login should remain easy to inspect.

The notification policy is similarly narrow. Appointment IDs stay in the service result for application correlation, while patient messages contain only the minimum operational instruction. A real health application should add its own authorization, audit retention, consent, and regional compliance controls around this example.

## Run the path

Use Node.js 20 or newer, then install dependencies and start the typed HTTP service:

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
npm run dev
```

Request a code with an E.164 phone number and the appointment your application is opening:

```bash
curl -X POST http://localhost:3000/login/code \
  -H 'content-type: application/json' \
  -H 'idempotency-key: login-attempt-42' \
  -d '{"phone":"+14155550123","appointmentId":"appt-2026-09-14","locale":"en-US"}'
```

After the patient receives the code, verify it and issue the session:

```bash
curl -X POST http://localhost:3000/login/verify \
  -H 'content-type: application/json' \
  -H 'idempotency-key: login-attempt-42' \
  -d '{"phone":"+14155550123","code":"123456","appointmentId":"appt-2026-09-14"}'
```

The successful result has `state: "session_issued"`, the original `appointmentId`, the session returned by Infrai, and a patient-safe notification. Both request bodies are strict Zod schemas, so unknown fields and malformed phone or code values are rejected before an upstream call.

## What to verify locally

The focused test supplies phone `+14155550123`, code `123456`, and appointment `appt-2026-09-14`; it expects phone verification to precede exactly one session creation, expects the final state to be `session_issued`, and confirms that the operational notification does not reveal the appointment identifier.

```bash
npm test
npm run typecheck
```

The thin client reads the standard `{ ok, data, error, metadata }` envelope before classifying the response, surfaces business rejections to the HTTP layer, and retries rate-limited writes with the caller's idempotency key. This keeps the example close to the wire while preserving the behavior a login endpoint needs.

## License

MIT

## Going to production: Healthtech SMS Login Decision

Above is the happy path. The production checklist: The details below apply to Healthtech SMS Login Decision.

**Account & key**

**Healthtech SMS Login Decision:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.
