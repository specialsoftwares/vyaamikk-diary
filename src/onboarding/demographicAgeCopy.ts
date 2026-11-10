import type { DemographicAgeBand } from "@/onboarding/demographicAge";

export type DemographicAgeCopy = {
  title: string;
  helper: string;
  skip: string;
  bands: Record<DemographicAgeBand, string>;
};

export const DEMOGRAPHIC_AGE_COPY: Record<"en" | "hi", DemographicAgeCopy> = {
  en: {
    title: "Age range (optional)",
    helper:
      "Used only as a demographic band. Prefer not to say is fine, and skipping this does not block your diary.",
    skip: "Skip",
    bands: {
      under_18: "Under 18",
      "18_24": "18–24",
      "25_34": "25–34",
      "35_44": "35–44",
      "45_54": "45–54",
      "55_plus": "55+",
      prefer_not_to_say: "Prefer not to say",
    },
  },
  hi: {
    title: "आयु सीमा (वैकल्पिक)",
    helper:
      "यह केवल एक जनसांख्यिकीय वर्ग है। नहीं बताना ठीक है, और इसे छोड़ने से आपकी डायरी नहीं रुकती।",
    skip: "छोड़ें",
    bands: {
      under_18: "18 से कम",
      "18_24": "18–24",
      "25_34": "25–34",
      "35_44": "35–44",
      "45_54": "45–54",
      "55_plus": "55+",
      prefer_not_to_say: "नहीं बताना चाहते",
    },
  },
};

/** English for every language other than Hindi. Locale catalogs are not used. */
export function demographicAgeCopy(language: string | null | undefined): DemographicAgeCopy {
  if (language === "hi") return DEMOGRAPHIC_AGE_COPY.hi;
  return DEMOGRAPHIC_AGE_COPY.en;
}
