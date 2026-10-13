/**
 * Saved letters from before Letterhead creation was removed.
 * The list, row open, and delete confirm stay bound to the current session.
 */
import React, { useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import {
  Card,
  EmptyState,
  ErrorState,
  Header,
  Loader,
  LocaleUiText,
  Screen,
} from "@/components/ui";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { getLetterheadDocumentRepository } from "@/services/letterhead/documentRepository";
import {
  createLegacyLetterheadListRuntime,
  maskLegacyList,
  type LegacyLiveSession,
} from "@/services/letterhead/legacyLetterheadReadRuntime";
import { userFacingMessage } from "@/domain/errors";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import { formatShortDate } from "@/utils/date";

export default function LegacyLetterheadHistoryScreen() {
  const t = useT();
  const router = useRouter();
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
  const routerRef = useRef(router);
  routerRef.current = router;

  const [runtime] = useState(() =>
    createLegacyLetterheadListRuntime({
      list: (ownerId) => getLetterheadDocumentRepository().list(ownerId),
      mapError: (error) => userFacingMessage(error),
      navigate: (documentId) => {
        routerRef.current.push({
          pathname: "/(app)/letterhead/create",
          params: { documentId },
        });
      },
      liveSession: () => liveRef.current,
    })
  );
  const [, setTick] = useState(0);
  const snap = maskLegacyList(runtime.snapshot(), live);
  const { requestDelete, isDeleting } = useRecordDelete(uid);

  useEffect(() => runtime.subscribe(() => setTick((n) => n + 1)), [runtime]);

  useEffect(() => {
    runtime.setOwner(liveSession);
  }, [runtime, liveSession?.uid, liveSession?.generation]); // eslint-disable-line react-hooks/exhaustive-deps -- session identity is uid + generation

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      lead: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
      list: { flex: 1 },
      listContent: { gap: spacing.md, paddingBottom: spacing.xxxl },
      title: { ...typography.titleSm, color: colors.text },
      meta: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
    })
  );

  return (
    <Screen>
      <Header title={t("letterhead.legacyListTitle")} showBack backFrom="letterhead" />
      <LocaleUiText style={styles.lead}>{t("letterhead.legacyListLead")}</LocaleUiText>
      {snap.phase !== "ready" && snap.phase !== "error" ? (
        <Loader fullscreen message={t("common.loading")} />
      ) : null}
      {snap.phase === "error" && snap.error ? (
        <ErrorState message={snap.error} onRetry={() => runtime.reload()} />
      ) : null}
      {snap.phase === "ready" ? (
        <FlatList
          data={snap.rows}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              title={t("letterhead.legacyEmptyTitle")}
              message={t("letterhead.legacyEmptyMessage")}
            />
          }
          renderItem={({ item }) => {
            const req = {
              entityType: "letterhead_document" as const,
              recordId: item.id,
              title: item.title,
              confirmTier: "record" as const,
            };
            return (
              <SwipeToDeleteRow
                rowKey={`lh-${item.id}`}
                recordId={item.id}
                entityType="letterhead_document"
                title={item.title}
                onDeletePress={() => {
                  const admission = runtime.admitRowDelete(item.id);
                  if (!admission) return;
                  requestDelete(
                    req,
                    () => {
                      if (runtime.rowDeleteStillCurrent(admission)) runtime.reload();
                    },
                    { confirmAdmit: () => runtime.rowDeleteStillCurrent(admission) }
                  );
                }}
                deleteInProgress={isDeleting(req)}
              >
                <Card onPress={() => runtime.openRow(item.id)}>
                  <View>
                    <LocaleUiText style={styles.title}>{item.title || item.subject}</LocaleUiText>
                    <LocaleUiText style={styles.meta}>{formatShortDate(item.dateMs)}</LocaleUiText>
                  </View>
                </Card>
              </SwipeToDeleteRow>
            );
          }}
        />
      ) : null}
    </Screen>
  );
}
