const CANDIDATES_KEY = "chapisuro.v2.candidates";
const SETTINGS_KEY = "chapisuro.v2.settings";
const PATROL_KEY = "chapisuro.v2.patrol";
const LOG_KEY = "chapisuro.v2.evaluationLogs";
const COMPARE_KEY = "chapisuro.v2.comparison";
const LEGACY_KEY = "chapisuro.phase3.candidates.v1";

const read = (key, fallback) => {
  try { const stored = localStorage.getItem(key); return stored === null ? fallback : JSON.parse(stored); }
  catch { return fallback; }
};
const write = (key, storedValue) => {
  try { localStorage.setItem(key, JSON.stringify(storedValue)); return true; }
  catch { return false; }
};
const num = storedValue => storedValue === null || storedValue === undefined || storedValue === "" ? null : Number.isFinite(Number(storedValue)) ? Number(storedValue) : null;
const validStatus = status => ["active", "hidden", "archived"].includes(status) ? status : "active";

export function normalizeCandidate(source = {}) {
  const today = source.today || {};
  const previous = source.previousDay || {};
  return {
    schemaVersion: 2,
    id: source.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    status: validStatus(source.status),
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
    sevenDayTrend: source.sevenDayTrend || "",
    note: source.note || "",
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || new Date().toISOString(),
    importSource: source.importSource || "手動入力"
  };
}

export function loadAllCandidates() {
  const current = read(CANDIDATES_KEY, null);
  if (Array.isArray(current)) return current.map(normalizeCandidate);
  const legacy = read(LEGACY_KEY, []);
  const migrated = Array.isArray(legacy) ? legacy.map(item => normalizeCandidate({ ...item, status: "active" })) : [];
  if (migrated.length) write(CANDIDATES_KEY, migrated);
  return migrated;
}

export const loadCandidates = () => loadAllCandidates().filter(candidate => candidate.status === "active");
export const saveAllCandidates = candidates => write(CANDIDATES_KEY, candidates.map(normalizeCandidate));
export const saveCandidates = saveAllCandidates;
export const loadSettings = () => ({ mode: "auto", closingTime: "22:45", budget: 30000, preferenceEnabled: true, ...read(SETTINGS_KEY, {}) });
export const saveSettings = settings => write(SETTINGS_KEY, settings);
export const loadPatrol = () => ({ currentId: null, states: {}, selectedLogId: null, ...read(PATROL_KEY, {}) });
export const savePatrol = patrol => write(PATROL_KEY, patrol);
export const loadComparison = () => {
  const ids = read(COMPARE_KEY, []);
  return Array.isArray(ids) ? ids.slice(0, 3) : [];
};
export const saveComparison = ids => write(COMPARE_KEY, [...new Set(ids)].slice(0, 3));
export const loadEvaluationLogs = () => {
  const logs = read(LOG_KEY, []);
  return Array.isArray(logs) ? logs : [];
};
export function appendEvaluationLog(log) {
  const entry = {
    id: log.id || globalThis.crypto?.randomUUID?.() || `log-${Date.now()}-${Math.random()}`,
    ...log
  };
  write(LOG_KEY, [entry, ...loadEvaluationLogs()].slice(0, 1000));
  return entry;
}
export function attachPlayResult(logId, play) {
  const logs = loadEvaluationLogs();
  const index = logs.findIndex(log => log.id === logId);
  if (index < 0) return false;
  logs[index] = { ...logs[index], play: { ...play, savedAt: new Date().toISOString() } };
  return write(LOG_KEY, logs);
}
export function deleteEvaluationLogsForCandidate(candidateId) {
  return write(LOG_KEY, loadEvaluationLogs().filter(log => log.candidateId !== candidateId));
}
export function summarizeHistoryByMachine() {
  const groups = new Map();
  loadEvaluationLogs().filter(log => log.type === "candidateEvaluation" && log.play).forEach(log => {
    const key = log.machineId || "default";
    const current = groups.get(key) || { machineId: key, machine: log.machine || "", sessions: 0, scoreTotal: 0, balance: 0 };
    current.sessions += 1;
    current.scoreTotal += Number(log.result?.score || 0);
    current.balance += Number(log.play.balance || 0);
    groups.set(key, current);
  });
  return [...groups.values()].map(group => ({ ...group, averageScore: group.sessions ? Math.round(group.scoreTotal / group.sessions) : 0 }));
}
