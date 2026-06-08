import type {
  AttachmentRef,
  BusinessEntry,
  BusinessEntryType,
  EntryLocation,
  EntryRecordStatus,
  EntrySource,
} from "@/domain/businessEntry";
import type { EntryReminder } from "@/domain/types";

export type { BusinessEntry, BusinessEntryType };

export interface CreateBusinessEntryInput {
  /** Stable id generated before first write — used for idempotent setDoc. */
  clientRecordId?: string;
  ueid: string;
  entryType: BusinessEntryType;
  title: string;
  entryDate: number;
  notes?: string | null;
  reminder?: EntryReminder | null;
  location?: EntryLocation | null;
  attachments?: AttachmentRef[];
  payload: BusinessEntry["payload"];
  source?: EntrySource;
  status?: EntryRecordStatus;
}

export interface UpdateBusinessEntryInput {
  id: string;
  title?: string;
  entryDate?: number;
  notes?: string | null;
  reminder?: EntryReminder | null;
  location?: EntryLocation | null;
  attachments?: AttachmentRef[];
  payload?: BusinessEntry["payload"];
  status?: EntryRecordStatus;
  pdfUri?: string | null;
}

/** @deprecated Use CreateBusinessEntryInput */
export type CreateDiaryEntryInput = CreateBusinessEntryInput;
/** @deprecated Use UpdateBusinessEntryInput */
export type UpdateDiaryEntryInput = UpdateBusinessEntryInput;

export interface ListDiaryEntriesOptions {
  search?: string;
  entryType?: BusinessEntryType | null;
  /** Only entries with a future reminder. */
  upcomingOnly?: boolean;
  /** @deprecated Use entryType */
  category?: string | null;
  includeDeleted?: boolean;
  limit?: number;
}

export interface DiaryRepository {
  create(userId: string, input: CreateBusinessEntryInput): Promise<BusinessEntry>;
  update(userId: string, input: UpdateBusinessEntryInput): Promise<BusinessEntry>;
  /** Permanently removes the entry document — no soft-delete tombstone. */
  hardDelete(userId: string, id: string): Promise<void>;
  /** @deprecated Use hardDelete */
  softDelete(userId: string, id: string): Promise<void>;
  getById(userId: string, id: string): Promise<BusinessEntry | null>;
  /** Legacy soft-deleted rows — used only for cleanup before hard-delete. */
  getByIdIncludingDeleted?(userId: string, id: string): Promise<BusinessEntry | null>;
  list(userId: string, options?: ListDiaryEntriesOptions): Promise<BusinessEntry[]>;
}
