"use client";

import { useEffect, useRef } from "react";

const SEEN_KEY = "saas-views-tracked";

/**
 * Registers a single page impression for the listing (item 4 — "visualizações").
 * Fire-and-forget, once per listing per browser session (localStorage guard),
 * never blocks rendering. The server rate-limits by IP and stamps the tenant
 * from the listing itself.
 */
export function ViewTracker({ propertyId }: { propertyId: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || typeof window === "undefined") return;
    fired.current = true;
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
      if (seen.includes(propertyId)) return;
      seen.push(propertyId);
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    } catch {
      // Storage unavailable — still report the visit.
    }
    fetch("/api/public/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId }),
    }).catch(() => undefined);
  }, [propertyId]);

  return null;
}