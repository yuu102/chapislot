import { localDateKey, normalizeExpInput, normalizeLevel, normalizePercentage } from "./utils.js";
import { seriesForJob } from "./jobs.js";
import {
  addCharacter,
  deleteCharacter,
  findCharacter,
  getCharacters,
  loadCharacters,
  replaceCharacters,
  saveCharacterOrder,
  saveCharacters,
  updateCharacter,
} from "./characters.js";
import { applyTemplateToCharacter, resetDailies, syncCompleted } from "./dailies.js";
import { loadSettings, normalizeDailyTemplate, normalizeSettings, saveSettings } from "./settings.js";
import { createBackupMetadata, downloadBackup, readBackup } from "./backup.js";
import { render } from "./render.js";
import { bindModal, closeModal, createCharacterFields, createCharacterOrderDialog, createDetailDialog, createSettingsDialog, openModal } from "./dialogs.js";

const $ = (id) => document.getElementById(id);
const elements = {
  list: $("characterList"),
  search: $("searchBox"),
  add: $("addCharacterBtn"),
  dialog: $("characterDialog"),
  title: $("dialogTitle"),
  name: $("characterName"),
  level: $("characterLevel"),
  previousLevel: $("characterPreviousLevel"),
  exp: $("characterExp"),
  afterDailyExp: $("characterAfterDailyExp"),
  save: $("saveBtn"),
  cancel: $("cancelBtn"),
  remove: $("deleteBtn"),
  reorderBar: $("reorderBar"),
  reorderSave: $("saveReorderBtn"),
  reorderCancel: $("cancelReorderBtn"),
  reorderNotice: $("reorderNotice"),
  counts: { all: $("summaryAll"), completed: $("summaryCompleted"), remaining: $("summaryRemaining") },
  progress: { count: $("dailyProgressCount"), percent: $("dailyProgressPercent"), bar: $("dailyProgressBar"), fill: $("dailyProgressFill"), date: $("dailyProgressDate") },
};
const fields = createCharacterFields(elements);
elements.job = fields.job;
elements.series = fields.series;
let editingId = null;
let settings = loadSettings();
let viewMode = settings.hideCompleted ? "remaining" : "all";
let reorderMode = false;
let draftOrderIds = [];
let noticeTimer = null;

function charactersForRender() {
  if (!reorderMode) return getCharacters();
  const byId = new Map(getCharacters().map((character) => [character.id, character]));
  return draftOrderIds.map((id, index) => ({ ...byId.get(id), order: index })).filter((character) => character.id);
}

function refresh() {
  render({
    list: elements.list,
    counts: elements.counts,
    progress: elements.progress,
    characters: charactersForRender(),
    keyword: elements.search.value,
    sortMode: settings.sortMode,
    viewMode,
    reorderMode,
    onOpenDetail: (id) => detail.open(id),
    onToggleFavorite: toggleFavorite,
    onChangeViewMode: (mode) => { if (!reorderMode) { viewMode = mode; refresh(); } },
    onLongPress: beginCardReorder,
    onMoveReorder: moveDraftCharacter,
  });
}

function canStartCardReorder() {
  return viewMode === "all" && settings.sortMode === "default" && !elements.search.value.trim();
}

function showReorderNotice(message) {
  elements.reorderNotice.textContent = message;
  elements.reorderNotice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { elements.reorderNotice.hidden = true; }, 2500);
}

function beginCardReorder() {
  if (!canStartCardReorder()) {
    showReorderNotice("全キャラ・登録順表示で並び替えできます");
    return;
  }
  reorderMode = true;
  draftOrderIds = [...getCharacters()].sort((a, b) => a.order - b.order).map((character) => character.id);
  elements.reorderBar.hidden = false;
  elements.add.hidden = true;
  refresh();
}

function moveDraftCharacter(id, direction) {
  const index = draftOrderIds.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= draftOrderIds.length) return;
  [draftOrderIds[index], draftOrderIds[target]] = [draftOrderIds[target], draftOrderIds[index]];
  refresh();
}

