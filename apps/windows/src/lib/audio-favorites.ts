import type { AudioDevice } from '@/lib/commands';

// Per-kind ("output" / "input") favorite device ids, persisted to localStorage.
// Extracted from the sound route so persistence + ordering live in one place.

function favKey(kind: string) {
  return `pane.audio.favorites.${kind}`;
}

export function readFavorites(kind: string): Set<string> {
  try {
    const raw = localStorage.getItem(favKey(kind));
    if (!raw) return new Set();
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr)
      ? new Set(arr.filter((x): x is string => typeof x === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

export function writeFavorites(kind: string, favorites: Set<string>): void {
  try {
    localStorage.setItem(favKey(kind), JSON.stringify([...favorites]));
  } catch {
    /* storage unavailable; favorites just won't persist */
  }
}

/** Favorites float to the top; everything else stays alphabetical. */
export function orderDevices(
  devices: AudioDevice[],
  favs: Set<string>,
): AudioDevice[] {
  return devices.toSorted((a, b) => {
    const fa = favs.has(a.id) ? 0 : 1;
    const fb = favs.has(b.id) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return a.name.localeCompare(b.name);
  });
}
