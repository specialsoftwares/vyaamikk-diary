import { getLocalDatabase } from "@/localDb/database";
import { shortId } from "@/utils/id";

export type FormDraftKind =
  | "composer"
  | "letterhead"
  | "identity"
  | "professional_pack";

export type DraftStatus = "active" | "converted" | "discarded";
export type DraftSource = "user" | "recovery";

export interface FormDraftRecord {
  id: string;
  userId: string;
  draftKind: FormDraftKind;
  scopeKey: string;
  entryId: string | null;
  title: string;
  status: DraftStatus;
  source: DraftSource;
  payload: Record<string, unknown>;
  updatedAt: number;
}

type DraftRow = {
  id: string;
  user_id: string;
  draft_kind: string;
  scope_key: string;
  entry_id: string | null;
  title: string | null;
  status: string | null;
  source: string | null;
  payload_json: string;
  updated_at: number;
};

function rowToDraft(row: DraftRow): FormDraftRecord {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  const status = row.status === "converted" || row.status === "discarded" ? row.status : "active";
  const source = row.source === "user" ? "user" : "recovery";
  return {
    id: row.id,
    userId: row.user_id,
    draftKind: row.draft_kind as FormDraftKind,
    scopeKey: row.scope_key,
    entryId: row.entry_id,
    title: row.title?.trim() || "",
    status,
    source,
    payload,
    updatedAt: row.updated_at,
  };
}

function selectDraftSql(extra = ""): string {
  return `SELECT id, user_id, draft_kind, scope_key, entry_id,
    COALESCE(title, '') AS title,
    COALESCE(status, 'active') AS status,
    COALESCE(source, 'recovery') AS source,
    payload_json, updated_at
    FROM form_drafts ${extra}`;
}

