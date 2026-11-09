import React from "react";

import { SkeletonList } from "@/components/ui/skeleton/SkeletonList";
import { SkeletonLoadingPanel } from "@/components/ui/skeleton/SkeletonLoadingPanel";
import { useI18n } from "@/i18n";

import { screenStateCopy } from "./screenStateCopy";

export function InitialListSkeleton({
  count = 6,
  Item,
}: {
  count?: number;
  Item?: React.ComponentType;
}) {
  const { lang } = useI18n();
  const copy = screenStateCopy(lang);
  return (
    <SkeletonLoadingPanel loading slowMessage={copy.slow}>
      <SkeletonList count={count} Item={Item} />
    </SkeletonLoadingPanel>
  );
}
