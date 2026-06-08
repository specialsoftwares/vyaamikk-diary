import type { ProfileSalutationId } from "@/domain/profileSalutation";
import type { UserProfile, ProfileLogoRef } from "@/domain/types";
import type { ProfilePatch } from "@/services/auth/types";
import type { PickedLogoAsset } from "@/services/profileLogo/storage";

export type LogoDraft =
  | { status: "unchanged" }
  | { status: "picked"; previewUri: string; asset: PickedLogoAsset }
  | { status: "removed" };

export interface IdentityFormValues {
  salutation: ProfileSalutationId;
  displayName: string;
  businessName: string;
  workType: string;
  businessEmail: string;
  designation: string;
}

export interface IdentityBaseline {
  salutation: ProfileSalutationId;
  displayName: string;
  businessName: string;
  workType: string;
  businessEmail: string;
  designation: string;
  includeLogoOnPdf: boolean;
  hadLogo: boolean;
}

export function snapshotIdentityBaseline(user: UserProfile): IdentityBaseline {
  return {
    salutation: user.salutation ?? "none",
    displayName: user.displayName?.trim() ?? "",
    businessName: user.businessName?.trim() ?? "",
    workType: user.workType?.trim() ?? "",
    businessEmail: user.businessEmail?.trim() ?? "",
    designation: user.designation?.trim() ?? "",
    includeLogoOnPdf: user.pdfBranding?.includeProfileLogo !== false,
    hadLogo: Boolean(user.profileLogo?.localUri),
  };
}

export function isDetailsFormDirty(
  baseline: IdentityBaseline,
  values: IdentityFormValues
): boolean {
  if (values.displayName.trim() !== baseline.displayName) return true;
  if (values.salutation !== baseline.salutation) return true;
  if (values.businessName.trim() !== baseline.businessName) return true;
  if (values.workType.trim() !== baseline.workType) return true;
  if (values.businessEmail.trim() !== baseline.businessEmail) return true;
  if (values.designation.trim() !== baseline.designation) return true;
  return false;
}

export function isBrandingDirty(
  baseline: IdentityBaseline,
  includeLogoOnPdf: boolean,
  logoDraft: LogoDraft
): boolean {
  if (includeLogoOnPdf !== baseline.includeLogoOnPdf) return true;
  if (logoDraft.status === "picked") return true;
  if (logoDraft.status === "removed" && baseline.hadLogo) return true;
  return false;
}

export function isIdentityDirty(
  baseline: IdentityBaseline,
  values: IdentityFormValues,
  includeLogoOnPdf: boolean,
  logoDraft: LogoDraft
): boolean {
  return (
    isDetailsFormDirty(baseline, values) ||
    isBrandingDirty(baseline, includeLogoOnPdf, logoDraft)
  );
}

/** Preview logo URI for the identity card (draft overrides saved profile). */
export function previewLogoUri(
  user: UserProfile,
  logoDraft: LogoDraft
): string | null {
  if (logoDraft.status === "picked") return logoDraft.previewUri;
  if (logoDraft.status === "removed") return null;
  return user.profileLogo?.localUri ?? null;
}

export function buildIdentityProfilePatch(
  user: UserProfile,
  baseline: IdentityBaseline,
  values: IdentityFormValues,
  includeLogoOnPdf: boolean,
  logoDraft: LogoDraft
): ProfilePatch | null {
  const patch: ProfilePatch = {};
  const displayName = values.displayName.trim();
  const salutation = values.salutation === "none" ? null : values.salutation;
  const businessName = values.businessName.trim() || null;
  const workType = values.workType.trim() || null;
  const businessEmail = values.businessEmail.trim().toLowerCase() || null;
  const designation = values.designation.trim() || null;

  if (displayName !== baseline.displayName) {
    patch.displayName = displayName;
  }
  if (salutation !== (baseline.salutation === "none" ? null : baseline.salutation)) {
    patch.salutation = salutation;
  }
  if (businessName !== (baseline.businessName || null)) {
    patch.businessName = businessName;
  }
  if (workType !== (baseline.workType || null)) {
    patch.workType = workType;
  }
  if (businessEmail !== (baseline.businessEmail || null)) {
    patch.businessEmail = businessEmail;
  }
  if (designation !== (baseline.designation || null)) {
    patch.designation = designation;
  }
  if (includeLogoOnPdf !== baseline.includeLogoOnPdf) {
    patch.pdfBranding = { includeProfileLogo: includeLogoOnPdf };
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/** True when save must touch `profileLogo` on the profile document. */
export function hasLogoFieldChange(logoDraft: LogoDraft, baseline: IdentityBaseline): boolean {
  if (logoDraft.status === "picked") return true;
  if (logoDraft.status === "removed" && baseline.hadLogo) return true;
  return false;
}

/** Whether remove-logo should be offered (saved logo or a newly picked one). */
export function canRemoveLogo(user: UserProfile, logoDraft: LogoDraft): boolean {
  if (logoDraft.status === "picked") return true;
  if (logoDraft.status === "removed") return false;
  return Boolean(user.profileLogo?.localUri);
}

export type PendingLogoSave =
  | { kind: "none" }
  | { kind: "persist"; asset: PickedLogoAsset }
  | { kind: "delete"; previous: ProfileLogoRef | null };

export function pendingLogoSave(
  user: UserProfile,
  logoDraft: LogoDraft
): PendingLogoSave {
  if (logoDraft.status === "picked") {
    return { kind: "persist", asset: logoDraft.asset };
  }
  if (logoDraft.status === "removed" && user.profileLogo) {
    return { kind: "delete", previous: user.profileLogo };
  }
  return { kind: "none" };
}
