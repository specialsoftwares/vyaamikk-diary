import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import {
  exploreLocalPartyLedger,
  type LocalPartyLedger,
} from "@/services/partyLedger/localExplorer";
import { loadLocalPartyLedger } from "@/services/partyLedger/loadLocalPartyLedger";

export function useLocalPartyLedger(ownerUid: string | null) {
  const [ledger, setLedger] = useState<LocalPartyLedger | null>(null);
  const [error, setError] = useState(false);
  const [reading, setReading] = useState(Boolean(ownerUid));

  const reload = useCallback(async () => {
    if (!ownerUid) {
      setLedger(exploreLocalPartyLedger([]));
      setError(false);
      setReading(false);
      return;
    }
    setReading(true);
    try {
      const next = await loadLocalPartyLedger(ownerUid);
      setLedger(next);
      setError(false);
    } catch {
      setLedger(null);
      setError(true);
    } finally {
      setReading(false);
    }
  }, [ownerUid]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  return { ledger, error, reading, reload };
}
