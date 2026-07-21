/**
 * Transactional email provider abstraction.
 *
 * Production requires EMAIL_PROVIDER_API_KEY (Resend) + EMAIL_FROM_ADDRESS secrets.
 * Emulator / missing secrets: development adapter logs only — never claims production delivery.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  textBody: string;
  /** Idempotency key for provider / retry safety. */
  idempotencyKey: string;
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
            from: fromAddress,
            to: [input.to],
            subject: input.subject,
            text: input.textBody,
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

/**
 * Resolve provider from environment.
 * - FUNCTIONS_EMULATOR / missing API key → dev-log (explicit non-production)
 * - Production without key → none (fail closed at call site)
 */
export function resolveEmailProvider(env: NodeJS.ProcessEnv = process.env): {
  provider: EmailProvider;
  mode: "development" | "production" | "unavailable";
} {
  const apiKey = env.EMAIL_PROVIDER_API_KEY?.trim() || env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM_ADDRESS?.trim();
  const emulator = env.FUNCTIONS_EMULATOR === "true";

  if (emulator || env.EMAIL_PROVIDER_FORCE_DEV === "1") {
    return { provider: createDevLogEmailProvider(), mode: "development" };
  }
  if (apiKey && from) {
    return { provider: createResendEmailProvider(apiKey, from), mode: "production" };
  }
  return {
    provider: {
      async send() {
        return {
          delivered: false,
          provider: "none",
          errorCode: "EMAIL_PROVIDER_UNAVAILABLE",
        };
      },
    },
    mode: "unavailable",
  };
}
