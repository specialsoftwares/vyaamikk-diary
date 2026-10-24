/**
 * Durable photo, PDF, and ledger follow-ups.
 * Written in the same local transaction as the voucher row, before local success
 * is shown. Restart reads these rows. A detached promise is not the record.
 */

import type { BusinessEntry } from "@/domain/businessEntry";
import { getLocalDatabase } from "@/localDb/database";
import { ensureRecordFollowUpsTable as ensureFollowUpSchema } from "@/localDb/migrate";
import { readLocalEntryRecordSync } from "@/repositories/localEntriesRepository";
import { CASH_PAID_ATTACHMENT_ID } from "@/services/attachments/cashPaidPhotoRef";
import { captureAdmissionToken, mayIssueRemoteWork } from "@/sync/syncSessionOwnership";

export type FollowUpKind = "photo_upload" | "pdf" | "ledger_hold";
export type FollowUpStatus = "pending" | "held" | "done" | "stale";

export interface RecordFollowUp {
  id: string;
  userId: string;
  recordId: string;
  kind: FollowUpKind;
  sourceRevision: number;
  attachmentRevision: string;
  status: FollowUpStatus;
  createdAt: number;
}

type FollowUpRunner = (job: RecordFollowUp, entry: BusinessEntry) => Promise<void>;

let runnerForTests: FollowUpRunner | null = null;

export function setFollowUpRunnerForTests(runner: FollowUpRunner | null): void {
  runnerForTests = runner;
}

export function ensureRecordFollowUpsTable(): void {
  ensureFollowUpSchema(getLocalDatabase());
}

function followUpId(userId: string, recordId: string, kind: FollowUpKind): string {
  return `${userId}:${recordId}:${kind}`;
}

function attachmentRevisionOf(entry: BusinessEntry): string {
  const attachment = entry.attachments?.find((item) => item.id === CASH_PAID_ATTACHMENT_ID);
  return attachment?.revision ?? attachment?.contentHash ?? "";
}

function rowFrom(record: {
  id: string;
  user_id: string;
  record_id: string;
  kind: string;
  source_revision: number;
  attachment_revision: string;
  status: string;
  created_at: number;
}): RecordFollowUp {
  return {
    id: record.id,
    userId: record.user_id,
    recordId: record.record_id,
    kind: record.kind as FollowUpKind,
    sourceRevision: Number(record.source_revision),
    attachmentRevision: record.attachment_revision,
    status: record.status as FollowUpStatus,
    createdAt: Number(record.created_at),
  };
}

export function queueRecordFollowUpsSync(entry: BusinessEntry, sourceRevision: number): void {
  ensureRecordFollowUpsTable();
  const db = getLocalDatabase();
  const now = Date.now();
  const attachmentRevision = attachmentRevisionOf(entry);
  const jobs: { kind: FollowUpKind; status: FollowUpStatus }[] = [
    { kind: "ledger_hold", status: "held" },
  ];
  if (entry.entryType === "business_cash_given") {
    jobs.push({ kind: "pdf", status: "pending" });
    if (attachmentRevision) jobs.push({ kind: "photo_upload", status: "pending" });
  }
  for (const job of jobs) {
    db.runSync(
      `INSERT OR REPLACE INTO record_followups
        (id, user_id, record_id, kind, source_revision, attachment_revision, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        followUpId(entry.userId, entry.id, job.kind),
        entry.userId,
        entry.id,
        job.kind,
        sourceRevision,
        attachmentRevision,
        job.status,
        now,
      ]
    );
  }
}

export function listFollowUpsSync(userId: string, recordId?: string): RecordFollowUp[] {
  ensureRecordFollowUpsTable();
  const db = getLocalDatabase();
  const rows = recordId
    ? db.getAllSync<Parameters<typeof rowFrom>[0]>(
        `SELECT * FROM record_followups WHERE user_id = ? AND record_id = ? ORDER BY kind ASC`,
        [userId, recordId]
      )
    : db.getAllSync<Parameters<typeof rowFrom>[0]>(
        `SELECT * FROM record_followups WHERE user_id = ? ORDER BY created_at ASC`,
        [userId]
      );
  return rows.map(rowFrom);
}

function markStatus(job: RecordFollowUp, status: FollowUpStatus): void {
  getLocalDatabase().runSync(
    `UPDATE record_followups SET status = ? WHERE id = ? AND source_revision = ?`,
    [status, job.id, job.sourceRevision]
  );
}

/**
 * A late upload or PDF may finish only when it still matches the saved revision
 * and the same signed-in owner. Otherwise the result is stale or blocked.
 */
export function classifyFollowUp(
  job: RecordFollowUp,
  sessionUid: string | null
): "ready" | "stale" | "session_blocked" {
  if (!sessionUid || sessionUid !== job.userId) return "session_blocked";
  const live = readLocalEntryRecordSync(job.userId, job.recordId);
  const liveRevision = live?.meta.localRevision ?? 0;
  const liveAttachment = live ? attachmentRevisionOf(live.entry) : "";
  if (
    !live ||
    job.sourceRevision !== liveRevision ||
    (job.kind !== "ledger_hold" && job.attachmentRevision !== liveAttachment)
  ) {
    markStatus(job, "stale");
    return "stale";
  }
  return "ready";
}

export function settleFollowUpSync(
  job: RecordFollowUp,
  sessionUid: string | null,
  apply: () => void
): "done" | "stale" | "session_blocked" {
  const verdict = classifyFollowUp(job, sessionUid);
  if (verdict !== "ready") return verdict;
  apply();
  markStatus(job, "done");
  return "done";
}

async function defaultRunner(job: RecordFollowUp, entry: BusinessEntry): Promise<void> {
  const attachment = entry.attachments?.find((item) => item.id === CASH_PAID_ATTACHMENT_ID);
  if (job.kind === "photo_upload") {
    if (!attachment?.uri) return;
    const mimeType = attachment.mimeType === "image/png" ? "image/png" : "image/jpeg";
    const { uploadCashPaidPhotoToStorage } = await import("@/services/attachments/cashPaidPhotoStorage");
    await uploadCashPaidPhotoToStorage({
      userId: job.userId,
      recordId: job.recordId,
      picked: {
        uri: attachment.uri,
        mimeType,
        byteSize: attachment.byteSize ?? 0,
        contentHash: attachment.contentHash ?? job.attachmentRevision,
        width: 0,
        height: 0,
      },
      localAttachment: attachment,
    });
    return;
  }
  if (job.kind === "pdf") {
    const { regenerateEntryPdf } = await import("@/services/diary/regenerateEntryPdf");
    await regenerateEntryPdf(job.userId, entry, {
      user: { uid: job.userId } as never,
      t: (key) => key,
      fileNameHint: "cash-voucher",
    });
  }
}

export async function resumePendingFollowUps(userId: string): Promise<{
  resumed: string[];
  blocked: boolean;
}> {
  const session = captureAdmissionToken();
  if (!mayIssueRemoteWork(session, userId)) return { resumed: [], blocked: true };
  const pending = listFollowUpsSync(userId).filter((job) => job.status === "pending");
  const resumed: string[] = [];
  for (const job of pending) {
    const verdict = classifyFollowUp(job, session?.uid ?? null);
    if (verdict !== "ready") continue;
    const live = readLocalEntryRecordSync(userId, job.recordId);
    if (!live) continue;
    const runner = runnerForTests ?? defaultRunner;
    try {
      await runner(job, live.entry);
      markStatus(job, "done");
      resumed.push(job.id);
    } catch {
      markStatus(job, "pending");
    }
  }
  return { resumed, blocked: false };
}
