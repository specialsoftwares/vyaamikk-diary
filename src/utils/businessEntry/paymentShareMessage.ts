import type { BusinessEntry } from "@/domain/businessEntry";
import { buildPaymentRequestShareText } from "@/services/share/shareTextBuilders";

/** @deprecated Prefer `buildPaymentRequestShareText` from shareTextService. */
export function formatPaymentShareMessage(entry: BusinessEntry): string {
  return buildPaymentRequestShareText(entry, {
    locale: "en",
    t: (key) => key,
  });
}
