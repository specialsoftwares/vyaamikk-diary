/**
 * Render-time IAP owner binding.
 *
 * Effects run after commit, so Auth uid can change while the previous IAP
 * view is still on screen. This helper is the synchronous visibility gate.
 * ownerUid stays internal.
 */

import type { IapUnavailableReason, IapView } from "./iapTypes";

export type IapAuthStatus = "loading" | "signed_out" | "signed_in" | string;

export function activeIapAuthUid(
  authStatus: IapAuthStatus,
  authUid: string | null | undefined
): string | null {
  if (authStatus !== "signed_in") return null;
  return authUid || null;
}

export function defaultSafeIapView(args: {
  ownerUid: string | null;
  unavailableReason?: IapUnavailableReason | null;
}): IapView {
  return {
    ownerUid: args.ownerUid,
    available: false,
    unavailableReason: args.ownerUid
      ? (args.unavailableReason ?? null)
      : "not_signed_in",
    connected: false,
    catalog: [],
    pending: null,
    lastResult: null,
    purchaseInFlight: false,
  };
}

export function bindIapViewToAuth(args: {
  view: IapView;
  authStatus: IapAuthStatus;
  authUid: string | null | undefined;
}): IapView {
  const activeUid = activeIapAuthUid(args.authStatus, args.authUid);
  if (activeUid != null && args.view.ownerUid === activeUid) {
    return args.view;
  }
  return defaultSafeIapView({ ownerUid: activeUid });
}

export function iapSessionActionAllowed(args: {
  activeUid: string | null;
  sessionOwnerUid: string | null;
}): boolean {
  return args.activeUid != null && args.activeUid === args.sessionOwnerUid;
}

export async function runGuardedIapAction<T>(args: {
  activeUid: string | null;
  sessionOwnerUid: string | null;
  blockedResult: T;
  action: () => Promise<T>;
}): Promise<T> {
  if (!iapSessionActionAllowed(args)) return args.blockedResult;
  return args.action();
}
