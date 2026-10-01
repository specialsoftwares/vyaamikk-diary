/**
 * Boot completion coordination — extracted so routing permission can be tested
 * without mounting React Native.
 *
 * Presentation timeouts are not permission to navigate. Destinations and
 * continuation actions are bound to the live session UID+generation from
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

/** Existing signed-in destinations used by Later / View Drafts — not new routes. */
export const BOOT_LATER_HREF = "/(app)/(tabs)/you" as Href;
export const BOOT_VIEW_DRAFTS_HREF = "/(app)/drafts" as Href;

export type BootOwner =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "signed_in"; uid: string; generation: number };

export type BootLiveSnapshot = {
  owner: BootOwner | null;
  dbStatus: string;
  authStatus: string;
};

/** Immutable handle for Continue/Later/View Drafts — not the live sheet pointer. */
export type ContinuationTicket = {
  attemptId: number;
  owner: Extract<BootOwner, { kind: "signed_in" }>;
  continuation: BootComposerDraftContinuation;
};

export type BootCompletionAction =
  | { type: "none" }
  | { type: "navigate"; href: Href; owner: BootOwner }
  | { type: "show_continuation"; ticket: ContinuationTicket }
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

/** Animation overlay must not cover Retry; bootError hides the gate. */
export function bootOverlayShouldMount(args: {
  visible: boolean;
  bootError: boolean;
}): boolean {
  return args.visible && !args.bootError;
}

