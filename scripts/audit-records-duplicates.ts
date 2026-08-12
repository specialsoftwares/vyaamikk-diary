#!/usr/bin/env npx tsx
/**
 * DEV-ONLY duplicate record audit (Firestore CLI).
 * Refuses production. Requires EXPO_PUBLIC_FIREBASE_* env (shared-dev).
 *
 * Dry-run usage (identify only — never auto-deletes):
 *   npm run audit:records -- --user <uid>
 *
 * The script prints JSON with duplicate groups, id mismatches, and manual
 * cleanup steps for shared-dev / internal QA. Do not run against production
 * user data without explicit approval.
 *
 * Manual cleanup (shared-dev / QA only):
 *   1. Run this audit and note duplicateGroups[].docIds per kind.
 *   2. In Firebase Console → Firestore → users/{uid}/<collection>, open each
 *      duplicate doc and compare createdAt + serial/recordNumber.
 *   3. Keep the earliest doc (lowest createdAt or lowest serial). Delete the
 *      rest via in-app permanent delete, or delete the Firestore doc directly
 *      in shared-dev only.
 *   4. Re-run audit to confirm duplicateGroups is empty.
 *   5. Never bulk-delete production accounts; escalate to engineering if unsure.
 */

import { collection, getDocs, query } from "firebase/firestore";

function readArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

interface DuplicateGroup {
  kind: string;
  fingerprint: string;
  docIds: string[];
  payloadIds: string[];
  serials?: number[];
  createdAtRangeMs: number;
}

function fingerprint(
  kind: string,
  title: string,
  dateMs: number,
  extra = ""
): string {
  return `${kind}|${extra}|${title.trim().toLowerCase()}|${dateMs}`;
}

function groupDuplicates(
  kind: string,
  rows: {
    docId: string;
    payloadId: string;
    title: string;
    dateMs: number;
    createdAt: number;
    serial?: number;
    extra?: string;
  }[],
  windowMs = 10 * 60 * 1000
): DuplicateGroup[] {
  const buckets = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = fingerprint(kind, row.title, row.dateMs, row.extra ?? "");
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }
  const out: DuplicateGroup[] = [];
  for (const [fp, list] of buckets) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.createdAt - b.createdAt);
    const span = list[list.length - 1].createdAt - list[0].createdAt;
    if (span <= windowMs) {
      out.push({
        kind,
        fingerprint: fp,
        docIds: list.map((r) => r.docId),
        payloadIds: list.map((r) => r.payloadId),
        serials: list.some((r) => r.serial != null)
          ? list.map((r) => r.serial ?? 0)
          : undefined,
        createdAtRangeMs: span,
      });
    }
  }
  return out;
}

function formatDuplicateSummary(groups: DuplicateGroup[]): string[] {
  if (groups.length === 0) return ["No near-duplicate groups in 10-minute window."];
  return groups.map(
    (g) =>
      `[${g.kind}] ${g.docIds.length} docs within ${g.createdAtRangeMs}ms — keep earliest, delete: ${g.docIds.slice(1).join(", ")}`
  );
}

