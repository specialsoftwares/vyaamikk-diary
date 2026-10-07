import React, { useCallback, useMemo, useState } from "react";

import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { filterOwnerReceipts } from "@/services/grin/repository/grinReceiptSearch";
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
  const [items, setItems] = useState<ReturnType<typeof filterOwnerReceipts>>([]);

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
      const listed = originRepo(origin).list();
      setItems(filterOwnerReceipts(listed, ""));
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

  const filtered = useMemo(() => filterOwnerReceipts(items, query), [items, query]);

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.returnSelectTitle")} subtitle={t("grin.returnSelectIntro")} showBack />
        <GrinFixtureNotices />
        <Banner tone="info" message={t("grin.returnReplacementNote")} />
        {error ? <Banner tone="danger" message={error} /> : null}
        <TextField
          label={t("grin.returnSelectSearch")}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel={t("grin.returnSelectSearch")}
        />
        {loading ? <Text style={styles.sub}>{t("grin.returnSelectLoading")}</Text> : null}
        {!loading && filtered.length === 0 ? (
          <Text style={styles.sub}>{t("grin.returnSelectEmpty")}</Text>
        ) : null}
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
                onPress={() =>
                  router.push({
                    pathname: "/(app)/grin/[receiptId]/return",
                    params: { receiptId: hit.receiptId },
                  })
                }
                variant="secondary"
              />
            </View>
          ))}
        </FormSection>
        <Button label={t("common.retry")} onPress={load} disabled={loading} />
      </View>
    </Screen>
  );
}
