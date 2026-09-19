/**
 * Official GST State codes (numeric strings). Client copy of the server
 * table in functions/src/billing/tax/gstin.ts — React Native must not import
 * Functions runtime. Postal abbreviations such as MH / UP are never codes.
 */

export const GST_STATE_NAMES: Readonly<Record<string, string>> = {
  "01": "Jammu and Kashmir",
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
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

export const GST_STATE_CODES = Object.keys(GST_STATE_NAMES).sort();

export function gstStateName(stateCode: string): string | null {
  return GST_STATE_NAMES[stateCode] ?? null;
}

export function isKnownGstStateCode(stateCode: string): boolean {
  return Object.prototype.hasOwnProperty.call(GST_STATE_NAMES, stateCode);
}

export function gstStateLabel(stateCode: string): string {
  const name = gstStateName(stateCode);
  return name ? `${stateCode} · ${name}` : stateCode;
}
