import { SETTINGS_STORAGE_KEY, readJson, writeJson } from "./storage.js";
import { createId } from "./utils.js";

export const SORT_MODES = ["default", "favorite", "level", "name", "levelUpSoon"];
export const DEFAULT_DAILY_TITLES = ["デイリークエスト", "遠征", "ミニダン", "モンカニ"];

const defaults = {
  sortMode: "default",
  autoDailyReset: false,
  lastResetDate: "",
  hideCompleted: false,
  backupInfo: null,
};

function normalizeBackupInfo(value) {
  if (!value || typeof value !== "object") return null;
  const appVersion = typeof value.appVersion === "string" && value.appVersion ? value.appVersion : "Legacy";
  const backupDate = typeof value.backupDate === "string" && value.backupDate ? value.backupDate : "";
  return { appVersion, backupDate };
}

function createDefaultTemplate() {
  return DEFAULT_DAILY_TITLES.map((title) => ({ id: createId(), title }));
}

/**
 * 旧文字列配列と現行のID付き配列を、重複しないIDを持つテンプレートへ統一する。
 */
export function normalizeDailyTemplate(value) {
  const source = Array.isArray(value) ? value : createDefaultTemplate();
  const usedIds = new Set();
  const template = source.reduce((items, entry) => {
    const rawTitle = typeof entry === "string" ? entry : entry?.title;
    const title = typeof rawTitle === "string" ? rawTitle.trim().slice(0, 40) : "";
    if (!title) return items;

    let id = typeof entry === "object" && typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || usedIds.has(id)) id = createId();
    usedIds.add(id);
    items.push({ id, title });
    return items;
  }, []);

  return template.length ? template : createDefaultTemplate();
}

export function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...defaults,
    ...source,
    dailyTemplate: normalizeDailyTemplate(source.dailyTemplate),
    sortMode: SORT_MODES.includes(source.sortMode) ? source.sortMode : "default",
    autoDailyReset: source.autoDailyReset === true,
    hideCompleted: source.hideCompleted === true,
    backupInfo: normalizeBackupInfo(source.backupInfo),
  };
}

export function loadSettings() {
  return normalizeSettings(readJson(SETTINGS_STORAGE_KEY));
}

export function saveSettings(settings) {
  writeJson(SETTINGS_STORAGE_KEY, {
    ...settings,
    dailyTemplate: normalizeDailyTemplate(settings.dailyTemplate),
  });
}
