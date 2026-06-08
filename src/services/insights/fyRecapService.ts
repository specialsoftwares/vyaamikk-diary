import AsyncStorage from "@react-native-async-storage/async-storage";

import type { FyRecapSnapshot } from "@/domain/businessInsight";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import type { MovementDistanceRecord } from "@/domain/movementInsight";
import type { BusinessInsightRow } from "@/domain/businessInsight";
import { computeCreditSummary, isReceivable } from "@/domain/customerCredit";
import {
  formatFinancialYearLabel,
  getFinancialYearRange,
  isFinancialYearClosed,
  isRecapPrepWindow,
} from "@/utils/financialYear";
import { createLogger } from "@/utils/logger";

import type { CashPaidSummary } from "./businessInsightsDashboard";

const log = createLogger("insights/fyRecap");
const PREFIX = "vyd_fy_recap_v1_";

function key(userId: string, fy: number): string {
  return `${PREFIX}${userId}_${fy}`;
}

export async function loadFyRecapSnapshot(
  userId: string,
  fyStartYear: number
): Promise<FyRecapSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId, fyStartYear));
    if (!raw) return null;
    return JSON.parse(raw) as FyRecapSnapshot;
  } catch {
    return null;
  }
}

async function saveFyRecapSnapshot(userId: string, snap: FyRecapSnapshot): Promise<void> {
  await AsyncStorage.setItem(key(userId, snap.fyStartYear), JSON.stringify(snap));
}

export async function removeFyRecapsForUser(userId: string): Promise<void> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const mine = all.filter((k) => k.startsWith(`${PREFIX}${userId}_`));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch (e) {
    log.warn("purge recaps", e);
  }
}

interface RecapBuildInput {
  parties: BusinessInsightRow[];
  pins: BusinessInsightRow[];
  movements: MovementDistanceRecord[];
  cashPaid: CashPaidSummary;
  creditRecords: CustomerCreditRecord[];
  poCount: number;
  letterheadCount: number;
  pdfsGeneratedCount: number;
  recordsCount: number;
}

const prepScheduled = new Set<string>();

/** Background FY recap — never blocks UI. */
export function scheduleFyRecapPrepare(
  userId: string,
  ueid: string,
  fyStartYear: number,
  input: RecapBuildInput
): void {
  if (!isFinancialYearClosed(fyStartYear) && !isRecapPrepWindow(fyStartYear)) return;
  const token = `${userId}:${fyStartYear}`;
  if (prepScheduled.has(token)) return;
  prepScheduled.add(token);

  setTimeout(() => {
    void (async () => {
      try {
        const existing = await loadFyRecapSnapshot(userId, fyStartYear);
        if (existing?.status === "ready") return;

        await saveFyRecapSnapshot(userId, {
          fyStartYear,
          status: "preparing",
          preparedAt: null,
          recordsCreated: 0,
          pdfsGenerated: 0,
          totalCashPaid: 0,
          approxDistanceKm: 0,
          topParties: [],
          topPins: [],
          topRoutes: [],
          creditActive: 0,
          creditClosed: 0,
          creditPendingBalance: 0,
          purchaseOrders: 0,
          letterheads: 0,
          mostActiveMonth: null,
          mostUsedRecordType: null,
        });

        const { startMs, endMs } = getFinancialYearRange(fyStartYear);
        let creditActive = 0;
        let creditClosed = 0;
        let pending = 0;
        for (const rec of input.creditRecords) {
          if (rec.deletedAt || rec.saleDate < startMs || rec.saleDate >= endMs) continue;
          if (isReceivable(rec)) {
            creditActive += 1;
            pending += computeCreditSummary(rec).balance;
          } else if (rec.status === "fully_paid" || rec.status === "external_completed") {
            creditClosed += 1;
          }
        }

        let km = 0;
        const routeMap = new Map<string, number>();
        for (const m of input.movements) {
          if (m.financialYear !== fyStartYear) continue;
          if (m.approxDistanceKm != null) km += m.approxDistanceKm;
          const route = m.routeLabel ?? `${m.fromPin} → ${m.toPin}`;
          routeMap.set(route, (routeMap.get(route) ?? 0) + 1);
        }

        const snap: FyRecapSnapshot = {
          fyStartYear,
          status: "ready",
          preparedAt: Date.now(),
          recordsCreated: input.recordsCount,
          pdfsGenerated: input.pdfsGeneratedCount,
          totalCashPaid: input.cashPaid.fyTotal,
          approxDistanceKm: Math.round(km),
          topParties: input.parties.slice(0, 5).map((p) => ({
            name: p.displayLabel,
            count: p.recordCount,
          })),
          topPins: input.pins.slice(0, 5).map((p) => ({
            pin: p.displayLabel,
            label: (p.metadata as { state?: string }).state ?? p.displayLabel,
            count: p.recordCount,
          })),
          topRoutes: [...routeMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([route, count]) => ({ route, count, km: null })),
          creditActive,
          creditClosed,
          creditPendingBalance: Math.round(pending),
          purchaseOrders: input.poCount,
          letterheads: input.letterheadCount,
          mostActiveMonth: null,
          mostUsedRecordType: null,
        };

        await saveFyRecapSnapshot(userId, snap);
        void ueid;
      } catch (e) {
        log.warn("recap prepare failed", e);
      } finally {
        prepScheduled.delete(token);
      }
    })();
  }, 2000);
}

export function formatRecapTitle(fyStartYear: number): string {
  return `${formatFinancialYearLabel(fyStartYear)} Summary`;
}
