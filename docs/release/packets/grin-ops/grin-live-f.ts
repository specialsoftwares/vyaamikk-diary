/**
 * LIVE_BACKEND synthetic smoke via Firebase client phone OTP session.
 * Never prints UIDs, tokens, API keys, or env values.
 * Cross-owner / non-admitted remain NOT RUN.
 * Does not use iamcredentials.signJwt or Admin-substituted client success.
 * Does not create users/{uid}; existing active account is a precondition.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { freezeCommand } from "../../../../src/goodsEvidence/command";
import { sampleRegisterBody } from "../../../../src/goodsEvidence/testFixtures";
import { assembleEvidencePackInputs } from "../../../../src/goodsEvidence/evidencePackInputs";
import { waitForOwnerClientSession } from "./grin-live-f-signin.mjs";
import {
  assertConfirmedProjection,
  assertReplayPreservesIssuance,
  assertUnauthenticatedDenial,
} from "./grin-live-f-evidence.mjs";

const PROJECT = "vyaamikk-diary";
const REGION = "asia-south1";
const BUCKET = "vyaamikk-diary.firebasestorage.app";
const LEDGER = "ledger_pilot_live";
const RECEIPT = "receiptl01";
const COMMAND = "commandl01";
const EVIDENCE = "evidencel01";
const UID_FILE =
  process.env.GRIN_OWNER_UID_FILE ||
  "/Users/shivamsaurav/vyd-private/grin-owner-admission.txt";

type ScenarioStatus = "PASS" | "FAIL" | "NOT_RUN" | "NARROW";
const results: Record<string, ScenarioStatus> = {
  authenticated_success: "NOT_RUN",
  unauthenticated_denial: "NOT_RUN",
  non_admitted_denial: "NOT_RUN",
  cross_owner_denial: "NOT_RUN",
  register_replay: "NOT_RUN",
  upload_verification: "NOT_RUN",
  confirmation: "NOT_RUN",
  /** Authorized read + local manifest assembly only — not production PDF/export acceptance. */
  read_export: "NOT_RUN",
};

function fail(msg: string): never {
  process.stderr.write(`LIVE_F ABORT: ${msg}\n`);
  process.exit(2);
}

function loadUid(): string {
  const raw = readFileSync(UID_FILE, "utf8");
  const uids = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
  if (uids.length !== 1) fail("owner UID file count unexpected");
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uids[0])) fail("owner UID grammar rejected");
  return uids[0];
}

function firebaseAccessToken(): string {
  const obj = JSON.parse(
    readFileSync(`${process.env.HOME}/.config/configstore/firebase-tools.json`, "utf8"),
  ) as { tokens?: { access_token?: string } };
  const tok = obj.tokens?.access_token;
  if (typeof tok !== "string" || tok.length < 20) fail("firebase CLI token missing");
  return tok;
}

function fsDocUrl(path: string): string {
  const encoded = path
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
  return `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${encoded}`;
}

async function gcpJson(
  token: string,
  url: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { parse: false, len: text.length };
  }
  return { status: res.status, json };
}

function strFields(obj: Record<string, string>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = { stringValue: v };
  return { fields };
}

function fieldStr(fields: Record<string, unknown> | undefined, key: string): string | null {
  const f = fields?.[key] as Record<string, unknown> | undefined;
  if (!f) return null;
  if (typeof f.stringValue === "string") return f.stringValue;
  if (typeof f.integerValue === "string") return f.integerValue;
  if (typeof f.integerValue === "number") return String(f.integerValue);
  return null;
}

