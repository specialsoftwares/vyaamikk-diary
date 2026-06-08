/**
 * GSTIN (Goods & Services Tax Identification Number) helpers.
 *
 * Format (15 chars): 2-digit state code + 10-char PAN + 1 entity code +
 * "Z" (default) + 1 checksum/alphanumeric.
 *   e.g. 27ABCDE1234F1Z5
 *
 * We validate structure (not the legal checksum digit, which requires the GST
 * algorithm and is out of scope) and extract the state from the leading code.
 */

export const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Uppercase + strip spaces; cap to 15 chars. */
export function normalizeGstin(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase().slice(0, 15);
}

/** Structural validity (15-char GSTIN pattern). */
export function isValidGstin(raw: string): boolean {
  return GSTIN_REGEX.test(normalizeGstin(raw));
}

/** GST state codes → state/UT name (2017 list). */
export const GST_STATE_NAMES: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman & Diu",
  "26": "Dadra & Nagar Haveli",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (Old)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

/** Leading 2-digit state code (only when the GSTIN is structurally valid). */
export function gstinStateCode(raw: string): string | null {
  const g = normalizeGstin(raw);
  if (!isValidGstin(g)) return null;
  return g.slice(0, 2);
}

/** State name for a GSTIN, or null when unknown/invalid. */
export function gstinStateName(raw: string): string | null {
  const code = gstinStateCode(raw);
  if (!code) return null;
  return GST_STATE_NAMES[code] ?? null;
}
