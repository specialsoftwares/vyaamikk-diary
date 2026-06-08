export interface IntroCard {
  key: string;
  icon: string;
  labelEn: string;
  titleEn: string;
  titleHi: string;
  bodyEn: string;
  bodyHi: string;
  /** Short centered benefit lines (English). */
  highlightsEn?: string[];
  highlightsHi?: string[];
}

export const INTRO_CARDS: IntroCard[] = [
  {
    key: "new-record",
    icon: "plus-circle-outline",
    labelEn: "New record",
    titleEn: "Add business records in one place",
    titleHi: "एक जगह पर व्यापारिक रिकॉर्ड जोड़ें",
    bodyEn: "Use + New Record on your dashboard to capture day-to-day work with a calm, structured flow.",
    bodyHi: "डैशबोर्ड पर + नया रिकॉर्ड से रोज़ का काम साफ़ और व्यवस्थित तरीके से दर्ज करें।",
    highlightsEn: [
      "Work updates & staff notes",
      "Payment requests & cash records",
      "Freight, material & reminders",
    ],
    highlightsHi: [
      "वर्क अपडेट और स्टाफ नोट्स",
      "पेमेंट रिक्वेस्ट और कैश रिकॉर्ड",
      "फ्रेट, मटेरियल और रिमाइंडर",
    ],
  },
  {
    key: "vyaamikk-id",
    icon: "card-account-details-outline",
    labelEn: "Vyaamikk ID",
    titleEn: "Your stable business identity",
    titleHi: "आपकी स्थायी व्यापारिक पहचान",
    bodyEn:
      "When you sign in, you receive a Vyaamikk ID (UEID) — one permanent identifier tied to your verified mobile number.",
    bodyHi:
      "साइन इन पर आपको Vyaamikk ID (UEID) मिलती है — आपके सत्यापित मोबाइल से जुड़ी एक स्थायी पहचान।",
    highlightsEn: [
      "Stays the same across devices & reinstalls",
      "Shown on records and PDFs you generate",
      "Helps keep your diary clearly yours",
    ],
    highlightsHi: [
      "डिवाइस बदलने या रीइंस्टॉल पर भी वही ID",
      "आपके रिकॉर्ड और PDF पर दिखती है",
      "डायरी साफ़ तौर पर आपकी रहती है",
    ],
  },
  {
    key: "pdfs",
    icon: "file-pdf-box",
    labelEn: "Professional PDF",
    titleEn: "Export ready-to-share PDFs",
    titleHi: "शेयर करने योग्य PDF तैयार करें",
    bodyEn:
      "Generate clean A4 documents with your name, business identity, Vyaamikk ID and edit history — professional output for your records.",
    bodyHi:
      "अपने नाम, बिज़नेस पहचान, Vyaamikk ID और एडिट हिस्ट्री के साथ साफ़ A4 PDF — आपके रिकॉर्ड के लिए प्रोफेशनल आउटपुट।",
  },
];
