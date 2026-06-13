/**
 * Letterhead configuration + document types.
 *
 * Storage model:
 *   • One LetterheadConfig per user. Saving again replaces it.
 *   • The template image is stored as a base64 data URI so it round-trips
 *     through both AsyncStorage (mock) and Firestore (shared-dev/prod)
 *     without any separate Storage SDK.
 *   • The writable area is expressed as percentages of the A4 page so it
 *     stays correct regardless of the image's intrinsic dimensions.
 */

export interface LetterheadMargins {
  /** % of page height from the top of A4 where content starts. */
  topPct: number;
  /** % of page height from the bottom of A4 where content ends. */
  bottomPct: number;
  /** % of page width from the left edge of A4 where content starts. */
  leftPct: number;
  /** % of page width from the right edge of A4 where content ends. */
  rightPct: number;
}

export interface LetterheadConfig {
  userId: string;
  /** Original image dimensions in pixels — useful for preview-time aspect. */
  imageWidth: number;
  imageHeight: number;
  /**
   * Legacy inline base64 (e.g. `data:image/png;base64,...`). Superseded by
   * `letterheadImageStoragePath` when migrated to Firebase Storage.
   */
  imageDataUri?: string | null;
  /** Canonical Firebase Storage object path for the template image. */
  letterheadImageStoragePath?: string | null;
  /** Optional cached download URL for the storage object. */
  letterheadImageDownloadUrl?: string | null;
  /** When the storage-backed template image was last written. */
  letterheadImageUpdatedAt?: number | null;
  /** When legacy inline base64 was migrated to Storage (one-time). */
  letterheadStorageMigratedAt?: number | null;
  margins: LetterheadMargins;
  /**
   * Optional user-scoped reusable assets stored as data URIs. Kept on the
   * config (one per user) rather than per-document so they round-trip with
   * the template and are never shared across users.
   */
  signatureDataUri?: string | null;
  stampDataUri?: string | null;
  /** Reusable letter defaults so the form stays minimal. */
  defaultSenderName?: string | null;
  defaultSenderTitle?: string | null;
  defaultComplimentaryClose?: string | null;
  /**
   * When true (default), the template image repeats on every page of a
   * multi-page letter. `false` is reserved for a future "first page only"
   * mode (not yet selectable in V1).
   */
  repeatTemplateAllPages?: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Defaults used the first time a user uploads a letterhead. Derived from the
 * print-safe A4 inch defaults in `letterheadLayoutConfig` (≈ 2.25in top,
 * 1.25in bottom, 1in sides) so the writable area never collides with a
 * typical printed header/footer band.
 */
export const DEFAULT_LETTERHEAD_MARGINS: LetterheadMargins = {
  topPct: 19,
  bottomPct: 11,
  leftPct: 12,
  rightPct: 12,
};

/** Input shape passed into the create-letterhead form. */
export interface LetterheadDocumentInput {
  title: string;
  date: number; // epoch millis
  /** Optional tracking / reference id printed near the top. */
  reference?: string;
  /** Recipient block (all optional; blank fields never print). */
  recipientName?: string;
  recipientDesignation?: string;
  recipientCompany?: string;
  recipientAddress?: string;
  subject: string;
  /** Opening salutation, e.g. "Dear Sir/Madam,". */
  salutation?: string;
  body: string;
  closing: string;
  name: string;
  designation: string;
  place: string;
  /** Whether to render the user's saved signature image above the name. */
  useSignature?: boolean;
  /** Whether to render the user's saved stamp/seal image in the sign block. */
  useStamp?: boolean;
}

export interface LetterheadRepository {
  get(userId: string): Promise<LetterheadConfig | null>;
  save(
    userId: string,
    patch: Omit<LetterheadConfig, "userId" | "createdAt" | "updatedAt">
  ): Promise<LetterheadConfig>;
  remove(userId: string): Promise<void>;
}

/**
 * Saved letterhead document record. Treated as first-class data —
 * generated/saved any time the user creates a letterhead PDF.
 *
 *   • `templateRefUpdatedAt` is the `updatedAt` of the `LetterheadConfig`
 *     used to generate this document. If the user later replaces their
 *     letterhead, old records still point at the timestamp that was
 *     active when they were created. We don't persist the template image
 *     bytes per-document — that would balloon storage.
 *   • `pdfUri` is best-effort. Generated PDFs are short-lived OS temp
 *     files; on next regenerate the URI is refreshed. UI should
 *     gracefully handle a missing/invalid URI by regenerating from the
 *     stored `input`.
 */
/** A single internal edit/generation event for a letterhead document. */
export interface LetterheadEditHistoryEntry {
  /** 1-based version this entry produced. */
  version: number;
  /** When this version was generated. */
  at: number;
  /** "created" for the first generation, "edited" for subsequent ones. */
  action: "created" | "edited";
}

export interface LetterheadDocument {
  id: string;
  userId: string;
  ueid: string;
  title: string;
  /** Frozen copy of the form inputs so we can regenerate the PDF later. */
  input: LetterheadDocumentInput;
  /** Updated timestamp of the letterhead config at the time of generation. */
  templateRefUpdatedAt: number | null;
  /** Best-effort URI of the most recently generated PDF for this doc. */
  pdfUri: string | null;
  /** True when the user explicitly saved (vs. just shared once). */
  saved: boolean;
  /**
   * Internal-only edit tracking (never printed on the PDF):
   *   • `firstGeneratedAt` — original generation time, preserved across edits.
   *   • `lastEditedAt` — most recent edit (null until first edit).
   *   • `version` — current version number (1 on create, +1 per edit).
   *   • `editHistory` — ordered log of create/edit events.
   */
  firstGeneratedAt?: number;
  lastEditedAt?: number | null;
  version?: number;
  editHistory?: LetterheadEditHistoryEntry[];
  createdAt: number;
  updatedAt: number;
  /** Multi-step save progress — coordination only, no PII. */
  completedSteps?: string[];
}

export type LetterheadDocumentCreateInput = Omit<
  LetterheadDocument,
  "id" | "userId" | "createdAt" | "updatedAt"
> & {
  /** Stable id generated before first write — used for idempotent setDoc. */
  clientRecordId?: string;
};

export interface LetterheadDocumentRepository {
  list(userId: string): Promise<LetterheadDocument[]>;
  get(userId: string, id: string): Promise<LetterheadDocument | null>;
  create(userId: string, record: LetterheadDocumentCreateInput): Promise<LetterheadDocument>;
  update(
    userId: string,
    id: string,
    patch: Partial<
      Pick<
        LetterheadDocument,
        | "pdfUri"
        | "saved"
        | "title"
        | "input"
        | "lastEditedAt"
        | "version"
        | "editHistory"
        | "templateRefUpdatedAt"
      >
    >
  ): Promise<LetterheadDocument>;
  remove(userId: string, id: string): Promise<void>;
}
