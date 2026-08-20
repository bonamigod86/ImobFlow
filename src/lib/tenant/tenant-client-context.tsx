"use client";

import { createContext, useContext } from "react";

/**
 * Client-side tenant context provider.
 *
 * The server layout reads the identity headers stamped by the middleware and
 * passes them here; components use `useTenant()` for UI branching (e.g. hiding
 * admin actions) — the API layer still enforces everything server-side.
 */

export interface TenantMeta {
  slug: string | null;
  role: string | null;
}

const TenantContext = createContext<TenantMeta>({ slug: null, role: null });

export function TenantProvider({
  meta,
  children,
}: {
  meta: TenantMeta;
  children: React.ReactNode;
}) {
  return <TenantContext.Provider value={meta}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantMeta {
  return useContext(TenantContext);
}