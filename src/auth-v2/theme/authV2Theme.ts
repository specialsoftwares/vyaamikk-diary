import { AUTH_SECONDARY_ACTIVE } from "@/actionSystem/authSecondaryActive";
import type { ColorScheme } from "@/theme/palettes";

/** Premium auth surface — indigo-forward Vyaamikk Diary onboarding. */
export function authV2GradientStops(isDark: boolean): [string, string, string] {
  if (isDark) {
    return ["#24307A", "#171B3D", "#0B0D18"];
  }
  return ["#4F46E5", "#3730A3", "#171B3D"];
}

export function authV2Tokens(colors: ColorScheme, isDark: boolean) {
  return {
    heading: "#FFFFFF",
    body: isDark ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.9)",
    muted: "rgba(255,255,255,0.62)",
    /** Readable secondary text-action on the dark auth gradient (not primaryLight). */
    secondaryAction: "rgba(199,210,254,0.92)",
    tertiaryAction: "rgba(199,210,254,0.72)",
    secondaryActionMuted: "rgba(199,210,254,0.42)",
    /**
     * Outlined Edit/Change/Choose on dark auth cards.
     * Fixed periwinkle — never derived from `colors.primaryLight` / `link`.
     */
    secondaryActiveFg: AUTH_SECONDARY_ACTIVE.fg,
    secondaryActiveBorder: AUTH_SECONDARY_ACTIVE.border,
    secondaryActiveFill: AUTH_SECONDARY_ACTIVE.fill,
    secondaryActivePressedFill: AUTH_SECONDARY_ACTIVE.pressedFill,
    secondaryActiveDisabledFg: AUTH_SECONDARY_ACTIVE.disabledFg,
    secondaryActiveDisabledBorder: AUTH_SECONDARY_ACTIVE.disabledBorder,
    secondaryActiveDisabledFill: AUTH_SECONDARY_ACTIVE.disabledFill,
    inputBg: isDark ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.16)",
    inputBorder: isDark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.22)",
    inputText: "#FFFFFF",
    placeholder: "rgba(255,255,255,0.4)",
    ctaActiveBg: isDark ? "#8B91FF" : "#4F46E5",
    ctaActiveText: isDark ? "#0B0D18" : "#FFFFFF",
    ctaMutedBg: isDark ? "rgba(165,180,252,0.28)" : "rgba(199,210,254,0.42)",
    ctaMutedText: isDark ? "rgba(237,240,255,0.9)" : "rgba(30,27,75,0.72)",
    ctaMutedBorder: isDark ? "rgba(165,180,252,0.55)" : "rgba(99,102,241,0.4)",
    backBtnBg: "rgba(255,255,255,0.1)",
    backBtnBorder: "rgba(255,255,255,0.2)",
    cardBg: isDark ? "rgba(18,21,46,0.92)" : "rgba(42,47,143,0.88)",
    cardBorder: "rgba(255,255,255,0.14)",
    /**
     * Legacy link token — may equal dark `primaryLight` (#252A52).
     * Do NOT use for enabled secondary Edit/Change controls; use secondaryActive*.
     */
    link: colors.primaryLight,
    danger: "#FFB4AB",
    primary: colors.primary,
  };
}
