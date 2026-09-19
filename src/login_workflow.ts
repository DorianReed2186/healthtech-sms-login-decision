import { z } from "zod";
import type { InfraiClient } from "./infrai.js";

export const requestCodeBody = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "phone must use E.164 format"),
  appointmentId: z.string().min(1).max(100),
  locale: z.string().min(2).max(20).default("en-US"),
}).strict();

export const verifyCodeBody = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "phone must use E.164 format"),
  code: z.string().regex(/^\d{4,8}$/, "code must contain 4 to 8 digits"),
  appointmentId: z.string().min(1).max(100),
}).strict();

export type AppointmentLoginResult = {
  appointmentId: string;
  state: "session_issued";
  session: unknown;
  notification: {
    audience: "patient";
    containsClinicalDetails: false;
    message: string;
  };
};

export class AppointmentLoginWorkflow {
  private readonly infrai: InfraiClient;

  constructor(infrai: InfraiClient) {
    this.infrai = infrai;
  }

  async requestCode(input: z.infer<typeof requestCodeBody>, requestId: string) {
    await this.infrai.auth.phone.send_code(
      { phone: input.phone, purpose: "login", locale: input.locale },
      `${requestId}:send-code`,
    );
    return {
      appointmentId: input.appointmentId,
      state: "code_sent" as const,
      notification: {
        audience: "patient" as const,
        containsClinicalDetails: false as const,
        message: "Your secure sign-in code was sent. It does not include appointment or clinical details.",
      },
    };
  }

  async verifyAndCreateSession(input: z.infer<typeof verifyCodeBody>, requestId: string): Promise<AppointmentLoginResult> {
    const verified = await this.infrai.auth.phone.verify(
      { phone: input.phone, code: input.code, login: true },
      `${requestId}:verify-code`,
    );
    const session = await this.infrai.auth.session.create(
      { user_id: verified.user_id, method: "phone", mfa_factor: "sms", require_mfa: false },
      `${requestId}:create-session`,
    );
    return {
      appointmentId: input.appointmentId,
      state: "session_issued",
      session,
      notification: {
        audience: "patient",
        containsClinicalDetails: false,
        message: "Secure sign-in completed. Open the appointment portal to view details.",
      },
    };
  }
}