export const formDraftsRepository = {
  async getById(userId: string, draftId: string): Promise<FormDraftRecord | null> {
    const db = getLocalDatabase();
    const row = db.getFirstSync<DraftRow>(
      `${selectDraftSql("WHERE user_id = ? AND id = ?")}`,
      [userId, draftId]
    );
    return row ? rowToDraft(row) : null;
  },

  /** Recovery slot — one per (user, kind, scope, entry). Not shown in drafts list. */
  async saveRecovery(input: {
    userId: string;
    draftKind: FormDraftKind;
    scopeKey: string;
    entryId?: string | null;
    payload: Record<string, unknown>;
  }): Promise<FormDraftRecord> {
    const db = getLocalDatabase();
    const entryId = input.entryId ?? null;
    const updatedAt = Date.now();
    const existing = db.getFirstSync<DraftRow>(
      `${selectDraftSql(
        `WHERE user_id = ? AND draft_kind = ? AND scope_key = ?
         AND COALESCE(entry_id, '') = COALESCE(?, '') AND source = 'recovery'`
      )}`,
      [input.userId, input.draftKind, input.scopeKey, entryId ?? ""]
    );
    const id = existing?.id ?? shortId("draft");
    const payloadJson = JSON.stringify(input.payload);
    db.runSync(
      `INSERT OR REPLACE INTO form_drafts
       (id, user_id, draft_kind, scope_key, entry_id, title, status, source, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 'recovery', ?, ?)`,
      [id, input.userId, input.draftKind, input.scopeKey, entryId, "", payloadJson, updatedAt]
    );
    return {
      id,
      userId: input.userId,
      draftKind: input.draftKind,
      scopeKey: input.scopeKey,
      entryId,
      title: "",
      status: "active",
      source: "recovery",
      payload: input.payload,
      updatedAt,
    };
  },

  async loadRecovery(input: {
    userId: string;
    draftKind: FormDraftKind;
    scopeKey: string;
    entryId?: string | null;
  }): Promise<FormDraftRecord | null> {
    const db = getLocalDatabase();
    const entryId = input.entryId ?? null;
    const row = db.getFirstSync<DraftRow>(
      `${selectDraftSql(
        `WHERE user_id = ? AND draft_kind = ? AND scope_key = ?
         AND COALESCE(entry_id, '') = COALESCE(?, '') AND source = 'recovery' AND status = 'active'`
      )}`,
      [input.userId, input.draftKind, input.scopeKey, entryId ?? ""]
    );
    return row ? rowToDraft(row) : null;
  },

  /** User-saved draft — many per scope; identified by draft id. */
  async saveUserDraft(input: {
    userId: string;
    draftKind: FormDraftKind;
    scopeKey: string;
    entryId?: string | null;
    draftId?: string | null;
    title: string;
    payload: Record<string, unknown>;
  }): Promise<FormDraftRecord> {
    const db = getLocalDatabase();
    const entryId = input.entryId ?? null;
    const updatedAt = Date.now();
    let id = input.draftId ?? null;
    if (id) {
      const existing = db.getFirstSync<DraftRow>(
        `${selectDraftSql("WHERE user_id = ? AND id = ? AND source = 'user'")}`,
        [input.userId, id]
      );
      if (!existing) id = null;
    }
    if (!id) id = shortId("draft");
    const payloadJson = JSON.stringify(input.payload);
    db.runSync(
      `INSERT OR REPLACE INTO form_drafts
       (id, user_id, draft_kind, scope_key, entry_id, title, status, source, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 'user', ?, ?)`,
      [
        id,
        input.userId,
        input.draftKind,
        input.scopeKey,
        entryId,
        input.title.trim(),
        payloadJson,
        updatedAt,
      ]
    );
    return {
      id,
      userId: input.userId,
      draftKind: input.draftKind,
      scopeKey: input.scopeKey,
      entryId,
      title: input.title.trim(),
      status: "active",
      source: "user",
      payload: input.payload,
      updatedAt,
    };
  },

  async updateUserDraftTitle(
    userId: string,
    draftId: string,
    title: string
  ): Promise<void> {
    const db = getLocalDatabase();
    db.runSync(
      `UPDATE form_drafts SET title = ?, updated_at = ? WHERE user_id = ? AND id = ? AND source = 'user'`,
      [title.trim(), Date.now(), userId, draftId]
    );
  },

  async listActiveUserDrafts(
    userId: string,
    options?: { draftKind?: FormDraftKind; scopeKey?: string; limit?: number }
  ): Promise<FormDraftRecord[]> {
    const db = getLocalDatabase();
    const clauses = ["user_id = ?", "source = 'user'", "status = 'active'"];
    const params: (string | number)[] = [userId];
    if (options?.draftKind) {
      clauses.push("draft_kind = ?");
      params.push(options.draftKind);
    }
    if (options?.scopeKey) {
      clauses.push("scope_key = ?");
      params.push(options.scopeKey);
    }
    const limit = options?.limit ?? 200;
    const rows = db.getAllSync<DraftRow>(
      `${selectDraftSql(`WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`)}`,
      [...params, limit]
    );
    return rows.map(rowToDraft);
  },

  async countActiveUserDrafts(userId: string): Promise<number> {
    const db = getLocalDatabase();
    const row = db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM form_drafts
       WHERE user_id = ? AND source = 'user' AND status = 'active'`,
      [userId]
    );
    return row?.n ?? 0;
  },

  async getMostRecentUserDraft(
    userId: string,
    draftKind?: FormDraftKind
  ): Promise<FormDraftRecord | null> {
    const list = await this.listActiveUserDrafts(userId, {
      draftKind,
      limit: 1,
    });
    return list[0] ?? null;
  },

  /** @deprecated Use loadRecovery — kept for migration callers during transition. */
  async load(input: {
    userId: string;
    draftKind: FormDraftKind;
    scopeKey: string;
    entryId?: string | null;
  }): Promise<FormDraftRecord | null> {
    const user = await this.listActiveUserDrafts(input.userId, {
      draftKind: input.draftKind,
      scopeKey: input.scopeKey,
      limit: 1,
    });
    const match = user.find(
      (d) => (d.entryId ?? "") === (input.entryId ?? "")
    );
    if (match) return match;
    return this.loadRecovery(input);
  },

  /** @deprecated Use saveRecovery. */
  async save(input: {
    userId: string;
    draftKind: FormDraftKind;
    scopeKey: string;
    entryId?: string | null;
    payload: Record<string, unknown>;
  }): Promise<FormDraftRecord> {
    return this.saveRecovery(input);
  },

  async clearRecovery(input: {
    userId: string;
    draftKind: FormDraftKind;
    scopeKey: string;
    entryId?: string | null;
  }): Promise<void> {
    const db = getLocalDatabase();
    const entryId = input.entryId ?? null;
    db.runSync(
      `DELETE FROM form_drafts
       WHERE user_id = ? AND draft_kind = ? AND scope_key = ?
       AND COALESCE(entry_id, '') = COALESCE(?, '') AND source = 'recovery'`,
      [input.userId, input.draftKind, input.scopeKey, entryId ?? ""]
    );
  },

  async discardDraft(userId: string, draftId: string): Promise<void> {
    const db = getLocalDatabase();
    db.runSync(
      `UPDATE form_drafts SET status = 'discarded', updated_at = ? WHERE user_id = ? AND id = ?`,
      [Date.now(), userId, draftId]
    );
  },

  async deleteDraft(userId: string, draftId: string): Promise<void> {
    const db = getLocalDatabase();
    db.runSync(`DELETE FROM form_drafts WHERE user_id = ? AND id = ?`, [userId, draftId]);
  },

  async markConverted(userId: string, draftId: string): Promise<void> {
    const db = getLocalDatabase();
    db.runSync(
      `UPDATE form_drafts SET status = 'converted', updated_at = ? WHERE user_id = ? AND id = ?`,
      [Date.now(), userId, draftId]
    );
  },

  async clear(input: {
    userId: string;
    draftKind: FormDraftKind;
    scopeKey: string;
    entryId?: string | null;
  }): Promise<void> {
    await this.clearRecovery(input);
    const db = getLocalDatabase();
    const entryId = input.entryId ?? null;
    db.runSync(
      `UPDATE form_drafts SET status = 'discarded', updated_at = ?
       WHERE user_id = ? AND draft_kind = ? AND scope_key = ?
       AND COALESCE(entry_id, '') = COALESCE(?, '') AND source = 'user' AND status = 'active'`,
      [Date.now(), input.userId, input.draftKind, input.scopeKey, entryId ?? ""]
    );
  },

  /** Latest active user draft (any composer type) for boot / dashboard. */
  async getMostRecentComposerDraft(userId: string): Promise<FormDraftRecord | null> {
    return this.getMostRecentUserDraft(userId, "composer");
  },
};
