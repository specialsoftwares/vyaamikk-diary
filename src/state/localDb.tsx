import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getLocalDatabaseInitError,
  initializeLocalDatabase,
  isLocalDatabaseReady,
} from "@/localDb/init";

type LocalDbStatus = "loading" | "ready" | "failed";

interface LocalDbContextValue {
  status: LocalDbStatus;
  error: Error | null;
}

const LocalDbContext = createContext<LocalDbContextValue>({
  status: "loading",
  error: null,
});

export function LocalDbProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LocalDbStatus>("loading");
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    initializeLocalDatabase()
      .then(() => {
        if (mounted) {
          setStatus("ready");
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (mounted) {
          setStatus("failed");
          setError(e);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(() => ({ status, error }), [status, error]);

  return <LocalDbContext.Provider value={value}>{children}</LocalDbContext.Provider>;
}

export function useLocalDb(): LocalDbContextValue {
  return useContext(LocalDbContext);
}

/** Gate helpers for boot — DB must be ready before auth restore or forms. */
export function assertLocalDbReady(): void {
  if (!isLocalDatabaseReady()) {
    const err = getLocalDatabaseInitError();
    throw err ?? new Error("Local database is not ready.");
  }
}
