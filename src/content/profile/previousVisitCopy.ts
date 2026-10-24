/**
 * Previous-visit strings for the You identity card.
 * Coordinator: merge into locale catalogs under `you.identityCard.previousVisit`.
 * English is canonical. Other languages are drafts until that merge.
 * The card calls this module directly so the line can ship before locales update.
 */

export const PREVIOUS_VISIT_LOCALE_KEY = "you.identityCard.previousVisit" as const;

export interface PreviousVisitCopy {
  label: string;
  first: string;
  unavailable: string;
  a11yPrevious: string;
  a11yFirst: string;
  a11yUnavailable: string;
}

export const PREVIOUS_VISIT_COPY = {
  en: {
    label: "Previous visit",
    first: "First visit",
    unavailable: "Not available",
    a11yPrevious: "Previous visit, {when}",
    a11yFirst: "First visit. No earlier visit is recorded on this device.",
    a11yUnavailable: "Previous visit is not available.",
  },
  hi: {
    label: "पिछली विज़िट",
    first: "पहली विज़िट",
    unavailable: "उपलब्ध नहीं",
    a11yPrevious: "पिछली विज़िट, {when}",
    a11yFirst: "पहली विज़िट। इस डिवाइस पर पहले की कोई विज़िट दर्ज नहीं है।",
    a11yUnavailable: "पिछली विज़िट उपलब्ध नहीं है।",
  },
  ta: {
    label: "முந்தைய வருகை",
    first: "முதல் வருகை",
    unavailable: "இல்லை",
    a11yPrevious: "முந்தைய வருகை, {when}",
    a11yFirst: "முதல் வருகை. இந்த சாதனத்தில் முந்தைய வருகை பதிவாகவில்லை.",
    a11yUnavailable: "முந்தைய வருகை இல்லை.",
  },
  te: {
    label: "మునుపటి సందర్శన",
    first: "మొదటి సందర్శన",
    unavailable: "అందుబాటులో లేదు",
    a11yPrevious: "మునుపటి సందర్శన, {when}",
    a11yFirst: "మొదటి సందర్శన. ఈ పరికరంలో మునుపటి సందర్శన నమోదు కాలేదు.",
    a11yUnavailable: "మునుపటి సందర్శన అందుబాటులో లేదు.",
  },
  gu: {
    label: "પહેલાની મુલાકાત",
    first: "પહેલી મુલાકાત",
    unavailable: "ઉપલબ્ધ નથી",
    a11yPrevious: "પહેલાની મુલાકાત, {when}",
    a11yFirst: "પહેલી મુલાકાત. આ ડિવાઇસ પર પહેલાંની મુલાકાત નોંધાઈ નથી.",
    a11yUnavailable: "પહેલાની મુલાકાત ઉપલબ્ધ નથી.",
  },
} as const satisfies Record<string, PreviousVisitCopy>;

export type PreviousVisitCopyLang = keyof typeof PREVIOUS_VISIT_COPY;

export function previousVisitCopy(lang: string | null | undefined): PreviousVisitCopy {
  if (lang && Object.prototype.hasOwnProperty.call(PREVIOUS_VISIT_COPY, lang)) {
    return PREVIOUS_VISIT_COPY[lang as PreviousVisitCopyLang];
  }
  return PREVIOUS_VISIT_COPY.en;
}

export function previousVisitAccessibilityText(
  lang: string | null | undefined,
  kind: "previous" | "first" | "unavailable",
  when?: string
): string {
  const copy = previousVisitCopy(lang);
  if (kind === "first") return copy.a11yFirst;
  if (kind === "unavailable") return copy.a11yUnavailable;
  return copy.a11yPrevious.replace("{when}", when ?? copy.unavailable);
}
