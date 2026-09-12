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

/** Minimal Cloud KMS surface used to WRAP/UNWRAP data-encryption keys only. */
export interface KmsKeyClient {
  encrypt(args: { name: string; plaintext: Buffer }): Promise<{ ciphertext: Buffer }>;
  decrypt(args: { name: string; ciphertext: Buffer }): Promise<{ plaintext: Buffer }>;
}

const ENVELOPE_FORMAT_VERSION = 1;
const DEK_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // AES-GCM standard nonce
const TAG_LENGTH = 16;
const ENVELOPE_AAD = Buffer.from(PROD_ALG, "utf8");

function malformedEnvelope(): BillingError {
  return new BillingError({
    clientCode: "internal_error",
    causeCode: "envelope_malformed",
  });
}

/**
 * TRUE KMS envelope encryption (owner W-3):
 * 1. Generate a random 256-bit data-encryption key (DEK) per credential.
 * 2. Encrypt the credential locally with AES-256-GCM under the DEK
 *    (random 96-bit IV, 128-bit auth tag, algorithm string bound as AAD).
 * 3. Ask Cloud KMS to WRAP the DEK (KMS never sees the credential).
 * 4. Persist a single envelope: format version + wrapped DEK + IV + auth
 *    tag + local ciphertext (base64), plus the KMS key name (`keyVersion`)
 *    and algorithm/version identifier on the document.
 * Decrypt = KMS UNWRAP of the DEK, then AES-GCM verify + decrypt.
 *
 * The plaintext DEK is never persisted anywhere and is zeroized after use.
 * Without a KMS client + key name every call FAILS CLOSED — no insecure
 * fallback exists. (Direct KMS encryption of the credential itself was
 * rejected: it would ship the secret to KMS on every operation and break
 * the documented envelope contract.)
 *
 * Envelope binary layout (before base64):
 *   [1B format version][2B BE wrapped-DEK length][wrapped DEK]
 *   [12B IV][16B GCM tag][local ciphertext]
 */
export class KmsEnvelopeCipher implements CredentialCipher {
  constructor(
    private readonly kms: KmsKeyClient | null,
    private readonly keyName: string | null
  ) {}

  private requireKms(): { kms: KmsKeyClient; keyName: string } {
    if (!this.kms || !this.keyName) {
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "kms_unavailable",
        retryable: true,
      });
    }
    return { kms: this.kms, keyName: this.keyName };
  }

  async encryptCredential(plaintext: string): Promise<EncryptedPurchaseCredential> {
    const { kms, keyName } = this.requireKms();
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "empty_credential_plaintext",
      });
    }
    const dek = randomBytes(DEK_LENGTH);
    try {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv("aes-256-gcm", dek, iv);
      cipher.setAAD(ENVELOPE_AAD);
      const localCiphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();

      const wrapped = await kms.encrypt({ name: keyName, plaintext: dek });
      const wrappedDek = wrapped.ciphertext;
      if (wrappedDek.length === 0 || wrappedDek.length > 0xffff) {
        throw malformedEnvelope();
      }
      const header = Buffer.alloc(3);
      header.writeUInt8(ENVELOPE_FORMAT_VERSION, 0);
      header.writeUInt16BE(wrappedDek.length, 1);
      return {
        ciphertext: Buffer.concat([header, wrappedDek, iv, tag, localCiphertext]).toString(
          "base64"
        ),
        keyVersion: keyName,
        algorithm: PROD_ALG,
      };
    } finally {
      dek.fill(0);
    }
  }

  async decryptCredential(envelope: EncryptedPurchaseCredential): Promise<string> {
    const { kms, keyName } = this.requireKms();
    if (envelope.algorithm !== PROD_ALG) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "cipher_algorithm_mismatch",
      });
    }
    const buf = Buffer.from(envelope.ciphertext, "base64");
    if (buf.length < 3) throw malformedEnvelope();
    if (buf.readUInt8(0) !== ENVELOPE_FORMAT_VERSION) throw malformedEnvelope();
    const wrappedLen = buf.readUInt16BE(1);
    const minLength = 3 + wrappedLen + IV_LENGTH + TAG_LENGTH;
    if (wrappedLen === 0 || buf.length < minLength) throw malformedEnvelope();
    const wrappedDek = buf.subarray(3, 3 + wrappedLen);
    const iv = buf.subarray(3 + wrappedLen, 3 + wrappedLen + IV_LENGTH);
    const tag = buf.subarray(3 + wrappedLen + IV_LENGTH, minLength);
    const localCiphertext = buf.subarray(minLength);

    // Real Cloud KMS resolves the wrapping key VERSION from the ciphertext
    // itself; unwrapping always uses the configured key resource name.
    const unwrapped = await kms.decrypt({ name: keyName, ciphertext: Buffer.from(wrappedDek) });
    const dek = unwrapped.plaintext;
    try {
      if (dek.length !== DEK_LENGTH) throw malformedEnvelope();
      const decipher = createDecipheriv("aes-256-gcm", dek, iv);
      decipher.setAAD(ENVELOPE_AAD);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(localCiphertext), decipher.final()]).toString(
        "utf8"
      );
    } finally {
      dek.fill(0);
    }
  }
}

/** Production factory: fails closed when KMS is not configured. */
export function createProductionCredentialCipher(opts: {
  kms?: KmsKeyClient | null;
  keyName?: string | null;
}): CredentialCipher {
  return new KmsEnvelopeCipher(opts.kms ?? null, opts.keyName ?? null);
}