function finishCardReorder(save) {
  if (save) saveCharacterOrder(draftOrderIds);
  reorderMode = false;
  draftOrderIds = [];
  elements.reorderBar.hidden = true;
  elements.add.hidden = false;
  refresh();
}

function applyAutoReset() {
  if (!settings.autoDailyReset || settings.lastResetDate === localDateKey()) return false;
  getCharacters().forEach(resetDailies);
  settings = { ...settings, lastResetDate: localDateKey() };
  saveCharacters();
  saveSettings(settings);
  return true;
}

function manualDailyReset() {
  if (!confirm("デイリーのチェックをリセットして、今日分へ更新しますか？\n日課終了後EXPが入力されているキャラは、前日EXPへ引き継がれます。")) return false;
  if (settings.lastResetDate === localDateKey() && !confirm("今日はすでに更新済みです。\nもう一度リセットしますか？")) return false;
  getCharacters().forEach(resetDailies);
  settings = { ...settings, lastResetDate: localDateKey() };
  saveCharacters();
  saveSettings(settings);
  refresh();
  return true;
}

function checkAutoResetOnResume() {
  if (applyAutoReset()) refresh();
}

function toggleFavorite(id) {
  const character = findCharacter(id);
  if (!character) return;
  character.favorite = !character.favorite;
  saveCharacters();
  refresh();
}

function setDaily(characterId, dailyId, checked) {
  const character = findCharacter(characterId);
  const daily = character?.dailies.find((item) => item.id === dailyId);
  if (!daily) return;
  daily.checked = checked;
  syncCompleted(character);
  saveCharacters();
}

/** テンプレートのIDを軸に、変更を全キャラクターへ一括反映する。 */
function applyDailyTemplate(previousTemplate, nextTemplate) {
  getCharacters().forEach((character) => applyTemplateToCharacter(character, previousTemplate, nextTemplate));
  saveCharacters();
}

const detail = createDetailDialog({ find: findCharacter, setDaily, refresh, edit: openEdit });
const characterOrderDialog = createCharacterOrderDialog({
  characters: () => [...getCharacters()].sort((a, b) => a.order - b.order),
  save: (ids) => {
    saveCharacterOrder(ids);
    refresh();
  },
});

async function restoreBackup(file) {
  try {
    const backup = await readBackup(file);
    if (!confirm("バックアップを復元します。\n\n現在のデータは上書きされます。\n\n続行しますか？")) return;
    settings = backup.settings ? normalizeSettings(backup.settings) : settings;
    settings = { ...settings, backupInfo: backup.metadata };
    // 復元済みの当日チェックを直後の自動リセットで消さないよう、当日は更新済みとして扱う。
    if (settings.autoDailyReset) settings.lastResetDate = localDateKey();
    replaceCharacters(backup.characters, settings.dailyTemplate);
    saveSettings(settings);
    viewMode = settings.hideCompleted ? "remaining" : "all";
    refresh();
  } catch {
    alert("JSON復元に失敗しました。");
  }
}

function createBackup() {
  const metadata = createBackupMetadata();
  settings = { ...settings, backupInfo: metadata };
  saveSettings(settings);
  downloadBackup(getCharacters(), settings, metadata);
  return metadata;
}

const settingsDialog = createSettingsDialog(
  () => settings,
  (next) => {
    const previousTemplate = settings.dailyTemplate;
    const normalized = normalizeSettings({ ...next, dailyTemplate: normalizeDailyTemplate(next.dailyTemplate) });
    const enabledToday = !settings.autoDailyReset && normalized.autoDailyReset;
    settings = enabledToday ? { ...normalized, lastResetDate: localDateKey() } : normalized;
    applyDailyTemplate(previousTemplate, settings.dailyTemplate);
    saveSettings(settings);
    applyAutoReset();
    refresh();
  },
  {
    onBackup: createBackup,
    onRestore: restoreBackup,
    onOpenCharacterOrder: () => characterOrderDialog.open(),
    onManualDailyReset: manualDailyReset,
  },
);

