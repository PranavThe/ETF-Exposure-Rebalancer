"use client";

import { useEffect, useState } from "react";

import { api, type Health } from "./api";

export type Resource<T> = { data?: T; error?: string; loading: boolean };

/** Runs `fetcher` whenever `key` changes; a null key means "nothing to load yet". */
export function useResource<T>(key: string | null, fetcher: () => Promise<T>): Resource<T> {
  const [state, setState] = useState<{ key: string; data?: T; error?: string } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let active = true;
    fetcher().then(
      (data) => active && setState({ key, data }),
      (err: Error) => active && setState({ key, error: err.message }),
    );
    return () => {
      active = false;
    };
    // The key identifies the request; fetcher is recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = state && state.key === key ? state : null;
  return { data: current?.data, error: current?.error, loading: key !== null && current === null };
}

export function useHealth(): Resource<Health> {
  return useResource("health", () => api.health());
}
