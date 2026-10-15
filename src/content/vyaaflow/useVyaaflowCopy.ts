import { useT } from "@/i18n";

import { vyaaflowCopy, vyaaflowPendingLocaleKeys } from "./copy";

function readPending(
  t: (key: string) => string,
  key: string,
  english: string
): string {
  const value = t(key);
  return value && value !== key ? value : english;
}

/** Visible VyaaFlow strings for the active language. English falls back from the catalog. */
export function useVyaaflowCopy() {
  const t = useT();
  return {
    screenTitle: t("calendarMaps.vyaaflow.screenTitle"),
    intro: readPending(
      t,
      vyaaflowPendingLocaleKeys.introCompact,
      vyaaflowCopy.introCompact
    ),
    showDetails: t("calendarMaps.vyaaflow.showDetails"),
    hideDetails: t("calendarMaps.vyaaflow.hideDetails"),
    calendarSection: t("calendarMaps.vyaaflow.calendarSection"),
    filters: {
      all: readPending(t, vyaaflowPendingLocaleKeys.filterAll, vyaaflowCopy.filters.all),
      myBusiness: readPending(
        t,
        vyaaflowPendingLocaleKeys.filterMyBusiness,
        vyaaflowCopy.filters.myBusiness
      ),
      statutory: readPending(
        t,
        vyaaflowPendingLocaleKeys.filterStatutory,
        vyaaflowCopy.filters.statutory
      ),
    },
    statutoryReferenceTitle: readPending(
      t,
      vyaaflowPendingLocaleKeys.statutoryReferenceTitle,
      vyaaflowCopy.statutoryReference.title
    ),
    statutoryReferenceSubtitle: t("statutory.tabSubtitle"),
    disclaimer: t("calendarMaps.vyaaflow.paragraphs.statutory"),
    paragraphs: {
      businessDates: t("calendarMaps.vyaaflow.paragraphs.businessDates"),
      statutory: t("calendarMaps.vyaaflow.paragraphs.statutory"),
    },
    detectMyPin: {
      action: t("calendarMaps.vyaaflow.detectMyPin.action"),
      reason: t("calendarMaps.vyaaflow.detectMyPin.reason"),
      continue: t("calendarMaps.vyaaflow.detectMyPin.continue"),
      notNow: t("calendarMaps.vyaaflow.detectMyPin.notNow"),
      working: t("calendarMaps.vyaaflow.detectMyPin.working"),
      confirmLead: t("calendarMaps.vyaaflow.detectMyPin.confirmLead"),
      approximateNote: t("calendarMaps.vyaaflow.detectMyPin.approximateNote"),
      usePin: t("calendarMaps.vyaaflow.detectMyPin.usePin"),
      typeInstead: t("calendarMaps.vyaaflow.detectMyPin.typeInstead"),
      denied: t("calendarMaps.vyaaflow.detectMyPin.denied"),
      unavailable: t("calendarMaps.vyaaflow.detectMyPin.unavailable"),
      keptManual: t("calendarMaps.vyaaflow.detectMyPin.keptManual"),
    },
  };
}
