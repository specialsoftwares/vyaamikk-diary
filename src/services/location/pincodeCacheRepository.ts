import type { PincodeResolution } from "@/domain/indianPostal";
import { getLocalDatabase } from "@/localDb/database";

const TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const pincodeCacheRepository = {
  async get(pinCode: string): Promise<PincodeResolution | null> {
    try {
      const db = getLocalDatabase();
      const row = db.getFirstSync<{ payload_json: string; cached_at: number }>(
        "SELECT payload_json, cached_at FROM pincode_cache WHERE pin_code = ?",
        [pinCode]
      );
      if (!row) return null;
      if (Date.now() - row.cached_at > TTL_MS) {
        db.runSync("DELETE FROM pincode_cache WHERE pin_code = ?", [pinCode]);
        return null;
      }
      return JSON.parse(row.payload_json) as PincodeResolution;
    } catch {
      return null;
    }
  },

  async set(resolution: PincodeResolution): Promise<void> {
    if (!resolution.success) return;
    try {
      const db = getLocalDatabase();
      db.runSync(
        `INSERT OR REPLACE INTO pincode_cache (pin_code, payload_json, cached_at)
         VALUES (?, ?, ?)`,
        [resolution.pinCode, JSON.stringify(resolution), Date.now()]
      );
    } catch {
      // Cache miss is non-fatal
    }
  },
};
