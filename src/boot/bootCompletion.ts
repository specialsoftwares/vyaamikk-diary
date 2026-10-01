/**
 * Boot completion coordination — extracted so routing permission can be tested
 * without mounting React Native.
 *
 * Presentation timeouts are not permission to navigate. Destinations are bound
 * to the current boot attempt and session UID+generation from
 * `syncSessionOwnership`. Label: EXTRACTED_RUNTIME (not mounted React, not native).
 */

import type { Href } from "expo-router";

import { getAuthEntryHref } from "@/config/authWrapper";
import {
  BOOT_ANIMATION_MS,
  BOOT_REDUCED_MOTION_MS,
} from "@/config/brandMotion";
import type { SyncSessionToken } from "@/sync/syncSessionOwnership";
import type {
  BootComposerDraftContinuation,
  BootDestination,
  BootRouteInput,
} from "@/boot/resolveBootRoute";

export type BootOwner =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "signed_in"; uid: string; generation: number };

export type BootCompletionAction =
  | { type: "none" }
  | { type: "navigate"; href: Href }
  | { type: "show_continuation"; continuation: BootComposerDraftContinuation }
  | { type: "hide_continuation" }
  | { type: "resolver_failed" };

export function bootOwnerFromAuth(
  status: "loading" | "signed_out" | "signed_in",
  uid: string | null,
  session: SyncSessionToken | null
): BootOwner | null {
  if (status === "loading") return { kind: "loading" };
  if (status !== "signed_in" || !uid) return { kind: "signed_out" };
  if (!session || session.uid !== uid) return null;
  return { kind: "signed_in", uid, generation: session.generation };
}

export function ownersEqual(a: BootOwner | null, b: BootOwner | null): boolean {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "signed_in" && b.kind === "signed_in") {
    return a.uid === b.uid && a.generation === b.generation;
  }
  return true;
}

/** Local DB failure is a visible terminal path — never a manufactured route. */
export function shouldShowLocalDbFailure(dbStatus: string): boolean {
  return dbStatus === "failed";
}

export function computeBootReady(args: {
  dbStatus: string;
  authStatus: string;
  owner: BootOwner | null;
}): boolean {
  if (shouldShowLocalDbFailure(args.dbStatus)) return false;
  if (args.dbStatus !== "ready") return false;
  if (args.authStatus === "loading") return false;
  return args.owner != null && args.owner.kind !== "loading";
}

export function computeRouteResolved(args: {
  destinationReady: boolean;
  sequenceHoldDone: boolean;
  routeFailed: boolean;
}): boolean {
  return args.destinationReady && args.sequenceHoldDone && !args.routeFailed;
}

export function sequenceHoldDurationMs(reducedMotion: boolean): number {
  return reducedMotion ? BOOT_REDUCED_MOTION_MS : BOOT_ANIMATION_MS;
}

/**
 * Production BootAnimationGate callbacks — both are presentation signals,
 * not permission to invent a destination.
 */
export function createBootGateCompleters(machine: {
  tryComplete: () => BootCompletionAction;
}): {
  onExitComplete: () => BootCompletionAction;
  onHoldTimeout: () => BootCompletionAction;
} {
  const onPresentationSignal = (): BootCompletionAction => machine.tryComplete();
  return {
    onExitComplete: onPresentationSignal,
    onHoldTimeout: onPresentationSignal,
  };
}

function destinationCompatible(dest: BootDestination, owner: BootOwner): boolean {
  if (owner.kind === "loading") return false;
  if (dest.kind === "draft_continuation") {
    return owner.kind === "signed_in" && dest.continuation.userId === owner.uid;
  }
  if (owner.kind === "signed_out") {
    return dest.href === getAuthEntryHref();
  }
  return owner.kind === "signed_in";
}

