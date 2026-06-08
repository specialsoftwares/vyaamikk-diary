import type { ColorScheme } from "@/theme/palettes";

/** Premium auth surface — indigo-forward Vyaamikk Diary onboarding. */
export function authV2GradientStops(isDark: boolean): [string, string, string] {
  if (isDark) {
    return ["#1E2468", "#12152E", "#06070D"];
  }
  return ["#4F46E5", "#3730A3", "#14162B"];
}

export function authV2Tokens(colors: ColorScheme, isDark: boolean) {
  return {
    heading: "#FFFFFF",
    body: isDark ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.85)",
    muted: "rgba(255,255,255,0.55)",
    inputBg: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.14)",
    inputBorder: isDark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.22)",
    inputText: "#FFFFFF",
    placeholder: "rgba(255,255,255,0.4)",
    ctaActiveBg: "#FFFFFF",
    ctaActiveText: colors.primaryDark,
    ctaMutedBg: "rgba(255,255,255,0.12)",
    ctaMutedText: "rgba(255,255,255,0.35)",
    backBtnBg: "rgba(255,255,255,0.1)",
    backBtnBorder: "rgba(255,255,255,0.2)",
    cardBg: isDark ? "rgba(18,21,46,0.92)" : "rgba(42,47,143,0.88)",
    cardBorder: "rgba(255,255,255,0.14)",
    link: colors.primaryLight,
    danger: "#FFB4AB",
    primary: colors.primary,
  };
}
