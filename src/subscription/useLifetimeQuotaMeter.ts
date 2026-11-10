/**
 * Shared lifetime meter hook for You dashboard and every creation screen.
 *
 * Paid activation hides the meter in the same publish (no navigate/refresh).
 * Unreadable plan → checking — never Free / 0/15.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/state/auth";
import { useSubscription } from "@/subscription";
import {
  buildEntitlementView,
  type EntitlementView,
} from "@/subscription/entitlementView";
import { readOwnerQuotaUsage } from "@/subscription/quotaUsageReader";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

export function useLifetimeQuotaMeter(): {
  view: EntitlementView | null;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const subscription = useSubscription();
  const userId = user?.uid ?? null;
  const [lifetimeUsed, setLifetimeUsed] = useState<number | null>(null);
  const [usageReadable, setUsageReadable] = useState(false);

  const loadUsage = useCallback(async () => {
    const session = syncSessionOwnership.capture();
    const admittedUid = session?.uid ?? null;
    const admittedGen = session?.generation ?? 0;
    if (!userId || !admittedUid || admittedUid !== userId) {
      setLifetimeUsed(null);
      setUsageReadable(false);
      return;
    }
    const usage = await readOwnerQuotaUsage(userId);
    const live = syncSessionOwnership.capture();
    if (!live || live.uid !== admittedUid || live.generation !== admittedGen) return;
    if (usage.kind === "ok") {
      const used =
        typeof usage.lifetimeAcceptedCount === "number"
          ? usage.lifetimeAcceptedCount
          : usage.recordsThisMonth;
      setLifetimeUsed(used);
      setUsageReadable(true);
    } else if (usage.kind === "missing") {
      setLifetimeUsed(0);
      setUsageReadable(true);
    } else {
      setLifetimeUsed(null);
      setUsageReadable(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage, subscription.status.entitlementActive, subscription.source]);

  const view = useMemo(() => {
    if (!userId) return null;
    const authError =
      typeof subscription.error === "string" &&
      /permission|unauth|denied/i.test(subscription.error);
    const statusReadable =
      !subscription.isLoading &&
      !authError &&
      (subscription.source === "server" || subscription.source === "cache");
    const paidActive = subscription.status.entitlementActive === true;
    const freeReadable =
      statusReadable && !paidActive && usageReadable && lifetimeUsed != null;
    return buildEntitlementView({
      uid: userId,
      status:
        statusReadable && paidActive
          ? {
              statusReadable: true,
              entitlementActive: true,
              plan: subscription.status.plan,
            }
          : freeReadable
            ? {
                statusReadable: true,
                entitlementActive: false,
                plan: subscription.status.plan,
                lifetimeUsed: lifetimeUsed ?? 0,
              }
            : { statusReadable: false, entitlementActive: false, plan: null },
      purchase: { kind: "idle" },
    });
  }, [
    userId,
    subscription.isLoading,
    subscription.error,
    subscription.source,
    subscription.status.entitlementActive,
    subscription.status.plan,
    lifetimeUsed,
    usageReadable,
  ]);

  const refresh = useCallback(async () => {
    await subscription.refresh();
    await loadUsage();
  }, [subscription, loadUsage]);

  return { view, refresh };
}
