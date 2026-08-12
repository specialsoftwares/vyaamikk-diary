/**
 * Presentation-only visual state machine.
 * PREVIEW ONLY — no Firebase Auth, no SMS, no email OTP, no production writes.
 * Auth action cluster uses AuthShell footerPlacement=actionZone (lower-middle).
 * Compact consent stays one line on ordinary phone widths.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { logStage2ActionSystemProvenance } from "@/actionSystem/stage2RuntimeProvenance";
import { EmailEntryScreen } from "@/auth-v2/screens/EmailEntryScreen";
import { EmailOtpScreen } from "@/auth-v2/screens/EmailOtpScreen";
import { OtpVerificationScreen } from "@/auth-v2/screens/OtpVerificationScreen";
import { PhoneEntryScreen } from "@/auth-v2/screens/PhoneEntryScreen";
import { VerificationSuccessAck } from "@/auth-v2/components/VerificationSuccessAck";
import { DEFAULT_AUTH_V2_COUNTRY_CODE, type AuthV2PhoneDraft } from "@/auth-v2/types";
import {
  ONBOARDING_MIN_VERIFYING_VISIBLE_MS,
  ONBOARDING_SCREEN_MS,
  ONBOARDING_SUCCESS_ACK_MS,
} from "@/auth-v2/theme/onboardingMotion";
import {
  minVerifyingRemainderMs,
  reduceVerificationVisual,
  type VerificationVisualPhase,
} from "@/auth-v2/verificationVisualState";
import { VyaamikkBootAnimation } from "@/components/boot/VyaamikkBootAnimation";
import { evaluateGstinInput } from "@/onboarding/gstinVerificationState";
import type { GstinVerificationState } from "@/onboarding/profileIdentityModel";
import { lookupPostalPincodeApi } from "@/services/location/postalPincodeApi";
import { useI18n } from "@/i18n";
import { spacing, typography } from "@/theme";
import { normalizeGstin } from "@/utils/gst/gstin";

import {
  IdentityLocationPreview,
  type ConfirmedPinPreview,
  type PinChoicePreview,
  type PinUi,
} from "./IdentityLocationPreview";
import { YouPreview } from "./YouPreview";
import { ReviewSectionEditPreview } from "./ReviewSectionEditPreview";
import { WorkspacePhasePreview } from "./WorkspacePhasePreview";
import {
  createInitialHarnessReviewSession,
} from "./harnessReviewSession";
import {
  nextHarnessScreenAfterIdentityContinue,
  shouldNavigateHarnessYouAfterWorkspaceReady,
  simulateHarnessProfileCompletion,
} from "@/auth-v2/preview/harnessPostLocationHandoff";
import {
  harnessDefaultEntryScreen,
  harnessPhaseControlLabel,
  restartHarnessOnboardingReview,
} from "@/auth-v2/preview/harnessReviewRestart";
import {
  ProfileReviewPresentation,
  type ProfileReviewEditSection,
} from "@/auth-v2/screens/ProfileReviewPresentation";
import type { ReviewEditTarget } from "@/auth-v2/reviewEditIntent";

const BOOT_FAST_MS = 720;
const OWNER_ACCEPTANCE_SESSION = createInitialHarnessReviewSession();

type VerifyLatencyPreset = "fast" | "typical" | "slow";
const VERIFY_LATENCY_MS: Record<VerifyLatencyPreset, number> = {
  fast: 300,
  typical: 1200,
  slow: 3000,
};

export type HarnessScreenId =
  | "boot_current"
  | "boot_fast"
  | "phone"
  | "phone_sending"
  | "phone_otp"
  | "email"
  | "email_otp"
  | "identity"
  | "location"
  | "location_lookup"
  | "location_confirmed"
  | "location_error"
  | "profile_review"
  | "review_edit"
  | "workspace_preparing"
  | "workspace_ready"
  | "you_preview";

const FIXTURES: { id: HarnessScreenId; label: string }[] = [
  { id: "boot_current", label: "Splash 3600ms" },
  { id: "boot_fast", label: "Splash fast" },
  { id: "phone", label: "Phone" },
  { id: "phone_sending", label: "Phone sending" },
  { id: "phone_otp", label: "Phone OTP" },
  { id: "email", label: "Email" },
  { id: "email_otp", label: "Email OTP" },
  { id: "identity", label: "Profile details" },
  { id: "location", label: "Location PIN" },
  { id: "location_lookup", label: "PIN looking up" },
  { id: "location_confirmed", label: "PIN confirmed" },
  { id: "location_error", label: "PIN network" },
  { id: "profile_review", label: "Profile review" },
  { id: "you_preview", label: "You preview" },
];

export function HarnessApp() {
  const insets = useSafeAreaInsets();
  const { ready } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Owner-acceptance default: Review (not terminal You). HMR may still preserve
  // prior screen — use Restart onboarding review to recover deterministically.
  const [screen, setScreen] = useState<HarnessScreenId>(harnessDefaultEntryScreen());
  const [reviewEditTarget, setReviewEditTarget] = useState<ReviewEditTarget | null>(null);
  const [reviewJourneyKey, setReviewJourneyKey] = useState(0);
  const [logoUri, setLogoUri] = useState<string | null>(OWNER_ACCEPTANCE_SESSION.logoUri);
  const [verifiedPhoneE164, setVerifiedPhoneE164] = useState(
    OWNER_ACCEPTANCE_SESSION.phoneE164
  );
  const [verifiedEmail, setVerifiedEmail] = useState(OWNER_ACCEPTANCE_SESSION.email);
  const pinLookupCountRef = useRef(0);
  const [verifyLatency, setVerifyLatency] = useState<VerifyLatencyPreset>("typical");
  const workspaceYouNavigatedRef = useRef(false);

  useEffect(() => {
    logStage2ActionSystemProvenance("HarnessApp");
  }, []);

  const onReviewSuccessNavigate = useCallback(() => {
    if (
      !shouldNavigateHarnessYouAfterWorkspaceReady({
        phase: "ready",
        alreadyNavigated: workspaceYouNavigatedRef.current,
      })
    ) {
      return;
    }
    workspaceYouNavigatedRef.current = true;
    console.log("[ux-harness-obs] workspaceReady→you_preview (no production write)");
    setScreen("you_preview");
  }, []);

  const [phoneDraft, setPhoneDraft] = useState<AuthV2PhoneDraft>({
    countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE,
    localNumber: "",
  });
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [displayName, setDisplayName] = useState(OWNER_ACCEPTANCE_SESSION.displayName);
  const [businessName, setBusinessName] = useState(OWNER_ACCEPTANCE_SESSION.businessName);
  const [constitution, setConstitution] = useState(OWNER_ACCEPTANCE_SESSION.constitution);
  const [gstin, setGstin] = useState(OWNER_ACCEPTANCE_SESSION.gstin);
  const [gstinState, setGstinState] = useState<GstinVerificationState>(
    OWNER_ACCEPTANCE_SESSION.gstinState
  );
  const [pinCode, setPinCode] = useState(OWNER_ACCEPTANCE_SESSION.pinCode);
  const [pinUi, setPinUi] = useState<PinUi>("confirmed");
  const [confirmedPin, setConfirmedPin] = useState<ConfirmedPinPreview | null>(
    OWNER_ACCEPTANCE_SESSION.confirmedPin
  );
  const [pinChoices, setPinChoices] = useState<PinChoicePreview | null>(null);
  const [selectedLocality, setSelectedLocality] = useState<string | null>(null);
  const [mobileVisual, setMobileVisual] = useState<VerificationVisualPhase>("idle");
  const [emailVisual, setEmailVisual] = useState<VerificationVisualPhase>("idle");
  const lastOtpSubmit = useRef<string | null>(null);
  const lastEmailSubmit = useRef<string | null>(null);
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinRequestId = useRef(0);
  const verifyStartedAt = useRef(0);

  const restartOnboardingReview = useCallback(() => {
    const snapshot = {
      displayName,
      businessName,
      constitution,
      gstin,
      pinCode,
      phoneE164: verifiedPhoneE164,
      email: verifiedEmail,
      logoUri,
    };
    const next = restartHarnessOnboardingReview({
      session: snapshot,
      reviewJourneyKey,
    });
    // Preserve CURRENT session fields — do not re-seed fixtures.
    workspaceYouNavigatedRef.current = next.workspaceYouNavigated;
    setReviewEditTarget(next.reviewEditTarget);
    setReviewJourneyKey(next.reviewJourneyKey);
    setMobileVisual("idle");
    setEmailVisual("idle");
    lastOtpSubmit.current = null;
    lastEmailSubmit.current = null;
    setScreen(next.screen);
    setDrawerOpen(false);
    console.log(
      "[ux-harness-obs] restart→profile_review (session preserved, no production write)"
    );
  }, [
    displayName,
    businessName,
    constitution,
    gstin,
    pinCode,
    verifiedPhoneE164,
    verifiedEmail,
    logoUri,
    reviewJourneyKey,
  ]);

  const logProbe = (label: string, start: number) => {
    const ms = Math.round((globalThis.performance?.now?.() ?? Date.now()) - start);
    console.log(`[ux-harness-obs] ${label}=${ms}ms DEV HARNESS OBSERVATION`);
  };

  const runPreviewVerify = useCallback(
    (kind: "mobile" | "email") => {
      const t0 = globalThis.performance?.now?.() ?? Date.now();
      verifyStartedAt.current = Date.now();
      if (kind === "mobile") {
        setMobileVisual((p) => reduceVerificationVisual(p, "otp_submitted"));
      } else {
        setEmailVisual((p) => reduceVerificationVisual(p, "otp_submitted"));
      }
      requestAnimationFrame(() => logProbe(`${kind}VerifyTap→verifyingUi`, t0));
      setTimeout(() => {
        const wait = minVerifyingRemainderMs({
          startedAt: verifyStartedAt.current,
          now: Date.now(),
          minVisibleMs: ONBOARDING_MIN_VERIFYING_VISIBLE_MS,
        });
        const reveal = () => {
          if (kind === "mobile") {
            setMobileVisual((p) => reduceVerificationVisual(p, "authoritative_success"));
          } else {
            setEmailVisual((p) => reduceVerificationVisual(p, "authoritative_success"));
          }
        };
        if (wait === 0) reveal();
        else setTimeout(reveal, wait);
      }, VERIFY_LATENCY_MS[verifyLatency]);
    },
    [verifyLatency]
  );

  const onPhoneSend = () => {
    const t0 = globalThis.performance?.now?.() ?? Date.now();
    setScreen("phone_sending");
    requestAnimationFrame(() => logProbe("phoneContinueTap→sendingUi", t0));
    setTimeout(() => setScreen("phone_otp"), 320);
  };

  const onOtpVerify = useCallback(
    (code: string) => {
      if (lastOtpSubmit.current === code) return;
      lastOtpSubmit.current = code;
      runPreviewVerify("mobile");
    },
    [runPreviewVerify]
  );

  const onEmailVerify = useCallback(() => {
    if (lastEmailSubmit.current === emailCode) return;
    lastEmailSubmit.current = emailCode;
    runPreviewVerify("email");
  }, [emailCode, runPreviewVerify]);

  useEffect(() => {
    if (screen !== "email_otp") return;
    if (emailCode.length !== 6) return;
    onEmailVerify();
  }, [emailCode, screen, onEmailVerify]);

  useEffect(() => {
    return () => {
      if (pinTimer.current) clearTimeout(pinTimer.current);
    };
  }, []);

  const applyFixture = (id: HarnessScreenId) => {
    setScreen(id);
    setMobileVisual("idle");
    setEmailVisual("idle");
    if (id === "phone") {
      setPhoneDraft({ countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE, localNumber: "" });
      setTerms(false);
      setPrivacy(false);
    }
    if (id === "phone_sending") {
      setPhoneDraft({ countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE, localNumber: "9876543210" });
      setTerms(true);
      setPrivacy(true);
    }
    if (id === "phone_otp") {
      setPhoneDraft({ countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE, localNumber: "9876543210" });
      setOtp("");
      lastOtpSubmit.current = null;
    }
    if (id === "email" || id === "email_otp") {
      setEmail(id === "email" ? "" : email.trim());
      setEmailCode("");
      lastEmailSubmit.current = null;
    }
    if (id === "identity") {
      setDisplayName("");
      setBusinessName("");
      setConstitution("");
      setGstin("");
      setGstinState("notProvided");
    }
    if (id.startsWith("location")) {
      setDisplayName(displayName.trim() || "Ada Lovelace");
      setBusinessName(businessName.trim() || "Sharma Hardware");
      setConstitution(constitution.trim() || "Proprietorship");
      setPinCode(id === "location" ? "" : pinCode.trim() || "201016");
      setPinUi(
        id === "location_lookup"
          ? "looking_up"
          : id === "location_error"
            ? "unavailable"
            : id === "location_confirmed"
              ? "confirmed"
              : "idle"
      );
      setConfirmedPin(
        id === "location_confirmed"
          ? confirmedPin ?? {
              locality: "Crossing Republik",
              district: "Ghaziabad",
              state: "Uttar Pradesh",
            }
          : null
      );
    }
    if (id === "profile_review" || id === "you_preview") {
      if (id === "profile_review") {
        workspaceYouNavigatedRef.current = false;
        setReviewEditTarget(null);
        setReviewJourneyKey((k) => k + 1);
      }
      // Fill only empty fields — never wipe committed owner session values.
      setDisplayName((v) => v.trim() || OWNER_ACCEPTANCE_SESSION.displayName);
      setBusinessName((v) => v.trim() || OWNER_ACCEPTANCE_SESSION.businessName);
      setConstitution((v) => v.trim() || OWNER_ACCEPTANCE_SESSION.constitution);
      setPinCode((v) => v.trim() || OWNER_ACCEPTANCE_SESSION.pinCode);
      setPinUi("confirmed");
      setConfirmedPin((prev) => prev ?? OWNER_ACCEPTANCE_SESSION.confirmedPin);
      setVerifiedEmail((v) => v.trim() || OWNER_ACCEPTANCE_SESSION.email);
    }
    if (id === "workspace_preparing" || id === "workspace_ready") {
      workspaceYouNavigatedRef.current = false;
    }
  };

  const onPinChange = (raw: string) => {
    setPinCode(raw);
    setConfirmedPin(null);
    setPinChoices(null);
    setSelectedLocality(null);
    if (pinTimer.current) clearTimeout(pinTimer.current);
    if (raw.length !== 6) {
      setPinUi("idle");
      return;
    }
    setPinUi("looking_up");
    setScreen("location_lookup");
    const requestId = ++pinRequestId.current;
    pinTimer.current = setTimeout(() => {
      void (async () => {
        const result = await lookupPostalPincodeApi(raw);
        if (requestId !== pinRequestId.current || pinCodeRef.current !== raw) return;
        if (result.classification === "success") {
          if (result.resolution.localities.length > 1 && result.district && result.state) {
            setPinChoices({
              localities: result.resolution.localities,
              district: result.district,
              state: result.state,
            });
            setPinUi("choices");
            setScreen("location");
            return;
          }
          setConfirmedPin({
            locality: result.locality,
            district: result.district ?? "",
            state: result.state ?? "",
          });
          setPinUi("confirmed");
          setScreen("location_confirmed");
          return;
        }
        if (result.classification === "not-found" || result.classification === "invalid-format") {
          setPinUi("not_found");
          setScreen("location");
          return;
        }
        setPinUi("unavailable");
        setScreen("location_error");
      })();
    }, 280);
  };

  const pinCodeRef = useRef(pinCode);
  pinCodeRef.current = pinCode;

  const onGstinChange = (raw: string) => {
    const normalized = normalizeGstin(raw);
    const ev = evaluateGstinInput(normalized);
    setGstin(normalized);
    setGstinState(ev.state);
  };

  if (!ready) {
    return <View style={styles.fill} />;
  }

  const phase = screen.startsWith("location") ? "location" : "details";
  const mobileOverlay = mobileVisual === "verifying" || mobileVisual === "success";
  const emailOverlay = emailVisual === "verifying" || emailVisual === "success";

  return (
    <View style={styles.fill}>
      <Animated.View
        key={
          screen.startsWith("location")
            ? "location"
            : screen === "phone_sending"
              ? "phone"
              : screen === "profile_review"
                ? `profile_review-${reviewJourneyKey}`
                : screen
        }
        entering={FadeInRight.duration(ONBOARDING_SCREEN_MS)}
        exiting={FadeOutLeft.duration(ONBOARDING_SCREEN_MS)}
        style={styles.fill}
      >
        {screen === "boot_current" || screen === "boot_fast" ? (
          <VyaamikkBootAnimation
            releaseToApp
            sequenceDurationMs={screen === "boot_fast" ? BOOT_FAST_MS : undefined}
            onAnimationDone={() => undefined}
            onBlackMidpoint={() => undefined}
            onExitComplete={() => setScreen("phone")}
          />
        ) : null}

        {screen === "phone" || screen === "phone_sending" ? (
          <PhoneEntryScreen
            draft={phoneDraft}
            onDraftChange={setPhoneDraft}
            step="phone"
            termsAccepted={terms}
            privacyAccepted={privacy}
            onTermsAcceptedChange={setTerms}
            onPrivacyAcceptedChange={setPrivacy}
            onContinueToConfirm={() => undefined}
            onConfirmSend={onPhoneSend}
            onBackFromConfirm={() => undefined}
            loading={screen === "phone_sending"}
            onOpenLegalDocument={() =>
              Alert.alert("Preview", "Legal documents open in the production app.")
            }
          />
        ) : null}

        {screen === "phone_otp" ? (
          <View style={styles.fill}>
            <OtpVerificationScreen
              phoneE164="+919876543210"
              onVerify={onOtpVerify}
              onResend={() => {
                lastOtpSubmit.current = null;
                setOtp("");
                setMobileVisual("idle");
              }}
              onChangeNumber={() => {
                lastOtpSubmit.current = null;
                setOtp("");
                setMobileVisual("idle");
                setScreen("phone");
              }}
              loading={mobileVisual === "verifying"}
              initialDigits={otp}
              onDigitsChange={(d) => {
                setOtp(d);
                if (d.length < 6) lastOtpSubmit.current = null;
              }}
            />
            {mobileOverlay ? (
              <VerificationSuccessAck
                kind="mobile"
                phase={mobileVisual === "success" ? "success" : "verifying"}
                onDone={() => {
                  setMobileVisual((p) => reduceVerificationVisual(p, "success_settled"));
                  if (phoneDraft.localNumber.trim().length >= 10) {
                    setVerifiedPhoneE164(
                      `${phoneDraft.countryCode}${phoneDraft.localNumber.replace(/\D/g, "")}`
                    );
                  }
                  setScreen("email");
                }}
              />
            ) : null}
          </View>
        ) : null}

        {screen === "email" ? (
          <EmailEntryScreen
            value={email}
            onChange={setEmail}
            onContinue={() => {
              setScreen("email_otp");
              setEmailCode("");
              lastEmailSubmit.current = null;
              setEmailVisual("idle");
            }}
            onBack={() => setScreen("phone_otp")}
          />
        ) : null}

        {screen === "email_otp" ? (
          <View style={styles.fill}>
            <EmailOtpScreen
              email={email.trim().toLowerCase()}
              code={emailCode}
              onCodeChange={(d) => {
                setEmailCode(d);
                if (d.length < 6) lastEmailSubmit.current = null;
              }}
              onVerify={onEmailVerify}
              onResend={() => {
                lastEmailSubmit.current = null;
                setEmailCode("");
                setEmailVisual("idle");
              }}
              onBack={() => setScreen("email")}
              loading={emailVisual === "verifying"}
              canVerify
            />
            {emailOverlay ? (
              <VerificationSuccessAck
                kind="email"
                phase={emailVisual === "success" ? "success" : "verifying"}
                onDone={() => {
                  setEmailVisual((p) => reduceVerificationVisual(p, "success_settled"));
                  const nextEmail = email.trim().toLowerCase();
                  if (nextEmail) setVerifiedEmail(nextEmail);
                  setScreen("identity");
                }}
              />
            ) : null}
          </View>
        ) : null}

        {screen === "identity" || screen.startsWith("location") ? (
          <IdentityLocationPreview
            phase={phase}
            displayName={displayName}
            businessName={businessName}
            constitution={constitution}
            gstin={gstin}
            gstinState={gstinState}
            pinCode={pinCode}
            pinUi={pinUi}
            confirmedPin={confirmedPin}
            pinChoices={pinChoices}
            selectedLocality={selectedLocality}
            onDisplayNameChange={setDisplayName}
            onBusinessNameChange={setBusinessName}
            onConstitutionChange={setConstitution}
            onGstinChange={onGstinChange}
            onPinChange={onPinChange}
            onSelectLocality={(loc) => {
              setSelectedLocality(loc);
              if (pinChoices) {
                setConfirmedPin({
                  locality: loc,
                  district: pinChoices.district,
                  state: pinChoices.state,
                });
                setPinUi("confirmed");
                setScreen("location_confirmed");
              }
            }}
            onContinue={() => {
              if (phase === "details") {
                setScreen("location");
                setPinCode("");
                setPinUi("idle");
                setConfirmedPin(null);
                return;
              }
              // DEV only: carry session location into shared Review presentation.
              // No production profile write — Alert removed so owner can proceed.
              console.log(
                "[ux-harness-obs] locationContinue→profile_review (no production write)"
              );
              setScreen(nextHarnessScreenAfterIdentityContinue("location"));
            }}
            onBack={() => {
              if (phase === "location") {
                setScreen("identity");
                return;
              }
              setScreen("email");
            }}
          />
        ) : null}

        {screen === "profile_review" ? (
          <ProfileReviewPresentation
            key={`harness-review-${reviewJourneyKey}`}
            model={{
              accountKind: "business",
              displayName,
              businessName,
              constitution,
              gstin,
              gstinVerificationState: gstinState,
              pinCode,
              confirmedLocation: confirmedPin
                ? {
                    locality: confirmedPin.locality,
                    district: confirmedPin.district,
                    state: confirmedPin.state,
                  }
                : null,
              phoneE164: verifiedPhoneE164,
              email: verifiedEmail,
              emailVerified: Boolean(verifiedEmail.trim()),
              logoPreviewUri: logoUri,
              logoPersisted: Boolean(logoUri),
            }}
            onConfirmPersist={async () => {
              // Persist/simulate only — WorkspaceReadyAck owns You navigation.
              await simulateHarnessProfileCompletion();
            }}
            onSuccessNavigate={onReviewSuccessNavigate}
            onBack={() => setScreen("location_confirmed")}
            onEdit={(section: ProfileReviewEditSection) => {
              setReviewEditTarget(section);
              setScreen("review_edit");
            }}
          />
        ) : null}

        {screen === "workspace_preparing" ? (
          <WorkspacePhasePreview phase="preparing" />
        ) : null}
        {screen === "workspace_ready" ? <WorkspacePhasePreview phase="ready" /> : null}

        {screen === "review_edit" && reviewEditTarget ? (
          <ReviewSectionEditPreview
            target={reviewEditTarget}
            model={{
              displayName,
              businessName,
              constitution,
              gstin,
              gstinState,
              pinCode,
              confirmedPin,
              phoneE164: verifiedPhoneE164,
              email: verifiedEmail,
              logoUri,
            }}
            pinLookupSpy={() => {
              pinLookupCountRef.current += 1;
              console.log(
                `[ux-harness-obs] pinLookupCalls=${pinLookupCountRef.current} target=${reviewEditTarget}`
              );
            }}
            onPickLogoLocal={async () => {
              try {
                const { pickIdentityMedia } = await import("@/onboarding/identityMedia");
                const picked = await pickIdentityMedia("library");
                return picked.uri;
              } catch (e) {
                const msg = String(e);
                if (!/cancel/i.test(msg)) {
                  console.log("[ux-harness-obs] logoPickFailed", msg);
                }
                return null;
              }
            }}
            onSave={(patch) => {
              if (patch.displayName != null) setDisplayName(patch.displayName);
              if (patch.businessName != null) setBusinessName(patch.businessName);
              if (patch.constitution != null) setConstitution(patch.constitution);
              if (patch.gstin != null) setGstin(patch.gstin);
              if (patch.gstinState != null) setGstinState(patch.gstinState);
              if (patch.pinCode != null) setPinCode(patch.pinCode);
              if (patch.confirmedPin !== undefined) setConfirmedPin(patch.confirmedPin);
              if (patch.logoUri !== undefined) setLogoUri(patch.logoUri);
              if (patch.phoneE164 != null) setVerifiedPhoneE164(patch.phoneE164);
              if (patch.email != null) setVerifiedEmail(patch.email);
              if (__DEV__) {
                console.log("[review-state] Review rendered after session patch");
              }
              setReviewEditTarget(null);
              setScreen("profile_review");
            }}
            onCommit={(patch) => {
              // Authoritative bind reconciliation — NO navigation (ordering contract).
              if (patch.phoneE164 != null) setVerifiedPhoneE164(patch.phoneE164);
              if (patch.email != null) setVerifiedEmail(patch.email);
              if (__DEV__) {
                console.log("[review-state] profile reconciled (harness session)");
              }
            }}
            onBack={() => {
              setReviewEditTarget(null);
              setScreen("profile_review");
            }}
          />
        ) : null}

        {screen === "you_preview" ? <YouPreview displayName={displayName} /> : null}
      </Animated.View>

      <View style={[styles.drawerWrap, { top: Math.max(insets.top, 8) }]}>
        <Pressable
          onPress={() => setDrawerOpen((v) => !v)}
          style={styles.drawerToggle}
          accessibilityRole="button"
          accessibilityLabel="Toggle developer drawer"
        >
          <Text style={styles.drawerToggleText}>{drawerOpen ? "Hide DEV" : "DEV"}</Text>
        </Pressable>
        {drawerOpen ? (
          <View style={styles.drawer}>
            <Text style={styles.drawerTitle}>UX harness — local fixtures only</Text>
            <Text style={styles.drawerHint}>
              Verify latency preset is PREVIEW ONLY. Production uses real async completion.
              Success settle {ONBOARDING_SUCCESS_ACK_MS}ms · transition {ONBOARDING_SCREEN_MS}ms
            </Text>
            <Text style={styles.drawerSection}>ONBOARDING UX</Text>
            <Pressable
              onPress={restartOnboardingReview}
              style={styles.restartBtn}
              accessibilityRole="button"
              accessibilityLabel="Restart onboarding review"
            >
              <Text style={styles.restartBtnText}>Restart onboarding review</Text>
            </Pressable>
            <View style={styles.chipRowWrap}>
              {(
                [
                  "profile_review",
                  "workspace_preparing",
                  "workspace_ready",
                  "you_preview",
                ] as const
              ).map((id) => (
                <Pressable
                  key={id}
                  onPress={() => {
                    if (id === "profile_review") {
                      restartOnboardingReview();
                      return;
                    }
                    applyFixture(id);
                    setDrawerOpen(false);
                  }}
                  style={[styles.chip, screen === id && styles.chipOn]}
                >
                  <Text style={styles.chipText}>{harnessPhaseControlLabel(id)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.chipRowWrap}>
              {(["fast", "typical", "slow"] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setVerifyLatency(p)}
                  style={[styles.chip, verifyLatency === p && styles.chipOn]}
                >
                  <Text style={styles.chipText}>
                    {p} {VERIFY_LATENCY_MS[p]}ms
                  </Text>
                </Pressable>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {FIXTURES.map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => applyFixture(f.id)}
                  style={[styles.chip, screen === f.id && styles.chipOn]}
                >
                  <Text style={styles.chipText}>{f.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={() =>
                Alert.alert(
                  "Native feature pending",
                  "Android Phone Number Hint uses Play services PendingIntent. Not simulated in JS."
                )
              }
              style={styles.hintBtn}
            >
              <Text style={styles.hintBtnText}>Preview phone hint trigger – native feature pending</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#0B0D18" },
  drawerWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 50,
  },
  drawerToggle: {
    alignSelf: "flex-end",
    marginRight: spacing.md,
    backgroundColor: "rgba(15,23,42,0.55)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  drawerToggleText: { ...typography.micro, color: "rgba(224,231,255,0.62)", fontWeight: "600" },
  drawer: {
    marginHorizontal: spacing.sm,
    marginTop: 6,
    backgroundColor: "rgba(15,23,42,0.94)",
    borderRadius: 12,
    padding: spacing.sm,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  drawerTitle: { ...typography.captionStrong, color: "#F8FAFC" },
  drawerHint: { ...typography.micro, color: "rgba(255,255,255,0.65)" },
  drawerSection: {
    ...typography.micro,
    color: "rgba(165,180,252,0.9)",
    fontWeight: "700",
    marginTop: 4,
  },
  restartBtn: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(165,180,252,0.55)",
    backgroundColor: "rgba(165,180,252,0.16)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  restartBtnText: { ...typography.captionStrong, color: "#E0E7FF" },
  chipRow: { gap: 6, paddingVertical: 4 },
  chipRowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipOn: { backgroundColor: "rgba(165,180,252,0.25)" },
  chipText: { ...typography.micro, color: "#E0E7FF" },
  hintBtn: { paddingVertical: 4 },
  hintBtnText: { ...typography.micro, color: "#A5B4FC", textDecorationLine: "underline" },
});
