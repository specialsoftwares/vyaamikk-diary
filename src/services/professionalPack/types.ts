import type {
  ProfessionalCategory,
  ProfessionalMatterType,
  ProfessionalPackStatus,
  ProfessionalServicePack,
} from "@/domain/professionalPack";
import type { AttachmentRef } from "@/domain/businessEntry";
import type { EntryReminder, UEID } from "@/domain/types";

export type { ProfessionalServicePack };

export interface CreateProfessionalPackInput {
  /** Stable id generated before first write — used for idempotent setDoc. */
  clientRecordId?: string;
  ueid: UEID;
  professionalCategory: ProfessionalCategory;
  matterType: ProfessionalMatterType;
  title: string;
  facts: Record<string, string | number | null>;
  linkedEntryIds?: string[];
  attachments?: AttachmentRef[];
  matterDate: number;
  dueDate?: number | null;
  reminder?: EntryReminder | null;
  status?: ProfessionalPackStatus;
  professionalName?: string | null;
  professionalContact?: string | null;
  notes?: string | null;
  pdfUri?: string | null;
}

export interface UpdateProfessionalPackInput {
  id: string;
  title?: string;
  facts?: Record<string, string | number | null>;
  linkedEntryIds?: string[];
  attachments?: AttachmentRef[];
  matterDate?: number;
  dueDate?: number | null;
  reminder?: EntryReminder | null;
  status?: ProfessionalPackStatus;
  professionalName?: string | null;
  professionalContact?: string | null;
  notes?: string | null;
  pdfUri?: string | null;
}

export interface ListProfessionalPacksOptions {
  search?: string;
  category?: ProfessionalCategory | null;
  status?: ProfessionalPackStatus | null;
  includeDeleted?: boolean;
  limit?: number;
}

export interface ProfessionalPackRepository {
  create(userId: string, input: CreateProfessionalPackInput): Promise<ProfessionalServicePack>;
  update(userId: string, input: UpdateProfessionalPackInput): Promise<ProfessionalServicePack>;
  hardDelete(userId: string, id: string): Promise<void>;
  /** @deprecated Use hardDelete */
  softDelete(userId: string, id: string): Promise<void>;
  getById(userId: string, id: string): Promise<ProfessionalServicePack | null>;
  getByIdIncludingDeleted?(userId: string, id: string): Promise<ProfessionalServicePack | null>;
  list(userId: string, options?: ListProfessionalPacksOptions): Promise<ProfessionalServicePack[]>;
}
