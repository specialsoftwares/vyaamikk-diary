import React, { useCallback, useMemo, useState } from "react";

import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import {
  filterOwnerReceipts,
  type GrinReceiptSearchHit,
} from "@/services/grin/repository/grinReceiptSearch";
import type { GrinApplicationListItem } from "@/services/grin/repository/types";
import { spacing } from "@/theme/spacing";

import { grinMutationErrorMessage } from "./grinActionErrors";
import { GrinFixtureNotices } from "./GrinFixtureNotices";
import {
  originRepo,
  useFrozenGrinOrigin,
  useGrinFocusEffect,
  useGrinRouter,
  useGrinT,
  useGrinThemedStyles,
} from "./grinScreenHooks";
import { Banner, Button, FormSection, Header, Screen, TextField, View, StyleSheet, Text } from "./grinSurfaces";

/**
 * Owner-scoped receipt picker for Return / Replacement.
 * Lists only the current origin repository (UID + ledger + generation).
 * Local search filter is not eligibility — each row is checked before navigate.
 */
export function GrinReturnSelectAdmittedBody({
  session,
}: {
  session: GrinDispatchSession;
}): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
  const t = useGrinT();
  const router = useGrinRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GrinApplicationListItem[]>([]);
  const [selectError, setSelectError] = useState<string | null>(null);

  const styles = useGrinThemedStyles((c) =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
      row: {
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: c.divider,
        gap: 2,
      },
      title: { fontSize: 16, fontWeight: "600", color: c.text },
      sub: { fontSize: 13, color: c.textMuted },
    })
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      setItems(originRepo(origin).list());
    } catch (caught) {
      const mapped = grinMutationErrorMessage(caught, t, "grin.returnSelectUnavailable");
      if (mapped.retired) {
        setItems([]);
        setError(t("grin.errSessionRetired"));
      } else {
        setItems([]);
        setError(t("grin.returnSelectUnavailable"));
      }
    } finally {
      setLoading(false);
    }
  }, [origin, t]);

  useGrinFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered: GrinReceiptSearchHit[] = useMemo(
    () => filterOwnerReceipts(items, query),
    [items, query]
  );

  const onSelect = useCallback(
    (hit: GrinReceiptSearchHit) => {
      setSelectError(null);
      try {
        const eligibility = originRepo(origin).returnEligibility(hit.receiptId);
        if (!eligibility.ok) {
          setSelectError(t(`grin.returnIneligible.${eligibility.reason}`));
          return;
        }
        router.push({
          pathname: "/(app)/grin/[receiptId]/return",
          params: { receiptId: hit.receiptId },
        });
      } catch (caught) {
        const mapped = grinMutationErrorMessage(caught, t, "grin.returnSelectUnavailable");
        setSelectError(mapped.message);
      }
    },
    [origin, router, t]
  );

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.returnSelectTitle")} subtitle={t("grin.returnSelectIntro")} showBack />
        <GrinFixtureNotices />
        <Banner tone="info" message={t("grin.returnReplacementNote")} />
        {error ? <Banner tone="danger" message={error} /> : null}
        {selectError ? <Banner tone="danger" message={selectError} /> : null}
        <TextField
          label={t("grin.returnSelectSearch")}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel={t("grin.returnSelectSearch")}
        />
        {loading ? <Text style={styles.sub}>{t("grin.returnSelectLoading")}</Text> : null}
        {!loading && !error && filtered.length === 0 ? (
          <Text style={styles.sub}>{t("grin.returnSelectEmpty")}</Text>
        ) : null}
        {!loading && !error ? (
          <FormSection title={t("grin.returnSelectTitle")}>
            {filtered.map((hit) => (
              <View key={hit.receiptId} style={styles.row}>
                <Text style={styles.title}>
                  {hit.displayNumber ?? t("grin.pdf.pendingNumber")}
                </Text>
                <Text style={styles.sub}>
                  {[hit.supplierName, hit.reportedArrivalAt?.slice(0, 10), hit.receiptId]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                <Button
                  label={t("common.next")}
                  onPress={() => onSelect(hit)}
                  variant="secondary"
                />
              </View>
            ))}
          </FormSection>
        ) : null}
        <Button label={t("common.retry")} onPress={load} disabled={loading} />
      </View>
    </Screen>
  );
}
