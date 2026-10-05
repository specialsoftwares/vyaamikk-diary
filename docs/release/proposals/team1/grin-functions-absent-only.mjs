#!/usr/bin/env node
/**
 * Fail-closed planner for mixed GRIN presence. Not authorization. Not live
 * deploy. Does not spawn firebase/gcloud. Does not set GRIN_OPS_ALLOW_LIVE.
 *
 * The guarded tool `docs/release/packets/grin-ops/grin-functions-op.mjs`
 * stays unchanged: mixed PRESENT/ABSENT remains stuck there until a later
 * owner-approved wiring of this planner into a separate command.
 */
import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import {
  GRIN_FUNCTIONS,
  PRESENCE_ABSENT,
  PRESENCE_PRESENT,
  PRESENCE_UNKNOWN,
  PROJECT_ID,
} from "../../packets/grin-ops/grin-functions-op.mjs";

export class AbsentOnlyAbort extends Error {
  constructor(message, code = 2) {
    super(message);
    this.name = "AbsentOnlyAbort";
    this.code = code;
  }
}

function abort(message, code = 2) {
  throw new AbsentOnlyAbort(message, code);
}

const JOURNAL_KEYS = Object.freeze([
  "op",
  "name",
  "presence",
  "revision_if_known",
  "firebase_hash_if_known",
  "at",
]);

const FORBIDDEN_JOURNAL_KEY = /env|token|secret|password|credential|authorization|gatevalue|dotenv/i;

export function classifyGrinInventory(fixture) {
  if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) {
    abort("inventory fixture must be an object with an entry per GRIN function");
  }
  const present = [];
  const absent = [];
  const unknown = [];
  for (const name of GRIN_FUNCTIONS) {
    const e = fixture[name];
    const presence = e && typeof e === "object" ? e.presence : null;
    if (presence === PRESENCE_PRESENT) present.push(name);
    else if (presence === PRESENCE_ABSENT) absent.push(name);
    else unknown.push(name);
  }
  return {
    present,
    absent,
    unknown,
    mixed: present.length > 0 && absent.length > 0 && unknown.length === 0,
    allAbsent: present.length === 0 && unknown.length === 0 && absent.length === GRIN_FUNCTIONS.length,
    allPresent: absent.length === 0 && unknown.length === 0 && present.length === GRIN_FUNCTIONS.length,
  };
}

/**
 * create-absent-only is only for mixed inspect: some PRESENT, some ABSENT,
 * zero UNKNOWN. All-absent stays on gate-off-initial. All-present is enable
 * territory. UNKNOWN blocks.
 */
export function assertCreateAbsentOnlyPlan(fixture) {
  const classified = classifyGrinInventory(fixture);
  if (classified.unknown.length) {
    abort(
      `UNKNOWN presence blocks create-absent-only (${classified.unknown.join(", ")}); inspect until complete`,
    );
  }
  if (classified.allAbsent) {
    abort("all seven ABSENT; use gate-off-initial, not create-absent-only (refuses all-seven retry via this path)");
  }
  if (classified.allPresent) {
    abort("all seven PRESENT; create-absent-only has nothing to create (enable/disable require a later approval)");
  }
  if (!classified.mixed) {
    abort("create-absent-only requires mixed PRESENT/ABSENT with zero UNKNOWN");
  }
  return classified;
}

export function buildFirebaseAbsentOnlyArgs(absentNames) {
  if (!Array.isArray(absentNames) || absentNames.length === 0) {
    abort("create-absent-only --only list is empty");
  }
  const seen = new Set();
  for (const name of absentNames) {
    if (!GRIN_FUNCTIONS.includes(name)) abort(`${name} is not a GRIN callable; refusing`);
    if (seen.has(name)) abort(`duplicate name in absent-only list: ${name}`);
    seen.add(name);
  }
  if (absentNames.length === GRIN_FUNCTIONS.length) {
    abort("absent-only list is all seven; refusing (that is gate-off-initial, not mixed-state resume)");
  }
  const only = absentNames.map((n) => `functions:${n}`).join(",");
  return ["deploy", "--project", PROJECT_ID, "--non-interactive", "--only", only];
}

