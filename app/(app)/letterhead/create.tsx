/**
 * Read-only view for a letter or draft saved before Letterhead creation
 * was removed. The route path stays `create` so older links and drafts
 * still resolve. It does not edit, save, or generate a PDF.
 */
import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Redirect, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";

import {
  Banner,
  Button,
  Card,
  ErrorState,
  Header,
  Loader,
  LocaleUiText,
  Screen,
} from "@/components/ui";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { getLetterheadDocumentRepository } from "@/services/letterhead/documentRepository";
import { draftPayloadToLetterheadInput } from "@/services/letterhead/letterheadDraftMapper";
import {
  classifyStoredPdf,
  legacyLetterFields,
  legacyLetterVisibleTo,
  legacyReaderParams,
  type StoredPdfState,
} from "@/services/letterhead/legacyLetterhead";
import type { LetterheadDocumentInput } from "@/services/letterhead/types";
import { pdfService } from "@/services/pdf/pdfService";
import { isShareSheetCancellation } from "@/services/pdf/shareCancellation";
import { userFacingMessage } from "@/domain/errors";
import { formatShortDate } from "@/utils/date";

type Loaded =
  | { kind: "letter"; input: LetterheadDocumentInput; dateLabel: string; designKept: boolean; pdfUri: string | null }
  | { kind: "draft"; input: LetterheadDocumentInput; dateLabel: string; designKept: boolean };

export default function LegacyLetterheadScreen() {
  const params = useLocalSearchParams<{
    draftId?: string;
    documentId?: string;
    editDocId?: string;
  }>();
  const ids = legacyReaderParams({
    draftId: firstParam(params.draftId),
    documentId: firstParam(params.documentId),
    editDocId: firstParam(params.editDocId),
  });
  if (!ids.draftId && !ids.documentId) {
    return <Redirect href="/(app)/letterhead/history" />;
  }
  return <LegacyLetterheadBody draftId={ids.draftId} documentId={ids.documentId} />;
}

function LegacyLetterheadBody({
  draftId,
  documentId,
}: {
  draftId?: string;
  documentId?: string;
}) {
  const t = useT();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pdfState, setPdfState] = useState<StoredPdfState>("none");
  const [sharing, setSharing] = useState(false);

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      lead: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
      block: { gap: spacing.xs, marginBottom: spacing.md },
      label: { ...typography.caption, color: colors.textMuted },
      value: { ...typography.body, color: colors.text },
      banner: { marginBottom: spacing.md },
    })
  );

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      if (documentId) {
        const doc = await getLetterheadDocumentRepository().get(user.uid, documentId);
        if (!doc || !legacyLetterVisibleTo(doc.userId, user.uid)) {
          setLoaded(null);
          setError(t("letterhead.legacyUnavailable"));
          return;
        }
        const pdfUri = doc.pdfUri?.trim() ? doc.pdfUri : null;
        let exists = false;
        if (pdfUri) {
          try {
            const info = await FileSystem.getInfoAsync(pdfUri);
            exists = info.exists;
          } catch {
            exists = false;
          }
        }
        setPdfState(classifyStoredPdf(pdfUri, exists));
        setLoaded({
          kind: "letter",
          input: doc.input,
          dateLabel: formatShortDate(doc.input.date),
          designKept: Boolean(doc.templateSnapshot),
          pdfUri,
        });
        return;
      }
      if (draftId) {
        const draft = await formDraftsRepository.getById(user.uid, draftId);
        if (!draft || draft.draftKind !== "letterhead" || draft.userId !== user.uid) {
          setLoaded(null);
          setError(t("letterhead.legacyUnavailable"));
          return;
        }
        setPdfState("none");
        setLoaded({
          kind: "draft",
          input: draftPayloadToLetterheadInput(draft.payload),
          dateLabel: formatShortDate(
            typeof draft.payload.date === "number" ? draft.payload.date : draft.updatedAt
          ),
          designKept: draft.payload.templateAvailability === "snapshot" && Boolean(draft.payload.templateSnapshot),
        });
      }
    } catch (e) {
      setLoaded(null);
      setError(userFacingMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user, documentId, draftId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onShare = useCallback(async () => {
    if (!loaded || loaded.kind !== "letter" || !loaded.pdfUri || pdfState !== "present") return;
    setSharing(true);
    try {
      await pdfService.share({ uri: loaded.pdfUri, fileName: "Saved-letter.pdf" });
    } catch (e) {
      if (!isShareSheetCancellation(e)) setError(userFacingMessage(e));
    } finally {
      setSharing(false);
    }
  }, [loaded, pdfState]);

  const title =
    loaded?.kind === "draft" ? t("letterhead.legacyDraftTitle") : t("letterhead.legacyTitle");

  return (
    <Screen>
      <Header title={title} showBack backFrom="letterhead" />
      {loading ? <Loader fullscreen message={t("common.loading")} /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && loaded ? (
        <View>
          <LocaleUiText style={styles.lead}>{loaded.dateLabel}</LocaleUiText>
          <Banner
            tone="info"
            message={
              loaded.designKept
                ? t("letterhead.legacyDesignKept")
                : t("letterhead.legacyDesignMissing")
            }
          />
          <View style={styles.banner} />
          <Card>
            {legacyLetterFields(loaded.input).map((row) => (
              <View key={row.key} style={styles.block}>
                <LocaleUiText style={styles.label}>{t(`letterhead.legacyField.${row.key}`)}</LocaleUiText>
                <LocaleUiText style={styles.value}>{row.value}</LocaleUiText>
              </View>
            ))}
          </Card>
          {loaded.kind === "letter" && pdfState === "none" ? (
            <Banner tone="info" message={t("letterhead.legacyNoPdf")} />
          ) : null}
          {loaded.kind === "letter" && pdfState === "missing" ? (
            <Banner tone="warning" message={t("letterhead.legacyPdfMissing")} />
          ) : null}
          {loaded.kind === "letter" && pdfState === "present" ? (
            <Button
              label={t("letterhead.legacySharePdf")}
              onPress={() => void onShare()}
              loading={sharing}
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ? raw : undefined;
}
