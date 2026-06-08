/**
 * User-entered Indian postal metadata (PIN lookup + optional business place name).
 * Not device GPS — used for labels, search, PDFs, and calendar snippets only.
 */

export interface IndianPostalLocation {
  pinCode: string;
  /** Godown / site / business-specific label. */
  placeName: string | null;
  /** Post office or locality name from lookup or user selection. */
  locality: string | null;
  district: string | null;
  state: string | null;
  country: string;
  /** Resolved display label, e.g. "Kota, Rajasthan". */
  displayLabel: string | null;
}

export type PincodeResolutionSource = "cache" | "offline" | "api" | "manual";

export interface PincodeResolution {
  pinCode: string;
  success: boolean;
  source: PincodeResolutionSource;
  localities: string[];
  defaultLocality: string | null;
  district: string | null;
  state: string | null;
  country: string;
}