/** Fonts may wait on the brand surface; they must not block ready routing or retry. */
export function bootFontsMayBlockProgress(args: {
  fontsLoaded: boolean;
  canEnterApp: boolean;
  bootError: boolean;
}): boolean {
  if (args.bootError || args.canEnterApp) return false;
  return !args.fontsLoaded;
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

function snapshotContinuation(
  continuation: BootComposerDraftContinuation
): BootComposerDraftContinuation {
  return {
    userId: continuation.userId,
    draftId: continuation.draftId,
    scopeKey: continuation.scopeKey,
    entryId: continuation.entryId,
    updatedAt: continuation.updatedAt,
    composerHref: continuation.composerHref,
    recordLabelKey: continuation.recordLabelKey,
  };
}

export function createBootCompletionMachine(options?: {
  live?: () => BootLiveSnapshot;
}) {
  let attemptSeq = 0;
  let liveAttempt = 0;
  let currentOwner: BootOwner | null = null;
  let pending: { attemptId: number; owner: BootOwner; dest: BootDestination } | null =
    null;
  let navigated = false;
  let continuation: BootComposerDraftContinuation | null = null;
  let shownTicket: ContinuationTicket | null = null;
  let routeFailed = false;

  function defaultLive(): BootLiveSnapshot {
    const owner = currentOwner;
    const authStatus =
      owner?.kind === "loading"
        ? "loading"
        : owner?.kind === "signed_in"
          ? "signed_in"
          : "signed_out";
    return { owner, dbStatus: "ready", authStatus };
  }

  const readLive = options?.live ?? defaultLive;

  function retireLiveWork(): void {
    liveAttempt = 0;
    pending = null;
    continuation = null;
    shownTicket = null;
    routeFailed = false;
  }

  function liveAllowsNavigation(expected: BootOwner): boolean {
    const snap = readLive();
    if (!computeBootReady(snap)) return false;
    if (!ownersEqual(expected, snap.owner)) return false;
    return true;
  }

  function ticketStillOwns(ticket: ContinuationTicket): boolean {
    if (navigated) return false;
    if (!shownTicket) return false;
    if (ticket.attemptId !== shownTicket.attemptId) return false;
    if (ticket.attemptId !== liveAttempt) return false;
    if (!ownersEqual(ticket.owner, shownTicket.owner)) return false;
    if (ticket.continuation.draftId !== shownTicket.continuation.draftId) return false;
    if (ticket.continuation.userId !== shownTicket.continuation.userId) return false;
    if (!continuation) return false;
    if (continuation.draftId !== ticket.continuation.draftId) return false;
    if (continuation.userId !== ticket.owner.uid) return false;
    if (!liveAllowsNavigation(ticket.owner)) return false;
    return true;
  }

  function applyPending(): BootCompletionAction {
    if (navigated) return { type: "none" };
    if (!pending || pending.attemptId !== liveAttempt) return { type: "none" };
    if (!liveAllowsNavigation(pending.owner)) return { type: "none" };
    if (!destinationCompatible(pending.dest, pending.owner)) return { type: "none" };
    const dest = pending.dest;
    const owner = pending.owner;
    pending = null;
    if (dest.kind === "draft_continuation") {
      if (owner.kind !== "signed_in") return { type: "none" };
      continuation = snapshotContinuation(dest.continuation);
      shownTicket = {
        attemptId: liveAttempt,
        owner,
        continuation: snapshotContinuation(dest.continuation),
      };
      return { type: "show_continuation", ticket: shownTicket };
    }
    navigated = true;
    continuation = null;
    shownTicket = null;
    return { type: "navigate", href: dest.href, owner };
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
    shownTicket(): ContinuationTicket | null {
      return shownTicket;
    },
    owner(): BootOwner | null {
      return currentOwner;
    },

    observeOwner(next: BootOwner | null): BootCompletionAction {
      if (ownersEqual(currentOwner, next)) {
        currentOwner = next;
        return { type: "none" };
      }
      retireLiveWork();
      currentOwner = next;
      // Retire all previous presentation, including a failure surface, not only a sheet.
      return { type: "hide_continuation" };
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
      const start = readLive();
      if (!ownersEqual(owner, start.owner)) return { type: "none" };
      if (!ownersEqual(owner, currentOwner)) return { type: "none" };

      attemptSeq += 1;
      const attemptId = attemptSeq;
      liveAttempt = attemptId;
      pending = null;
      routeFailed = false;

      try {
        const dest = await resolve(input);
        if (attemptId !== liveAttempt) return { type: "none" };
        const after = readLive();
        if (!ownersEqual(owner, after.owner)) return { type: "none" };
        if (!ownersEqual(owner, currentOwner)) return { type: "none" };
        if (!destinationCompatible(dest, owner)) {
          routeFailed = true;
          return { type: "resolver_failed" };
        }
        pending = { attemptId, owner, dest };
        return { type: "none" };
      } catch {
        if (attemptId !== liveAttempt) return { type: "none" };
        const after = readLive();
        if (!ownersEqual(owner, after.owner)) return { type: "none" };
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
      if (!shownTicket) return false;
      if (shownTicket.owner.uid !== expectedUserId) return false;
      return ticketStillOwns(shownTicket);
    },

    takeContinue(ticket: ContinuationTicket): BootCompletionAction {
      if (!ticketStillOwns(ticket)) return { type: "none" };
      const href = shownTicket!.continuation.composerHref;
      navigated = true;
      continuation = null;
      shownTicket = null;
      return { type: "navigate", href, owner: ticket.owner };
    },

    takeViewDrafts(ticket: ContinuationTicket): BootCompletionAction {
      if (!ticketStillOwns(ticket)) return { type: "none" };
      navigated = true;
      continuation = null;
      shownTicket = null;
      return { type: "navigate", href: BOOT_VIEW_DRAFTS_HREF, owner: ticket.owner };
    },

    async takeLater(
      ticket: ContinuationTicket,
      ports: {
        snooze: (userId: string) => Promise<void>;
        clearActiveRoute: (userId: string) => Promise<void>;
      }
    ): Promise<BootCompletionAction> {
      if (!ticketStillOwns(ticket)) return { type: "none" };
      await ports.snooze(ticket.continuation.userId);
      if (!ticketStillOwns(ticket)) return { type: "none" };
      await ports.clearActiveRoute(ticket.continuation.userId);
      if (!ticketStillOwns(ticket)) return { type: "none" };
      navigated = true;
      continuation = null;
      shownTicket = null;
      return { type: "navigate", href: BOOT_LATER_HREF, owner: ticket.owner };
    },
  };
}

export type BootCompletionMachine = ReturnType<typeof createBootCompletionMachine>;
