import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  masterDataRepository,
  setMasterDataSessionUser,
  type MasterDataSuggestion,
  type MasterDataUserScope,
  type MasterFieldKey,
} from "@/services/masterData";
import { formatSuggestionDisplay } from "@/services/masterData/normalize";

const DEBOUNCE_MS = 180;
const MIN_QUERY_LEN = 1;

export interface FieldSuggestionRow {
  id: string;
  display: string;
  hintKey: "recent" | "times" | "source";
  hintCount?: number;
  sourceType?: string | null;
}

interface UseFieldSuggestionsOptions {
  scope: MasterDataUserScope | null;
  fieldKey: MasterFieldKey;
  query: string;
  enabled?: boolean;
  limit?: number;
}

function toRow(s: MasterDataSuggestion): FieldSuggestionRow {
  const display = formatSuggestionDisplay(s.fieldKey, s.displayValue);
  let hintKey: FieldSuggestionRow["hintKey"] = "recent";
  if (s.usageCount >= 2) {
    hintKey = "times";
  } else if (s.sourceRecordType) {
    hintKey = "source";
  }
  return {
    id: s.id,
    display,
    hintKey,
    hintCount: s.usageCount,
    sourceType: s.sourceRecordType,
  };
}

export function useFieldSuggestions({
  scope,
  fieldKey,
  query,
  enabled = true,
  limit = 5,
}: UseFieldSuggestionsOptions) {
  const [rows, setRows] = useState<FieldSuggestionRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (scope?.userId) {
      setMasterDataSessionUser(scope.userId);
    }
  }, [scope?.userId]);

  const canQuery = Boolean(
    enabled && scope?.userId && scope?.ueid && query.trim().length >= MIN_QUERY_LEN
  );

  const runQuery = useCallback(async () => {
    if (!scope || !canQuery) {
      setRows([]);
      setOpen(false);
      return;
    }
    const reqId = ++requestIdRef.current;
    setLoading(true);
    try {
      const results = await masterDataRepository.query({
        scope,
        fieldKey,
        prefix: query,
        limit,
      });
      if (reqId !== requestIdRef.current) return;
      const next = results.map(toRow);
      setRows(next);
      setOpen(next.length > 0);
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, [scope, canQuery, fieldKey, query, limit]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!canQuery) {
      setRows([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void runQuery();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [canQuery, runQuery]);

  const removeSuggestion = useCallback(
    async (id: string) => {
      if (!scope) return;
      await masterDataRepository.hide(scope, id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (rows.length <= 1) setOpen(false);
    },
    [scope, rows.length]
  );

  const dismiss = useCallback(() => setOpen(false), []);

  return useMemo(
    () => ({
      suggestions: rows,
      open,
      loading,
      setOpen,
      dismiss,
      removeSuggestion,
      refresh: runQuery,
    }),
    [rows, open, loading, dismiss, removeSuggestion, runQuery]
  );
}
