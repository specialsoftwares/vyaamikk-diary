/**
 * Proposed consent Firestore rules against the serving baseline.
 * Owner may listen to processingPurposes/crash_diagnostics. Foreign reads and
 * every client write stay denied. The purpose queue reaches native-enabled only
 * when that listener reports server health after the callable acknowledges.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type Firestore,
} from "firebase/firestore";

import { purposeTransition } from "../../../functions/src/privacy/processingPurposeState";
import {
  createPurposeConsentQueue,
  PROCESSING_NOTICE_VERSION,
  PROCESSING_POLICY_VERSION,
  type PurposeQueueState,
  type PurposeServerState,
} from "./purposeConsentQueue";
import {
  crashConsentStatus,
  crashReportingActive,
} from "../telemetry/crashConsentState";
import {
  __resetCrashReportingForTests,
  __setCrashlyticsClientForTests,
  setCrashReportingEnabled,
} from "../telemetry/crashReporter";
import {
  __resetCrashSdkBridgeForTests,
  __setCrashSdkBridgeForTests,
} from "../telemetry/crashNativeCollection";
import { resetDiagnosticsPreferenceForTests } from "../telemetry/diagnosticsPreference";

const PROPOSED = resolve(process.cwd(), "docs/release/rules-compat/proposed-consent/firestore.rules");
const SERVING = resolve(process.cwd(), "docs/release/rules-compat/proposed-grin/firestore.rules");
const PROPOSED_SHA = "d5127a7696118be13e73f328d5bc6dae975c903762a1e1661bfa507ced56c10d";
const SERVING_SHA = "551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b";

const OWNER = "owner-a";
const OTHER = "owner-b";
const PURPOSE = "crash_diagnostics";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function purposeRef(db: Firestore, uid: string) {
  return doc(db, "users", uid, "processingPurposes", PURPOSE);
}

async function waitFor<T>(predicate: () => T | null | undefined, label: string): Promise<T> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(label);
}

async function main(): Promise<void> {
  const proposedText = readFileSync(PROPOSED, "utf8");
  const servingText = readFileSync(SERVING, "utf8");
  assert.equal(sha256(servingText), SERVING_SHA);
  assert.equal(sha256(proposedText), PROPOSED_SHA);
  assert.equal(proposedText.includes("match /processingPurposes/{purposeId}"), true);
  assert.equal(proposedText.includes("grinEvidenceObjectKeys"), true);
  assert.equal(proposedText.includes("match /deletionJobs/{uid}"), true);
  assert.equal(proposedText.includes("match /emailBindings/{emailHash}"), true);
  assert.equal(servingText.includes("match /processingPurposes/{purposeId}"), false);

  const env: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: "demo-vyaamikk-processing-purpose-rules",
    firestore: { rules: proposedText, host: "127.0.0.1", port: 8080 },
  });

  let queue: ReturnType<typeof createPurposeConsentQueue> | null = null;
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore();
      await setDoc(doc(admin, "users", OWNER), { status: "active", uid: OWNER });
      await setDoc(doc(admin, "users", OTHER), { status: "active", uid: OTHER });
      await setDoc(purposeRef(admin, OWNER), {
        decision: "grant",
        revision: 1,
        receivedAt: 1000,
        noticeVersion: PROCESSING_NOTICE_VERSION,
        policyVersion: PROCESSING_POLICY_VERSION,
      });
    });

    const ownerDb = env.authenticatedContext(OWNER).firestore();
    const otherDb = env.authenticatedContext(OTHER).firestore();
    const anonDb = env.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(purposeRef(ownerDb, OWNER)));
    await assertFails(getDoc(purposeRef(otherDb, OWNER)));
    await assertFails(getDoc(purposeRef(anonDb, OWNER)));
    await assertFails(
      setDoc(purposeRef(ownerDb, OWNER), {
        decision: "withdraw",
        revision: 2,
        receivedAt: 2000,
      })
    );
    await assertFails(
      setDoc(doc(ownerDb, "users", OWNER, "processingPurposeEvents", "op1"), {
        purpose: PURPOSE,
        decision: "grant",
      })
    );

    __resetCrashReportingForTests();
    __resetCrashSdkBridgeForTests();
    resetDiagnosticsPreferenceForTests();
    const preference = { enabled: false as boolean | null };
    const session = { enabled: false, ownerUid: null as string | null, consentRevision: null as number | null };
    __setCrashlyticsClientForTests({
      setCrashlyticsCollectionEnabled: async (enabled: boolean) => {
        preference.enabled = enabled;
      },
      isCrashlyticsCollectionEnabled: async () => preference.enabled === true,
      log: async () => undefined,
      recordError: async () => undefined,
      setAttribute: async () => undefined,
      setUserId: async () => undefined,
      checkForUnsentReports: async () => false,
      sendUnsentReports: async () => undefined,
      deleteUnsentReports: async () => undefined,
      crash: () => undefined,
    });
    __setCrashSdkBridgeForTests({
      setSessionReportingEnabled: async (enabled, ownerUid, consentRevision) => {
        session.enabled = enabled;
        session.ownerUid = ownerUid ?? null;
        session.consentRevision = consentRevision ?? null;
      },
      deleteUnsentReports: async () => undefined,
    });

    const disk = new Map<string, PurposeQueueState>();
    let remote = {
      revision: 0,
      decision: null as "grant" | "withdraw" | null,
      receivedAt: null as number | null,
    };
    const events = new Set<string>();
    let generation = 1;
    let operations = 0;
    let stopListen: (() => void) | null = null;
    let listenerHealth: "none" | "listening" | "server" | "failed" = "none";

    queue = createPurposeConsentQueue({
      load: async (uid) => disk.get(uid) ?? null,
      save: async (state) => {
        disk.set(state.uid, structuredClone(state));
      },
      generation: () => generation,
      operationId: () => `operation_${++operations}`,
      applyLocal: (enabled, options) => setCrashReportingEnabled(enabled, options),
      async send(input) {
        if ("action" in input) return { ok: true as const, ...remote };
        const transition = purposeTransition(
          remote,
          { ...input, alreadyReceived: events.has(input.operationId) },
          Date.now()
        );
        if (transition.apply) {
          events.add(input.operationId);
          remote = transition.state;
          await env.withSecurityRulesDisabled(async (context) => {
            await setDoc(purposeRef(context.firestore(), input.uid), {
              decision: remote.decision,
              revision: remote.revision,
              receivedAt: remote.receivedAt,
              noticeVersion: PROCESSING_NOTICE_VERSION,
              policyVersion: PROCESSING_POLICY_VERSION,
            });
          });
        }
        return { ok: true as const, ...remote, conflict: transition.conflict };
      },
      observeRemote(uid, _generation, onRemote, onHealth) {
        stopListen?.();
        listenerHealth = "none";
        const db = env.authenticatedContext(uid).firestore();
        stopListen = onSnapshot(
          purposeRef(db, uid),
          { includeMetadataChanges: true },
          (snap) => {
            // Emulator snapshots can briefly report fromCache; a successful
            // authorized listen still reaches a non-cache metadata event.
            if (snap.metadata.fromCache !== true) {
              listenerHealth = "server";
              onHealth("server");
            }
            const data = snap.data();
            if (!data || snap.metadata.fromCache) return;
            if (data.decision !== "grant" && data.decision !== "withdraw") return;
            onRemote({
              ok: true,
              revision: Number(data.revision) || 0,
              decision: data.decision,
              receivedAt: typeof data.receivedAt === "number" ? data.receivedAt : null,
            } satisfies PurposeServerState);
          },
          () => {
            listenerHealth = "failed";
            onHealth("failed");
          }
        );
        listenerHealth = "listening";
        onHealth("listening");
        return () => {
          stopListen?.();
          stopListen = null;
        };
      },
    });

    queue.bind(OWNER);
    await waitFor(() => (listenerHealth === "server" ? true : null), "authorized listener reaches server");
    await queue.choose(OWNER, true);
    await waitFor(() => {
      const state = queue?.state(OWNER);
      return state &&
        crashConsentStatus(state.consent) === "active" &&
        crashReportingActive(state.consent) &&
        state.consent?.acknowledgement?.decision === "allow"
        ? state
        : null;
    }, "allow becomes acknowledged and native-active");
    assert.equal(session.enabled, true);
    assert.equal(preference.enabled, false);

    await queue.choose(OWNER, false);
    await waitFor(() => {
      const state = queue?.state(OWNER);
      return state && state.consent?.choice.decision === "withdraw" && state.consent.native === "disabled"
        ? state
        : null;
    }, "withdrawal stops reporting");
    assert.equal(session.enabled, false);
    assert.equal(crashReportingActive(queue.state(OWNER)?.consent ?? null), false);

    // Restart with the same account must not restore the withdrawn grant.
    queue.bind(null);
    generation += 1;
    queue.bind(OWNER);
    await waitFor(() => (listenerHealth === "server" ? true : null), "restart listener reaches server");
    await waitFor(() => (queue?.state(OWNER)?.consent?.choice.decision === "withdraw" ? true : null), "restart keeps withdraw");
    assert.equal(crashReportingActive(queue.state(OWNER)?.consent ?? null), false);
    assert.equal(session.enabled, false);

    // Account replacement must not revive the prior owner's allow.
    await queue.choose(OWNER, true);
    await waitFor(() => (crashReportingActive(queue?.state(OWNER)?.consent ?? null) ? true : null), "re-allow");
    assert.equal(session.enabled, true);
    queue.bind(OTHER);
    await waitFor(() => (listenerHealth === "server" ? true : null), "replacement listener reaches server");
    await waitFor(() => (session.enabled === false ? true : null), "replacement disables native");
    assert.equal(crashReportingActive(queue.state(OTHER)?.consent ?? null), false);
    assert.notEqual(queue.state(OTHER)?.consent?.choice.decision, "allow");

    console.log("processingPurposeRules.emulator.test.ts: ok");
  } finally {
    queue?.bind(null);
    await env.cleanup();
    __resetCrashReportingForTests();
    __resetCrashSdkBridgeForTests();
    resetDiagnosticsPreferenceForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
