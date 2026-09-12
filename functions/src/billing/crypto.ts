/**
 * Purchase-credential encryption abstraction (Phase B).
 *
 * Production target: Cloud KMS envelope encryption (owner W-3).
 * KMS is not enabled yet — the production adapter FAILS CLOSED.
 *
 * NOT allowed: plaintext persistence, hardcoded AES keys, env-string
 * encryption keys, or "Firestore encrypts at rest" as compliance.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { BillingError } from "./errors";
import type { EncryptedPurchaseCredential } from "./types";

export interface CredentialCipher {
  encryptCredential(plaintext: string): Promise<EncryptedPurchaseCredential>;
  decryptCredential(envelope: EncryptedPurchaseCredential): Promise<string>;
}

export function credentialFingerprint(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

const TEST_ALG = "TEST_ONLY_INMEMORY_AES256GCM_V1";
const PROD_ALG = "GOOGLE_KMS_ENVELOPE_AES256GCM_V1";

/**
 * Test-only cipher. Key is random per instance (never hardcoded, never read
 * from env). Must not be constructed on a production Functions runtime.
 */
export class InMemoryCredentialCipher implements CredentialCipher {
  readonly algorithm = TEST_ALG;
  private readonly key: Buffer;

  constructor() {
    if (process.env.K_SERVICE) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "test_cipher_forbidden_in_production",
      });
    }
    this.key = randomBytes(32);
  }

  async encryptCredential(plaintext: string): Promise<EncryptedPurchaseCredential> {
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "empty_credential_plaintext",
      });
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: Buffer.concat([iv, tag, ciphertext]).toString("base64"),
      keyVersion: "test-memory-v1",
      algorithm: TEST_ALG,
    };
  }

  async decryptCredential(envelope: EncryptedPurchaseCredential): Promise<string> {
    if (envelope.algorithm !== TEST_ALG) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "cipher_algorithm_mismatch",
      });
    }
    const buf = Buffer.from(envelope.ciphertext, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }
}

/**
 * Production adapter skeleton. Encrypt/decrypt throw until a KMS client and
 * key name are supplied. No insecure fallback exists.
 */
export class KmsEnvelopeCipher implements CredentialCipher {
  constructor(
    private readonly kms: {
      encrypt: (args: { name: string; plaintext: Buffer }) => Promise<{ ciphertext: Buffer }>;
      decrypt: (args: { name: string; ciphertext: Buffer }) => Promise<{ plaintext: Buffer }>;
    } | null,
    private readonly keyName: string | null
  ) {}

  async encryptCredential(plaintext: string): Promise<EncryptedPurchaseCredential> {
    if (!this.kms || !this.keyName) {
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "kms_unavailable",
        retryable: true,
      });
    }
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "empty_credential_plaintext",
      });
    }
    const result = await this.kms.encrypt({
      name: this.keyName,
      plaintext: Buffer.from(plaintext, "utf8"),
    });
    return {
      ciphertext: result.ciphertext.toString("base64"),
      keyVersion: this.keyName,
      algorithm: PROD_ALG,
    };
  }

  async decryptCredential(envelope: EncryptedPurchaseCredential): Promise<string> {
    if (!this.kms || !this.keyName) {
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "kms_unavailable",
        retryable: true,
      });
    }
    if (envelope.algorithm !== PROD_ALG) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "cipher_algorithm_mismatch",
      });
    }
    const result = await this.kms.decrypt({
      name: this.keyName,
      ciphertext: Buffer.from(envelope.ciphertext, "base64"),
    });
    return result.plaintext.toString("utf8");
  }
}

/** Production factory: fails closed when KMS is not configured. */
export function createProductionCredentialCipher(opts: {
  kms?: KmsEnvelopeCipher["kms"];
  keyName?: string | null;
}): CredentialCipher {
  return new KmsEnvelopeCipher(opts.kms ?? null, opts.keyName ?? null);
}
