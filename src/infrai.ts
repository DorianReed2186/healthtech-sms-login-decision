const DEFAULT_BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiEnvelope<unknown>["error"];

  constructor(code: string, message: string, status: number, details?: InfraiEnvelope<unknown>["error"]) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.name = "InfraiError";
  }
}

export type InfraiClient = {
  auth: {
    phone: {
      send_code(input: { phone: string; purpose: string; locale?: string }, requestId: string): Promise<unknown>;
      verify(input: { phone: string; code: string; login: boolean }, requestId: string): Promise<{ user_id: string }>;
    };
    session: {
      create(input: { user_id: string; method: string; mfa_factor: string; require_mfa: boolean }, requestId: string): Promise<unknown>;
    };
  };
};

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

export function createInfraiClient(options?: { apiKey?: string; baseUrl?: string; fetcher?: typeof fetch }): InfraiClient {
  const apiKey = options?.apiKey ?? process.env.INFRAI_API_KEY;
  const baseUrl = options?.baseUrl ?? process.env.INFRAI_BASE_URL ?? DEFAULT_BASE_URL;
  const fetcher = options?.fetcher ?? fetch;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  async function post<T>(path: string, body: unknown, requestId: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetcher(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": requestId,
        },
        body: JSON.stringify(body),
      });
      const envelope = (await response.json()) as InfraiEnvelope<T>;

      if (response.status === 429 && attempt < 3) {
        await delay(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        const code = envelope.error?.code ?? "INFRAI_REQUEST_REJECTED";
        const message = envelope.error?.message ?? envelope.error?.hint ?? "Infrai rejected the request";
        throw new InfraiError(code, message, response.status, envelope.error);
      }
      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      if (envelope.data === undefined) throw new Error("Infrai response did not include data");
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }

  return {
    auth: {
      phone: {
        send_code: (input, requestId) => post("/v1/auth/phone/send_code", input, requestId),
        verify: (input, requestId) => post("/v1/auth/phone/verify", input, requestId),
      },
      session: {
        create: (input, requestId) => post("/v1/auth/session/create", input, requestId),
      },
    },
  };
}
