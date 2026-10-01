/**
 * Production boot-screen coordination.
 * Surfaces (animation gate, draft sheet, retry, native splash/router) are injected
 * so Node tests can mount the same wiring with inert replacements.
 * Label: production screen wiring — not native rendering.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Href } from "expo-router";

import type { BootAnimationGateProps } from "@/boot/BootAnimationGate";
import type { BootDraftContinuationSheetProps } from "@/boot/BootDraftContinuationSheet";
import {
  bootOwnerFromAuth,
  computeBootReady,
  computeRouteResolved,
  createBootCompletionMachine,
  createBootGateCompleters,
  ownersEqual,
  sequenceHoldDurationMs,
  shouldShowLocalDbFailure,
  type BootCompletionAction,
  type BootLiveSnapshot,
  type ContinuationTicket,
} from "@/boot/bootCompletion";
import type {
  BootComposerDraftContinuation,
  BootDestination,
  BootRouteInput,
} from "@/boot/resolveBootRoute";
import type { UserProfile } from "@/domain/types";
import type { SyncSessionToken } from "@/sync/syncSessionOwnership";

export type BootScreenViewPorts = {
  authStatus: "loading" | "signed_out" | "signed_in";
  justCreated: boolean;
  user: UserProfile | null;
  dbStatus: string;
  dbErrorMessage?: string;
  reducedMotion: boolean;
  sequenceHoldMs?: number;
  captureSession: () => SyncSessionToken | null;
  resolveDestination: (input: BootRouteInput) => Promise<BootDestination>;
  snoozeDraft: (userId: string) => Promise<void>;
  clearActiveRoute: (userId: string) => Promise<void>;
  replaceRoute: (href: Href) => void;
  hideSplash: () => void;
  markNavigationSettled: () => void;
  t: (key: string) => string;
  schedule: (fn: () => void, ms: number) => () => void;
  renderDbFailure: (message?: string) => React.ReactNode;
  renderBackdrop: () => React.ReactNode;
  renderGate: (props: BootAnimationGateProps) => React.ReactNode;
  renderRetry: (props: { onPress: () => void; label: string }) => React.ReactNode;
  renderSheet: (props: BootDraftContinuationSheetProps) => React.ReactNode;
};

function liveSnapshot(ports: {
  authStatus: BootScreenViewPorts["authStatus"];
  dbStatus: string;
  user: UserProfile | null;
  captureSession: () => SyncSessionToken | null;
}): BootLiveSnapshot {
  return {
    owner: bootOwnerFromAuth(
      ports.authStatus,
      ports.user?.uid ?? null,
      ports.captureSession()
    ),
    dbStatus: ports.dbStatus,
    authStatus: ports.authStatus,
  };
}

export function BootScreenView({ ports }: { ports: BootScreenViewPorts }) {
  const livePortsRef = useRef(ports);
  livePortsRef.current = ports;

  const machineRef = useRef<ReturnType<typeof createBootCompletionMachine> | null>(
    null
  );
  if (!machineRef.current) {
    machineRef.current = createBootCompletionMachine({
      live: () =>
        liveSnapshot({
          authStatus: livePortsRef.current.authStatus,
          dbStatus: livePortsRef.current.dbStatus,
          user: livePortsRef.current.user,
          captureSession: livePortsRef.current.captureSession,
        }),
    });
  }

  const [phase, setPhase] = useState<"preparing" | "routing">("preparing");
  const [continuation, setContinuation] =
    useState<BootComposerDraftContinuation | null>(null);
  const [ticket, setTicket] = useState<ContinuationTicket | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [destinationReady, setDestinationReady] = useState(false);
  const [sequenceHoldDone, setSequenceHoldDone] = useState(false);
  const [animationVisible, setAnimationVisible] = useState(true);
  const [routeFailed, setRouteFailed] = useState(false);
  const [resolveEpoch, setResolveEpoch] = useState(0);

  const session = ports.captureSession();
  const sessionUid = session?.uid ?? null;
  const sessionGen = session?.generation ?? null;
  const renderedOwner = useMemo(
    () =>
      bootOwnerFromAuth(
        ports.authStatus,
        ports.user?.uid ?? null,
        sessionUid && sessionGen != null ? { uid: sessionUid, generation: sessionGen } : null
      ),
    [ports.authStatus, ports.user?.uid, sessionUid, sessionGen]
  );

  const liveNow = liveSnapshot(ports);
  const bootReady = computeBootReady(liveNow);
  const routeResolved = computeRouteResolved({
    destinationReady,
    sequenceHoldDone,
    routeFailed,
  });
  const ticketIsLive =
    ticket != null &&
    ownersEqual(ticket.owner, liveNow.owner) &&
    machineRef.current.continuationBelongsToCurrent(ticket.owner.uid);

  const userRef = useRef(ports.user);
  userRef.current = ports.user;

  const finishBootNavigation = useCallback(
    (href: Href, owner: Parameters<typeof ownersEqual>[0]) => {
      const snap = liveSnapshot(livePortsRef.current);
      if (!computeBootReady(snap)) return;
      if (!ownersEqual(owner, snap.owner)) return;
      livePortsRef.current.markNavigationSettled();
      setAnimationVisible(false);
      livePortsRef.current.replaceRoute(href);
      livePortsRef.current.hideSplash();
    },
    []
  );

  const applyAction = useCallback((action: BootCompletionAction) => {
    if (action.type === "navigate") {
      setSheetVisible(false);
      setContinuation(null);
      setTicket(null);
      finishBootNavigation(action.href, action.owner);
      return;
    }
    if (action.type === "show_continuation") {
      setTicket(action.ticket);
      setContinuation(action.ticket.continuation);
      setSheetVisible(true);
      setAnimationVisible(false);
      livePortsRef.current.hideSplash();
      return;
    }
    if (action.type === "hide_continuation") {
      setSheetVisible(false);
      setContinuation(null);
      setTicket(null);
      setDestinationReady(false);
      setRouteFailed(false);
      setAnimationVisible(true);
      return;
    }
    if (action.type === "resolver_failed") {
      setRouteFailed(true);
      setDestinationReady(false);
      setAnimationVisible(false);
    }
  }, [finishBootNavigation]);

  useEffect(() => {
    livePortsRef.current.hideSplash();
  }, []);

  useEffect(() => {
    const hide = machineRef.current!.observeOwner(renderedOwner);
    applyAction(hide);
    setDestinationReady(machineRef.current!.hasPendingDestination());
    setRouteFailed(machineRef.current!.isRouteFailed());
  }, [applyAction, renderedOwner]);

  const sequenceHoldMs = ports.sequenceHoldMs;
  const reducedMotion = ports.reducedMotion;
  const schedule = ports.schedule;

  useEffect(() => {
    const ms = sequenceHoldMs ?? sequenceHoldDurationMs(reducedMotion);
    return schedule(() => setSequenceHoldDone(true), ms);
  }, [reducedMotion, schedule, sequenceHoldMs]);

  useEffect(() => {
    if (ports.dbStatus !== "ready") return;
    setPhase("routing");
  }, [ports.dbStatus]);

  useEffect(() => {
    if (phase !== "routing") return;
    if (ports.dbStatus !== "ready") return;
    if (!renderedOwner || renderedOwner.kind === "loading") return;

    let cancelled = false;
    setRouteFailed(false);
    void (async () => {
      const action = await machineRef.current!.resolveForOwner(
        renderedOwner,
        {
          signedIn: renderedOwner.kind === "signed_in",
          user: userRef.current,
          justCreated: livePortsRef.current.justCreated,
        },
        livePortsRef.current.resolveDestination
      );
      if (cancelled) return;
      applyAction(action);
      setDestinationReady(machineRef.current!.hasPendingDestination());
      setRouteFailed(machineRef.current!.isRouteFailed());
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, ports.dbStatus, renderedOwner, ports.justCreated, applyAction, resolveEpoch]);

  const gateCompleters = useMemo(
    () => createBootGateCompleters(machineRef.current!),
    []
  );

  const applyPresentationSignal = useCallback(
    (which: "onExitComplete" | "onHoldTimeout") => {
      applyAction(gateCompleters[which]());
      setDestinationReady(machineRef.current!.hasPendingDestination());
    },
    [applyAction, gateCompleters]
  );

  const handleContinueDraft = useCallback(() => {
    if (!ticket) return;
    applyAction(machineRef.current!.takeContinue(ticket));
  }, [applyAction, ticket]);

  const handleLater = useCallback(async () => {
    if (!ticket) return;
    const action = await machineRef.current!.takeLater(ticket, {
      snooze: (userId) => livePortsRef.current.snoozeDraft(userId),
      clearActiveRoute: (userId) => livePortsRef.current.clearActiveRoute(userId),
    });
    applyAction(action);
  }, [applyAction, ticket]);

  const handleViewDrafts = useCallback(() => {
    if (!ticket) return;
    applyAction(machineRef.current!.takeViewDrafts(ticket));
  }, [applyAction, ticket]);

  const retryResolve = useCallback(() => {
    setRouteFailed(false);
    setDestinationReady(false);
    setAnimationVisible(true);
    setResolveEpoch((n) => n + 1);
  }, []);

  if (shouldShowLocalDbFailure(ports.dbStatus)) {
    return <>{ports.renderDbFailure(ports.dbErrorMessage)}</>;
  }

  const gateVisible = animationVisible && !routeFailed;

  return (
    <>
      {ports.renderBackdrop()}
      {ports.renderGate({
        visible: gateVisible,
        bootReady,
        routeResolved,
        bootError: routeFailed,
        onBlackMidpoint: () => undefined,
        onExitComplete: () => applyPresentationSignal("onExitComplete"),
        onHoldTimeout: () => applyPresentationSignal("onHoldTimeout"),
      })}
      {routeFailed
        ? ports.renderRetry({
            onPress: retryResolve,
            label: ports.t("common.retry"),
          })
        : null}
      {ports.renderSheet({
        visible: sheetVisible && ticketIsLive,
        continuation: ticketIsLive ? continuation : null,
        onContinue: handleContinueDraft,
        onLater: () => void handleLater(),
        onViewDrafts: handleViewDrafts,
      })}
    </>
  );
}
