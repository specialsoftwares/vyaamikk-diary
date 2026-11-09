import type { CrashConsentStatus } from "./crashConsentState";

export type CrashConsentCopy = {
  modalTitle: string;
  modalBody: string;
  allow: string;
  decline: string;
  title: string;
  status: Record<CrashConsentStatus, string>;
  detail: Record<CrashConsentStatus, string>;
  /** Unsent reports only. Uploaded reports are not deleted by this request. */
  unsentDeletionRequested: string;
};

const en: CrashConsentCopy = {
  modalTitle: "Help improve Vyaamikk Diary",
  modalBody:
    "Crash reports stay off until this account's choice is saved, confirmed, and crash reporting is turned on. Reports do not include personal data, business records, or account identifiers. You can change this in Settings.",
  allow: "Allow crash reports",
  decline: "No thanks",
  title: "Share crash reports",
  status: {
    pending: "Pending",
    active: "Active",
    failed: "Failed",
    unavailable: "Unavailable",
    off: "Off",
  },
  detail: {
    pending: "Your choice is waiting to be saved or confirmed. Crash reporting stays off until then.",
    active: "Crash reporting is on for this account on this device.",
    failed: "Crash reporting stayed off. The choice could not be saved or reporting could not be turned on.",
    unavailable: "Crash reporting is unavailable on this device. It stays off.",
    off: "Crash reporting is off for this account.",
  },
  unsentDeletionRequested:
    "Deletion of unsent crash reports on this device was requested. Reports already uploaded are not deleted.",
};

const hi: CrashConsentCopy = {
  modalTitle: "व्यामिक डायरी को बेहतर बनाने में मदद करें",
  modalBody:
    "इस खाते की पसंद सहेजने, पुष्टि होने और क्रैश रिपोर्टिंग चालू होने तक रिपोर्ट बंद रहती हैं। रिपोर्ट में व्यक्तिगत डेटा, व्यापार रिकॉर्ड या खाता पहचान शामिल नहीं होती। आप इसे सेटिंग में बदल सकते हैं।",
  allow: "क्रैश रिपोर्ट की अनुमति दें",
  decline: "नहीं, धन्यवाद",
  title: "क्रैश रिपोर्ट साझा करें",
  status: {
    pending: "लंबित",
    active: "सक्रिय",
    failed: "विफल",
    unavailable: "उपलब्ध नहीं",
    off: "बंद",
  },
  detail: {
    pending: "आपकी पसंद सहेजने या पुष्टि होने की प्रतीक्षा में है। तब तक क्रैश रिपोर्टिंग बंद रहेगी।",
    active: "इस खाते के लिए इस डिवाइस पर क्रैश रिपोर्टिंग चालू है।",
    failed: "क्रैश रिपोर्टिंग बंद रही। पसंद सहेजी नहीं जा सकी या रिपोर्टिंग चालू नहीं हो सकी।",
    unavailable: "इस डिवाइस पर क्रैश रिपोर्टिंग उपलब्ध नहीं है। यह बंद रहेगी।",
    off: "इस खाते के लिए क्रैश रिपोर्टिंग बंद है।",
  },
  unsentDeletionRequested:
    "इस डिवाइस पर न भेजी गई क्रैश रिपोर्ट हटाने का अनुरोध किया गया था। जो रिपोर्ट पहले ही अपलोड हो चुकी हैं, वे नहीं हटतीं।",
};

/** English, or Hindi when the app language is Hindi. */
export function crashConsentCopy(lang: string): CrashConsentCopy {
  return lang === "hi" ? hi : en;
}
