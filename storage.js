export const CHARACTER_STORAGE_KEY = "meimane.characters";
export const LEGACY_CHARACTER_KEYS = ["meimane_characters"];
export const SETTINGS_STORAGE_KEY = "meimane.settings";

export function readJson(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
