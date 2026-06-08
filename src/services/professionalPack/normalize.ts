import type {
  ProfessionalCategory,
  ProfessionalMatterType,
  ProfessionalPackStatus,
  ProfessionalServicePack,
} from "@/domain/professionalPack";
import type { AttachmentRef } from "@/domain/businessEntry";
import type { EntryReminder, UEID } from "@/domain/types";

function parseReminder(raw: unknown): EntryReminder | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    at: Number(r.at),
    note: String(r.note ?? ""),
    notificationId: r.notificationId == null ? null : String(r.notificationId),
  };
}

export function normaliseProfessionalPack(
  raw: unknown,
  fallbackUeid: UEID = "VYD-0000-000000"
): ProfessionalServicePack | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;

  const facts =
    r.facts && typeof r.facts === "object"
      ? (r.facts as Record<string, string | number | null>)
      : {};

  return {
    id: r.id,
    userId: String(r.userId ?? ""),
    ueid: typeof r.ueid === "string" ? (r.ueid as UEID) : fallbackUeid,
    professionalCategory: r.professionalCategory as ProfessionalCategory,
    matterType: r.matterType as ProfessionalMatterType,
    title: String(r.title ?? ""),
    facts,
    linkedEntryIds: Array.isArray(r.linkedEntryIds)
      ? (r.linkedEntryIds as string[]).filter((x) => typeof x === "string")
      : [],
    attachments: Array.isArray(r.attachments)
      ? (r.attachments as AttachmentRef[]).filter((a) => a && typeof a.id === "string")
      : [],
    matterDate: Number(r.matterDate ?? Date.now()),
    dueDate: r.dueDate == null ? null : Number(r.dueDate),
    reminder: parseReminder(r.reminder),
    status: (r.status as ProfessionalPackStatus) ?? "active",
    professionalName:
      typeof r.professionalName === "string" ? r.professionalName : null,
    professionalContact:
      typeof r.professionalContact === "string" ? r.professionalContact : null,
    notes: typeof r.notes === "string" && r.notes.trim() ? r.notes.trim() : null,
    pdfUri: typeof r.pdfUri === "string" ? r.pdfUri : null,
    createdAt: Number(r.createdAt ?? Date.now()),
    updatedAt: Number(r.updatedAt ?? Date.now()),
    deletedAt: r.deletedAt == null ? null : Number(r.deletedAt),
  };
}

export function packToStorage(pack: ProfessionalServicePack): Record<string, unknown> {
  return { ...pack };
}
