import type { LocationFootprintPreferences } from "@/domain/locationFootprintPreferences";

export type LocationAccessTone = "positive" | "neutral" | "muted" | "warning";

export function resolveLocationAccessDisplay(
  prefs: LocationFootprintPreferences | null,
  t: (key: string) => string
): { label: string; tone: LocationAccessTone } {
  if (!prefs) {
    return { label: t("settings.locationAccessLoading"), tone: "muted" };
  }

  const { locationPermissionStatus: perm, locationFootprintsEnabled: enabled } = prefs;

  if (perm === "blocked") {
    return { label: t("settings.locationAccessSystem"), tone: "warning" };
  }
  if (perm === "denied") {
    return { label: t("settings.locationAccessDenied"), tone: "warning" };
  }
  if (perm === "unknown") {
    return { label: t("settings.locationAccessAsk"), tone: "muted" };
  }
  if (perm === "granted" && enabled) {
    return { label: t("settings.locationAccessAllowed"), tone: "positive" };
  }
  if (perm === "granted" && !enabled) {
    return { label: t("settings.locationAccessOff"), tone: "neutral" };
  }

  return { label: t("settings.locationAccessAsk"), tone: "muted" };
}
