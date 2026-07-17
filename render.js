import { calculateDailyExpGain, getPercentage, localDateKey } from "./utils.js";
import { seriesClass } from "./jobs.js";

function control(className, label, title, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.title = title;
  button.addEventListener("click", (event) => { event.stopPropagation(); onClick(); });
  return button;
}

function expForLevelUp(character) {
  const after = character.afterDailyExp;
  return after !== "" && after !== null && after !== undefined ? getPercentage(after) : getPercentage(character.previousExp);
}

export function filteredAndSorted(characters, keyword, sortMode, viewMode = "all") {
  const search = keyword.trim().toLocaleLowerCase("ja-JP");
  const visible = characters
    .filter((character) => viewMode === "all" || (viewMode === "completed" ? character.completed : !character.completed))
    .filter((character) => `${character.name} ${character.job}`.toLocaleLowerCase("ja-JP").includes(search));
  if (sortMode === "favorite") return [...visible].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.order - b.order);
  if (sortMode === "level") return [...visible].sort((a, b) => Number(b.level) - Number(a.level) || a.order - b.order);
  if (sortMode === "name") return [...visible].sort((a, b) => a.name.localeCompare(b.name, "ja") || a.order - b.order);
  if (sortMode === "levelUpSoon") return [...visible].sort((a, b) => expForLevelUp(b) - expForLevelUp(a) || a.order - b.order);
  return [...visible].sort((a, b) => a.order - b.order);
}

export function render({ list, counts, progress, characters, keyword, sortMode, viewMode, reorderMode, onOpenDetail, onToggleFavorite, onChangeViewMode, onLongPress, onMoveReorder }) {
  const visible = filteredAndSorted(characters, keyword, sortMode, viewMode);
  list.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty-message";
    empty.textContent = characters.length ? "該当するキャラクターがいません" : "キャラクターがいません";
    list.append(empty);
  }
  visible.forEach((character) => list.append(renderCard(character, { reorderMode, onOpenDetail, onToggleFavorite, onLongPress, onMoveReorder })));
  renderSummary(counts, characters, viewMode, onChangeViewMode);
  renderDailyProgress(progress, characters);
}

export function renderSummary(counts, characters, viewMode, onChangeViewMode) {
  const completed = characters.filter((character) => character.completed).length;
  [["all", characters.length], ["completed", completed], ["remaining", characters.length - completed]].forEach(([mode, count]) => {
    const button = counts[mode];
    button.querySelector("span:last-child").textContent = String(count);
    const selected = viewMode === mode;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.onclick = () => onChangeViewMode(mode);
  });
}

export function renderDailyProgress(progress, characters) {
  const dailies = characters.flatMap((character) => character.dailies || []);
  const done = dailies.filter((daily) => daily.checked).length;
  const total = dailies.length;
  const rate = total ? Math.round((done / total) * 100) : 0;
  progress.count.textContent = `${done} / ${total}`;
  progress.percent.textContent = `${rate}%`;
  progress.fill.style.width = `${rate}%`;
  progress.bar.setAttribute("aria-valuenow", String(rate));
  progress.date.textContent = localDateKey().slice(5).replace("-", "/");
}

function percentageText(value) { return `${getPercentage(value).toFixed(2)}%`; }
function gainText(gain) { return gain === 0 ? "±0.00%" : `${gain > 0 ? "+" : ""}${gain.toFixed(2)}%`; }

