import React from "react";

import {
  GRIN_APPLICATION_REPOSITORY_LABEL,
  grinRepositoryIsFake,
} from "@/services/grin/repository";
import { spacing } from "@/theme/spacing";

import { Banner, View } from "./grinSurfaces";
import { useGrinT } from "./grinScreenHooks";

export function GrinFixtureNotices({
  repositoryLabel = GRIN_APPLICATION_REPOSITORY_LABEL,
}: {
  repositoryLabel?: string;
} = {}): React.ReactElement {
  const t = useGrinT();
  const banner = grinRepositoryIsFake(repositoryLabel) ? t("grin.fixtureBanner") : t("grin.queueBanner");
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
      <Banner tone="info" message={banner} />
      <Banner tone="warning" message={t("grin.pricingQuotaNote")} />
    </View>
  );
}
