import type { LetterheadDocument, LetterheadDocumentInput } from "./types";

function optStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function parseLetterheadDocument(
  id: string,
  raw: Record<string, unknown>,
  userId: string
): LetterheadDocument {
  const input = (raw.input ?? {}) as Partial<LetterheadDocumentInput>;
  const editHistory = Array.isArray(raw.editHistory)
    ? (raw.editHistory as LetterheadDocument["editHistory"])
    : undefined;
  const completedSteps = Array.isArray(raw.completedSteps)
    ? (raw.completedSteps as string[])
    : undefined;
  return {
    id,
    userId,
    ueid: String(raw.ueid ?? ""),
    title: String(raw.title ?? ""),
    input: {
      title: String(input.title ?? ""),
      date: Number(input.date ?? Date.now()),
      reference: optStr(input.reference),
      recipientName: optStr(input.recipientName),
      recipientDesignation: optStr(input.recipientDesignation),
      recipientCompany: optStr(input.recipientCompany),
      recipientAddress: optStr(input.recipientAddress),
      subject: String(input.subject ?? ""),
      salutation: optStr(input.salutation),
      body: String(input.body ?? ""),
      closing: String(input.closing ?? ""),
      name: String(input.name ?? ""),
      designation: String(input.designation ?? ""),
      place: String(input.place ?? ""),
      useSignature: input.useSignature === true,
      useStamp: input.useStamp === true,
    },
    templateRefUpdatedAt:
      raw.templateRefUpdatedAt == null ? null : Number(raw.templateRefUpdatedAt),
    pdfUri: typeof raw.pdfUri === "string" ? raw.pdfUri : null,
    saved: Boolean(raw.saved ?? true),
    firstGeneratedAt: raw.firstGeneratedAt == null ? undefined : Number(raw.firstGeneratedAt),
    lastEditedAt: raw.lastEditedAt == null ? null : Number(raw.lastEditedAt),
    version: raw.version == null ? undefined : Number(raw.version),
    editHistory,
    createdAt: Number(raw.createdAt ?? Date.now()),
    updatedAt: Number(raw.updatedAt ?? Date.now()),
    completedSteps,
  };
}
