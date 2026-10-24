import { getLocalDatabase } from "@/localDb/database";
import { LocalPayloadUnavailable, openOwnedPayload, sealOwnedPayload } from "@/services/accountDeletion/localPayload";

export interface ActiveRouteRecord {
  userId: string;
  href: string;
  params: Record<string, string>;
  updatedAt: number;
}

export const activeRouteRepository = {
  async set(userId: string, href: string, params?: Record<string, string>): Promise<void> {
    const db = getLocalDatabase();
    db.runSync(
      `INSERT OR REPLACE INTO active_route (user_id, href, params_json, updated_at)
       VALUES (?, ?, ?, ?)`,
      [userId, href, sealOwnedPayload(userId, JSON.stringify(params ?? {})), Date.now()]
    );
  },

  async get(userId: string): Promise<ActiveRouteRecord | null> {
    const db = getLocalDatabase();
    const row = db.getFirstSync<{
      user_id: string;
      href: string;
      params_json: string | null;
      updated_at: number;
    }>("SELECT * FROM active_route WHERE user_id = ?", [userId]);
    if (!row) return null;
    let params: Record<string, string> = {};
    try {
      const opened = openOwnedPayload(row.user_id, row.params_json ?? "{}");
      if (opened.state !== "ready") throw new LocalPayloadUnavailable(opened.reason);
      params = JSON.parse(opened.value || "{}") as Record<string, string>;
    } catch (error) {
      if (error instanceof LocalPayloadUnavailable) throw error;
      params = {};
    }
    return {
      userId: row.user_id,
      href: row.href,
      params,
      updatedAt: row.updated_at,
    };
  },

  async clear(userId: string): Promise<void> {
    const db = getLocalDatabase();
    db.runSync("DELETE FROM active_route WHERE user_id = ?", [userId]);
  },
};
