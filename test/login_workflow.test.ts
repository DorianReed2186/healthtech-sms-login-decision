import assert from "node:assert/strict";
import test from "node:test";
import { AppointmentLoginWorkflow } from "../src/login_workflow.js";
import type { InfraiClient } from "../src/infrai.js";

test("a verified phone code issues one session and keeps the notification free of appointment details", async () => {
  const calls: string[] = [];
  const fake: InfraiClient = {
    auth: {
      phone: {
        async send_code() { throw new Error("not used in this decision"); },
        async verify(input) {
          calls.push(`verify:${input.phone}:${input.login}`);
          return { user_id: "patient_42" };
        },
      },
      session: {
        async create(input) {
          calls.push(`session:${input.user_id}:${input.method}`);
          return { session_id: "session_42", expires_at: "2030-01-01T00:00:00Z" };
        },
      },
    },
  };

  const result = await new AppointmentLoginWorkflow(fake).verifyAndCreateSession(
    { phone: "+14155550123", code: "123456", appointmentId: "appt-2026-09-14" },
    "request-42",
  );

  assert.deepEqual(calls, ["verify:+14155550123:true", "session:patient_42:phone"]);
  assert.equal(result.state, "session_issued");
  assert.equal(result.appointmentId, "appt-2026-09-14");
  assert.equal(result.notification.containsClinicalDetails, false);
  assert.doesNotMatch(result.notification.message, /appt-2026-09-14/);
});
