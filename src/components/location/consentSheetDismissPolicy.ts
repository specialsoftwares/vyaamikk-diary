/**
 * Pure helpers for consent / prompt hosts — dismiss must never wait on
 * storage or native permission prompts, or a hung await leaves a Modal
 * capturing the whole screen (including native tab bar on some platforms).
 */

export function shouldKeepConsentSheetVisible(opts: {
  /** User explicitly dismissed or allow completed. */
  dismissed: boolean;
  /** Host is mid native-permission request. */
  busy: boolean;
}): boolean {
  if (opts.dismissed) return false;
  // Busy alone must not force visibility — the sheet may already be closing.
  return true;
}

/** Not-now / dismiss actions must stay enabled while Allow is busy. */
export function isConsentDismissDisabled(_busy: boolean): boolean {
  return false;
}