export function renderCard(character, actions) {
  const { reorderMode, onOpenDetail, onToggleFavorite, onLongPress, onMoveReorder } = actions;
  const card = document.createElement("div");
  card.className = "character-card";
  card.classList.toggle("is-completed", character.completed);
  card.classList.toggle("is-favorite", character.favorite);
  card.classList.toggle("is-reordering", reorderMode);
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", reorderMode ? `${character.name}を並び替え中` : `${character.name}の詳細を開く`);
  const header = document.createElement("div");
  header.className = "card-header";
  const status = document.createElement("span");
  status.className = "completion-status";
  status.textContent = character.completed ? "✓ 完了" : "○ 未完了";
  if (reorderMode) {
    const hint = document.createElement("span");
    hint.className = "reorder-hint";
    hint.textContent = "並び替え";
    header.append(hint, status);
  } else {
    header.append(control("favorite-toggle", character.favorite ? "★" : "☆", "お気に入り", () => onToggleFavorite(character.id)), status);
  }
  const nameRow = document.createElement("div");
  nameRow.className = "character-name-row";
  nameRow.append(Object.assign(document.createElement("div"), { className: "character-name", textContent: character.name }));
  const levelRow = document.createElement("div");
  levelRow.className = "character-level-row";
  levelRow.append(Object.assign(document.createElement("div"), { className: "character-level", textContent: `Lv.${character.level}` }));
  if (character.job) {
    const job = document.createElement("span");
    job.className = `job-badge ${seriesClass(character.series)}`;
    job.textContent = character.job;
    levelRow.append(job);
  }
  card.append(header, nameRow, levelRow, renderExpSection(character));
  if (reorderMode) {
    const controls = document.createElement("div");
    controls.className = "card-reorder-controls";
    controls.append(control("move-card-button", "↑", "上へ移動", () => onMoveReorder(character.id, -1)), control("move-card-button", "↓", "下へ移動", () => onMoveReorder(character.id, 1)));
    card.append(controls);
  }
  let timer = null;
  let startPoint = null;
  let longPressed = false;
  const clearPress = () => { if (timer) clearTimeout(timer); timer = null; startPoint = null; };
  const startPress = (point, target) => {
    if (reorderMode || target.closest?.(".favorite-toggle")) return;
    startPoint = point;
    longPressed = false;
    timer = setTimeout(() => {
      timer = null;
      longPressed = true;
      window.getSelection?.().removeAllRanges();
      navigator.vibrate?.(12);
      onLongPress(character.id);
    }, 600);
  };
  const movePress = (point) => {
    if (startPoint && Math.hypot(point.x - startPoint.x, point.y - startPoint.y) > 12) clearPress();
  };
  const usesTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (usesTouch) {
    card.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      if (touch) startPress({ x: touch.clientX, y: touch.clientY }, event.target);
    }, { passive: true });
    card.addEventListener("touchmove", (event) => {
      const touch = event.touches[0];
      if (touch) movePress({ x: touch.clientX, y: touch.clientY });
    }, { passive: true });
    card.addEventListener("touchend", clearPress, { passive: true });
    card.addEventListener("touchcancel", clearPress, { passive: true });
  } else {
    card.addEventListener("pointerdown", (event) => startPress({ x: event.clientX, y: event.clientY }, event.target));
    card.addEventListener("pointermove", (event) => movePress({ x: event.clientX, y: event.clientY }));
    card.addEventListener("pointerup", clearPress);
    card.addEventListener("pointercancel", clearPress);
  }
  card.addEventListener("selectstart", (event) => event.preventDefault());
  card.addEventListener("contextmenu", (event) => event.preventDefault());
  card.addEventListener("click", (event) => {
    if (reorderMode || longPressed) { event.preventDefault(); return; }
    onOpenDetail(character.id);
  });
  card.addEventListener("keydown", (event) => {
    if (!reorderMode && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenDetail(character.id); }
  });
  return card;
}

export function renderExpSection(character) {
  const previous = getPercentage(character.previousExp);
  const afterExists = character.afterDailyExp !== "" && character.afterDailyExp !== null && character.afterDailyExp !== undefined;
  const displayed = afterExists ? getPercentage(character.afterDailyExp) : previous;
  const section = document.createElement("div");
  section.className = "exp-section";
  const meta = document.createElement("div");
  meta.className = "exp-meta";
  meta.innerHTML = `<span>前日 ${percentageText(character.previousExp)}</span>${afterExists ? `<span>日課後 ${percentageText(character.afterDailyExp)}</span>` : ""}`;
  const bar = document.createElement("div");
  bar.className = "exp-bar";
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.setAttribute("aria-valuenow", String(displayed));
  const fill = document.createElement("div");
  fill.className = "exp-fill";
  fill.style.width = `${displayed}%`;
  bar.append(fill);
  section.append(meta, bar);
  if (afterExists) {
    const gain = calculateDailyExpGain(character);
    if (gain !== null) section.append(Object.assign(document.createElement("div"), { className: `daily-exp-gain ${gain < 0 ? "is-negative" : ""}`, textContent: `本日の獲得 ${gainText(gain)}` }));
  } else {
    section.append(Object.assign(document.createElement("div"), { className: "next-level", textContent: `次のレベルまで ${(100 - previous).toFixed(2)}%` }));
  }
  return section;
}
