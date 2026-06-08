import React, { useCallback, useRef, useState } from "react";
import { InteractionManager } from "react-native";
import { useFocusEffect, usePathname } from "expo-router";

import type { StatutoryPromptCard } from "@/domain/statutoryInfo";
import { StatutoryPromptSheet } from "@/components/statutory/StatutoryPromptSheet";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import {
  dismissStatutoryPrompt,
  getStatutoryPromptCardsForToday,
  snoozeStatutoryPrompt,
} from "@/services/statutory";
import {
  markStatutoryPromptShownToday,
  shouldAutoShowStatutoryPrompt,
} from "@/services/statutory/statutoryPromptSession";

const TAB_SEGMENT = /\(tabs\)\/(you|calendar|settings)/;

/**
 * Shows consolidated statutory sheet on main tabs after profile completion.
 * Does not interrupt composer flows.
 */
export function StatutoryPromptHost() {
  const { user } = useAuth();
  const t = useT();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [cards, setCards] = useState<StatutoryPromptCard[]>([]);
  const checkingRef = useRef(false);

  const tryShow = useCallback(async () => {
    if (!user?.profileCompletedAt || !user.uid) return;
    if (pathname.includes("composer")) return;
    if (!TAB_SEGMENT.test(pathname)) return;
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const mayShow = await shouldAutoShowStatutoryPrompt(user.uid);
      if (!mayShow) return;
      const pending = await getStatutoryPromptCardsForToday(user.uid, t);
      if (!pending.length) return;
      setCards(pending);
      setVisible(true);
      await markStatutoryPromptShownToday(user.uid);
    } finally {
      checkingRef.current = false;
    }
  }, [user, pathname, t]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const task = InteractionManager.runAfterInteractions(() => {
        timeoutId = setTimeout(() => {
          if (!cancelled) void tryShow();
        }, 1200);
      });
      return () => {
        cancelled = true;
        task.cancel();
        if (timeoutId) clearTimeout(timeoutId);
      };
    }, [tryShow])
  );

  const ids = cards.map((c) => c.occurrenceId);

  return (
    <StatutoryPromptSheet
      visible={visible}
      cards={cards}
      onDismissThanks={() => {
        setVisible(false);
        if (user?.uid) void dismissStatutoryPrompt(user.uid, ids);
      }}
      onSnoozeLater={() => {
        setVisible(false);
        if (user?.uid) void snoozeStatutoryPrompt(user.uid, ids);
      }}
      onOpenTab={() => setVisible(false)}
    />
  );
}
