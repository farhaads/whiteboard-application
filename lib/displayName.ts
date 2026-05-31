const STORAGE_KEY = "whiteboard:displayName";
const MAX_LEN = 40;

/** Read the persisted display name (client only). Returns "" when unset/unavailable. */
export function getStoredDisplayName(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(STORAGE_KEY) ?? "").slice(0, MAX_LEN);
  } catch {
    return "";
  }
}

/** Persist (or clear) the display name. Trims and caps length. */
export function setStoredDisplayName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = name.trim().slice(0, MAX_LEN);
    if (trimmed) {
      window.localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore quota / disabled storage */
  }
}
