import React from "react";

import {
  GRIN_APPLICATION_REPOSITORY_LABEL,
  grinRepositoryIsFake,
} from "@/services/grin/repository";
import { spacing } from "@/theme/spacing";

import { Banner, View } from "./grinSurfaces";
import { useGrinT } from "./grinScreenHooks";

/**
 * Fixture/demo notice only. Production GRIN surfaces use createIntro /
 * offline pending pills for customer-facing status — no repeated developer banners.
 */
export function GrinFixtureNotices({
  repositoryLabel = GRIN_APPLICATION_REPOSITORY_LABEL,
}: {
  repositoryLabel?: string;
} = {}): React.ReactElement | null {
  const t = useGrinT();
  if (!grinRepositoryIsFake(repositoryLabel)) return null;
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
      <Banner tone="warning" message={t("grin.fixtureBanner")} />
    </View>
  );
}
