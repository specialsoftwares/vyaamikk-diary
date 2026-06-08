export interface IntroTheme {
  isDark: boolean;
  background: string;
  cardGlass: string;
  cardBorder: string;
  text: string;
  secondaryText: string;
  mutedText: string;
  primary: string;
  primarySoft: string;
  pillBackground: string;
  pillBorder: string;
  inactiveDot: string;
  arrowShadow: string;
}

export function createIntroTheme(isDark: boolean): IntroTheme {
  return {
    isDark,
    background: isDark ? "#050505" : "#F8FAFC",
    cardGlass: isDark ? "rgba(17,24,39,0.72)" : "rgba(255,255,255,0.88)",
    cardBorder: isDark ? "rgba(255,255,255,0.10)" : "rgba(79,70,229,0.12)",
    text: isDark ? "#F4F4F5" : "#1F2937",
    secondaryText: isDark ? "#A1A1AA" : "#4B5563",
    mutedText: isDark ? "#71717A" : "#9CA3AF",
    primary: "#4F46E5",
    primarySoft: isDark ? "rgba(79,70,229,0.35)" : "rgba(79,70,229,0.14)",
    pillBackground: isDark ? "rgba(79,70,229,0.12)" : "rgba(79,70,229,0.08)",
    pillBorder: isDark ? "rgba(129,140,248,0.22)" : "rgba(79,70,229,0.14)",
    inactiveDot: isDark ? "rgba(255,255,255,0.22)" : "rgba(17,24,39,0.14)",
    arrowShadow: isDark ? "#312E81" : "#C7D2FE",
  };
}