export function createBootCompletionMachine() {
  let attemptSeq = 0;
  let liveAttempt = 0;
  let currentOwner: BootOwner | null = null;
  let pending: { attemptId: number; owner: BootOwner; dest: BootDestination } | null =
    null;
  let navigated = false;
  let continuation: BootComposerDraftContinuation | null = null;
  let routeFailed = false;

  function retireLiveWork(): void {
    liveAttempt = 0;
    pending = null;
    continuation = null;
    routeFailed = false;
  }

  function applyPending(): BootCompletionAction {
    if (navigated) return { type: "none" };
    if (!currentOwner || currentOwner.kind === "loading") return { type: "none" };
    if (!pending || pending.attemptId !== liveAttempt) return { type: "none" };
    if (!ownersEqual(pending.owner, currentOwner)) return { type: "none" };
    if (!destinationCompatible(pending.dest, currentOwner)) return { type: "none" };
    const dest = pending.dest;
    pending = null;
    if (dest.kind === "draft_continuation") {
      continuation = dest.continuation;
      return { type: "show_continuation", continuation: dest.continuation };
    }
    navigated = true;
    continuation = null;
    return { type: "navigate", href: dest.href };
  }

  return {
    liveAttemptId(): number {
      return liveAttempt;
    },
    hasPendingDestination(): boolean {
      return Boolean(pending && pending.attemptId === liveAttempt);
    },
    isNavigated(): boolean {
      return navigated;
    },
    isRouteFailed(): boolean {
      return routeFailed;
    },
    continuation(): BootComposerDraftContinuation | null {
      return continuation;
    },
    owner(): BootOwner | null {
      return currentOwner;
    },

    observeOwner(next: BootOwner | null): BootCompletionAction {
      if (ownersEqual(currentOwner, next)) {
        currentOwner = next;
        return { type: "none" };
      }
      const hadContinuation = continuation != null;
      retireLiveWork();
      currentOwner = next;
      if (hadContinuation) return { type: "hide_continuation" };
      return { type: "none" };
    },

    /**
     * Resolve for this owner. Cancellation of a previous call does not latch
     * forever — a later call starts a new attempt. Late results are ignored.
     */
    async resolveForOwner(
      owner: BootOwner,
      input: BootRouteInput,
      resolve: (next: BootRouteInput) => Promise<BootDestination>
    ): Promise<BootCompletionAction> {
      if (navigated) return { type: "none" };
      if (owner.kind === "loading") return { type: "none" };
      if (!ownersEqual(owner, currentOwner)) return { type: "none" };

      attemptSeq += 1;
      const attemptId = attemptSeq;
      liveAttempt = attemptId;
      pending = null;
      routeFailed = false;

      try {
        const dest = await resolve(input);
        if (attemptId !== liveAttempt) return { type: "none" };
        if (!ownersEqual(owner, currentOwner)) return { type: "none" };
        if (!destinationCompatible(dest, owner)) {
          routeFailed = true;
          return { type: "resolver_failed" };
        }
        pending = { attemptId, owner, dest };
        return { type: "none" };
      } catch {
        if (attemptId !== liveAttempt) return { type: "none" };
        routeFailed = true;
        pending = null;
        return { type: "resolver_failed" };
      }
    },

    /** Presentation timeout or animation exit — never invents a destination. */
    tryComplete(): BootCompletionAction {
      return applyPending();
    },

    continuationBelongsToCurrent(expectedUserId: string): boolean {
      if (navigated) return false;
      if (!continuation || continuation.userId !== expectedUserId) return false;
      if (!currentOwner || currentOwner.kind !== "signed_in") return false;
      return currentOwner.uid === continuation.userId;
    },

    takeContinuationNavigation(href: Href): BootCompletionAction {
      if (navigated) return { type: "none" };
      if (!continuation) return { type: "none" };
      if (!this.continuationBelongsToCurrent(continuation.userId)) {
        continuation = null;
        return { type: "hide_continuation" };
      }
      navigated = true;
      continuation = null;
      return { type: "navigate", href };
    },
  };
}

export type BootCompletionMachine = ReturnType<typeof createBootCompletionMachine>;
