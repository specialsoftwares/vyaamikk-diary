import type statutoryEn from "./statutoryEn";

/** Hindi statutory strings — structure mirrors statutoryEn. */
const statutoryHi: typeof statutoryEn = {
  tabLabel: "सांविधिक",
  tabTitle: "सांविधिक जानकारी",
  tabSubtitle: "मानक ड्यू तारीखें — केवल सूचना",
  disclaimer:
    "व्यामिक डायरी सुविधा के लिए सामान्य सांविधिक तारीखें दिखाती है। लागू होना आपके पंजीकरण, टर्नओवर और तथ्यों पर निर्भर है। तारीखें अधिसूचना से बदल सकती हैं। आधिकारिक पोर्टल या CA/CS से पुष्टि करें।",
  filters: {
    all: "सभी",
    GST: "GST",
    IncomeTax: "आयकर",
    TDS_TCS: "TDS / TCS",
    LLP: "LLP",
  },
  urgency: {
    "1": "1 दिन में ड्यू",
    "3": "3 दिन में ड्यू",
    "5": "5 दिन में ड्यू",
    "7": "7 दिन में ड्यू",
    later: "बाद में",
  },
  sections: { reference: "संदर्भ नोट", dismissed: "खारिज / पढ़ा" },
  empty: {
    title: "कोई आगामी सांविधिक सूचना नहीं",
    message: "जब मानक ड्यू तारीख रिमाइंडर विंडो में होगी, यहाँ दिखेगी।",
  },
  display: {
    periodLine: "{{period}} अवधि",
    dueLine: "ड्यू: {{date}}",
  },
  card: {
    due: "ड्यू {{date}} · {{days}} दिन शेष",
    daysLeft: "{{days}} दिन शेष",
  },
  calendar: {
    section: "सांविधिक जानकारी",
    markerSubtitle: "सूचनात्मक — लागू होना पुष्टि करें",
    legendStatutory: "सांविधिक",
  },
  prompt: {
    title: "सांविधिक जानकारी",
    subtitle: "कुछ मानक ड्यू तारीखें जल्द प्रासंगिक हो सकती हैं।",
    dueLine: "ड्यू {{date}} · {{days}} दिन शेष",
    footer: "केवल जानकारी। तारीखें अधिसूचना से बदल सकती हैं।",
    okThanks: "ठीक है, धन्यवाद",
    laterToday: "आज बाद में बताएं",
    openTab: "सांविधिक जानकारी खोलें",
  },
  caution: {
    standard:
      "मानक ड्यू तारीख दिखाई गई है। सरकार अधिसूचना से बदल सकती है। GST पोर्टल या पेशेवर से पुष्टि करें।",
    income_tax:
      "मानक आयकर समयरेखा। विस्तार संभव। आयकर पोर्टल या पेशेवर से पुष्टि करें।",
    mca: "मानक MCA समयरेखा। शुल्क/तारीख बदल सकती है। MCA पोर्टल से पुष्टि करें।",
  },
  source: {
    gst_portal: "संकेत — GST पोर्टल FAQ",
    income_tax: "संकेत — आयकर विभाग",
    mca: "संकेत — MCA LLP अनुपालन",
  },
  notes: {
    gst_interest: "यदि लागू हो, विलंबित GST पर ब्याज (धारा 50 — अधिसूचना अनुसार, अक्सर 18% वार्षिक)।",
    gst_late_fee: "यदि लागू हो, विलंबित रिटर्न पर विलंब शुल्क (अक्सर ₹50/दिन, निल ₹20)।",
    it_234bc: "यदि लागू हो, अग्रिम कर पर धारा 234B/234C ब्याज।",
    it_234f: "यदि लागू हो, विलंबित ITR पर धारा 234F शुल्क।",
    tds_234e: "यदि लागू हो, विलंबित TDS रिटर्न पर धारा 234E।",
    tds_interest: "यदि लागू हो, TDS पर ब्याज — पेशेवर से परामर्श करें।",
    llp_late_fee: "यदि लागू हो, विलंबित LLP फॉर्म पर MCA अतिरिक्त शुल्क।",
  },
  templates: {
    gst_gstr1_monthly: {
      title: "GSTR-1 (मासिक)",
      applicability: "यदि आप मासिक GSTR-1 दाखिल करते हैं।",
      body: "मानक ड्यू आमतौर अगले महीने की 11 तारीख।",
    },
    gst_gstr1_quarterly: {
      title: "GSTR-1 (त्रैमासिक / QRMP)",
      applicability: "यदि आप QRMP त्रैमासिक GSTR-1 दाखिल करते हैं।",
      body: "मानक ड्यू आमतौर तिमाही के बाद 13 तारीख।",
    },
    gst_gstr3b_monthly: {
      title: "GSTR-3B (मासिक)",
      applicability: "यदि आप मासिक GSTR-3B दाखिल करते हैं।",
      body: "मानक ड्यू आमतौर अगले महीने की 20 तारीख।",
    },
    gst_gstr3b_qrmp: {
      title: "GSTR-3B (QRMP त्रैमासिक)",
      applicability: "यदि आप QRMP त्रैमासिक GSTR-3B दाखिल करते हैं।",
      body: "मानक ड्यू आमतौर 22 या 24 — राज्य/केंद्रशासित जांचें।",
    },
    gst_qrmp_pmt06: {
      title: "QRMP PMT-06 (मासिक कर)",
      applicability: "यदि QRMP में तिमाही के पहले दो महीनों का मासिक कर देय है।",
      body: "PMT-06 आमतौर अगले महीने की 25 तारीख तक।",
    },
    gst_cmp08: {
      title: "CMP-08 (कम्पोजिशन)",
      applicability: "यदि आप कम्पोजिशन करदाता हैं।",
      body: "CMP-08 आमतौर तिमाही के बाद 18 तारीख।",
    },
    gst_gstr4_annual: {
      title: "GSTR-4 (वार्षिक)",
      applicability: "यदि वार्षिक GSTR-4 दाखिल करना है।",
      body: "आमतौर 30 अप्रैल (विस्तार संभव)।",
    },
    gst_gstr9_annual: {
      title: "GSTR-9 (वार्षिक रिटर्न)",
      applicability: "यदि GST वार्षिक रिटर्न लागू है।",
      body: "आमतौर वित्तीय वर्ष के बाद 31 दिसंबर।",
    },
    gst_gstr9c_annual: {
      title: "GSTR-9C (समाधान)",
      applicability: "यदि टर्नओवर सीमा पर समाधान लागू है।",
      body: "आमतौर 31 दिसंबर (विस्तार संभव)।",
    },
    gst_note_interest: {
      title: "विलंबित GST पर ब्याज",
      applicability: "यदि कर विलंब से भुगतान हुआ।",
      body: "धारा 50 के तहत ब्याज (अधिसूचना अनुसार)।",
    },
    gst_note_late_fee: {
      title: "विलंबित GST रिटर्न शुल्क",
      applicability: "यदि रिटर्न विलंब से दाखिल हुआ।",
      body: "विलंब शुल्क लागू हो सकता है (धारा 47 ढांचा)।",
    },
    it_advance_general: { applicability: "यदि अनुमानित कर देयता ₹10,000 से अधिक है।" },
    it_advance_jun: { title: "अग्रिम कर — 15 जून", body: "यदि आवश्यक, संचयी 15% जून तक।" },
    it_advance_sep: { title: "अग्रिम कर — 15 सितंबर", body: "यदि आवश्यक, संचयी 45% सितंबर तक।" },
    it_advance_dec: { title: "अग्रिम कर — 15 दिसंबर", body: "यदि आवश्यक, संचयी 75% दिसंबर तक।" },
    it_advance_mar: { title: "अग्रिम कर — 15 मार्च", body: "यदि आवश्यक, 100% मार्च तक।" },
    it_presumptive_mar: {
      title: "अग्रिम कर — 44AD/44ADA",
      applicability: "यदि आप धारा 44AD/44ADA पर हैं।",
      body: "आमतौर 15 मार्च तक 100% अग्रिम कर।",
    },
    it_itr_salaried: {
      title: "ITR — वेतनभोगी",
      applicability: "यदि वेतनभोगी/गैर-ऑडिट ITR दाखिल करना है।",
      body: "आमतौर 31 जुलाई (विस्तार/31 अगस्त संभव)।",
    },
    it_itr_business_non_audit: {
      title: "ITR — व्यवसाय (गैर-ऑडिट)",
      applicability: "यदि ऑडिट रहित व्यवसाय ITR दाखिल करना है।",
      body: "कई मामलों में 31 अगस्त (AY 2026-27) — श्रेणी पुष्टि करें।",
    },
    it_itr_audit: {
      title: "ITR — ऑडिट",
      applicability: "यदि कर ऑडिट लागू है।",
      body: "आमतौर 31 अक्टूबर।",
    },
    it_tax_audit_report: {
      title: "कर ऑडिट रिपोर्ट",
      applicability: "यदि ऑडिट लागू और ITR 31 अक्टूबर है।",
      body: "रिपोर्ट आमतौर 30 सितंबर तक।",
    },
    it_itr_transfer_pricing: {
      title: "ITR — ट्रांसफर प्राइसिंग",
      applicability: "यदि अंतर्राष्ट्रीय/निर्दिष्ट लेनदेन लागू है।",
      body: "आमतौर 30 नवंबर ITR ड्यू।",
    },
    it_tp_report_92e: {
      title: "रिपोर्ट (धारा 92E)",
      applicability: "यदि अंतर्राष्ट्रीय लेनदेन रिपोर्टिंग लागू है।",
      body: "आमतौर ITR से एक महीने पहले।",
    },
    tds_monthly_deposit: {
      title: "TDS मासिक जमा",
      applicability: "यदि आप TDS काटते हैं (गैर-सरकारी)।",
      body: "अगले महीने की 7 तारीख; मार्च कटौती 30 अप्रैल।",
    },
    tds_return: { applicability: "यदि त्रैमासिक TDS रिटर्न दाखिल करते हैं।" },
    tds_return_q1: { title: "TDS Q1", body: "आमतौर 31 जुलाई।" },
    tds_return_q2: { title: "TDS Q2", body: "आमतौर 31 अक्टूबर।" },
    tds_return_q3: { title: "TDS Q3", body: "आमतौर 31 जनवरी।" },
    tds_return_q4: { title: "TDS Q4", body: "आमतौर 31 मई।" },
    tds_certificate_note: {
      title: "TDS प्रमाणपत्र",
      applicability: "यदि TDS प्रमाणपत्र जारी करते हैं।",
      body: "16A त्रैमासिक; 16 वेतन के लिए वार्षिक।",
    },
    llp_form11: {
      title: "LLP फॉर्म 11",
      applicability: "यदि LLP है (गतिविधि न हो तब भी)।",
      body: "प्रत्येक वर्ष 30 मई तक।",
    },
    llp_form8: {
      title: "LLP फॉर्म 8",
      applicability: "यदि LLP है।",
      body: "प्रत्येक वर्ष 30 अक्टूबर तक।",
    },
    llp_audit_threshold: {
      title: "LLP ऑडिट सीमा",
      applicability: "यदि टर्नओवर/योगदान सीमा पार हो।",
      body: "ऑडिट लागू हो सकता है — वर्तमान कानून पुष्टि करें।",
    },
    llp_itr: { applicability: "यदि LLP को ITR-5 दाखिल करना है।" },
    llp_itr_non_audit: { title: "LLP ITR (गैर-ऑडिट)", body: "अक्सर 31 अगस्त — ऑडिट पुष्टि करें।" },
    llp_itr_audit: { title: "LLP ITR (ऑडिट)", body: "अक्सर 31 अक्टूबर; TP 30 नवंबर।" },
  },
};

export default statutoryHi;
