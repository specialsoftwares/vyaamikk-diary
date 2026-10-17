import React, { useCallback, useMemo, useState } from "react";

import { GRIN_DOCUMENT_FOOTER } from "@/goodsEvidence/constants";
import type { GrinApplicationPackExport, GrinApplicationRecord } from "@/services/grin/repository";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { generateGrinPackPdf } from "@/services/grin/pdf/grinPdfAdapter";
import { spacing } from "@/theme/spacing";

import { grinMutationErrorMessage } from "./grinActionErrors";
import { GrinFieldRow } from "./GrinFieldRow";
import { GrinFixtureNotices } from "./GrinFixtureNotices";
import { originRepo, useFrozenGrinOrigin, useGrinFocusEffect, useGrinLocalSearchParams, useGrinT, useGrinThemedStyles } from "./grinScreenHooks";
import { Banner, Button, Card, Header, Screen, View, StyleSheet } from "./grinSurfaces";

type PackShareFn = (file: { uri: string; fileName: string }) => Promise<unknown>;

let injectedShare: PackShareFn | null = null;

export function setGrinPackShareForTests(share: PackShareFn | null): void {
  injectedShare = share;
}

export function GrinPackAdmittedBody({ session }: { session: GrinDispatchSession }): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
  const t = useGrinT();
  const { receiptId } = useGrinLocalSearchParams<{ receiptId: string }>();
  const [record, setRecord] = useState<GrinApplicationRecord | null>(null);
  const [pack, setPack] = useState<GrinApplicationPackExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styles = useGrinThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const maskRetired = useCallback(() => {
    setRecord(null);
    setPack(null);
  }, []);

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
    } catch (caught) {
      if (grinMutationErrorMessage(caught, t, "grin.shareFailed").retired) {
        maskRetired();
        setError(t("grin.errSessionRetired"));
        return;
      }
      setRecord(null);
      setPack(null);
    }
  }, [maskRetired, origin, receiptId, t]);

  useGrinFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const completeness = pack?.completenessLabel === "complete" ? t("grin.pack.complete") : t("grin.pack.incomplete");
  const coverage = pack?.coverage === "complete" ? t("grin.pack.coverageComplete") : t("grin.pack.coverageIncomplete");
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
        if (injectedShare) {
          await injectedShare(pdf);
        } else {
          const { pdfService } = await import("@/services/pdf/pdfService");
          await pdfService.share(pdf);
        }
      } catch {
        // OS share sheet dismissed or failed after launch. Do not claim we cancelled it.
      }
      originRepo(origin);
    } catch (caught) {
      const mapped = grinMutationErrorMessage(caught, t, "grin.shareFailed");
      if (mapped.retired) {
        maskRetired();
        setError(t("grin.errSessionRetired"));
      } else {
        setError(mapped.message);
      }
    } finally {
      setBusy(false);
    }
  }, [maskRetired, origin, pack, record, t]);

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.packTitle")} showBack />
        <GrinFixtureNotices />
        <Banner tone="info" message={GRIN_DOCUMENT_FOOTER} />
        {error ? <Banner tone="danger" message={error} /> : null}
        <Card elevated={false}>
          <GrinFieldRow label={t("grin.pack.completeness")} value={completeness} />
          <GrinFieldRow label={t("grin.pack.coverage")} value={coverage} />
          <GrinFieldRow label={t("grin.pack.bundledArtifacts")} value={t("grin.pack.manifestPdfSummary")} />
          <GrinFieldRow label={t("grin.pack.itcNotDetermined")} value={t("grin.pack.itcNotDetermined")} />
          {pack?.originalsBundled === false ? (
            <Banner tone="info" message={t("grin.pack.originalsNotBundled")} />
          ) : null}
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
