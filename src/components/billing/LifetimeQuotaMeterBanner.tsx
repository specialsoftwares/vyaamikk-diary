/**
 * Shared free-lifetime meter banner for You dashboard and creation screens.
 * Renders nothing when EntitlementView.quota is hidden (confirmed paid).
 */

import React from "react";
import { Pressable, View } from "react-native";

import { Banner } from "@/components/ui/Banner";
import { useI18n } from "@/i18n";
import type { EntitlementView } from "@/subscription/entitlementView";
import { lifetimeQuotaMeterPresentation } from "@/subscription/lifetimeQuotaMeterPresentation";

export function LifetimeQuotaMeterBanner(props: {
  view: EntitlementView | null | undefined;
  onPressUpgrade?: () => void;
  onRetry?: () => void;
  style?: object;
}): React.ReactElement | null {
  const { t } = useI18n();
  const presented = lifetimeQuotaMeterPresentation(props.view);
  if (presented.kind === "none") return null;

  if (presented.kind === "checking" || presented.kind === "unavailable") {
    const message = t(presented.titleKey);
    const retryLabel = t(presented.retryKey);
    if (!props.onRetry) {
      return (
        <View style={props.style}>
          <Banner tone="info" message={message} />
        </View>
      );
    }
    return (
      <Pressable
        style={props.style}
        onPress={props.onRetry}
        accessibilityRole="button"
        accessibilityLabel={retryLabel}
      >
        <Banner tone="info" message={`${message} ${retryLabel}`} />
      </Pressable>
    );
  }

  const message = t(presented.copyKey, {
    used: presented.used,
    limit: presented.limit,
  });
  const body = (
    <Banner tone={presented.warnNearLimit ? "warning" : "info"} message={message} />
  );
  if (!props.onPressUpgrade) {
    return <View style={props.style}>{body}</View>;
  }
  return (
    <Pressable
      style={props.style}
      onPress={props.onPressUpgrade}
      accessibilityRole="button"
      accessibilityLabel={message}
    >
      {body}
    </Pressable>
  );
}
