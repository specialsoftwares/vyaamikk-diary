/**
 * Session-owned subscription management operations. Loading, save, restore
 * and manage use separate operation identities so one cannot strand another.
 * Publication checks live auth UID + session generation, not only setOwner.
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
  draftDirty: boolean;
};

export type LiveManagementSession = {
  authUid: string | null;
  session: SyncSessionToken | null;
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
  /** Authoritative live session; defaults to the last setOwner token. */
  liveSession?: () => LiveManagementSession;
};

const emptyDraft = draftFromDetails(null);

export function emptyPublished(ownerKey: string): ManagementPublished {
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
    draftDirty: false,
  };
}

export function liveOwnerKey(live: LiveManagementSession): string {
  if (!live.authUid || !live.session) return "signed_out#0";
  if (live.authUid !== live.session.uid) return "signed_out#0";
  return sessionFlushKey(live.session.uid, live.session);
}

export function maskManagementSnapshot(
  published: ManagementPublished,
  live: LiveManagementSession
): ManagementPublished {
  const key = liveOwnerKey(live);
  if (published.ownerKey === key) return published;
  if (key === "signed_out#0") {
    return {
      ...emptyPublished(key),
      usage: { kind: "unavailable", code: "signed_out" },
      history: { kind: "unavailable", code: "signed_out" },
      detailsKind: "unavailable",
    };
  }
  return emptyPublished(key);
}

export function createSubscriptionManagementRuntime(deps: ManagementRuntimeDeps) {
  let owner: SyncSessionToken | null = null;
  let loadSeq = 0;
  let saveSeq = 0;
  let restoreSeq = 0;
  let manageSeq = 0;
  let published = emptyPublished("signed_out#0");
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function ownerKeyOf(token: SyncSessionToken | null): string {
    return token ? sessionFlushKey(token.uid, token) : "signed_out#0";
  }

  function readLive(): LiveManagementSession {
    if (deps.liveSession) return deps.liveSession();
    return { authUid: owner?.uid ?? null, session: owner };
  }

  function isLiveAuthority(admitted: SyncSessionToken): boolean {
    const live = readLive();
    if (!live.authUid || !live.session) return false;
    if (live.authUid !== live.session.uid) return false;
    if (admitted.uid !== live.session.uid || admitted.generation !== live.session.generation) {
      return false;
    }
    if (!owner || owner.uid !== admitted.uid || owner.generation !== admitted.generation) {
      return false;
    }
    return true;
  }

  function retireAndReset(next: SyncSessionToken | null): void {
    loadSeq += 1;
    saveSeq += 1;
    restoreSeq += 1;
    manageSeq += 1;
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
    if (!isLiveAuthority(owner)) return;
    loadSeq += 1;
    const op = loadSeq;
    const admitted = { uid: owner.uid, generation: owner.generation };
    if (!published.draftDirty) {
      published = {
        ...published,
        detailsKind: published.detailsKind === "ready" ? "ready" : "loading",
      };
      emit();
    }
    void load(admitted, op);
  }

  async function load(admitted: SyncSessionToken, op: number): Promise<void> {
    const [usageRead, historyRead, detailsRead] = await Promise.all([
      deps.readUsage(admitted.uid),
      deps.readHistory(admitted.uid),
      deps.readDetails(admitted.uid),
    ]);
    if (op !== loadSeq) return;
    if (!isLiveAuthority(admitted)) return;
    let draft = emptyDraft;
    let detailsKind: ManagementPublished["detailsKind"] = "unavailable";
    if (detailsRead.kind === "ok") {
      draft = draftFromDetails(detailsRead.details);
      detailsKind = "ready";
    } else if (detailsRead.kind === "missing") {
      draft = draftFromDetails(null);
      detailsKind = "ready";
    }
    const keepDraft = published.draftDirty || published.saving;
    published = {
      ...published,
      ownerKey: ownerKeyOf(admitted),
      usage: usageRead,
      history: historyRead,
      detailsKind: keepDraft && published.detailsKind === "ready" ? "ready" : detailsKind,
      draft: keepDraft ? published.draft : draft,
      invoiceReady: keepDraft
        ? billingDetailsInvoiceReady(published.draft)
        : billingDetailsInvoiceReady(draft),
      gstinError: keepDraft ? published.gstinError : null,
      saveError: keepDraft ? published.saveError : null,
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
        const op = loadSeq;
        void load(next, op);
      }
    },
    reload,
    setDraft(draft: BillingDetailsDraft): void {
      if (!owner || !isLiveAuthority(owner)) return;
      published = {
        ...published,
        draft,
        draftDirty: true,
        invoiceReady: billingDetailsInvoiceReady(draft),
        gstinError: null,
      };
      emit();
    },
    async saveDetails(): Promise<void> {
      const admitted = owner ? { uid: owner.uid, generation: owner.generation } : null;
      if (!admitted || !isLiveAuthority(admitted)) return;
      saveSeq += 1;
      const op = saveSeq;
      const payload = payloadFromDraft(published.draft);
      published = { ...published, saving: true, saveError: null, gstinError: null };
      emit();
      let result: BillingDetailsSaveResult;
      try {
        result = await deps.saveDetails(payload);
      } catch {
        if (op !== saveSeq || !isLiveAuthority(admitted)) return;
        published = {
          ...published,
          saving: false,
          saveError: "save_failed",
        };
        emit();
        return;
      }
      if (op !== saveSeq || !isLiveAuthority(admitted)) return;
      published = { ...published, saving: false };
      if (result.kind === "saved") {
        published = { ...published, draftDirty: false };
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
      const live = readLive();
      if (
        !owner ||
        !session ||
        !live.session ||
        !live.authUid ||
        live.authUid !== live.session.uid ||
        session.uid !== live.session.uid ||
        session.generation !== live.session.generation
      ) {
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
      if (!admitted || !isLiveAuthority(admitted)) return;
      restoreSeq += 1;
      const op = restoreSeq;
      published = { ...published, restoring: true, restoreError: null };
      emit();
      try {
        const result = await deps.restore();
        if (op !== restoreSeq || !isLiveAuthority(admitted)) return;
        published = { ...published, restoring: false };
        if (result.kind === "failed") {
          published = { ...published, restoreError: result.message ?? "failed" };
        } else if (result.kind === "unavailable") {
          published = { ...published, restoreError: "unavailable" };
        }
        emit();
      } catch {
        if (op !== restoreSeq || !isLiveAuthority(admitted)) return;
        published = { ...published, restoring: false, restoreError: "failed" };
        emit();
      }
    },
    async manage(url: string): Promise<void> {
      const admitted = owner ? { uid: owner.uid, generation: owner.generation } : null;
      if (!admitted || !isLiveAuthority(admitted)) return;
      manageSeq += 1;
      const op = manageSeq;
      published = { ...published, manageError: null };
      emit();
      try {
        const opened = await deps.openUrl(url);
        if (op !== manageSeq || !isLiveAuthority(admitted)) return;
        if (opened === false) {
          published = { ...published, manageError: "manage_unavailable" };
          emit();
        }
      } catch {
        if (op !== manageSeq || !isLiveAuthority(admitted)) return;
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