export function firebaseAbsentOnlyIsUnsafe(args, allowedAbsent) {
  if (!Array.isArray(args) || !Array.isArray(allowedAbsent)) return true;
  const i = args.indexOf("--only");
  if (i < 0) return true;
  const value = args[i + 1] || "";
  if (value === "functions" || value === "functions:default") return true;
  const parts = value.split(",").filter(Boolean);
  if (parts.length === 0) return true;
  if (parts.length === GRIN_FUNCTIONS.length) return true;
  const allowed = new Set(allowedAbsent);
  for (const part of parts) {
    if (!part.startsWith("functions:")) return true;
    const name = part.slice("functions:".length);
    if (!GRIN_FUNCTIONS.includes(name)) return true;
    if (!allowed.has(name)) return true;
  }
  if (parts.length !== allowedAbsent.length) return true;
  return false;
}

export function planCreateAbsentOnly(fixture) {
  const classified = assertCreateAbsentOnlyPlan(fixture);
  const args = buildFirebaseAbsentOnlyArgs(classified.absent);
  if (firebaseAbsentOnlyIsUnsafe(args, classified.absent)) {
    abort("internal error: absent-only --only list is unsafe");
  }
  return {
    present: classified.present,
    absent: classified.absent,
    args,
    note: "PROPOSAL only. Not wired into grin-functions-op.mjs. No firebase spawn.",
  };
}

function assertJournalRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    abort("journal record must be a plain object");
  }
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_JOURNAL_KEY.test(key) || !JOURNAL_KEYS.includes(key)) {
      abort(`journal record has forbidden or unknown key ${key}`);
    }
    const value = record[key];
    if (value != null && typeof value === "object") {
      abort(`journal record ${key} must be a scalar (no env objects)`);
    }
  }
  if (typeof record.op !== "string" || !record.op) abort("journal op is required");
  if (typeof record.name !== "string" || !GRIN_FUNCTIONS.includes(record.name)) {
    abort("journal name must be a GRIN callable");
  }
  if (
    record.presence != null &&
    record.presence !== PRESENCE_PRESENT &&
    record.presence !== PRESENCE_ABSENT &&
    record.presence !== PRESENCE_UNKNOWN
  ) {
    abort("journal presence must be present, absent, unknown, or omitted");
  }
}

/**
 * Append one JSON line. Operator supplies an existing directory.
 * Does not print or persist env values, tokens, or secret names.
 */
export function appendJournalLine(journalDir, record) {
  if (!journalDir || typeof journalDir !== "string") abort("GRIN_OPS_JOURNAL_DIR is required");
  const dir = resolve(journalDir);
  if (!isAbsolute(dir)) abort("journal dir must be absolute");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    abort("journal dir missing; operator must create it (planner will not mkdir for live ops)");
  }
  assertJournalRecord(record);
  const line = {
    op: record.op,
    name: record.name,
    presence: record.presence ?? null,
    revision_if_known: record.revision_if_known ?? null,
    firebase_hash_if_known: record.firebase_hash_if_known ?? null,
    at: record.at || new Date().toISOString(),
  };
  const path = join(dir, "grin-ops-journal.jsonl");
  const text = `${JSON.stringify(line)}\n`;
  if (!existsSync(path)) writeFileSync(path, text, { mode: 0o600 });
  else appendFileSync(path, text);
  return path;
}

/** Test helper only: create a 0700 journal dir under os tmp-style paths. */
export function createJournalDirForTests(parent) {
  if (!parent || !isAbsolute(parent)) abort("test journal parent must be absolute");
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  return parent;
}

export { JOURNAL_KEYS, FORBIDDEN_JOURNAL_KEY };
