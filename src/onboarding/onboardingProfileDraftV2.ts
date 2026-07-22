/**
 * Onboarding profile draft v2 — keyed by uid + environment + identity type + schema.
 * Migrates legacy v1 drafts. Never stores OTP / challenge secrets.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { OnboardingAccountKind } from "@/auth/onboardingWizard";
import type { ProfileLogoRef } from "@/domain/types";
import {
  ONBOARDING_DRAFT_SCHEMA_VERSION,
  type ConfirmedPinLocation,
  type GstinVerificationState,
  type OnboardingProfileDraftV2,
} from "@/onboarding/profileIdentityModel";
import { getActiveBackend } from "@/config/env";

const PREFIX_V2 = "vyd_onboarding_profile_draft_v2_";
/** Legacy v1 key from Pass 1. */
const PREFIX_V1 = "vyd_onboarding_profile_draft_v1_";

function envKey(): string {
  try {
    return getActiveBackend();
  } catch {
    return "unknown";
  }
}

function draftKey(uid: string, accountKind: OnboardingAccountKind): string {
  return `${PREFIX_V2}${envKey()}_${uid}_${accountKind}_s${ONBOARDING_DRAFT_SCHEMA_VERSION}`;
}

function emptyDraft(
  uid: string,
  accountKind: OnboardingAccountKind
): OnboardingProfileDraftV2 {
  return {
    schemaVersion: 2,
    uid,
    environment: envKey(),
    accountKind,
    displayName: "",
    businessName: "",
    constitution: "",
    gstin: "",
    gstinVerificationState: "notProvided",
    pinCode: "",
    pinLocalityChoices: [],
    selectedLocality: null,
    confirmedLocation: null,
    profileLogo: null,
    logoPreviewUri: null,
    logoPersisted: false,
    updatedAt: Date.now(),
  };
}

function parseConfirmedLocation(raw: unknown): ConfirmedPinLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.pinCode !== "string" || !/^[1-9]\d{5}$/.test(o.pinCode)) return null;
  if (typeof o.district !== "string" || typeof o.state !== "string") return null;
  return {
    pinCode: o.pinCode,
    locality: typeof o.locality === "string" ? o.locality : null,
    district: o.district,
    state: o.state,
    country: typeof o.country === "string" ? o.country : "India",
    confirmedAt: Number(o.confirmedAt ?? Date.now()),
    source:
      o.source === "offline" || o.source === "api" || o.source === "cache" || o.source === "manual"
        ? o.source
        : "manual",
  };
}

function parseLogo(raw: unknown): ProfileLogoRef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.localUri !== "string" || !o.localUri.trim()) return null;
  return {
    localUri: o.localUri.trim(),
    mimeType: typeof o.mimeType === "string" ? o.mimeType : "image/jpeg",
    updatedAt: Number(o.updatedAt ?? Date.now()),
  };
}

function parseGstinState(raw: unknown): GstinVerificationState {
  const allowed: GstinVerificationState[] = [
    "notProvided",
    "formatInvalid",
    "formatValid",
    "verificationPending",
    "officiallyVerified",
    "verificationUnavailable",
    "verificationFailed",
    "identityMismatch",
  ];
  return allowed.includes(raw as GstinVerificationState)
    ? (raw as GstinVerificationState)
    : "notProvided";
}

