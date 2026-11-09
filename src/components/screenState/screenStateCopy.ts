/**
 * English and Hindi copy for recoverable screen states.
 * These sentences are not loaded from src/i18n locale catalogues.
 */

export interface ScreenStateCopy {
  errorTitle: string;
  retry: string;
  back: string;
  offlineSaved: string;
  offlineNoCache: string;
  slow: string;
  searchNoMatchTitle: string;
  searchNoMatchBody: string;
  searchEmptyLibraryTitle: string;
  searchEmptyLibraryBody: string;
  searchClear: string;
  searchFailedTitle: string;
  searchFailedBody: string;
  permissionTitle: string;
  permissionCameraBody: string;
  permissionLibraryBody: string;
  openSettings: string;
  usePhotosInstead: string;
  useCameraInstead: string;
  continueWithoutPhoto: string;
  sessionTitle: string;
  sessionBody: string;
  savedOnDevice: string;
  confirmed: string;
  signedOut: string;
}

const EN: ScreenStateCopy = {
  errorTitle: "Something went wrong",
  retry: "Try again",
  back: "Back",
  offlineSaved:
    "Saved on this device. You are offline, so this has not been confirmed by the server.",
  offlineNoCache: "You are offline. There is no saved copy on this device to show.",
  slow: "This is taking longer than usual. What is already on screen stays here.",
  searchNoMatchTitle: "No matches",
  searchNoMatchBody: "Nothing matches this search. Change the words or clear the search.",
  searchEmptyLibraryTitle: "No records yet",
  searchEmptyLibraryBody: "There are no records to search yet.",
  searchClear: "Clear search",
  searchFailedTitle: "Search could not finish",
  searchFailedBody: "Search did not finish. Try again. Your words stay in the box.",
  permissionTitle: "Permission needed",
  permissionCameraBody:
    "The camera is used only when you choose to attach an optional photo of this customer to the record. That photo stays on this device.",
  permissionLibraryBody:
    "Your photos are used only when you choose an existing picture to attach to this customer record. That copy stays on this device.",
  openSettings: "Open Settings",
  usePhotosInstead: "Choose a photo instead",
  useCameraInstead: "Take a photo instead",
  continueWithoutPhoto: "Continue without a photo",
  sessionTitle: "Please sign in again",
  sessionBody:
    "Your session has ended. What you have typed stays on this screen. A record will not be written until you sign in again.",
  savedOnDevice: "Saved on this device",
  confirmed: "Confirmed by the server",
  signedOut: "Sign in to see records for your account.",
};

const HI: ScreenStateCopy = {
  errorTitle: "कुछ गलत हो गया",
  retry: "फिर कोशिश करें",
  back: "वापस",
  offlineSaved:
    "इस डिवाइस पर सहेजा गया है। आप ऑफ़लाइन हैं, इसलिए सर्वर ने इसकी पुष्टि नहीं की है।",
  offlineNoCache: "आप ऑफ़लाइन हैं। इस स्क्रीन के लिए इस डिवाइस पर कोई सहेजी प्रति नहीं है।",
  slow: "इसमें सामान्य से अधिक समय लग रहा है। स्क्रीन पर जो पहले से है, वह यहीं रहता है।",
  searchNoMatchTitle: "कोई मेल नहीं",
  searchNoMatchBody: "इस खोज से कुछ नहीं मिला। शब्द बदलें या खोज साफ़ करें।",
  searchEmptyLibraryTitle: "अभी कोई रिकॉर्ड नहीं",
  searchEmptyLibraryBody: "खोजने के लिए अभी कोई रिकॉर्ड नहीं है।",
  searchClear: "खोज साफ़ करें",
  searchFailedTitle: "खोज पूरी नहीं हुई",
  searchFailedBody: "खोज पूरी नहीं हो सकी। फिर कोशिश करें। आपके शब्द बॉक्स में रहेंगे।",
  permissionTitle: "अनुमति चाहिए",
  permissionCameraBody:
    "कैमरा तभी इस्तेमाल होता है जब आप इस ग्राहक की वैकल्पिक फ़ोटो रिकॉर्ड में जोड़ना चुनते हैं। वह फ़ोटो इस डिवाइस पर रहती है।",
  permissionLibraryBody:
    "आपकी फ़ोटो तभी इस्तेमाल होती हैं जब आप इस ग्राहक के रिकॉर्ड में कोई मौजूदा चित्र जोड़ना चुनते हैं। वह प्रति इस डिवाइस पर रहती है।",
  openSettings: "सेटिंग्स खोलें",
  usePhotosInstead: "इसके बजाय फ़ोटो चुनें",
  useCameraInstead: "इसके बजाय फ़ोटो लें",
  continueWithoutPhoto: "बिना फ़ोटो के आगे बढ़ें",
  sessionTitle: "कृपया फिर से साइन इन करें",
  sessionBody:
    "आपका सत्र समाप्त हो गया है। जो आपने टाइप किया है वह इस स्क्रीन पर रहता है। फिर से साइन इन करने तक रिकॉर्ड नहीं लिखा जाएगा।",
  savedOnDevice: "इस डिवाइस पर सहेजा गया",
  confirmed: "सर्वर ने पुष्टि की",
  signedOut: "अपने खाते के रिकॉर्ड देखने के लिए साइन इन करें।",
};

export function screenStateCopy(lang: string): ScreenStateCopy {
  return lang === "hi" ? HI : EN;
}