async function callable(
  name: string,
  data: unknown,
  idToken: string | null,
): Promise<{ http: number; json: Record<string, unknown> }> {
  const url = `https://${REGION}-${PROJECT}.cloudfunctions.net/${name}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ data }) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { parse: false, len: text.length };
  }
  return { http: res.status, json };
}

function resultOf(json: Record<string, unknown>): Record<string, unknown> {
  if (json.result && typeof json.result === "object") return json.result as Record<string, unknown>;
  if (json.error && typeof json.error === "object") return json.error as Record<string, unknown>;
  return json;
}

async function main() {
  process.stdout.write(
    "LIVE_F start label=LIVE_BACKEND synthetic=true authBoundary=firebase-client-phone-otp-verified-idtoken\n",
  );
  results.non_admitted_denial = "NOT_RUN";
  results.cross_owner_denial = "NOT_RUN";
  process.stdout.write(
    "LIVE_F non_admitted_denial=NOT_RUN reason=additional_account_not_authorized\n",
  );
  process.stdout.write(
    "LIVE_F cross_owner_denial=NOT_RUN reason=second_authorized_account_absent\n",
  );

  const expectedUid = loadUid();
  const accessToken = firebaseAccessToken();

  const userDoc = await gcpJson(accessToken, fsDocUrl(`users/${expectedUid}`));
  if (userDoc.status === 404) {
    fail("users/{uid} missing; existing active account is a precondition (no create fallback)");
  }
  if (userDoc.status !== 200) fail("users/{uid} read failed");
  const userFields = (userDoc.json.fields || {}) as Record<string, unknown>;
  if (fieldStr(userFields, "status") !== "active") {
    fail("users/{uid} is not status=active; ineligible");
  }
  process.stdout.write("LIVE_F existing_account_eligible=true\n");

  // Authorized synthetic-ledger setup only (separate from account eligibility).
  const ledgerDoc = await gcpJson(
    accessToken,
    fsDocUrl(`users/${expectedUid}/goodsEvidenceLedgers/${LEDGER}`),
  );
  if (ledgerDoc.status === 404) {
    const created = await gcpJson(
      accessToken,
      fsDocUrl(`users/${expectedUid}/goodsEvidenceLedgers/${LEDGER}`),
      { method: "PATCH", body: strFields({ ownerUid: expectedUid, status: "active" }) },
    );
    if (created.status !== 200) fail("authorized synthetic ledger_pilot_live setup failed");
    process.stdout.write("LIVE_F synthetic_ledger_setup=created ledger_pilot_live\n");
  } else if (ledgerDoc.status === 200) {
    const fields = (ledgerDoc.json.fields || {}) as Record<string, unknown>;
    if (fieldStr(fields, "ownerUid") !== expectedUid || fieldStr(fields, "status") !== "active") {
      fail("ledger_pilot_live ownership/status mismatch");
    }
    process.stdout.write("LIVE_F synthetic_ledger_setup=verified ledger_pilot_live\n");
  } else {
    fail("ledger read failed");
  }

  const admission = await gcpJson(
    accessToken,
    fsDocUrl(`users/${expectedUid}/goodsEvidenceAdmission/runtime`),
  );
  if (admission.status !== 200) fail("admission runtime missing; D is required");
  const fields = (admission.json.fields || {}) as Record<string, unknown>;
  if (
    fieldStr(fields, "schemaVersion") !== "1" ||
    fieldStr(fields, "newCommands") !== "allow" ||
    fieldStr(fields, "reconciliation") !== "allow"
  ) {
    fail("admission fields not allow/allow schemaVersion=1");
  }
  process.stdout.write("LIVE_F admission fields_ok=true\n");

  const frozen = freezeCommand({
    commandId: COMMAND,
    type: "registerGoodsReceipt",
    ownerUid: expectedUid,
    ledgerId: LEDGER,
    body: sampleRegisterBody({ receiptId: RECEIPT }),
  });
  const payload = {
    envelope: {
      commandId: frozen.commandId,
      type: frozen.type,
      ledgerId: frozen.ledgerId,
      body: frozen.body,
      ownerUid: frozen.ownerUid,
    },
    digest: frozen.digest,
  };

  const unauth = await callable("grinRegisterGoodsReceipt", payload, null);
  const unauthRes = resultOf(unauth.json);
  if (assertUnauthenticatedDenial(unauth.http, unauthRes)) {
    results.unauthenticated_denial = "PASS";
  } else {
    results.unauthenticated_denial = "FAIL";
  }
  process.stdout.write(
    `LIVE_F unauthenticated_denial=${results.unauthenticated_denial} http=${unauth.http} code=${String(unauthRes.code || "none")}\n`,
  );
  if (results.unauthenticated_denial !== "PASS") {
    fail("unauthenticated_denial expected code=unauthenticated");
  }

  process.stdout.write(
    "LIVE_F waiting for owner Firebase client phone OTP on hardened local sign-in surface…\n",
  );
  const session = await waitForOwnerClientSession({ repoRoot: process.cwd() });
  if (session.uid !== expectedUid) fail("verified session UID did not match admission file");
  process.stdout.write("LIVE_F session_uid_matches_admission=true verified_id_token=true\n");
  const idToken = session.idToken;

  const registered = await callable("grinRegisterGoodsReceipt", payload, idToken);
  const reg = resultOf(registered.json);
  if (reg.ok !== true) {
    results.authenticated_success = "FAIL";
    process.stdout.write(
      `LIVE_F register_fail http=${registered.http} code=${String(reg.code || "none")}\n`,
    );
    fail("authenticated_success register failed");
  }
  results.authenticated_success = "PASS";
  const issued = reg.issuedNumber;
  const receiptId = String(reg.receiptId || RECEIPT);
  if (receiptId !== RECEIPT) fail("register returned unexpected receiptId");
  if (issued == null) fail("register missing issuedNumber");

  if (reg.confirmed && typeof reg.confirmed === "object") {
    const confCheck = assertConfirmedProjection(reg.confirmed as Record<string, unknown>, {
      receiptId: RECEIPT,
      ownerUid: expectedUid,
    });
    if (!confCheck.ok) {
      results.confirmation = "FAIL";
      fail(`confirmation invalid: ${confCheck.reason}`);
    }
    results.confirmation = "PASS";
  }

  process.stdout.write(
    `LIVE_F authenticated_success=PASS replayed=${String(reg.replayed)} issued_present=true receipt_ok=true\n`,
  );

  const replayed = await callable("grinRegisterGoodsReceipt", payload, idToken);
  const rep = resultOf(replayed.json);
  if (
    assertReplayPreservesIssuance(
      { ok: true, issuedNumber: issued, receiptId: RECEIPT },
      rep,
    )
  ) {
    results.register_replay = "PASS";
  } else {
    results.register_replay = "FAIL";
    fail("register_replay failed: must preserve issuedNumber and receiptId");
  }
  process.stdout.write(
    "LIVE_F register_replay=PASS preserved_issuedNumber=true preserved_receiptId=true no_duplicate_issuance=true\n",
  );

  const pdf = new Uint8Array(32);
  pdf.set([0x25, 0x50, 0x44, 0x46]);
  pdf.fill(0x41, 4);
  const sha = createHash("sha256").update(pdf).digest("hex");
  const reservedCall = await callable(
    "grinReserveEvidence",
    {
      evidenceId: EVIDENCE,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha,
      claimedByteSize: pdf.byteLength,
    },
    idToken,
  );
  const reserved = resultOf(reservedCall.json);
  if (reserved.ok !== true || typeof reserved.storagePath !== "string") {
    results.upload_verification = "FAIL";
    process.stdout.write(`LIVE_F reserve_fail code=${String(reserved.code || "none")}\n`);
    fail("reserveEvidence failed");
  }
  const began = await callable(
    "grinBeginEvidenceUpload",
    { evidenceId: EVIDENCE, ledgerId: LEDGER, receiptId: RECEIPT },
    idToken,
  );
  if (resultOf(began.json).ok !== true) {
    results.upload_verification = "FAIL";
    fail("beginEvidenceUpload failed");
  }
  const objectName = encodeURIComponent(String(reserved.storagePath));
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${objectName}`;
  const put = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Firebase ${idToken}`,
      "Content-Type": "application/pdf",
    },
    body: Buffer.from(pdf),
  });
  if (!put.ok) {
    results.upload_verification = "FAIL";
    process.stdout.write(`LIVE_F storage_put_http=${put.status}\n`);
    fail("storage PUT failed");
  }
  const uploadedCall = await callable(
    "grinUploadEvidence",
    { evidenceId: EVIDENCE, ledgerId: LEDGER, receiptId: RECEIPT },
    idToken,
  );
  const uploaded = resultOf(uploadedCall.json);
  if (uploaded.ok !== true || uploaded.originalDurable !== true || uploaded.actualSha256 !== sha) {
    results.upload_verification = "FAIL";
    process.stdout.write(`LIVE_F upload_fail code=${String(uploaded.code || "none")}\n`);
    fail("uploadEvidence verify failed");
  }
  results.upload_verification = "PASS";
  process.stdout.write("LIVE_F upload_verification=PASS original_durable=true\n");

  const readCall = await callable(
    "grinReadGoodsReceipt",
    { ledgerId: LEDGER, receiptId: RECEIPT },
    idToken,
  );
  const read = resultOf(readCall.json);
  if (read.ok !== true) {
    results.read_export = "FAIL";
    fail("authorized readReceipt failed");
  }
  const confirmed = (read.confirmed || {}) as Record<string, unknown>;
  const confCheck = assertConfirmedProjection(confirmed, {
    receiptId: RECEIPT,
    ownerUid: expectedUid,
  });
  if (!confCheck.ok) {
    results.confirmation = "FAIL";
    fail(`read confirmation invalid: ${confCheck.reason}`);
  }
  results.confirmation = "PASS";

  // Evidence linkage: events or confirmed projection should reference the receipt;
  // originals pathway is verified via durable upload above.
  const events = Array.isArray(confirmed.events) ? confirmed.events : [];
  process.stdout.write(
    `LIVE_F confirmation=PASS eventVersion_present=${confirmed.eventVersion != null} headHash_present=${typeof confirmed.headHash === "string"} events=${events.length}\n`,
  );

  const pack = assembleEvidencePackInputs({
    ownerUid: expectedUid,
    ledgerId: LEDGER,
    purchaseCaseId: "case_pilot_live",
    confirmedCuts: [
      {
        receiptId: String(confirmed.receiptId || RECEIPT),
        events: events as never[],
        originalSnapshot: confirmed.original as never,
        eventVersion: confirmed.eventVersion as never,
        headHash: confirmed.headHash as never,
      },
    ],
    originals: [
      {
        evidenceId: EVIDENCE,
        ownerUid: expectedUid,
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        byteSize: pdf.byteLength,
        rawSha256: sha,
        generation: String(uploaded.generation),
        originalFileName: "pilot.pdf",
        state: "verified",
      },
    ],
  });
  if (pack.originalBytesBundled !== false || pack.packPayloadKind !== "manifest_and_hashes") {
    results.read_export = "FAIL";
    fail("local manifest assembly unexpected shape");
  }
  // Narrow proof: authorized read + local manifest assembly. Not production PDF/export.
  results.read_export = "NARROW";
  process.stdout.write(
    "LIVE_F read_export=NARROW proof=authorized_read_plus_local_manifest_assembly not_production_pdf_export\n",
  );
  process.stdout.write("LIVE_F synthetic_usage_consumed=1_register_issuance_plus_evidence_path\n");

  const line = Object.entries(results)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  process.stdout.write(`LIVE_F DONE ${line}\n`);
  const hardFail = Object.entries(results).some(
    ([k, v]) => v === "FAIL" && k !== "cross_owner_denial" && k !== "non_admitted_denial",
  );
  if (hardFail) fail("one or more required scenarios failed");
  if (
    results.authenticated_success !== "PASS" ||
    results.register_replay !== "PASS" ||
    results.upload_verification !== "PASS" ||
    results.confirmation !== "PASS" ||
    (results.read_export !== "PASS" && results.read_export !== "NARROW")
  ) {
    fail("authenticated scenarios incomplete");
  }
}

main().catch((err) => {
  process.stderr.write(`LIVE_F ABORT: ${err instanceof Error ? err.message : "unknown"}\n`);
  process.exit(1);
});
