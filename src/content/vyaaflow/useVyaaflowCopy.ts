import { useT } from "@/i18n";

/** Visible VyaaFlow strings for the active language. English falls back from the catalog. */
export function useVyaaflowCopy() {
  const t = useT();
  return {
    screenTitle: t("calendarMaps.vyaaflow.screenTitle"),
    intro: t("calendarMaps.vyaaflow.intro"),
    showDetails: t("calendarMaps.vyaaflow.showDetails"),
    hideDetails: t("calendarMaps.vyaaflow.hideDetails"),
    calendarSection: t("calendarMaps.vyaaflow.calendarSection"),
    mapSection: t("calendarMaps.vyaaflow.mapSection"),
    paragraphs: {
      businessDates: t("calendarMaps.vyaaflow.paragraphs.businessDates"),
      statutory: t("calendarMaps.vyaaflow.paragraphs.statutory"),
      businessPins: t("calendarMaps.vyaaflow.paragraphs.businessPins"),
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
    pinList: {
      empty: t("calendarMaps.vyaaflow.pinList.empty"),
      approximate: t("calendarMaps.vyaaflow.pinList.approximate"),
      from: t("calendarMaps.vyaaflow.pinList.from"),
      to: t("calendarMaps.vyaaflow.pinList.to"),
      unplotted: t("calendarMaps.vyaaflow.pinList.unplotted"),
      invalid: t("calendarMaps.vyaaflow.pinList.invalid"),
      mapNote: t("calendarMaps.vyaaflow.pinList.mapNote"),
      mapEmpty: t("calendarMaps.vyaaflow.pinList.mapEmpty"),
    },
  };
}