async function main(): Promise<void> {
  const mode = process.env.EXPO_PUBLIC_APP_MODE ?? "development";
  if (mode === "production") {
    console.error("audit:records refuses production mode.");
    process.exit(1);
  }
  if (!process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim()) {
    console.error(
      "Firebase not configured. Set EXPO_PUBLIC_FIREBASE_* env vars, or audit duplicates in-app via Saved Records / Pro Pack history."
    );
    process.exit(1);
  }

  const userIdArg = readArg("--user");
  if (!userIdArg) {
    console.error("Provide --user <uid>.");
    console.error("Dry-run: npm run audit:records -- --user <uid>");
    process.exit(1);
  }
  const userId: string = userIdArg;

  const { initializeApp, getApps } = await import("firebase/app");
  const { getFirestore } = await import("firebase/firestore");

  if (getApps().length === 0) {
    initializeApp({
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    });
  }

  const db = getFirestore();

  async function loadSubcollection(name: string) {
    const snap = await getDocs(query(collection(db, "users", userId, name)));
    return snap.docs.map((d) => ({ docId: d.id, data: d.data() as Record<string, unknown> }));
  }

  const [entries, packs, letterheads, purchaseOrders, creditRecords] = await Promise.all([
    loadSubcollection("entries"),
    loadSubcollection("professionalPacks"),
    loadSubcollection("letterheadDocs"),
    loadSubcollection("purchaseOrders"),
    loadSubcollection("customerCreditRecords"),
  ]);

  const entryRows = entries.map((e) => ({
    docId: e.docId,
    payloadId: String(e.data.id ?? ""),
    title: String(e.data.title ?? ""),
    dateMs: Number(e.data.entryDate ?? 0),
    createdAt: Number(e.data.createdAt ?? 0),
    extra: String(e.data.entryType ?? ""),
  }));

  const packRows = packs.map((p) => ({
    docId: p.docId,
    payloadId: String(p.data.id ?? ""),
    title: String(p.data.title ?? ""),
    dateMs: Number(p.data.matterDate ?? 0),
    createdAt: Number(p.data.createdAt ?? 0),
    extra: `${p.data.professionalCategory ?? ""}:${p.data.matterType ?? ""}`,
  }));

  const letterheadRows = letterheads.map((l) => ({
    docId: l.docId,
    payloadId: String(l.data.id ?? ""),
    title: String(l.data.title ?? ""),
    dateMs: Number((l.data.input as Record<string, unknown> | undefined)?.date ?? 0),
    createdAt: Number(l.data.createdAt ?? 0),
    extra: String((l.data.input as Record<string, unknown> | undefined)?.subject ?? ""),
  }));

  const poRows = purchaseOrders.map((p) => ({
    docId: p.docId,
    payloadId: String(p.data.id ?? ""),
    title: String(p.data.poNumber ?? p.data.vendorName ?? ""),
    dateMs: Number(p.data.poDate ?? 0),
    createdAt: Number(p.data.createdAt ?? 0),
    serial: Number(p.data.serial ?? 0),
    extra: String(p.data.vendorName ?? ""),
  }));

  const creditRows = creditRecords.map((c) => ({
    docId: c.docId,
    payloadId: String(c.data.id ?? ""),
    title: String(c.data.recordNumber ?? c.data.customerName ?? ""),
    dateMs: Number(c.data.saleDate ?? 0),
    createdAt: Number(c.data.createdAt ?? 0),
    serial: Number(c.data.serial ?? 0),
    extra: String(c.data.customerName ?? ""),
  }));

  const blankPayloadIds = {
    entries: entryRows.filter((r) => !r.payloadId.trim()).length,
    packs: packRows.filter((r) => !r.payloadId.trim()).length,
    letterhead_docs: letterheadRows.filter((r) => !r.payloadId.trim()).length,
    purchase_orders: poRows.filter((r) => !r.payloadId.trim()).length,
    customer_credit: creditRows.filter((r) => !r.payloadId.trim()).length,
  };

  const idMismatches = [
    ...entryRows
      .filter((r) => r.payloadId && r.payloadId !== r.docId)
      .map((r) => ({ kind: "entry", docId: r.docId, payloadId: r.payloadId })),
    ...packRows
      .filter((r) => r.payloadId && r.payloadId !== r.docId)
      .map((r) => ({ kind: "pack", docId: r.docId, payloadId: r.payloadId })),
    ...letterheadRows
      .filter((r) => r.payloadId && r.payloadId !== r.docId)
      .map((r) => ({ kind: "letterhead_doc", docId: r.docId, payloadId: r.payloadId })),
    ...poRows
      .filter((r) => r.payloadId && r.payloadId !== r.docId)
      .map((r) => ({ kind: "purchase_order", docId: r.docId, payloadId: r.payloadId })),
    ...creditRows
      .filter((r) => r.payloadId && r.payloadId !== r.docId)
      .map((r) => ({ kind: "customer_credit", docId: r.docId, payloadId: r.payloadId })),
  ];

  const duplicateGroups = [
    ...groupDuplicates("business_entry", entryRows),
    ...groupDuplicates("professional_pack", packRows),
    ...groupDuplicates("letterhead_doc", letterheadRows),
    ...groupDuplicates("purchase_order", poRows),
    ...groupDuplicates("customer_credit", creditRows),
  ];

  const serialGaps = {
    purchase_orders: poRows
      .map((r) => r.serial ?? 0)
      .filter((s) => s > 0)
      .sort((a, b) => a - b),
    customer_credit: creditRows
      .map((r) => r.serial ?? 0)
      .filter((s) => s > 0)
      .sort((a, b) => a - b),
  };

  function duplicateSerials(kind: string, rows: { docId: string; serial?: number }[]) {
    const bySerial = new Map<number, string[]>();
    for (const row of rows) {
      const s = row.serial ?? 0;
      if (s <= 0) continue;
      const list = bySerial.get(s) ?? [];
      list.push(row.docId);
      bySerial.set(s, list);
    }
    return [...bySerial.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([serial, docIds]) => ({ kind, serial, docIds }));
  }

  const duplicatePaymentIds: { creditDocId: string; clientPaymentId: string; count: number }[] =
    [];
  for (const c of creditRecords) {
    const payments = Array.isArray(c.data.payments) ? (c.data.payments as Record<string, unknown>[]) : [];
    const counts = new Map<string, number>();
    for (const p of payments) {
      const pid = String(p.clientPaymentId ?? "").trim();
      if (!pid) continue;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
    for (const [clientPaymentId, count] of counts) {
      if (count > 1) {
        duplicatePaymentIds.push({ creditDocId: c.docId, clientPaymentId, count });
      }
    }
  }

  const missingClientRecordIds = {
    purchase_orders: purchaseOrders.filter((p) => !String(p.data.clientRecordId ?? "").trim()).length,
    customer_credit: creditRecords.filter((c) => !String(c.data.clientRecordId ?? "").trim()).length,
    letterhead_docs: letterheads.filter((l) => !String(l.data.clientRecordId ?? "").trim()).length,
  };

  const letterheadMatterLinkAnomalies = letterheads
    .map((l) => {
      const clientRecordId = String(l.data.clientRecordId ?? "").trim();
      const linkedEntryId = String(l.data.linkedDiaryEntryId ?? l.data.diaryEntryId ?? "").trim();
      if (!clientRecordId) return null;
      const expected = `${clientRecordId}_matter`;
      if (linkedEntryId && linkedEntryId !== expected) {
        return { docId: l.docId, clientRecordId, linkedEntryId, expected };
      }
      return null;
    })
    .filter(Boolean);

  const report = {
    mode: "dry-run-identify-only",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    userId: `${userId.slice(0, 4)}…${userId.slice(-4)}`,
    counts: {
      entries: entries.length,
      professional_packs: packs.length,
      letterhead_docs: letterheads.length,
      purchase_orders: purchaseOrders.length,
      customer_credit_records: creditRecords.length,
    },
    blankPayloadIds,
    missingClientRecordIds,
    idMismatches,
    duplicateGroups,
    duplicateSummary: formatDuplicateSummary(duplicateGroups),
    duplicateSerials: [
      ...duplicateSerials("purchase_order", poRows),
      ...duplicateSerials("customer_credit", creditRows),
    ],
    duplicatePaymentIds,
    letterheadMatterLinkAnomalies,
    serialSnapshots: {
      purchase_order_max: Math.max(0, ...serialGaps.purchase_orders),
      customer_credit_max: Math.max(0, ...serialGaps.customer_credit),
    },
    manualCleanup: [
      "This script never deletes data.",
      "For each duplicateSummary line: keep the first docId (earliest createdAt), remove the rest in shared-dev only.",
      "Prefer in-app permanent delete so local caches stay consistent.",
      "After cleanup, re-run: npm run audit:records -- --user <uid>",
      "Escalate before touching production user accounts.",
      "There is no auto-repair command in this repository — do not invent one against production.",
    ],
    recommendations: [
      duplicateGroups.length > 0
        ? "Duplicate groups found — see duplicateSummary and manualCleanup."
        : "No near-duplicate groups in 10-minute window.",
      Object.values(blankPayloadIds).some((n) => n > 0)
        ? "Legacy rows store blank payload id — reads must use Firestore docId."
        : null,
      idMismatches.length > 0
        ? "Payload id differs from doc id — repair on next update or manual cleanup."
        : null,
      Object.values(missingClientRecordIds).some((n) => n > 0)
        ? "Some records lack clientRecordId — older schema; reads must remain tolerant."
        : null,
      duplicatePaymentIds.length > 0
        ? "Duplicate clientPaymentId values found inside credit ledgers."
        : null,
      letterheadMatterLinkAnomalies.length > 0
        ? "Letterhead diary link diverges from `${clientRecordId}_matter`."
        : null,
    ].filter(Boolean),
  };

  console.log(JSON.stringify(report, null, 2));
}

void main();
