/**
 * Credential cipher: test roundtrip + production adapter fail-closed.
 * Run: npm run test:billing-crypto
 */

import assert from "node:assert/strict";

import {
  createProductionCredentialCipher,
  credentialFingerprint,
  InMemoryCredentialCipher,
  KmsEnvelopeCipher,
} from "./crypto";
import { BillingError } from "./errors";

const SECRET_MATERIAL = "google-purchase-token-EXAMPLE-not-for-prod";

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

  {
    const prod = createProductionCredentialCipher({ kms: null, keyName: null });
    await assert.rejects(
      prod.encryptCredential(SECRET_MATERIAL),
      (e: unknown) => e instanceof BillingError && e.causeCode === "kms_unavailable"
    );
    const kms = new KmsEnvelopeCipher(null, "projects/x/locations/y/keyRings/z/cryptoKeys/k");
    await assert.rejects(
      kms.encryptCredential(SECRET_MATERIAL),
      (e: unknown) => e instanceof BillingError && e.causeCode === "kms_unavailable"
    );
  }

  console.log("crypto.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
