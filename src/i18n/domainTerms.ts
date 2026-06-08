/**
 * Domain-sensitive terms that must not be auto-translated blindly.
 * Google translate script keeps these in English until manually reviewed.
 */
export const DOMAIN_TERM_PATTERNS: readonly RegExp[] = [
  /\bGST\b/i,
  /\bGSTIN\b/i,
  /\bPAN\b/i,
  /\bTDS\b/i,
  /\bEMI\b/i,
  /\bPO\b/i,
  /\bLLP\b/i,
  /\binvoice\b/i,
  /\bpurchase order\b/i,
  /\bledger\b/i,
  /\boutstanding\b/i,
  /\bclosure\b/i,
  /\bdispatch\b/i,
  /\bconsignment\b/i,
  /\bfreight\b/i,
  /\be-?way bill\b/i,
  /\bcredit note\b/i,
  /\bdebit note\b/i,
  /\bchallan\b/i,
  /\bbalance\b/i,
  /\btax\b/i,
  /\bsupplier\b/i,
  /\bvendor\b/i,
  /\bconsignee\b/i,
  /\bstatutory\b/i,
  /\bcompliance\b/i,
  /\binsight\b/i,
  /₹/,
];

export const DOMAIN_KEY_PATTERNS: readonly RegExp[] = [
  /invoice/i,
  /ledger/i,
  /purchaseOrder/i,
  /purchase[-_]?order/i,
  /\bpo\b/i,
  /dispatch/i,
  /consignment/i,
  /outstanding/i,
  /closure/i,
  /creditNote/i,
  /debitNote/i,
  /gst/i,
  /gstin/i,
  /\bpan\b/i,
  /statutory/i,
  /compliance/i,
  /insight/i,
  /\brecord/i,
  /saved/i,
  /saving/i,
  /draft/i,
  /serial/i,
  /freight/i,
  /eway/i,
  /challan/i,
];

export function isDomainSensitiveString(value: string): boolean {
  return DOMAIN_TERM_PATTERNS.some((re) => re.test(value));
}

export function isDomainSensitiveKey(key: string): boolean {
  return DOMAIN_KEY_PATTERNS.some((re) => re.test(key));
}

export function isDomainSensitive(key: string, value: string): boolean {
  return isDomainSensitiveString(value) || isDomainSensitiveKey(key);
}
