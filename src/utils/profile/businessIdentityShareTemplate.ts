/**
 * Central policy for digital business-card share text (native share sheet).
 * UEID and mobile are off by default — visible only in Settings when enabled later.
 */

export interface BusinessIdentityShareTemplateOptions {
  /** When true, append Vyaamikk ID line (default: false). */
  includeUeid?: boolean;
  /** When true, append phone/email on the role line (default: false). */
  includeContact?: boolean;
}

export const DEFAULT_BUSINESS_IDENTITY_SHARE_TEMPLATE: Required<BusinessIdentityShareTemplateOptions> =
  {
    includeUeid: false,
    includeContact: false,
  };
