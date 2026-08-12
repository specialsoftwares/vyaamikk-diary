import type { Href } from "expo-router";

import type { UserProfile } from "@/domain/types";
import { composerOptionForType } from "@/domain/composerOptions";
import type { BusinessEntryType } from "@/domain/businessEntry";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { activeRouteRepository } from "@/repositories/activeRouteRepository";
import { resolveAuthOnboardingHref } from "@/boot/resolveAuthOnboardingRoute";
import { getAuthEntryHref, needsAuthWrapperEmailCompletion } from "@/config/authWrapper";
import {
  canAccessDashboard,
  hrefForIdentityRouteState,
  resolveIdentityRouteState,
} from "@/auth/identityRouteState";
import { isBootDraftPromptSnoozed } from "@/services/drafts/draftBootSnooze";
import { hrefForDraft } from "@/services/drafts/draftRoutes";

export interface BootRouteInput {
  signedIn: boolean;
  user: UserProfile | null;
  justCreated: boolean;
}

/** User-saved draft the app can offer to resume at boot. */
export interface BootComposerDraftContinuation {
  userId: string;
  draftId: string;
  scopeKey: string;
  entryId: string | null;
  updatedAt: number;
  composerHref: Href;
  recordLabelKey: string;
}

export type BootDestination =
  | { kind: "route"; href: Href }
  | { kind: "draft_continuation"; continuation: BootComposerDraftContinuation };

function recordLabelKeyForType(entryType: string): string {
  const opt = composerOptionForType(entryType as BusinessEntryType);
  if (opt) return `composer.options.${opt.labelKey}`;
  return `composer.types.${entryType}`;
}

/**
 * Local-only boot routing — no network. Draft continuation is offered in UI, not auto-opened.
 */
export async function resolveBootDestination(
  input: BootRouteInput
): Promise<BootDestination> {
  if (!input.signedIn || !input.user) {
    return { kind: "route", href: getAuthEntryHref() };
  }

  // Authoritative identity gate — never flash dashboard before verified email.
  if (await needsAuthWrapperEmailCompletion(input.user)) {
    const state = resolveIdentityRouteState({
      signedIn: true,
      user: input.user,
      onboardingIncomplete: true,
    });
    const href = hrefForIdentityRouteState(state) ?? "/(auth)/v2?step=email";
    const { markBootWizardStep } = await import("@/auth/onboardingGuardPolicy");
    await markBootWizardStep(
      state === "emailPendingVerification" ? "emailOtp" : "emailEntry",
      input.user.uid
    );
    return { kind: "route", href: href as Href };
  }

  const onboardingHref = await resolveAuthOnboardingHref(input.user);
  if (onboardingHref) {
    const { markBootWizardStep } = await import("@/auth/onboardingGuardPolicy");
    if (String(onboardingHref).includes("complete-profile")) {
      await markBootWizardStep("businessIdentity", input.user.uid);
    } else if (String(onboardingHref).includes("ueid")) {
      // Integrity-only: malformed/missing UEID — not the former reveal gate.
      await markBootWizardStep("ueidRelease", input.user.uid);
    }
    return { kind: "route", href: onboardingHref };
  }

  const identityState = resolveIdentityRouteState({
    signedIn: true,
    user: input.user,
    onboardingIncomplete: false,
  });
  if (!canAccessDashboard(identityState)) {
    const href = hrefForIdentityRouteState(identityState) ?? getAuthEntryHref();
    return { kind: "route", href: href as Href };
  }

  const uid = input.user.uid;
  if (await isBootDraftPromptSnoozed(uid)) {
    return { kind: "route", href: "/(app)/(tabs)/you" };
  }

  const draft = await formDraftsRepository.getMostRecentUserDraft(uid, "composer");
  if (draft?.scopeKey && draft.source === "user" && draft.status === "active") {
    return {
      kind: "draft_continuation",
      continuation: {
        userId: uid,
        draftId: draft.id,
        scopeKey: draft.scopeKey,
        entryId: draft.entryId,
        updatedAt: draft.updatedAt,
        composerHref: hrefForDraft(draft),
        recordLabelKey: recordLabelKeyForType(draft.scopeKey),
      },
    };
  }

  await activeRouteRepository.clear(uid);
  return { kind: "route", href: "/(app)/(tabs)/you" };
}

/** @deprecated Use resolveBootDestination */
export async function resolveBootRoute(input: BootRouteInput): Promise<Href> {
  const dest = await resolveBootDestination(input);
  if (dest.kind === "route") return dest.href;
  return dest.continuation.composerHref;
}
