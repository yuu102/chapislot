import { createId } from "./utils.js";
import { calculateDailyExpGain, getPercentage } from "./utils.js";
import { createJobSelect, seriesForJob } from "./jobs.js";

let scrollLockDepth = 0;
let lockedScrollY = 0;
let bodyStyleSnapshot = null;
const openedDialogs = new Set();
const returnFocusTargets = new WeakMap();

export function lockBodyScroll() {
  scrollLockDepth += 1;
  if (scrollLockDepth !== 1) return;
  lockedScrollY = window.scrollY;
  bodyStyleSnapshot = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width };
  Object.assign(document.body.style, { position: "fixed", top: `-${lockedScrollY}px`, width: "100%" });
}

export function unlockBodyScroll() {
  scrollLockDepth = Math.max(0, scrollLockDepth - 1);
  if (scrollLockDepth !== 0 || !bodyStyleSnapshot) return;
  Object.assign(document.body.style, bodyStyleSnapshot);
  bodyStyleSnapshot = null;
  window.scrollTo(0, lockedScrollY);
}

export function bindModal(dialog) {
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeModal(dialog); });
  dialog.addEventListener("close", () => {
    if (!openedDialogs.delete(dialog)) return;
    unlockBodyScroll();
    const target = returnFocusTargets.get(dialog);
    if (target?.isConnected) target.focus?.({ preventScroll: true });
  });
}

export function openModal(dialog, focusTarget = null) {
  if (dialog.open) return;
  returnFocusTargets.set(dialog, document.activeElement);
  openedDialogs.add(dialog);
  lockBodyScroll();
  dialog.showModal();
  if (focusTarget) setTimeout(() => focusTarget.focus?.({ preventScroll: true }), 0);
}

export function closeModal(dialog, restoreFocus = true) {
  if (!dialog.open) return;
  const wasManaged = openedDialogs.delete(dialog);
  dialog.close();
  if (wasManaged) {
    unlockBodyScroll();
    const target = returnFocusTargets.get(dialog);
    if (restoreFocus && target?.isConnected) target.focus?.({ preventScroll: true });
  }
}

export function switchModal(fromDialog, openNext) {
  lockBodyScroll();
  closeModal(fromDialog, false);
  openNext();
  unlockBodyScroll();
}

export function createCharacterFields(elements) {
  const form = elements.name.closest(".form");
  const anchor = elements.level.previousElementSibling;
  const jobLabel = document.createElement("label");
  jobLabel.textContent = "職業";
  const job = createJobSelect();
  job.id = "characterJob";
  const seriesLabel = document.createElement("label");
  seriesLabel.textContent = "系列";
  const series = document.createElement("input");
  series.id = "characterSeries";
  series.readOnly = true;
  series.placeholder = "職業を選ぶと自動設定";
  form.insertBefore(jobLabel, anchor);
  form.insertBefore(job, anchor);
  form.insertBefore(seriesLabel, anchor);
  form.insertBefore(series, anchor);
  job.addEventListener("change", () => { series.value = seriesForJob(job.value); });
  return { job, series };
}

export function createDetailDialog(actions) {
  const dialog = document.createElement("dialog");
  dialog.className = "character-detail-dialog";
  dialog.innerHTML = "<h2></h2><div class='character-detail-body'></div><div class='character-detail-actions'><button type='button'>キャラ編集</button><button type='button'>閉じる</button></div>";
  document.body.append(dialog);
  bindModal(dialog);
  const title = dialog.querySelector("h2");
  const body = dialog.querySelector(".character-detail-body");
  const [edit, close] = dialog.querySelectorAll(".character-detail-actions button");
  let characterId = null;

  const draw = () => {
    const character = actions.find(characterId);
    body.replaceChildren();
    if (!character) return;
    title.textContent = `${character.name}の詳細`;
    const status = document.createElement("p");
    status.className = `detail-status ${character.completed ? "is-completed" : ""}`;
    status.textContent = character.completed ? "✓ 完了" : "○ 未完了";
    const expHeading = document.createElement("h3");
    expHeading.textContent = "EXP";
    const expList = document.createElement("div");
    expList.className = "detail-exp-list";
    expList.append(
      Object.assign(document.createElement("div"), { textContent: `前日終了時 Lv.${character.previousLevel} / ${getPercentage(character.previousExp).toFixed(2)}%` }),
      Object.assign(document.createElement("div"), { textContent: `現在 Lv.${character.level}` }),
    );
    const afterExists = character.afterDailyExp !== "" && character.afterDailyExp !== null && character.afterDailyExp !== undefined;
    if (afterExists) {
      expList.append(Object.assign(document.createElement("div"), { textContent: `日課終了後 ${getPercentage(character.afterDailyExp).toFixed(2)}%` }));
      const gain = calculateDailyExpGain(character);
      if (gain !== null) {
        const gainElement = document.createElement("div");
        gainElement.className = `detail-exp-gain ${gain < 0 ? "is-negative" : ""}`;
        gainElement.textContent = `本日の獲得 ${gain === 0 ? "±0.00" : `${gain > 0 ? "+" : ""}${gain.toFixed(2)}`}%`;
        expList.append(gainElement);
      }
    }
    const heading = document.createElement("h3");
    heading.textContent = "デイリー";
    body.append(status, expHeading, expList, heading);
    if (!character.dailies.length) {
      body.append(Object.assign(document.createElement("p"), { textContent: "クエストがありません", className: "daily-empty" }));
      return;
    }
    const list = document.createElement("div");
    list.className = "detail-daily-list";
    character.dailies.forEach((quest) => {
      const item = document.createElement("label");
      item.className = "detail-daily-item";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = quest.checked;
      check.addEventListener("change", () => {
        actions.setDaily(characterId, quest.id, check.checked);
        draw();
        actions.refresh();
      });
      item.append(check, Object.assign(document.createElement("span"), { textContent: quest.title }));
      list.append(item);
    });
    body.append(list);
  };

  close.addEventListener("click", () => closeModal(dialog));
  edit.addEventListener("click", () => switchModal(dialog, () => actions.edit(characterId)));
  return { open(id) { characterId = id; draw(); openModal(dialog, edit); }, refresh: draw };
}

