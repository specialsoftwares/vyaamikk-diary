/** Calendar-day count from invoice date (inclusive start) to due date (inclusive end). */
export function paymentPeriodDays(
  invoiceDateMs: number | null | undefined,
  dueDateMs: number | null | undefined
): number | null {
  if (invoiceDateMs == null || dueDateMs == null) return null;
  if (!Number.isFinite(invoiceDateMs) || !Number.isFinite(dueDateMs)) return null;
  const start = startOfLocalDay(invoiceDateMs);
  const end = startOfLocalDay(dueDateMs);
  const diff = Math.round((end - start) / MS_PER_DAY);
  return diff;
}

export function isPaymentPeriodInvalid(
  invoiceDateMs: number | null | undefined,
  dueDateMs: number | null | undefined
): boolean {
  const days = paymentPeriodDays(invoiceDateMs, dueDateMs);
  return days != null && days < 0;
}

export function formatPaymentPeriodLine(
  invoiceDateMs: number | null | undefined,
  dueDateMs: number | null | undefined,
  locale: "en" | "hi" = "en"
): string | null {
  const days = paymentPeriodDays(invoiceDateMs, dueDateMs);
  if (days == null || days < 0) return null;
  if (locale === "hi") {
    return `भुगतान अवधि: चालान तिथि से देय तिथि तक ${days} दिन।`;
  }
  return `Payment period: ${days} day${days === 1 ? "" : "s"} from invoice date to due date.`;
}

export function formatPaymentPeriodHelper(
  invoiceDateMs: number | null | undefined,
  dueDateMs: number | null | undefined,
  locale: "en" | "hi" = "en"
): string | null {
  const days = paymentPeriodDays(invoiceDateMs, dueDateMs);
  if (days == null) return null;
  if (days < 0) return null;
  if (locale === "hi") {
    return `भुगतान अवधि: ${days} दिन`;
  }
  return `Payment period: ${days} day${days === 1 ? "" : "s"}`;
}

const MS_PER_DAY = 86_400_000;

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
