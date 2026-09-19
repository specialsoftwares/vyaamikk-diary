/**
 * Session-owned subscription management operations. The screen must use this
 * runtime so delayed reads/saves cannot publish a retired account.
 */

import type { BillingDetailsSaveResult, UpdateBillingDetailsPayload } from "@/billing/iap/billingDetailsClient";
import { isSubscriptionPurchaseEntryEnabled } from "@/billing/iap/purchaseEntryGate";
import type { QuotaUpsellPresentResult } from "@/billing/quotaUpsell/quotaUpsellController";
import {
  draftFromDetails,
  payloadFromDraft,
  type BillingDetailsDraft,
} from "@/components/billing/billingDetailsDraft";
import type { BillingDetailsRead } from "@/subscription/billingDetailsReader";
import type { BillingHistoryRead } from "@/subscription/billingHistoryReader";
import type { QuotaUsageRead } from "@/subscription/quotaUsageReader";
import { billingDetailsInvoiceReady } from "@/subscription/subscriptionManagementPresentation";
import {
  sessionFlushKey,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";

export type ManagementPublished = {
  ownerKey: string;
  usage: QuotaUsageRead | null;
  history: BillingHistoryRead | null;
  detailsKind: "loading" | "ready" | "unavailable";
  draft: BillingDetailsDraft;
  gstinError: string | null;
  saveError: string | null;
  saving: boolean;
  restoreError: string | null;
  restoring: boolean;
  manageError: string | null;
  upgradeError: string | null;
  invoiceReady: boolean;
};

export type ManagementRuntimeDeps = {
  readUsage: (uid: string) => Promise<QuotaUsageRead>;
  readHistory: (uid: string) => Promise<BillingHistoryRead>;
  readDetails: (uid: string) => Promise<BillingDetailsRead>;
  saveDetails: (payload: UpdateBillingDetailsPayload) => Promise<BillingDetailsSaveResult>;
  restore: () => Promise<{ kind: string; message?: string }>;
  openUrl: (url: string) => Promise<boolean>;
  presentUpgrade: (session: SyncSessionToken | null) => QuotaUpsellPresentResult;
  nowMs?: () => number;
  isPurchaseEntryEnabled?: () => boolean;
};

const emptyDraft = draftFromDetails(null);

function emptyPublished(ownerKey: string): ManagementPublished {
  return {
    ownerKey,
    usage: null,
    history: null,
    detailsKind: "loading",
    draft: emptyDraft,
    gstinError: null,
    saveError: null,
    saving: false,
    restoreError: null,
    restoring: false,
    manageError: null,
    upgradeError: null,
    invoiceReady: false,
  };
}

export function createSubscriptionManagementRuntime(deps: ManagementRuntimeDeps) {
  let owner: SyncSessionToken | null = null;
  let opSeq = 0;
  let published = emptyPublished("signed_out#0");
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function ownerKeyOf(token: SyncSessionToken | null): string {
    return token ? sessionFlushKey(token.uid, token) : "signed_out#0";
  }

  function isLive(token: SyncSessionToken | null, op: number): boolean {
    if (op !== opSeq) return false;
    if (!token || !owner) return false;
    return token.uid === owner.uid && token.generation === owner.generation;
  }

  function retireAndReset(next: SyncSessionToken | null): void {
    opSeq += 1;
    owner = next;
    published = emptyPublished(ownerKeyOf(next));
    if (!next) {
      published = {
        ...published,
        usage: { kind: "unavailable", code: "signed_out" },
        history: { kind: "unavailable", code: "signed_out" },
        detailsKind: "unavailable",
      };
    }
    emit();
  }

  function reload(): void {
    if (!owner) {
      retireAndReset(null);
      return;
    }
    const admitted = { uid: owner.uid, generation: owner.generation };
    opSeq += 1;
    const op = opSeq;
    published = {
      ...published,
      detailsKind: published.detailsKind === "ready" ? "ready" : "loading",
    };
    emit();
    void load(admitted, op);
  }

  async function load(admitted: SyncSessionToken, op: number): Promise<void> {
    const [usageRead, historyRead, detailsRead] = await Promise.all([
      deps.readUsage(admitted.uid),
      deps.readHistory(admitted.uid),
      deps.readDetails(admitted.uid),
    ]);
    if (!isLive(admitted, op)) return;
    let draft = emptyDraft;
    let detailsKind: ManagementPublished["detailsKind"] = "unavailable";
    if (detailsRead.kind === "ok") {
      draft = draftFromDetails(detailsRead.details);
      detailsKind = "ready";
    } else if (detailsRead.kind === "missing") {
      draft = draftFromDetails(null);
      detailsKind = "ready";
    }
    published = {
      ...published,
      ownerKey: ownerKeyOf(admitted),
      usage: usageRead,
      history: historyRead,
      detailsKind,
      draft,
      invoiceReady: billingDetailsInvoiceReady(draft),
      gstinError: null,
      saveError: null,
    };
    emit();
  }

  return {
    snapshot(): ManagementPublished {
      return published;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOwner(next: SyncSessionToken | null): void {
      const prevKey = ownerKeyOf(owner);
      const nextKey = ownerKeyOf(next);
      if (prevKey === nextKey) return;
      retireAndReset(next);
      if (next) {
        const op = opSeq;
        void load(next, op);
      }
    },
    reload,
    setDraft(draft: BillingDetailsDraft): void {
      if (!owner) return;
      published = {
        ...published,
        draft,
        invoiceReady: billingDetailsInvoiceReady(draft),
        gstinError: null,
      };
      emit();
    },
    async saveDetails(): Promise<void> {
      const admitted = owner ? { uid: owner.uid, generation: owner.generation } : null;
      if (!admitted) return;
      opSeq += 1;
      const op = opSeq;
      const payload = payloadFromDraft(published.draft);
      published = { ...published, saving: true, saveError: null, gstinError: null };
      emit();
      let result: BillingDetailsSaveResult;
      try {
        result = await deps.saveDetails(payload);
      } catch {
        if (!isLive(admitted, op)) return;
        published = {
          ...published,
          saving: false,
          saveError: "save_failed",
        };
        emit();
        return;
      }
      if (!isLive(admitted, op)) return;
      published = { ...published, saving: false };
      if (result.kind === "saved") {
        emit();
        reload();
        return;
      }
      if (result.kind === "gstin_format_invalid") {
        published = { ...published, gstinError: "gstin_format_invalid" };
      } else {
        published = { ...published, saveError: result.kind };
      }
      emit();
    },
    presentUpgrade(session: SyncSessionToken | null): QuotaUpsellPresentResult {
      const enabled = (deps.isPurchaseEntryEnabled ?? isSubscriptionPurchaseEntryEnabled)();
      if (!enabled) {
        published = { ...published, upgradeError: "purchase_entry_closed" };
        emit();
        return { ok: false, reason: "purchase_entry_closed", visible: false, clientRecordId: null };
      }
      if (!owner || !session || session.uid !== owner.uid || session.generation !== owner.generation) {
        published = { ...published, upgradeError: "session_stale" };
        emit();
        return { ok: false, reason: "session_stale", visible: false, clientRecordId: null };
      }
      published = { ...published, upgradeError: null };
      emit();
      return deps.presentUpgrade(session);
    },
    async restore(): Promise<void> {
      const admitted = owner ? { uid: owner.uid, generation: owner.generation } : null;
      if (!admitted) return;
      opSeq += 1;
      const op = opSeq;
      published = { ...published, restoring: true, restoreError: null };
      emit();
      try {
        const result = await deps.restore();
        if (!isLive(admitted, op)) return;
        published = { ...published, restoring: false };
        if (result.kind === "failed") {
          published = { ...published, restoreError: result.message ?? "failed" };
        } else if (result.kind === "unavailable") {
          published = { ...published, restoreError: "unavailable" };
        }
        emit();
      } catch {
        if (!isLive(admitted, op)) return;
        published = { ...published, restoring: false, restoreError: "failed" };
        emit();
      }
    },
    async manage(url: string): Promise<void> {
      const admitted = owner ? { uid: owner.uid, generation: owner.generation } : null;
      if (!admitted) return;
      opSeq += 1;
      const op = opSeq;
      published = { ...published, manageError: null };
      emit();
      try {
        const opened = await deps.openUrl(url);
        if (!isLive(admitted, op)) return;
        if (opened === false) {
          published = { ...published, manageError: "manage_unavailable" };
          emit();
        }
      } catch {
        if (!isLive(admitted, op)) return;
        published = { ...published, manageError: "manage_unavailable" };
        emit();
      }
    },
    dispose(): void {
      retireAndReset(null);
      listeners.clear();
    },
  };
}

export type SubscriptionManagementRuntime = ReturnType<typeof createSubscriptionManagementRuntime>;
