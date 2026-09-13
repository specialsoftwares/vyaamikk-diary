/**
 * Narrow ADC-backed Cloud KMS wrap/unwrap client (VYD-32).
 *
 * Implements KmsKeyClient over the Cloud KMS REST API. The KmsEnvelopeCipher
 * still performs local AES-256-GCM; KMS only wraps the DEK. Missing key name
 * is handled by KmsEnvelopeCipher (`kms_unavailable`) — this client does not
 * fall back to InMemoryCredentialCipher.
 *
 * No KMS key creation, IAM, or secret provisioning happens here.
 */

import { BillingError } from "../errors";
import type { KmsKeyClient } from "../crypto";

const CLOUDKMS_SCOPE = "https://www.googleapis.com/auth/cloudkms";
const KMS_API = "https://cloudkms.googleapis.com/v1";
const KMS_TIMEOUT_MS = 15_000;

export async function getCloudKmsAccessTokenFromAdc(): Promise<string> {
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({ scopes: [CLOUDKMS_SCOPE] });
  const client = await auth.getClient();
  const result = await client.getAccessToken();
  const token =
    typeof result === "string"
      ? result
      : result && typeof result === "object" && "token" in result
        ? (result as { token?: string | null }).token
        : null;
  if (!token) {
    throw new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "kms_unavailable",
      retryable: true,
    });
  }
  return token;
}

export class GoogleCloudKmsKeyClient implements KmsKeyClient {
  constructor(private readonly getAccessToken: () => Promise<string> = getCloudKmsAccessTokenFromAdc) {}

  private async post(name: string, method: "encrypt" | "decrypt", body: Record<string, string>): Promise<Record<string, unknown>> {
    const token = await this.getAccessToken();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), KMS_TIMEOUT_MS);
    try {
      const res = await fetch(`${KMS_API}/${name}:${method}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok) {
        throw new BillingError({
          clientCode: "temporary_unavailable",
          causeCode: "kms_unavailable",
          retryable: true,
        });
      }
      const json = (await res.json()) as Record<string, unknown>;
      return json;
    } catch (err) {
      if (err instanceof BillingError) throw err;
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "kms_unavailable",
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async encrypt(args: { name: string; plaintext: Buffer }): Promise<{ ciphertext: Buffer }> {
    const json = await this.post(args.name, "encrypt", {
      plaintext: args.plaintext.toString("base64"),
    });
    if (typeof json.ciphertext !== "string" || json.ciphertext.length === 0) {
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "kms_unavailable",
        retryable: true,
      });
    }
    return { ciphertext: Buffer.from(json.ciphertext, "base64") };
  }

  async decrypt(args: { name: string; ciphertext: Buffer }): Promise<{ plaintext: Buffer }> {
    const json = await this.post(args.name, "decrypt", {
      ciphertext: args.ciphertext.toString("base64"),
    });
    if (typeof json.plaintext !== "string" || json.plaintext.length === 0) {
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "kms_unavailable",
        retryable: true,
      });
    }
    return { plaintext: Buffer.from(json.plaintext, "base64") };
  }
}
