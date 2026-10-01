import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { Banner, Button, Card, Header, Screen } from "@/components/ui";
import { GRIN_DOCUMENT_FOOTER } from "@/goodsEvidence/constants";
import { useT } from "@/i18n";
import type { GrinApplicationPackExport, GrinApplicationRecord } from "@/services/grin/repository";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { generateGrinPackPdf } from "@/services/grin/pdf/grinPdfAdapter";
import { pdfService } from "@/services/pdf/pdfService";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinFieldRow } from "./GrinFieldRow";
import { originRepo, useFrozenGrinOrigin } from "./grinScreenHooks";

export function GrinPackScreen(): React.ReactElement {
  const t = useT();
  return (
    <GrinAdmissionGate title={t("grin.packTitle")}>
      {(session) => <GrinPackAdmittedBody session={session} />}
    </GrinAdmissionGate>
  );
}

function GrinPackAdmittedBody({ session }: { session: GrinDispatchSession }): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
  const t = useT();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const [record, setRecord] = useState<GrinApplicationRecord | null>(null);
  const [pack, setPack] = useState<GrinApplicationPackExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const load = useCallback(() => {
    if (!receiptId) {
      setRecord(null);
      setPack(null);
      return;
    }
    try {
      const repo = originRepo(origin);
      setRecord(repo.get(receiptId));
      setPack(repo.exportPack(receiptId));
    } catch {
      setRecord(null);
      setPack(null);
    }
  }, [origin, receiptId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const completeness = pack?.completenessLabel === "complete" ? t("grin.pack.complete") : t("grin.pack.incomplete");
  const reasons = useMemo(() => pack?.manifest.incompleteReasons ?? [], [pack]);

  const onExport = useCallback(async () => {
    if (!record || !pack) return;
    setBusy(true);
    setError(null);
    try {
      originRepo(origin);
      const pdf = await generateGrinPackPdf({ record, pack, t });
      originRepo(origin);
      try {
        await pdfService.share(pdf);
      } catch {
        // dismissed
      }
      originRepo(origin);
    } catch {
      setError(t("grin.shareFailed"));
    } finally {
      setBusy(false);
    }
  }, [origin, pack, record, t]);

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.packTitle")} showBack />
        <GrinFixtureNotices />
        <Banner tone="info" message={GRIN_DOCUMENT_FOOTER} />
        {error ? <Banner tone="danger" message={error} /> : null}
        <Card elevated={false}>
          <GrinFieldRow label={t("grin.pack.completeness")} value={completeness} />
          <GrinFieldRow label={t("grin.pack.itcNotDetermined")} value={t("grin.pack.itcNotDetermined")} />
          {pack?.missingOriginal ? <Banner tone="warning" message={t("grin.pack.missingOriginal")} /> : null}
          {pack?.invoiceReferenceIsNotRetainedInvoice ? (
            <Banner tone="warning" message={t("grin.pack.invoiceRefNotRetained")} />
          ) : null}
          {pack?.challanIsNotInvoice ? <Banner tone="info" message={t("grin.pack.challanNotInvoice")} /> : null}
        </Card>
        {reasons.map((reason) => (
          <Banner
            key={reason}
            tone="warning"
            message={
              /missing original|no verified originals/i.test(reason)
                ? t("grin.pack.missingOriginal")
                : /challan/i.test(reason)
                  ? t("grin.pack.challanNotInvoice")
                  : /invoice reference|retained invoice|commercial_document/i.test(reason)
                    ? t("grin.pack.invoiceRefNotRetained")
                    : /event cut|projection/i.test(reason)
                      ? t("grin.projection.incomplete")
                      : t("grin.pack.incomplete")
            }
          />
        ))}
        <Button label={t("grin.pack.export")} onPress={() => void onExport()} loading={busy} />
      </View>
    </Screen>
  );
}
