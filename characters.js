import { CHARACTER_STORAGE_KEY, LEGACY_CHARACTER_KEYS, readJson, writeJson } from "./storage.js";
import { createId, normalizeLevel, normalizePercentage } from "./utils.js";
import { seriesForJob } from "./jobs.js";
import { createDefaultDailies, normalizeDailies, syncCompleted } from "./dailies.js";

let characters = [];

export const getCharacters = () => characters;
export const findCharacter = (id) => characters.find((character) => character.id === id);
export const saveCharacters = () => writeJson(CHARACTER_STORAGE_KEY, characters);

export function normalizeCharacter(record, template = []) {
  const { daily: _legacyDaily, ...rest } = record;
  const job = typeof record.job === "string" ? record.job.trim().slice(0, 20) : "";
  const dailies = normalizeDailies(record, template);
  const character = {
    ...rest,
    id: typeof record.id === "string" && record.id ? record.id : createId(),
    name: record.name.trim(),
    job,
    series: seriesForJob(job, record.series || ""),
    level: normalizeLevel(record.level) || "1",
    previousLevel: normalizeLevel(record.previousLevel) || normalizeLevel(record.level) || "1",
    previousExp: normalizePercentage(record.previousExp ?? record.exp ?? ""),
    afterDailyExp: normalizePercentage(record.afterDailyExp ?? ""),
    dailies,
    favorite: record.favorite === true,
  };
  syncCompleted(character);
  return character;
}

/** orderなし・重複・不正値を、現在の並びを保ちながら0始まりの連番へ直す。 */
function normalizeCharacterOrder(records) {
  const orders = records.map((character) => character.order);
  const valid = orders.every((order) => Number.isInteger(order) && order >= 0)
    && new Set(orders).size === orders.length;
  const ordered = valid ? [...records].sort((a, b) => a.order - b.order) : records;
  return ordered.map((character, index) => ({ ...character, order: index }));
}

function assignSequentialOrder(records) {
  return records.map((character, index) => ({ ...character, order: index }));
}

function setRecords(records, template) {
  const used = new Set();
  const normalized = records.filter((item) => item && typeof item.name === "string").map((item) => {
    const character = normalizeCharacter(item, template);
    if (used.has(character.id)) character.id = createId();
    used.add(character.id);
    return character;
  });
  characters = normalizeCharacterOrder(normalized);
  saveCharacters();
  return characters;
}

export function loadCharacters(template = []) {
  for (const key of [CHARACTER_STORAGE_KEY, ...LEGACY_CHARACTER_KEYS]) {
    const parsed = readJson(key);
    if (Array.isArray(parsed)) return setRecords(parsed, template);
  }
  characters = [];
  return characters;
}

export function replaceCharacters(records, template = []) {
  return setRecords(records, template);
}

export function addCharacter(data, dailyTemplate) {
  const maxOrder = characters.reduce((max, character) => Math.max(max, Number(character.order) || 0), -1);
  const character = { id: createId(), ...data, order: maxOrder + 1, dailies: createDefaultDailies(dailyTemplate), favorite: false };
  syncCompleted(character);
  characters.push(character);
  saveCharacters();
}

export function updateCharacter(id, data) {
  const character = findCharacter(id);
  if (character) {
    Object.assign(character, data);
    saveCharacters();
  }
  return character;
}

export function deleteCharacter(id) {
  characters = assignSequentialOrder(characters.filter((character) => character.id !== id));
  saveCharacters();
}

/** 指定IDの並びを保存し、orderを0から振り直す。 */
export function saveCharacterOrder(ids) {
  const byId = new Map(characters.map((character) => [character.id, character]));
  const requested = ids.map((id) => byId.get(id)).filter(Boolean);
  const missing = characters.filter((character) => !ids.includes(character.id));
  characters = assignSequentialOrder([...requested, ...missing]);
  saveCharacters();
}
