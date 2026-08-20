/** Browser-only favorites store (localStorage). Server components must not import this module. */

const FAVORITES_KEY = "saasimob:favorites";

export function readFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeFavorites(ids: string[]): void {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private mode / quota) — favorites stay in-memory.
  }
}

export function isFavorite(propertyId: string): boolean {
  return readFavorites().includes(propertyId);
}

/** Toggle a property in the favorites list; returns the new list. */
export function toggleFavorite(propertyId: string): string[] {
  const current = readFavorites();
  const next = current.includes(propertyId) ? current.filter((id) => id !== propertyId) : [...current, propertyId];
  writeFavorites(next);
  return next;
}