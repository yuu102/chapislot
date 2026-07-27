const CANDIDATES_KEY = "chapisuro.v2.candidates";
const SETTINGS_KEY = "chapisuro.v2.settings";
const PATROL_KEY = "chapisuro.v2.patrol";
const LOG_KEY = "chapisuro.v2.evaluationLogs";
const LEGACY_KEY = "chapisuro.phase3.candidates.v1";

const read = (key, fallback) => {
  try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); }
  catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
};
const num = value => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;

export function normalizeCandidate(source = {}) {
  const today = source.today || {};
  const previous = source.previousDay || {};
  return {
    schemaVersion: 2,
    id: source.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    hall: source.hall || "",
    machine: source.machine || "",
    machineNumber: String(source.machineNumber || ""),
    today: {
      currentGames: num(today.currentGames ?? source.currentGames),
      totalGames: num(today.totalGames ?? source.totalGames),
      firstHits: num(today.firstHits ?? source.firstHits),
      atCount: num(today.atCount ?? source.atCount ?? source.bonusCount),
      maxCoins: num(today.maxCoins ?? source.maxCoins),
      graphState: today.graphState || source.graphState || "",
      recentFlow: today.recentFlow || source.recentFlow || ""
    },
    previousDay: {
      finalGames: num(previous.finalGames ?? source.previousGames),
      totalGames: num(previous.totalGames ?? source.previousTotalGames),
      firstHits: num(previous.firstHits ?? source.previousFirstHits),
      atCount: num(previous.atCount ?? source.previousAtCount),
      maxCoins: num(previous.maxCoins ?? source.previousMaxCoins),
      graphState: previous.graphState || source.previousGraph || ""
    },
    note: source.note || "",
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || new Date().toISOString(),
    importSource: source.importSource || "手動入力"
  };
}

export function loadCandidates() {
  const current = read(CANDIDATES_KEY, null);
  if (Array.isArray(current)) return current.map(normalizeCandidate);
  const legacy = read(LEGACY_KEY, []);
  const migrated = Array.isArray(legacy) ? legacy.map(normalizeCandidate) : [];
  if (migrated.length) write(CANDIDATES_KEY, migrated);
  return migrated;
}
export const saveCandidates = value => write(CANDIDATES_KEY, value);
export const loadSettings = () => ({ mode: "night", closingTime: "22:45", ...read(SETTINGS_KEY, {}) });
export const saveSettings = value => write(SETTINGS_KEY, value);
export const loadPatrol = () => read(PATROL_KEY, { currentId: null, states: {} });
export const savePatrol = value => write(PATROL_KEY, value);
export function appendEvaluationLog(log) {
  const logs = read(LOG_KEY, []);
  logs.unshift(log);
  write(LOG_KEY, logs.slice(0, 500));
}
