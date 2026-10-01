/**
 * Firebase JS httpsCallable GrinServerCommandPort.
 *
 * INJECTED transport. Not the tools/goods-evidence-emulator INJECTED adapter.
 * Do not import this module from functions/src/index.ts.
 */

import { getFunctions, httpsCallable } from "firebase/functions";

import { env } from "@/config/env";
import { getFirebaseApp, getFirebaseAuth } from "@/config/firebase";
import type { GrinMutationResult, GrinReconcileResult, GrinRegisterResult } from "@/goodsEvidence/ports";
import { canonicalFunctionsRegion } from "@/services/auth/authFlowErrorPresentation";
import type {
  GrinMutationEnvelope,
  GrinRegisterEnvelope,
  GrinServerCommandPort,
} from "@/services/grin/outbox/ports";

import {
  GRIN_MUTATE_CALLABLE,
  GRIN_RECONCILE_CALLABLE,
  GRIN_REGISTER_CALLABLE,
  type GrinHttpsCallablePayload,
  type GrinHttpsReconcilePayload,
} from "./callableNames";

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

function isUnauthenticatedCallableError(err: unknown): boolean {
  if (err == null || typeof err !== "object" || !("code" in err)) return false;
  return String((err as { code: unknown }).code).includes("unauthenticated");
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
    }): Promise<GrinRegisterResult> {
      const authz = ownerMatchesAuth(deps.currentAuth(), input.uid);
      if (!authz.ok) return authz.result;
      const payload: GrinHttpsCallablePayload = {
        envelope: input.envelope,
        digest: input.digest,
      };
      try {
        return (await deps.call(GRIN_REGISTER_CALLABLE, payload)) as GrinRegisterResult;
      } catch (err) {
        if (isUnauthenticatedCallableError(err)) return deny("unauthenticated");
        throw err;
      }
    },
    async reconcile(input: {
      uid: string;
      ledgerId: string;
      commandId: string;
    }): Promise<GrinReconcileResult> {
      const authz = ownerMatchesAuth(deps.currentAuth(), input.uid);
      if (!authz.ok) return authz.result;
      const payload: GrinHttpsReconcilePayload = {
        ledgerId: input.ledgerId,
        commandId: input.commandId,
      };
      try {
        return (await deps.call(GRIN_RECONCILE_CALLABLE, payload)) as GrinReconcileResult;
      } catch (err) {
        if (isUnauthenticatedCallableError(err)) return deny("unauthenticated");
        throw err;
      }
    },
    async mutate(input: {
      uid: string;
      envelope: GrinMutationEnvelope;
      digest: string;
    }): Promise<GrinMutationResult> {
      const authz = ownerMatchesAuth(deps.currentAuth(), input.uid);
      if (!authz.ok) return authz.result;
      const payload: GrinHttpsCallablePayload = {
        envelope: input.envelope,
        digest: input.digest,
      };
      try {
        return (await deps.call(GRIN_MUTATE_CALLABLE, payload)) as GrinMutationResult;
      } catch (err) {
        if (isUnauthenticatedCallableError(err)) return deny("unauthenticated");
        throw err;
      }
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
