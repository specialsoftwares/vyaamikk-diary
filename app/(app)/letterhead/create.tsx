/**
 * Read-only view for a letter or draft saved before Letterhead creation
 * was removed. The route path stays `create` so older links and drafts
 * still resolve. It does not edit, save, or generate a PDF.
 * Loaded text and PDF share stay bound to the current UID and session.
 */
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
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
import { legacyLetterFields, legacyReaderParams } from "@/services/letterhead/legacyLetterhead";
import {
  createLegacyLetterheadReaderRuntime,
  maskLegacyReader,
  type LegacyLiveSession,
} from "@/services/letterhead/legacyLetterheadReadRuntime";
import { pdfService } from "@/services/pdf/pdfService";
import { isShareSheetCancellation } from "@/services/pdf/shareCancellation";
import { userFacingMessage } from "@/domain/errors";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import { formatShortDate } from "@/utils/date";

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
  const uid = user?.uid ?? null;
  const session = syncSessionOwnership.capture();
  const liveSession =
    uid && session && uid === session.uid
      ? { uid: session.uid, generation: session.generation }
      : null;
  const live: LegacyLiveSession = { authUid: uid, session: liveSession };
  const liveRef = useRef(live);
  liveRef.current = live;
  const unavailable = t("letterhead.legacyUnavailable");

  const [runtime] = useState(() =>
    createLegacyLetterheadReaderRuntime({
      getDocument: (ownerId, id) => getLetterheadDocumentRepository().get(ownerId, id),
      getDraft: (ownerId, id) => formDraftsRepository.getById(ownerId, id),
      fileExists: async (uri) => {
        try {
          const info = await FileSystem.getInfoAsync(uri);
          return info.exists;
        } catch {
          return false;
        }
      },
      sharePdf: async (uri) => {
        await pdfService.share({ uri, fileName: "Saved-letter.pdf" });
      },
      isShareCancelled: isShareSheetCancellation,
      mapError: (error) => userFacingMessage(error),
      unavailableMessage: unavailable,
      liveSession: () => liveRef.current,
    })
  );
  const [, setTick] = useState(0);
  const snap = maskLegacyReader(runtime.snapshot(), live);

  useEffect(() => runtime.subscribe(() => setTick((n) => n + 1)), [runtime]);

  useEffect(() => {
    runtime.setIdentity(liveSession, { documentId, draftId });
  }, [runtime, liveSession?.uid, liveSession?.generation, documentId, draftId]); // eslint-disable-line react-hooks/exhaustive-deps -- session identity is uid + generation

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      lead: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
      block: { gap: spacing.xs, marginBottom: spacing.md },
      label: { ...typography.caption, color: colors.textMuted },
      value: { ...typography.body, color: colors.text },
      banner: { marginBottom: spacing.md },
    })
  );

  const view = snap.phase === "ready" ? snap.view : null;
  const title =
    view?.kind === "draft" ? t("letterhead.legacyDraftTitle") : t("letterhead.legacyTitle");

  return (
    <Screen>
      <Header title={title} showBack backFrom="letterhead" />
      {snap.phase !== "ready" && snap.phase !== "error" ? (
        <Loader fullscreen message={t("common.loading")} />
      ) : null}
      {snap.phase === "error" && snap.error ? (
        <ErrorState message={snap.error} onRetry={() => runtime.reload()} />
      ) : null}
      {view ? (
        <View>
          <LocaleUiText style={styles.lead}>{formatShortDate(view.input.date)}</LocaleUiText>
          <Banner
            tone="info"
            message={
              view.designKept
                ? t("letterhead.legacyDesignKept")
                : t("letterhead.legacyDesignMissing")
            }
          />
          <View style={styles.banner} />
          <Card>
            {legacyLetterFields(view.input).map((row) => (
              <View key={row.key} style={styles.block}>
                <LocaleUiText style={styles.label}>{t(`letterhead.legacyField.${row.key}`)}</LocaleUiText>
                <LocaleUiText style={styles.value}>{row.value}</LocaleUiText>
              </View>
            ))}
          </Card>
          {view.kind === "letter" && view.pdfState === "none" ? (
            <Banner tone="info" message={t("letterhead.legacyNoPdf")} />
          ) : null}
          {view.kind === "letter" && view.pdfState === "missing" ? (
            <Banner tone="warning" message={t("letterhead.legacyPdfMissing")} />
          ) : null}
          {view.kind === "letter" && view.pdfState === "present" ? (
            <Button
              label={t("letterhead.legacySharePdf")}
              onPress={() => void runtime.shareLoadedPdf()}
              loading={snap.sharing}
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
