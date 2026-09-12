/**
 * Transactional email provider abstraction.
 *
 * Production requires EMAIL_PROVIDER_API_KEY (Resend) + EMAIL_FROM_ADDRESS secrets
 * (bound via defineSecret on callables that send or HMAC email OTPs).
 * EMAIL_FROM_ADDRESS may be a bare address (`no-reply@domain`) or Resend display form
 * (`Vyaamikk Diary <no-reply@domain>`).
 * RESEND_API_KEY remains an optional process.env fallback only (not a Secret Manager param).
 * Emulator / missing secrets: development adapter logs only — never claims production delivery.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  textBody: string;
  /** Idempotency key for provider / retry safety. */
  idempotencyKey: string;
  /** Optional HTML body. OTP callers omit this; billing may include a download link. */
  htmlBody?: string;
  /** Optional sender override. OTP callers omit this and keep EMAIL_FROM_ADDRESS. */
  fromAddress?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  delivered: boolean;
  provider: "dev-log" | "resend" | "none";
  providerMessageId?: string;
  errorCode?: "EMAIL_PROVIDER_UNAVAILABLE";
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

/** Resend live keys are `re_…` with no whitespace. */
export function isPlausibleResendApiKey(apiKey: string): boolean {
  const key = apiKey.trim();
  if (!key.startsWith("re_")) return false;
  if (key.length < 20 || key.length > 256) return false;
  if (/\s/.test(key)) return false;
  return true;
}

/**
 * Accept bare email or a single `Display Name <email>` form.
 * Reject duplicated / concatenated secret paste mistakes.
 */
export function canonicalizeEmailFromAddress(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 200) return null;

  const angle = trimmed.match(/^([^<>]+)<\s*([^<>@\s]+@[^<>@\s]+)\s*>$/);
  if (angle) {
    const display = angle[1]!.trim().replace(/\s+/g, " ");
    const email = angle[2]!.trim().toLowerCase();
    if (!display || display.length > 80) return null;
    if (trimmed.indexOf("<") !== trimmed.lastIndexOf("<")) return null;
    return `${display} <${email}>`;
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !/\s/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

export function createDevLogEmailProvider(): EmailProvider {
  return {
    async send(input) {
      console.info("[email-provider/dev-log]", {
        to: input.to.replace(/(.{2}).+(@.+)/, "$1***$2"),
        subject: input.subject,
        idempotencyKey: input.idempotencyKey,
        // Never log OTP body contents in production — this adapter is non-prod only.
        bodyChars: input.textBody.length,
      });
      return { delivered: true, provider: "dev-log" };
    },
  };
}

export function createResendEmailProvider(apiKey: string, fromAddress: string): EmailProvider {
  return {
    async send(input) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": input.idempotencyKey.slice(0, 256),
          },
          body: JSON.stringify({
            from: input.fromAddress?.trim() || fromAddress,
            to: [input.to],
            subject: input.subject,
            text: input.textBody,
            ...(input.htmlBody ? { html: input.htmlBody } : {}),
            ...(input.replyTo ? { reply_to: input.replyTo } : {}),
          }),
        });
        if (!res.ok) {
          console.error("[email-provider/resend] send failed", res.status);
          return {
            delivered: false,
            provider: "resend",
            errorCode: "EMAIL_PROVIDER_UNAVAILABLE",
          };
        }
        const json = (await res.json()) as { id?: string };
        return {
          delivered: true,
          provider: "resend",
          providerMessageId: json.id,
        };
      } catch (e) {
        console.error("[email-provider/resend] network error", e);
        return {
          delivered: false,
          provider: "resend",
          errorCode: "EMAIL_PROVIDER_UNAVAILABLE",
        };
      }
    },
  };
}

function unavailableProvider(): EmailProvider {
  return {
    async send() {
      return {
        delivered: false,
        provider: "none",
        errorCode: "EMAIL_PROVIDER_UNAVAILABLE",
      };
    },
  };
}

/**
 * Resolve provider from environment.
 * - FUNCTIONS_EMULATOR / missing API key → dev-log (explicit non-production)
 * - Production without key → none (fail closed at call site)
 */
export function resolveEmailProvider(env: NodeJS.ProcessEnv = process.env): {
  provider: EmailProvider;
  mode: "development" | "production" | "unavailable";
} {
  const apiKeyRaw = env.EMAIL_PROVIDER_API_KEY?.trim() || env.RESEND_API_KEY?.trim() || "";
  const fromRaw = env.EMAIL_FROM_ADDRESS?.trim() || "";
  const emulator = env.FUNCTIONS_EMULATOR === "true";

  if (emulator || env.EMAIL_PROVIDER_FORCE_DEV === "1") {
    return { provider: createDevLogEmailProvider(), mode: "development" };
  }

  const from = canonicalizeEmailFromAddress(fromRaw);
  const apiKeyOk = isPlausibleResendApiKey(apiKeyRaw);
  if (apiKeyOk && from) {
    return {
      provider: createResendEmailProvider(apiKeyRaw.trim(), from),
      mode: "production",
    };
  }

  if (apiKeyRaw || fromRaw) {
    console.error("[email-provider] production config rejected", {
      apiKeyPlausible: apiKeyOk,
      fromCanonical: Boolean(from),
      fromRawLen: fromRaw.length,
      apiKeyRawLen: apiKeyRaw.length,
    });
  }

  return { provider: unavailableProvider(), mode: "unavailable" };
}
