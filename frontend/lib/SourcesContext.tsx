"use client";

import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";

import { api } from "./api";
import { SourceInfo } from "./types";

type SourcesContextValue = {
  sources: SourceInfo[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const SourcesContext = createContext<SourcesContextValue | null>(null);

export function SourcesProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await api.listSources();
    setSources(data);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  return (
    <SourcesContext.Provider value={{ sources, loading, refresh }}>
      {children}
    </SourcesContext.Provider>
  );
}

export function useSources() {
  const ctx = useContext(SourcesContext);
  if (!ctx) throw new Error("useSources must be used within SourcesProvider");
  return ctx;
}