export function createSettingsDialog(settings, onSave, actions) {
  const dialog = document.createElement("dialog");
  dialog.className = "settings-dialog";
  dialog.innerHTML = "<h2>設定</h2><h3>表示設定</h3><label><input class='hide-completed' type='checkbox'> 完了したキャラを非表示</label><h3>並び替え</h3><label>並び替え <select aria-label='並び替え'><option value='default'>登録順</option><option value='favorite'>お気に入り順</option><option value='level'>Lv順</option><option value='name'>名前順</option><option value='levelUpSoon'>レベルアップが近い順</option></select></label><button class='character-order' type='button'>キャラクター並び替え</button><h3>デイリー編集</h3><p>保存時に全キャラクターへ反映されます。</p><ol class='daily-template-list'></ol><div class='daily-template-add'><input maxlength='40' placeholder='新しいデイリー名' aria-label='新しいデイリー名'><button type='button'>追加</button></div><h3>デイリー</h3><label><input class='auto-reset' type='checkbox'> デイリー自動リセット</label><p>ONの場合、日付が変わって最初に開いたとき、デイリーのチェックをリセットします。</p><p class='last-reset-date'></p><button class='manual-daily-reset' type='button'>今日分に更新</button><h3>データ管理</h3><div class='settings-data'><button class='backup' type='button'>💾 バックアップ</button><button class='restore' type='button'>📂 復元</button><input type='file' accept='application/json,.json' hidden></div><section class='backup-info'><strong>最終バックアップ</strong><p></p></section><div><button class='save-settings' type='button'>保存</button><button class='cancel-settings' type='button'>キャンセル</button></div>";
  document.body.append(dialog);
  bindModal(dialog);
  const select = dialog.querySelector("select");
  const hide = dialog.querySelector(".hide-completed");
  const reset = dialog.querySelector(".auto-reset");
  const list = dialog.querySelector(".daily-template-list");
  const addInput = dialog.querySelector(".daily-template-add input");
  const addButton = dialog.querySelector(".daily-template-add button");
  const fileInput = dialog.querySelector("input[type=file]");
  const lastReset = dialog.querySelector(".last-reset-date");
  const backupInfo = dialog.querySelector(".backup-info p");
  backupInfo.style.whiteSpace = "pre-line";
  let draftTemplate = [];

  const drawTemplate = () => {
    list.replaceChildren();
    draftTemplate.forEach((item, index) => {
      const row = document.createElement("li");
      row.style.display = "flex";
      row.style.gap = "8px";
      row.style.alignItems = "center";
      const name = document.createElement("input");
      name.type = "text";
      name.maxLength = 40;
      name.value = item.title;
      name.setAttribute("aria-label", `デイリー名 ${index + 1}`);
      name.style.flex = "1";
      name.style.minWidth = "0";
      name.style.padding = "10px";
      name.addEventListener("input", () => { item.title = name.value; });
      const controls = document.createElement("span");
      controls.className = "daily-template-controls";
      controls.style.display = "flex";
      controls.style.gap = "6px";
      [["↑", -1, "上へ移動"], ["↓", 1, "下へ移動"]].forEach(([text, direction, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.setAttribute("aria-label", label);
        button.disabled = direction < 0 ? index === 0 : index === draftTemplate.length - 1;
        button.style.minHeight = "40px";
        button.addEventListener("click", () => {
          const next = index + direction;
          [draftTemplate[index], draftTemplate[next]] = [draftTemplate[next], draftTemplate[index]];
          drawTemplate();
        });
        controls.append(button);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "削除";
      remove.setAttribute("aria-label", `${item.title || "デイリー"}を削除`);
      remove.style.minHeight = "40px";
      remove.addEventListener("click", () => { draftTemplate.splice(index, 1); drawTemplate(); });
      controls.append(remove);
      row.append(name, controls);
      list.append(row);
    });
  };

  const addTemplate = () => {
    const title = addInput.value.trim().slice(0, 40);
    if (!title) return addInput.focus();
    draftTemplate.push({ id: createId(), title });
    addInput.value = "";
    drawTemplate();
    addInput.focus();
  };

  addButton.addEventListener("click", addTemplate);
  addInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); addTemplate(); }
  });
  dialog.querySelector(".backup").addEventListener("click", () => {
    actions.onBackup();
    backupInfo.textContent = formatBackupInfo(settings().backupInfo);
  });
  dialog.querySelector(".character-order").addEventListener("click", actions.onOpenCharacterOrder);
  dialog.querySelector(".manual-daily-reset").addEventListener("click", () => {
    actions.onManualDailyReset();
    const value = settings();
    lastReset.textContent = `最終更新日：${formatResetDate(value.lastResetDate)}`;
  });
  dialog.querySelector(".restore").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => { if (fileInput.files[0]) actions.onRestore(fileInput.files[0]); fileInput.value = ""; });
  dialog.querySelector(".save-settings").addEventListener("click", () => {
    const dailyTemplate = draftTemplate.map((item) => ({ ...item, title: item.title.trim().slice(0, 40) })).filter((item) => item.title);
    if (dailyTemplate.length !== draftTemplate.length || !dailyTemplate.length) {
      alert("デイリー名を入力してください。");
      return;
    }
    onSave({ ...settings(), sortMode: select.value, autoDailyReset: reset.checked, hideCompleted: hide.checked, dailyTemplate });
    closeModal(dialog);
  });
  dialog.querySelector(".cancel-settings").addEventListener("click", () => closeModal(dialog));
  return {
    open() {
      const value = settings();
      select.value = value.sortMode;
      reset.checked = value.autoDailyReset;
      hide.checked = value.hideCompleted;
      lastReset.textContent = `最終更新日：${formatResetDate(value.lastResetDate)}`;
      backupInfo.textContent = formatBackupInfo(value.backupInfo);
      draftTemplate = value.dailyTemplate.map((item) => ({ ...item }));
      addInput.value = "";
      drawTemplate();
      openModal(dialog, select);
    },
  };
}

function formatResetDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value.replaceAll("-", "/") : "未更新";
}

function formatBackupInfo(value) {
  if (!value?.backupDate) return "未作成";
  const date = value.backupDate.replace("T", " ").replace(/([+-]\d{2}:\d{2}|Z)$/, "").slice(0, 16).replaceAll("-", "/");
  return `${date}\nVersion ${value.appVersion || "Legacy"}`;
}

/** iPhoneでも確実に操作できる、↑↓ボタン式のキャラクター並び替え画面。 */
export function createCharacterOrderDialog(actions) {
  const dialog = document.createElement("dialog");
  dialog.className = "character-order-dialog";
  dialog.innerHTML = "<h2>キャラクター並び替え</h2><p>↑↓で順番を変更し、保存で反映します。</p><ol class='character-order-list'></ol><div><button class='save-character-order' type='button'>保存</button><button class='cancel-character-order' type='button'>キャンセル</button></div>";
  document.body.append(dialog);
  bindModal(dialog);
  const list = dialog.querySelector(".character-order-list");
  let draft = [];

  const draw = () => {
    list.replaceChildren();
    draft.forEach((character, index) => {
      const row = document.createElement("li");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.padding = "10px";
      const name = document.createElement("span");
      name.textContent = character.name;
      name.style.flex = "1";
      name.style.minWidth = "0";
      name.style.overflow = "hidden";
      name.style.textOverflow = "ellipsis";
      name.style.whiteSpace = "nowrap";
      const controls = document.createElement("span");
      controls.style.display = "flex";
      controls.style.gap = "7px";
      [["↑", -1, "上へ移動"], ["↓", 1, "下へ移動"]].forEach(([text, direction, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.setAttribute("aria-label", `${character.name}を${label}`);
        button.disabled = direction < 0 ? index === 0 : index === draft.length - 1;
        button.style.minWidth = "44px";
        button.style.minHeight = "44px";
        button.addEventListener("click", () => {
          const target = index + direction;
          [draft[index], draft[target]] = [draft[target], draft[index]];
          draw();
        });
        controls.append(button);
      });
      row.append(name, controls);
      list.append(row);
    });
  };

  dialog.querySelector(".save-character-order").addEventListener("click", () => {
    actions.save(draft.map((character) => character.id));
    closeModal(dialog);
  });
  dialog.querySelector(".cancel-character-order").addEventListener("click", () => closeModal(dialog));
  return {
    open() {
      draft = actions.characters().map((character) => ({ id: character.id, name: character.name }));
      draw();
      openModal(dialog, dialog.querySelector(".save-character-order"));
    },
  };
}
