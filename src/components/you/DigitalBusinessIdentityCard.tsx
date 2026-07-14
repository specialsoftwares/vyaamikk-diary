import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import type { ComponentProps } from "react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useFocusEffect, useRouter } from "expo-router";

import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { DashboardGreetingHeroSurface } from "@/components/you/DashboardGreetingHeroSurface";
import type { UserProfile } from "@/domain/types";
import { useIdentityCardTrustStats } from "@/hooks/useIdentityCardTrustStats";
import { useStuckBusyRecovery } from "@/hooks/useStuckBusyRecovery";
import {
  FLIP_LOCK_TIMEOUT_SLACK_MS,
  createFlipLockController,
  type FlipLockController,
} from "./identityCardFlipController";
import { useT } from "@/i18n";
import { executivePressFeedback } from "@/theme/executiveLayer";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";
import { getGreetingPeriod, greetingPeriodFallbackKey } from "@/utils/greeting";
import { buildBusinessIdentityShareMessage } from "@/utils/profile/buildBusinessIdentityShareMessage";
import { formatGreetingName } from "@/utils/profile/formatGreetingName";

type MciName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const AVATAR_SIZE = 40;
const FLIP_MS = 580;
const FLIP_EASING = Easing.bezier(0.33, 0.01, 0.15, 1);
const STAGE_FALLBACK_HEIGHT = 118;

const CONTENT_PAD = {
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md + 2,
} as const;

export interface DigitalBusinessIdentityCardProps {
  user: UserProfile | null;
  onAvatarPress?: () => void;
  rightSlot?: React.ReactNode;
  /** Saved PDF count for utility chips (from You dashboard summary). */
  savedPdfTotal?: number;
}

