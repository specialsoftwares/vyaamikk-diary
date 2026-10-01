export function admissionPath(uid: string): string {
  return `users/${uid}/goodsEvidenceAdmission/runtime`;
}

export function userPath(uid: string): string {
  return `users/${uid}`;
}

export function ledgerPath(uid: string, ledgerId: string): string {
  return `users/${uid}/goodsEvidenceLedgers/${ledgerId}`;
}

export function receiptPath(uid: string, ledgerId: string, receiptId: string): string {
  return `${ledgerPath(uid, ledgerId)}/receipts/${receiptId}`;
}

export function evidenceObjectPath(uid: string, ledgerId: string, evidenceId: string): string {
  return `${ledgerPath(uid, ledgerId)}/evidenceObjects/${evidenceId}`;
}

export function evidenceLinkPath(
  uid: string,
  ledgerId: string,
  receiptId: string,
  evidenceId: string
): string {
  return `${receiptPath(uid, ledgerId, receiptId)}/evidenceLinks/${evidenceId}`;
}

export function evidenceControlPath(uid: string, ledgerId: string, receiptId: string): string {
  return `${receiptPath(uid, ledgerId, receiptId)}/evidenceControl/runtime`;
}

export function uploadControlPath(uid: string): string {
  return `users/${uid}/goodsEvidenceUploadControl/runtime`;
}

export function uploadFlightToken(ledgerId: string, evidenceId: string): string {
  return `${ledgerId}/${evidenceId}`;
}