function openAdd() {
  editingId = null;
  elements.title.textContent = "キャラクター追加";
  elements.name.value = "";
  elements.job.value = "";
  elements.series.value = "";
  elements.level.value = "";
  elements.previousLevel.value = "";
  elements.exp.value = "";
  elements.afterDailyExp.value = "";
  elements.remove.hidden = true;
  openModal(elements.dialog, elements.name);
}

function openEdit(id) {
  const character = findCharacter(id);
  if (!character) return;
  editingId = id;
  elements.title.textContent = "キャラクター編集";
  elements.name.value = character.name;
  if (!Array.from(elements.job.options).some((option) => option.value === character.job)) {
    elements.job.insertBefore(new Option(`既存職業: ${character.job}`, character.job), elements.job.children[1]);
  }
  elements.job.value = character.job;
  elements.series.value = seriesForJob(character.job, character.series);
  elements.level.value = character.level;
  elements.previousLevel.value = character.previousLevel;
  elements.exp.value = normalizeExpInput(character.previousExp);
  elements.afterDailyExp.value = normalizeExpInput(character.afterDailyExp);
  elements.remove.hidden = false;
  openModal(elements.dialog, elements.name);
}

function saveForm() {
  const name = elements.name.value.trim();
  const level = normalizeLevel(elements.level.value);
  const previousLevel = normalizeLevel(elements.previousLevel.value) || level;
  const previousExp = normalizeExpInput(elements.exp.value);
  const afterDailyExp = normalizeExpInput(elements.afterDailyExp.value);
  if (!name || !level) {
    alert("キャラ名とレベルを入力してください。");
    return;
  }
  const data = {
    name,
    job: elements.job.value,
    series: seriesForJob(elements.job.value, elements.series.value),
    level,
    previousLevel,
    previousExp,
    afterDailyExp,
  };
  if (editingId) updateCharacter(editingId, data);
  else addCharacter(data, settings.dailyTemplate);
  closeModal(elements.dialog);
  refresh();
}

function removeCharacter() {
  const character = findCharacter(editingId);
  if (!character || !confirm(`「${character.name}」を削除しますか？`)) return;
  deleteCharacter(editingId);
  closeModal(elements.dialog);
  refresh();
}

function createToolbar() {
  const config = document.createElement("button");
  config.type = "button";
  config.textContent = "設定";
  config.addEventListener("click", () => settingsDialog.open());
  const bar = document.createElement("div");
  bar.className = "tool-controls";
  bar.append(config);
  elements.search.insertAdjacentElement("afterend", bar);
}

elements.add.addEventListener("click", openAdd);
elements.search.addEventListener("input", refresh);
elements.save.addEventListener("click", saveForm);
elements.cancel.addEventListener("click", () => closeModal(elements.dialog));
elements.remove.addEventListener("click", removeCharacter);
elements.reorderSave.addEventListener("click", () => finishCardReorder(true));
elements.reorderCancel.addEventListener("click", () => finishCardReorder(false));
elements.level.addEventListener("input", () => { elements.level.value = normalizeLevel(elements.level.value); });
elements.previousLevel.addEventListener("input", () => { elements.previousLevel.value = normalizeLevel(elements.previousLevel.value); });
elements.exp.addEventListener("blur", () => { elements.exp.value = normalizeExpInput(elements.exp.value); });
elements.afterDailyExp.addEventListener("blur", () => { elements.afterDailyExp.value = normalizeExpInput(elements.afterDailyExp.value); });
elements.reorderBar.hidden = true;
elements.add.hidden = false;
bindModal(elements.dialog);
elements.dialog.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.tagName !== "BUTTON") {
    event.preventDefault();
    saveForm();
  }
});

// Version 1.3.3: 設定を先に読み込み、旧キャラクターデータへtemplateIdとorderを補完する。
saveSettings(settings);
loadCharacters(settings.dailyTemplate);
applyAutoReset();
createToolbar();
refresh();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkAutoResetOnResume(); });
window.addEventListener("pageshow", checkAutoResetOnResume);
window.addEventListener("focus", checkAutoResetOnResume);
