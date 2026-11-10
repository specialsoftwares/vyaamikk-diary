/**
 * Phone sign-in and reactivation copy that is not in the locale catalogs.
 * Hindi is used when the active language is Hindi. Other languages use English.
 * These sentences must not call a code wrong, and must not claim sign-in succeeded,
 * when the attempt ended because the wait expired.
 */

export type PhoneAuthCopy = {
  restoredCode: (phone: string) => string;
  resendWait: string;
  resultUnknown: string;
  sessionChanged: string;
  accountSetupFailed: string;
  reactivateUnknown: string;
  reactivateLocalFailed: string;
};

const en: PhoneAuthCopy = {
  restoredCode: (phone) =>
    `Enter the code already sent to ${phone}. Opening the app did not send a new SMS.`,
  resendWait: "Wait for the timer before requesting another code.",
  resultUnknown:
    "We could not confirm whether verification finished. Wait a moment, then try again.",
  sessionChanged: "This sign-in attempt is no longer current. Start again.",
  accountSetupFailed:
    "Your phone was verified, but account setup did not finish. Try again without requesting a new code.",
  reactivateUnknown:
    "We could not confirm whether reactivation finished. Wait a moment, then try again without requesting another code.",
  reactivateLocalFailed:
    "The account may already be reactivated, but this device could not finish signing in. Try again without requesting a new code.",
};

const hi: PhoneAuthCopy = {
  restoredCode: (phone) =>
    `पहले भेजा गया कोड ${phone} पर दर्ज करें। ऐप खोलने से नया एसएमएस नहीं गया।`,
  resendWait: "नया कोड माँगने से पहले टाइमर का इंतज़ार करें।",
  resultUnknown:
    "सत्यापन पूरा हुआ या नहीं, इसकी पुष्टि नहीं हो सकी। थोड़ी देर बाद फिर कोशिश करें।",
  sessionChanged: "यह साइन-इन अब चालू नहीं है। फिर से शुरू करें।",
  accountSetupFailed:
    "आपका फ़ोन सत्यापित हो गया, लेकिन खाता सेटअप पूरा नहीं हुआ। नया कोड माँगे बिना फिर कोशिश करें।",
  reactivateUnknown:
    "पुनर्सक्रियन पूरा हुआ या नहीं, इसकी पुष्टि नहीं हो सकी। थोड़ी देर बाद फिर कोशिश करें। नया कोड अभी न मांगें।",
  reactivateLocalFailed:
    "अकाउंट सक्रिय हो चुका हो सकता है, पर यह डिवाइस साइन-इन पूरा नहीं कर सका। नया कोड मांगे बिना फिर कोशिश करें।",
};

export function phoneAuthCopy(lang: string | null | undefined): PhoneAuthCopy {
  return lang === "hi" ? hi : en;
}
