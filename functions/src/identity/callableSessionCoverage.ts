/**
 * Inventory of backend entry points and whether they enforce the
 * authSecurity origin cutoff. Service-to-service entry points stay excluded.
 */
export const CALLABLE_SESSION_COVERAGE = {
  mintClientAuthToken: "enforced",
  recordAgeAssessment: "enforced",
  sealOwnerContent: "enforced",
  openOwnerContent: "enforced",
  recordProcessingPurpose: "enforced",
  logoutAllDevices: "enforced",
  resolveOrCreateUserByPhone: "enforced",
  checkMobileQuarantine: "enforced",
  rebindQuarantinedMobileCallable: "enforced",
  preflightVerifiedMobileContactChange: "enforced",
  confirmVerifiedMobileContactChange: "enforced",
  startEmailVerification: "enforced",
  resendEmailVerification: "enforced",
  verifyAndBindEmail: "enforced",
  changeVerifiedEmail: "enforced",
  startAccountRecovery: "enforced",
  completeAccountRecovery: "enforced",
  openManualRecoveryCase: "enforced",
  resolveManualRecoveryCase: "enforced",
  startAccountReactivation: "enforced",
  completeAccountReactivation: "enforced",
  ensureAccountDeletionJob: "enforced",
  retireIdentity: "enforced",
  completeAccountDeletion: "enforced",
  registerNewDeviceSecurityEvent: "enforced",
  retryNewDeviceSecurityEmail: "enforced",
  verifyGstinManual: "enforced",
  validateAndActivateIOS: "enforced",
  validateAndActivateAndroid: "enforced",
  updateBillingDetails: "enforced",
  reviewSubscriptionTaxCompliance: "enforced",
  retryReconciliationWorkItem: "enforced",
  prepareIOSBillingAccount: "enforced",
  prepareAndroidBillingAccount: "enforced",
  markGstr1Filed: "enforced",
  getPlayPurchaseAdmission: "enforced",
  getInvoiceDownloadUrl: "enforced",
  generateGstr1WorkingPapers: "enforced",
  grinRegisterGoodsReceipt: "enforced",
  grinReconcileCommand: "enforced",
  grinMutateGoodsReceipt: "enforced",
  grinReadGoodsReceipt: "enforced",
  grinReserveEvidence: "enforced",
  grinBeginEvidenceUpload: "enforced",
  grinUploadEvidence: "enforced",
  androidRtdn: "Play RTDN authenticates the push with OIDC, not a user ID token.",
  appStoreServerNotificationsV2:
    "App Store server notifications authenticate Apple's signed payload, not a user ID token.",
  scheduledBillingReconciliation:
    "Cloud Scheduler invokes this job with the Functions service identity.",
  scheduledDeletionCleanup: "Cloud Scheduler invokes this job with the Functions service identity.",
  handleWasNotMeToken:
    "The signed single-use link is the credential. The handler records a report and does not revoke Firebase refresh tokens.",
  handleWasNotMeTokenHttp:
    "The email deep link uses the same signed token and does not revoke Firebase refresh tokens.",
} as const;

export type CallableSessionName = keyof typeof CALLABLE_SESSION_COVERAGE;
