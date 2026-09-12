/**
 * Credential cipher: test roundtrip, TRUE KMS envelope (fake wrap/unwrap),
 * and production fail-closed behavior without KMS.
 * Run: npm run test:billing-crypto
 */

import assert from "node:assert/strict";

import {
  createProductionCredentialCipher,
  credentialFingerprint,
  InMemoryCredentialCipher,
  KmsEnvelopeCipher,
  type KmsKeyClient,
} from "./crypto";
import { BillingError } from "./errors";

const SECRET_MATERIAL = "google-purchase-token-EXAMPLE-not-for-prod";
const KEY_NAME = "projects/x/locations/y/keyRings/z/cryptoKeys/k";

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

/** Fake KMS: XOR wrap with a fixed pad — invertible, and wrapped ≠ raw DEK. */
function makeFakeKms(): { kms: KmsKeyClient; wrapCalls: Buffer[] } {
  const pad = Buffer.from("fake-kms-wrapping-pad-0123456789abcdef", "utf8");
  const xor = (buf: Buffer): Buffer =>
    Buffer.from(buf.map((b, i) => b ^ pad[i % pad.length]));
  const wrapCalls: Buffer[] = [];
  const kms: KmsKeyClient = {
    async encrypt({ name, plaintext }) {
      assert.equal(name, KEY_NAME);
      wrapCalls.push(Buffer.from(plaintext));
      return { ciphertext: Buffer.concat([Buffer.from("WRAP1:"), xor(plaintext)]) };
    },
    async decrypt({ name, ciphertext }) {
      assert.equal(name, KEY_NAME);
      assert.equal(ciphertext.subarray(0, 6).toString("utf8"), "WRAP1:");
      return { plaintext: xor(Buffer.from(ciphertext.subarray(6))) };
    },
  };
  return { kms, wrapCalls };
}

async function main() {
  {
    const cipher = new InMemoryCredentialCipher();
    const env = await cipher.encryptCredential(SECRET_MATERIAL);
    assert.equal(typeof env.ciphertext, "string");
    assert.ok(!env.ciphertext.includes(SECRET_MATERIAL));
    assert.match(env.algorithm, /^TEST_ONLY_/);
    const round = await cipher.decryptCredential(env);
    assert.equal(round, SECRET_MATERIAL);
    assert.equal(credentialFingerprint(SECRET_MATERIAL).length, 64);
    assert.notEqual(credentialFingerprint(SECRET_MATERIAL), SECRET_MATERIAL);
  }

  // ——— TRUE KMS ENVELOPE: local AES-256-GCM under a per-credential DEK,
  //     KMS wraps ONLY the DEK, envelope carries wrapped DEK + IV + tag ———
  {
    const { kms, wrapCalls } = makeFakeKms();
    const cipher = new KmsEnvelopeCipher(kms, KEY_NAME);

    const env = await cipher.encryptCredential(SECRET_MATERIAL);
    assert.equal(env.algorithm, "GOOGLE_KMS_ENVELOPE_AES256GCM_V1");
    assert.equal(env.keyVersion, KEY_NAME);

    // KMS wrapped exactly one 256-bit DEK and NEVER saw the credential
    assert.equal(wrapCalls.length, 1);
    assert.equal(wrapCalls[0].length, 32);
    assert.ok(!wrapCalls[0].equals(Buffer.from(SECRET_MATERIAL, "utf8")));

    // the envelope contains neither the credential nor the plaintext DEK
    const raw = Buffer.from(env.ciphertext, "base64");
    assert.ok(!raw.includes(Buffer.from(SECRET_MATERIAL, "utf8")));
    assert.ok(!raw.includes(wrapCalls[0]), "plaintext DEK must never be persisted");

    // decrypt = KMS unwrap + AES-GCM verify/decrypt
    const round = await cipher.decryptCredential(env);
    assert.equal(round, SECRET_MATERIAL);

    // fresh random DEK + IV per encryption; fingerprint stays deterministic
    const env2 = await cipher.encryptCredential(SECRET_MATERIAL);
    assert.notEqual(env2.ciphertext, env.ciphertext);
    assert.equal(wrapCalls.length, 2);
    assert.ok(!wrapCalls[0].equals(wrapCalls[1]), "DEK must be unique per credential");
    assert.equal(
      credentialFingerprint(SECRET_MATERIAL),
      credentialFingerprint(await cipher.decryptCredential(env2))
    );

    // GCM auth: tampered ciphertext must fail closed
    const tampered = Buffer.from(env.ciphertext, "base64");
    tampered[tampered.length - 1] ^= 0xff;
    await assert.rejects(
      cipher.decryptCredential({ ...env, ciphertext: tampered.toString("base64") })
    );

    // malformed envelope and wrong algorithm fail closed
    await assert.rejects(
      cipher.decryptCredential({ ...env, ciphertext: Buffer.from("AAAA").toString("base64") }),
      isCause("envelope_malformed")
    );
    await assert.rejects(
      cipher.decryptCredential({ ...env, algorithm: "TEST_ONLY_INMEMORY_AES256GCM_V1" }),
      isCause("cipher_algorithm_mismatch")
    );
  }

  // ——— no KMS configured → FAIL CLOSED (no insecure fallback) ———
  {
    const prod = createProductionCredentialCipher({ kms: null, keyName: null });
    await assert.rejects(prod.encryptCredential(SECRET_MATERIAL), isCause("kms_unavailable"));
    const kmsMissing = new KmsEnvelopeCipher(null, KEY_NAME);
    await assert.rejects(kmsMissing.encryptCredential(SECRET_MATERIAL), isCause("kms_unavailable"));
    const { kms } = makeFakeKms();
    const keyMissing = new KmsEnvelopeCipher(kms, null);
    await assert.rejects(keyMissing.encryptCredential(SECRET_MATERIAL), isCause("kms_unavailable"));
    await assert.rejects(
      keyMissing.decryptCredential({
        ciphertext: "AAAA",
        keyVersion: KEY_NAME,
        algorithm: "GOOGLE_KMS_ENVELOPE_AES256GCM_V1",
      }),
      isCause("kms_unavailable")
    );
  }

  console.log("crypto.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
