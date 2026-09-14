/**
 * Authenticated Pub/Sub push OIDC verification for Play RTDN (VYD-32).
 *
 * No static shared verification token. Production uses google-auth-library
 * to verify the bearer ID token: signature, issuer, exact audience, exact
 * service-account email, email_verified === true.
 */

import { BillingError } from "../errors";

export interface OidcTokenPayload {
  iss?: string;
  aud?: string | string[];
  email?: string;
  email_verified?: boolean | string;
  sub?: string;
}

export interface OidcTokenVerifier {
  verifyIdToken(opts: { idToken: string; audience: string }): Promise<OidcTokenPayload>;
}

const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export interface PubSubOidcExpectation {
  audience: string;
  serviceAccountEmail: string;
}

export function extractBearerToken(authorizationHeader: string | undefined): string {
  if (typeof authorizationHeader !== "string" || authorizationHeader.length === 0) {
    throw new BillingError({
      clientCode: "not_entitled",
      causeCode: "rtdn_unauthenticated",
    });
  }
  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  if (!match) {
    throw new BillingError({
      clientCode: "not_entitled",
      causeCode: "rtdn_unauthenticated",
    });
  }
  return match[1];
}

function audienceMatches(aud: string | string[] | undefined, expected: string): boolean {
  if (typeof aud === "string") return aud === expected;
  if (Array.isArray(aud)) return aud.includes(expected);
  return false;
}

function emailVerified(value: boolean | string | undefined): boolean {
  return value === true || value === "true";
}

export async function verifyPubSubPushOidc(
  verifier: OidcTokenVerifier,
  authorizationHeader: string | undefined,
  expected: PubSubOidcExpectation
): Promise<OidcTokenPayload> {
  if (!expected.audience || !expected.serviceAccountEmail) {
    throw new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "rtdn_oidc_config_missing",
      retryable: true,
    });
  }
  const idToken = extractBearerToken(authorizationHeader);
  let payload: OidcTokenPayload;
  try {
    payload = await verifier.verifyIdToken({ idToken, audience: expected.audience });
  } catch {
    throw new BillingError({
      clientCode: "not_entitled",
      causeCode: "rtdn_oidc_invalid",
    });
  }
  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) {
    throw new BillingError({
      clientCode: "not_entitled",
      causeCode: "rtdn_oidc_invalid",
    });
  }
  if (!audienceMatches(payload.aud, expected.audience)) {
    throw new BillingError({
      clientCode: "not_entitled",
      causeCode: "rtdn_oidc_invalid",
    });
  }
  if (payload.email !== expected.serviceAccountEmail) {
    throw new BillingError({
      clientCode: "not_entitled",
      causeCode: "rtdn_oidc_invalid",
    });
  }
  if (!emailVerified(payload.email_verified)) {
    throw new BillingError({
      clientCode: "not_entitled",
      causeCode: "rtdn_oidc_invalid",
    });
  }
  return payload;
}

export function createGoogleOidcVerifier(): OidcTokenVerifier {
  return {
    async verifyIdToken(opts) {
      const { OAuth2Client } = await import("google-auth-library");
      const client = new OAuth2Client();
      const ticket = await client.verifyIdToken({
        idToken: opts.idToken,
        audience: opts.audience,
      });
      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error("empty_oidc_payload");
      }
      return payload;
    },
  };
}

export function rtdnOidcExpectationFromEnv(
  env: NodeJS.ProcessEnv = process.env
): PubSubOidcExpectation {
  return {
    audience: env.PLAY_RTDN_PUSH_AUDIENCE ?? "",
    serviceAccountEmail: env.PLAY_RTDN_PUSH_SERVICE_ACCOUNT ?? "",
  };
}