function UtilityChip({ label, icon }: { label: string; icon?: MciName }) {
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      chip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingVertical: 3,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: isDark ? "rgba(139,145,255,0.4)" : "rgba(59,65,197,0.18)",
        backgroundColor: isDark ? "rgba(139,145,255,0.14)" : c.primaryLight,
      },
      text: {
        ...typography.micro,
        color: isDark ? "#C8CCFF" : c.primaryDark,
        fontWeight: "600",
      },
    })
  );
  return (
    <View style={styles.chip}>
      {icon ? (
        <MaterialCommunityIcons
          name={icon}
          size={11}
          color={isDark ? "#C8CCFF" : "#2A2F9A"}
        />
      ) : null}
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function DigitalBusinessIdentityCard({
  user,
  onAvatarPress,
  rightSlot,
  savedPdfTotal = 0,
}: DigitalBusinessIdentityCardProps) {
  const t = useT();
  const router = useRouter();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const trustStats = useIdentityCardTrustStats(user?.uid, savedPdfTotal);

  const [period, setPeriod] = useState(() => getGreetingPeriod());
  const [reduceMotion, setReduceMotion] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [isBack, setIsBack] = useState(false);
  const [stageHeight, setStageHeight] = useState(STAGE_FALLBACK_HEIGHT);
  const shareLockRef = useRef(false);
  const shareLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measuredHeights = useRef({ front: 0, back: 0 });
  const flipProgress = useSharedValue(0);
  const flipProgressRef = useRef(flipProgress);
  flipProgressRef.current = flipProgress;

  // Single idempotent lock-release mechanism for the flip animation.
  // Releases from: timing callback (any finished value), blur, unmount, and
  // a defensive timeout that also snaps transforms to the nearest stable side.
  const flipLockRef = useRef<FlipLockController | null>(null);
  if (flipLockRef.current === null) {
    flipLockRef.current = createFlipLockController({
      timeoutMs: FLIP_MS + FLIP_LOCK_TIMEOUT_SLACK_MS,
      scheduleTimeout: (fn, ms) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      },
      onForcedRelease: () => {
        const progress = flipProgressRef.current;
        cancelAnimation(progress);
        const settled = progress.value >= 0.5 ? 1 : 0;
        progress.value = settled;
        setIsBack(settled === 1);
      },
    });
  }
  const flipLock = flipLockRef.current;

  const releaseShareLock = useCallback(() => {
    if (shareLockTimerRef.current) {
      clearTimeout(shareLockTimerRef.current);
      shareLockTimerRef.current = null;
    }
    shareLockRef.current = false;
  }, []);

  /** Tracked timer (cleared on blur/unmount) — replaces the untracked 400ms setTimeout. */
  const armShareLockRelease = useCallback(() => {
    if (shareLockTimerRef.current) clearTimeout(shareLockTimerRef.current);
    shareLockTimerRef.current = setTimeout(() => {
      shareLockTimerRef.current = null;
      shareLockRef.current = false;
    }, 400);
  }, []);

  const shareRecovery = useStuckBusyRecovery(
    useCallback(() => {
      // Share.share can hang on iOS after sheet dismissal — recover on
      // refocus / app-active so the card never stays disabled.
      setSharing(false);
      releaseShareLock();
    }, [releaseShareLock])
  );

  useFocusEffect(
    useCallback(() => {
      setPeriod(getGreetingPeriod());
      flipProgress.value = 0;
      setIsBack(false);
      flipLock.release();
      return () => {
        // Blur mid-animation: stop the worklet and release the lock so the
        // card is responsive when the tab regains focus.
        cancelAnimation(flipProgress);
        flipLock.release();
        releaseShareLock();
      };
    }, [flipProgress, flipLock, releaseShareLock])
  );

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return () => {
      flipLock.dispose();
      cancelAnimation(flipProgressRef.current);
      if (shareLockTimerRef.current) {
        clearTimeout(shareLockTimerRef.current);
        shareLockTimerRef.current = null;
      }
    };
  }, [flipLock]);

  const syncStageHeight = useCallback(() => {
    const next = Math.max(measuredHeights.current.front, measuredHeights.current.back);
    if (next > 0) {
      setStageHeight(next);
    }
  }, []);

  const onFrontLayout = useCallback(
    (event: LayoutChangeEvent) => {
      measuredHeights.current.front = event.nativeEvent.layout.height;
      syncStageHeight();
    },
    [syncStageHeight]
  );

  const onBackLayout = useCallback(
    (event: LayoutChangeEvent) => {
      measuredHeights.current.back = event.nativeEvent.layout.height;
      syncStageHeight();
    },
    [syncStageHeight]
  );

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      pressable: { width: "100%" },
      measureWrap: {
        position: "absolute",
        opacity: 0,
        left: 0,
        right: 0,
        pointerEvents: "none",
        zIndex: -1,
      },
      stage: {
        position: "relative",
        width: "100%",
      },
      faceLayer: {
        ...StyleSheet.absoluteFillObject,
        backfaceVisibility: "hidden",
      },
      shell: { gap: spacing.sm },
      topRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.sm,
      },
      greetingCol: { flex: 1, minWidth: 0, gap: 4 },
      greetingPeriod: {
        ...typography.titleSm,
        fontSize: 15,
        lineHeight: 21,
        fontWeight: "500",
        letterSpacing: 0.75,
        color: isDark ? "#C8CCFF" : c.primaryDark,
        opacity: isDark ? 0.96 : 0.84,
        textTransform: "none",
      },
      userName: {
        ...typography.titleMd,
        fontSize: 18,
        fontWeight: "700",
        color: c.text,
        lineHeight: 24,
      },
      designationLine: {
        ...typography.micro,
        color: c.textSubtle,
        lineHeight: 15,
      },
      topActions: { flexShrink: 0 },
      bodyRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        marginTop: 2,
      },
      avatarWrap: {
        borderRadius: AVATAR_SIZE / 2 + 4,
        borderWidth: 1.5,
        borderColor: c.primary,
        padding: 2,
        backgroundColor: c.primaryLight,
      },
      businessLine: {
        ...typography.captionStrong,
        color: c.textMuted,
        flex: 1,
      },
      flipHint: {
        ...typography.micro,
        color: c.textSubtle,
        textAlign: "right",
        marginTop: 2,
      },
      utilityTitle: {
        ...typography.captionStrong,
        color: c.text,
        letterSpacing: 0.3,
      },
      utilitySubtitle: {
        ...typography.micro,
        color: c.textMuted,
        lineHeight: 16,
      },
      shareBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        backgroundColor: isDark ? "rgba(139,145,255,0.22)" : c.primary,
        borderWidth: 1,
        borderColor: isDark ? "rgba(139,145,255,0.45)" : c.primaryDark,
      },
      shareBtnPressed: { opacity: 0.88 },
      shareBtnText: {
        ...typography.captionStrong,
        color: isDark ? "#E8EAFF" : "#FFFFFF",
      },
      chipRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.xs,
      },
      frontChipRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.xs,
        marginTop: 2,
      },
      counterGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.xs,
      },
      counterTile: {
        flexBasis: "48%",
        flexGrow: 1,
        flexDirection: "row",
        alignItems: "baseline",
        gap: spacing.xs,
        paddingVertical: 4,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        backgroundColor: c.surfaceMuted,
      },
      counterValue: { ...typography.titleSm, color: isDark ? "#C8CCFF" : c.primaryDark },
      counterLabel: { ...typography.micro, color: c.textMuted, flexShrink: 1 },
      manageLink: {
        alignSelf: "flex-start",
        paddingVertical: 2,
      },
      manageLinkText: {
        ...typography.micro,
        color: isDark ? "#8B91FF" : c.primaryDark,
        fontWeight: "600",
        textDecorationLine: "underline",
      },
    })
  );

  const settleFlip = useCallback(
    (target: number, finished: boolean) => {
      if (!flipLock.release()) return;
      if (finished) {
        setIsBack(target >= 0.5);
        return;
      }
      // Interrupted/cancelled: restore a stable transform on the nearest side
      // so neither face is stuck mid-rotation intercepting touches.
      const progress = flipProgressRef.current;
      const settled = progress.value >= 0.5 ? 1 : 0;
      progress.value = settled;
      setIsBack(settled === 1);
    },
    [flipLock]
  );

  const toggleFlip = useCallback(() => {
    if (sharing || shareLockRef.current) return;
    if (!flipLock.acquire()) return;
    const next = flipProgress.value < 0.5 ? 1 : 0;
    if (reduceMotion) {
      flipProgress.value = next;
      setIsBack(next >= 0.5);
      flipLock.release();
      return;
    }
    flipProgress.value = withTiming(
      next,
      { duration: FLIP_MS, easing: FLIP_EASING },
      (finished) => {
        runOnJS(settleFlip)(next, finished === true);
      }
    );
  }, [flipProgress, reduceMotion, sharing, flipLock, settleFlip]);

  const frontFaceStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    return {
      transform: [{ perspective: 1100 }, { rotateY: `${rotateY}deg` }],
      opacity: interpolate(flipProgress.value, [0, 0.48, 0.52, 1], [1, 1, 0, 0]),
    };
  });

  const backFaceStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [180, 360]);
    return {
      transform: [{ perspective: 1100 }, { rotateY: `${rotateY}deg` }],
      opacity: interpolate(flipProgress.value, [0, 0.48, 0.52, 1], [0, 0, 1, 1]),
    };
  });

  const onShare = useCallback(async () => {
    if (!user || sharing) return;
    setSharing(true);
    shareRecovery.markPending();
    try {
      const message = buildBusinessIdentityShareMessage(user, t);
      await Share.share({
        message,
        title: t("you.identityCard.shareTitle"),
      });
    } catch {
      // dismissed
    } finally {
      shareRecovery.clearPending();
      setSharing(false);
    }
  }, [user, sharing, t, shareRecovery]);

  const onManageInSettings = useCallback(() => {
    router.push({
      pathname: "/(app)/settings/identity",
      params: { from: "you" },
    });
  }, [router]);

  const displayName = user?.displayName?.trim() || "";
  const businessName = user?.businessName?.trim() || "";
  const workType = user?.workType?.trim() || "";
  const periodLine = t(greetingPeriodFallbackKey(period));
  const nameLine = formatGreetingName(displayName || businessName, user?.salutation, t);
  const designation = user?.designation?.trim() || "";
  const businessLine = businessName || workType || t("executive.commandCentre");

  const pdfBrandingOn = user?.pdfBranding?.includeProfileLogo !== false;
  const identityReady = Boolean(user?.profileCompletedAt);

  // Front: compact premium identity-status chips — no raw profile data.
  const frontChips: Array<{ icon: MciName; label: string }> = [
    {
      icon: "shield-check-outline",
      label: identityReady
        ? t("you.identityCard.chipSecureProfile")
        : t("you.identityCard.chipIdentityPending"),
    },
    {
      icon: "file-lock-outline",
      label: t("you.identityCard.chipDetailsEmbedded"),
    },
    {
      icon: "lock-outline",
      label: t("you.identityCard.chipPrivate"),
    },
    {
      icon: pdfBrandingOn ? "file-pdf-box" : "file-lock-outline",
      label: pdfBrandingOn
        ? t("you.identityCard.chipPdfReady")
        : t("you.identityCard.chipLogoPending"),
    },
  ];

  const distanceLabel =
    trustStats.approxDistanceKm > 0
      ? t("you.identityCard.counterDistanceApprox", { km: trustStats.approxDistanceKm })
      : t("you.identityCard.counterDistanceZero");

  // Back: motivational live counters (4–6 max).
  const counters: Array<{ value: string | number; label: string }> = [
    { value: trustStats.recordsCount, label: t("you.identityCard.counterRecords") },
    { value: savedPdfTotal, label: t("you.identityCard.counterPdfs") },
    { value: trustStats.creditRecordsCount, label: t("you.identityCard.counterCredit") },
    { value: trustStats.activeEmiCount, label: t("you.identityCard.counterActiveEmi") },
    { value: distanceLabel, label: t("you.identityCard.counterDistance") },
    { value: trustStats.activeDraftsCount, label: t("you.identityCard.counterDrafts") },
  ];

  const frontFace = (
    <View style={styles.shell}>
      <View style={styles.topRow}>
        <View style={styles.greetingCol}>
          <Text style={styles.greetingPeriod} numberOfLines={1}>
            {periodLine}
          </Text>
          {nameLine ? (
            <Text style={styles.userName} numberOfLines={2}>
              {nameLine}
            </Text>
          ) : null}
          {designation ? (
            <Text style={styles.designationLine} numberOfLines={1}>
              {designation}
            </Text>
          ) : null}
        </View>
        {rightSlot ? <View style={styles.topActions}>{rightSlot}</View> : null}
      </View>
      <View style={styles.bodyRow}>
        <Pressable
          onPress={() => onAvatarPress?.()}
          disabled={!onAvatarPress}
          accessibilityRole={onAvatarPress ? "button" : undefined}
          accessibilityLabel={onAvatarPress ? t("identity.title") : undefined}
          style={onAvatarPress ? ({ pressed }) => executivePressFeedback(pressed) : undefined}
        >
          <View style={styles.avatarWrap}>
            <ProfileAvatar user={user} size={AVATAR_SIZE} />
          </View>
        </Pressable>
        <Text style={styles.businessLine} numberOfLines={2}>
          {businessLine}
        </Text>
      </View>
      <View style={styles.frontChipRow}>
        {frontChips.map((chip, index) => (
          <UtilityChip key={`fc-${index}-${chip.label}`} label={chip.label} icon={chip.icon} />
        ))}
      </View>
      <LocaleUiText style={styles.flipHint}>{t("you.identityCard.tapToFlip")}</LocaleUiText>
    </View>
  );

  const backFace = (
    <View style={styles.shell}>
      <LocaleUiText style={styles.utilityTitle}>{t("you.identityCard.businessCardTitle")}</LocaleUiText>
      <LocaleUiText style={styles.utilitySubtitle}>{t("you.identityCard.motivationSubtitle")}</LocaleUiText>
      <Pressable
        onPressIn={() => {
          shareLockRef.current = true;
        }}
        onPress={() => {
          void onShare();
          armShareLockRelease();
        }}
        disabled={sharing || !user}
        style={({ pressed }) => [styles.shareBtn, pressed && styles.shareBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel={t("you.identityCard.shareBusinessCardA11y")}
      >
        <MaterialCommunityIcons
          name="share-variant"
          size={18}
          color={isDark ? "#E8EAFF" : "#FFFFFF"}
        />
        <LocaleUiText style={styles.shareBtnText}>{t("you.identityCard.shareBusinessCard")}</LocaleUiText>
      </Pressable>
      <View style={styles.counterGrid}>
        {counters.map((counter, index) => (
          <View key={`ct-${index}-${counter.label}`} style={styles.counterTile}>
            <Text style={styles.counterValue} numberOfLines={1}>
              {counter.value}
            </Text>
            <LocaleUiText style={styles.counterLabel} numberOfLines={2}>
              {counter.label}
            </LocaleUiText>
          </View>
        ))}
      </View>
      <Pressable
        onPressIn={() => {
          shareLockRef.current = true;
        }}
        onPress={() => {
          onManageInSettings();
          armShareLockRelease();
        }}
        style={styles.manageLink}
        accessibilityRole="link"
        accessibilityLabel={t("you.identityCard.manageInSettingsA11y")}
      >
        <LocaleUiText style={styles.manageLinkText}>{t("you.identityCard.manageInSettings")}</LocaleUiText>
      </Pressable>
      <LocaleUiText style={styles.flipHint}>{t("you.identityCard.tapToFlipBack")}</LocaleUiText>
    </View>
  );

  return (
    <Pressable
      onPress={toggleFlip}
      accessibilityRole="button"
      accessibilityLabel={t("you.identityCard.flipA11y")}
      accessibilityHint={t("you.identityCard.flipHint")}
      style={styles.pressable}
      disabled={sharing}
    >
      <DashboardGreetingHeroSurface contentStyle={CONTENT_PAD}>
        <View style={styles.measureWrap}>
          <View onLayout={onFrontLayout}>{frontFace}</View>
          <View onLayout={onBackLayout}>{backFace}</View>
        </View>

        <View style={[styles.stage, { height: stageHeight }]}>
          <Animated.View
            style={[styles.faceLayer, frontFaceStyle]}
            pointerEvents={isBack ? "none" : "auto"}
          >
            {frontFace}
          </Animated.View>

          <Animated.View
            style={[styles.faceLayer, backFaceStyle]}
            pointerEvents={isBack ? "auto" : "none"}
          >
            {backFace}
          </Animated.View>
        </View>
      </DashboardGreetingHeroSurface>
    </Pressable>
  );
}