function parseV2(raw: string, uid: string): OnboardingProfileDraftV2 | null {
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingProfileDraftV2>;
    if (parsed.schemaVersion !== 2) return null;
    if (parsed.uid && parsed.uid !== uid) return null;
    const accountKind: OnboardingAccountKind =
      parsed.accountKind === "individual" ? "individual" : "business";
    return {
      ...emptyDraft(uid, accountKind),
      ...parsed,
      schemaVersion: 2,
      uid,
      environment: typeof parsed.environment === "string" ? parsed.environment : envKey(),
      accountKind,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : "",
      businessName: typeof parsed.businessName === "string" ? parsed.businessName : "",
      constitution: typeof parsed.constitution === "string" ? parsed.constitution : "",
      gstin: typeof parsed.gstin === "string" ? parsed.gstin : "",
      gstinVerificationState: parseGstinState(parsed.gstinVerificationState),
      pinCode: typeof parsed.pinCode === "string" ? parsed.pinCode : "",
      pinLocalityChoices: Array.isArray(parsed.pinLocalityChoices)
        ? parsed.pinLocalityChoices.filter((x): x is string => typeof x === "string")
        : [],
      selectedLocality:
        typeof parsed.selectedLocality === "string" ? parsed.selectedLocality : null,
      confirmedLocation: parseConfirmedLocation(parsed.confirmedLocation),
      profileLogo: parseLogo(parsed.profileLogo),
      logoPreviewUri:
        typeof parsed.logoPreviewUri === "string" ? parsed.logoPreviewUri : null,
      logoPersisted: parsed.logoPersisted === true,
      updatedAt: Number(parsed.updatedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}

async function migrateV1(uid: string, accountKind: OnboardingAccountKind): Promise<OnboardingProfileDraftV2 | null> {
  try {
    const raw = await AsyncStorage.getItem(`${PREFIX_V1}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const kind: OnboardingAccountKind =
      parsed.accountKind === "individual" ? "individual" : accountKind;
    const draft = emptyDraft(uid, kind);
    draft.displayName = typeof parsed.displayName === "string" ? parsed.displayName : "";
    draft.businessName = typeof parsed.businessName === "string" ? parsed.businessName : "";
    draft.constitution =
      typeof parsed.workType === "string"
        ? parsed.workType
        : typeof parsed.designation === "string"
          ? parsed.designation
          : "";
    draft.updatedAt = Date.now();
    await saveOnboardingProfileDraftV2(draft);
    await AsyncStorage.removeItem(`${PREFIX_V1}${uid}`);
    return draft;
  } catch {
    return null;
  }
}

export async function loadOnboardingProfileDraftV2(
  uid: string,
  accountKind: OnboardingAccountKind = "business"
): Promise<OnboardingProfileDraftV2> {
  try {
    const raw = await AsyncStorage.getItem(draftKey(uid, accountKind));
    if (raw) {
      const parsed = parseV2(raw, uid);
      if (parsed) return parsed;
    }
    // Try the other kind if switching mid-flow left only one key.
    const other: OnboardingAccountKind =
      accountKind === "business" ? "individual" : "business";
    const otherRaw = await AsyncStorage.getItem(draftKey(uid, other));
    if (otherRaw) {
      const parsed = parseV2(otherRaw, uid);
      if (parsed && parsed.accountKind === accountKind) return parsed;
    }
    const migrated = await migrateV1(uid, accountKind);
    if (migrated) return migrated;
  } catch {
    /* fall through */
  }
  return emptyDraft(uid, accountKind);
}

export async function saveOnboardingProfileDraftV2(
  draft: OnboardingProfileDraftV2
): Promise<void> {
  const next: OnboardingProfileDraftV2 = {
    ...draft,
    schemaVersion: 2,
    environment: envKey(),
    updatedAt: Date.now(),
  };
  await AsyncStorage.setItem(draftKey(draft.uid, draft.accountKind), JSON.stringify(next));
}

export async function clearOnboardingProfileDraftV2(uid: string): Promise<void> {
  await AsyncStorage.multiRemove([
    draftKey(uid, "individual"),
    draftKey(uid, "business"),
    `${PREFIX_V1}${uid}`,
  ]);
}

/** Isolate drafts when verified mobile / account identity changes. */
export async function discardOnboardingDraftsForUid(uid: string): Promise<void> {
  await clearOnboardingProfileDraftV2(uid);
}

export function createEmptyOnboardingDraft(
  uid: string,
  accountKind: OnboardingAccountKind
): OnboardingProfileDraftV2 {
  return emptyDraft(uid, accountKind);
}
