import type { Lang } from "./types";

/** Hardcoded wait copy — never read from i18n during mid-switch. */
export const LANGUAGE_SWITCH_WAIT: Record<Lang, string> = {
  en: "Updating language, please wait…",
  hi: "भाषा अपडेट हो रही है, कृपया प्रतीक्षा करें…",
  ta: "மொழ புதுப்பிக்கப்படுகிறது, தயவுசெய்து காத்திருங்கள்…",
  te: "భాష నవీకరించబడుతోంది, దయచేసి వేచి ఉడండి…",
  gu: "ભાષા અપડેટ થઈ રહ છે, કૃપા કરીને રહ જુઓ…",
};

export const LANGUAGE_SWITCH_SURFACE = "#1E1B4B";

export const LANGUAGE_SWITCH_MIN_HOLD_MS = 1200;

export function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Noto families loaded at app start via LocaleFontProvider. */
export const LANGUAGE_SWITCH_FONT: Partial<Record<Lang, string>> = {
  hi: "NotoSansDevanagari_400Regular",
  ta: "NotoSansTamil_400Regular",
  te: "NotoSansTelugu_400Regular",
  gu: "NotoSansGujarati_400Regular",
};
