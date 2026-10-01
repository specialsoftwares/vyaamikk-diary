/**
 * Firebase JS httpsCallable GrinServerCommandPort.
 *
 * INJECTED transport. Not the tools/goods-evidence-emulator INJECTED adapter.
 * Do not import this module from functions/src/index.ts.
 * Remote payloads are parsed before acceptance. Auth is rechecked after awaits.
 */

import { getFunctions, httpsCallable } from "firebase/functions";

import { env } from "@/config/env";
import { getFirebaseApp, getFirebaseAuth } from "@/config/firebase";
import type { GrinDeny, GrinReceiptReadResult } from "@/goodsEvidence/ports";
import { canonicalFunctionsRegion } from "@/services/auth/authFlowErrorPresentation";
import type {
  GrinMutationEnvelope,
  GrinRegisterEnvelope,
  GrinServerCommandPort,
} from "@/services/grin/outbox/ports";

import {
  GRIN_MUTATE_CALLABLE,
  GRIN_READ_CALLABLE,
  GRIN_RECONCILE_CALLABLE,
  GRIN_REGISTER_CALLABLE,
  type GrinHttpsCallablePayload,
  type GrinHttpsReadPayload,
  type GrinHttpsReconcilePayload,
} from "./callableNames";
import {
  mapCallableFailure,
  parseGrinMutationResult,
  parseGrinReceiptReadResult,
  parseGrinReconcileResult,
  parseGrinRegisterResult,
  type GrinRemoteMutationResult,
  type GrinRemoteReconcileResult,
  type GrinRemoteRegisterResult,
} from "./parseRemote";

const GENERIC_DENY = "denied" as const;

export type GrinAuthSnapshot = { uid: string } | null;

export type GrinHttpsCallableInvoker = (name: string, data: unknown) => Promise<unknown>;

export type FirebaseGrinTransportDeps = {
  call: GrinHttpsCallableInvoker;
  currentAuth: () => GrinAuthSnapshot;
};

export type FirebaseGrinTransport = GrinServerCommandPort & {
  portKind: "INJECTED";
  transportKind: "FIREBASE_JS_HTTPS_CALLABLE";
  compositionLabel: "not live deploy";
  mutate: NonNullable<GrinServerCommandPort["mutate"]>;
  readReceipt(input: {
    uid: string;
    ledgerId: string;
    receiptId: string;
  }): Promise<GrinReceiptReadResult>;
};

function deny(code: "unauthenticated" | "forbidden"): {
  ok: false;
  code: typeof code;
  detail: typeof GENERIC_DENY;
} {
  return { ok: false, code, detail: GENERIC_DENY };
}

function ownerMatchesAuth(
  current: GrinAuthSnapshot,
  ownerUid: string
): { ok: true; uid: string } | { ok: false; result: { ok: false; code: "unauthenticated" | "forbidden"; detail: "denied" } } {
  if (current == null || current.uid.length === 0) {
    return { ok: false, result: deny("unauthenticated") };
  }
  if (current.uid !== ownerUid) {
    return { ok: false, result: deny("forbidden") };
  }
  return { ok: true, uid: current.uid };
}

async function invokeCallable(
  deps: FirebaseGrinTransportDeps,
  ownerUid: string,
  name: string,
  payload: unknown
): Promise<{ ok: true; raw: unknown } | { ok: false; result: ReturnType<typeof deny> | GrinDeny }> {
  const before = ownerMatchesAuth(deps.currentAuth(), ownerUid);
  if (!before.ok) return before;
  let raw: unknown;
  try {
    raw = await deps.call(name, payload);
  } catch (err) {
    const mapped = mapCallableFailure(err);
    if (mapped) return { ok: false, result: mapped };
    throw err;
  }
  const after = ownerMatchesAuth(deps.currentAuth(), ownerUid);
  if (!after.ok) return after;
  return { ok: true, raw };
}

export function createFirebaseGrinTransport(deps: FirebaseGrinTransportDeps): FirebaseGrinTransport {
  const port: FirebaseGrinTransport = {
    portKind: "INJECTED",
    transportKind: "FIREBASE_JS_HTTPS_CALLABLE",
    compositionLabel: "not live deploy",
    async register(input: {
      uid: string;
      envelope: GrinRegisterEnvelope;
      digest: string;
    }): Promise<GrinRemoteRegisterResult> {
      const payload: GrinHttpsCallablePayload = {
        envelope: input.envelope,
        digest: input.digest,
      };
      const invoked = await invokeCallable(deps, input.uid, GRIN_REGISTER_CALLABLE, payload);
      if (!invoked.ok) return invoked.result;
      return parseGrinRegisterResult(invoked.raw);
    },
    async reconcile(input: {
      uid: string;
      ledgerId: string;
      commandId: string;
    }): Promise<GrinRemoteReconcileResult> {
      const payload: GrinHttpsReconcilePayload = {
        ledgerId: input.ledgerId,
        commandId: input.commandId,
      };
      const invoked = await invokeCallable(deps, input.uid, GRIN_RECONCILE_CALLABLE, payload);
      if (!invoked.ok) return invoked.result;
      return parseGrinReconcileResult(invoked.raw);
    },
    async mutate(input: {
      uid: string;
      envelope: GrinMutationEnvelope;
      digest: string;
    }): Promise<GrinRemoteMutationResult> {
      const payload: GrinHttpsCallablePayload = {
        envelope: input.envelope,
        digest: input.digest,
      };
      const invoked = await invokeCallable(deps, input.uid, GRIN_MUTATE_CALLABLE, payload);
      if (!invoked.ok) return invoked.result;
      return parseGrinMutationResult(invoked.raw);
    },
    async readReceipt(input: {
      uid: string;
      ledgerId: string;
      receiptId: string;
    }): Promise<GrinReceiptReadResult> {
      const payload: GrinHttpsReadPayload = {
        ledgerId: input.ledgerId,
        receiptId: input.receiptId,
      };
      const invoked = await invokeCallable(deps, input.uid, GRIN_READ_CALLABLE, payload);
      if (!invoked.ok) return invoked.result;
      return parseGrinReceiptReadResult(invoked.raw);
    },
  };
  return port;
}

function defaultCall(name: string, data: unknown): Promise<unknown> {
  const region = canonicalFunctionsRegion(env.firebase.functionsRegion);
  const callable = httpsCallable(getFunctions(getFirebaseApp(), region || undefined), name);
  return callable(data).then((result) => result.data);
}

function defaultCurrentAuth(): GrinAuthSnapshot {
  const uid = getFirebaseAuth().currentUser?.uid;
  return uid ? { uid } : null;
}

/**
 * Production-shaped JS client wiring. Callables remain unexported / undeployed.
 * Tests should inject `createFirebaseGrinTransport` instead of this factory.
 */
export function createFirebaseJsGrinTransport(): FirebaseGrinTransport {
  return createFirebaseGrinTransport({
    call: defaultCall,
    currentAuth: defaultCurrentAuth,
  });
}
