import { createId } from "./utils.js";

const legacyTitles = ["デイリー 1", "デイリー 2", "デイリー 3"];

export function createDaily(templateOrTitle, checked = false) {
  const template = templateOrTitle && typeof templateOrTitle === "object" ? templateOrTitle : null;
  const title = template ? template.title : templateOrTitle;
  return {
    id: createId(),
    ...(template ? { templateId: template.id } : {}),
    title: typeof title === "string" ? title.trim().slice(0, 40) : "",
    checked: checked === true,
  };
}

export function createDefaultDailies(template) {
  return (Array.isArray(template) ? template : []).map((item) => createDaily(item));
}

function normalizedSourceDailies(record) {
  if (Array.isArray(record.dailies)) return record.dailies;
  const legacy = record.daily && typeof record.daily === "object" ? record.daily : {};
  const goal = Math.max(1, Math.floor(Number(legacy.goal ?? legacy.target) || 3));
  const progress = Math.min(goal, Math.max(0, Math.floor(Number(legacy.progress ?? legacy.count ?? legacy.completed) || 0)));
  return Array.from({ length: goal }, (_, index) => ({ title: legacyTitles[index] || `デイリー ${index + 1}`, checked: index < progress }));
}

/**
 * 既存のtemplateIdがないデイリーは、同タイトルのテンプレートへ順番に対応付ける。
 * 同名が複数ある場合でも、テンプレート順とキャラ側の並び順を優先する。
 */
export function normalizeDailies(record, template = []) {
  const usedIds = new Set();
  const dailies = normalizedSourceDailies(record).reduce((items, entry) => {
    if (!entry || typeof entry.title !== "string") return items;
    const title = entry.title.trim().slice(0, 40);
    if (!title) return items;
    let id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || usedIds.has(id)) id = createId();
    usedIds.add(id);
    items.push({
      id,
      ...(typeof entry.templateId === "string" && entry.templateId.trim() ? { templateId: entry.templateId.trim() } : {}),
      title,
      checked: entry.checked === true,
    });
    return items;
  }, []);

  const usedDailyIndexes = new Set();
  template.forEach((item) => {
    const index = dailies.findIndex((daily, dailyIndex) => !usedDailyIndexes.has(dailyIndex) && !daily.templateId && daily.title === item.title);
    if (index >= 0) {
      dailies[index].templateId = item.id;
      usedDailyIndexes.add(index);
    }
  });

  // 旧 daily.progress / goal 由来の仮デイリーを、現在のテンプレートへ完全移行する。
  // 独自デイリーが混在していても残し、仮デイリーだけをテンプレート順で置換する。
  const legacyIndexes = dailies
    .map((daily, index) => (!daily.templateId && /^デイリー\s*\d+$/.test(daily.title) ? index : -1))
    .filter((index) => index >= 0);
  if (legacyIndexes.length && template.length) {
    const usedTemplateIds = new Set(dailies.map((daily) => daily.templateId).filter((id) => template.some((item) => item.id === id)));
    const removeIndexes = new Set();
    legacyIndexes.forEach((index) => {
      const nextTemplate = template.find((item) => !usedTemplateIds.has(item.id));
      if (!nextTemplate) {
        removeIndexes.add(index);
        return;
      }
      dailies[index].templateId = nextTemplate.id;
      dailies[index].title = nextTemplate.title;
      usedTemplateIds.add(nextTemplate.id);
    });
    const retained = dailies.filter((_, index) => !removeIndexes.has(index));
    const byTemplateId = new Map(retained.filter((daily) => daily.templateId).map((daily) => [daily.templateId, daily]));
    const templateDailies = template.map((item) => byTemplateId.get(item.id) || createDaily(item));
    const customDailies = retained.filter((daily) => !template.some((item) => item.id === daily.templateId));
    return [...templateDailies, ...customDailies];
  }
  return dailies;
}

/** 設定テンプレートの変更を全キャラクターへID基準で反映する。 */
export function applyTemplateToCharacter(character, previousTemplate, nextTemplate) {
  const previousIds = new Set(previousTemplate.map((item) => item.id));
  const nextIds = new Set(nextTemplate.map((item) => item.id));
  const consumed = new Set();
  const byTemplateId = new Map();
  character.dailies.forEach((daily, index) => {
    if (!daily.templateId || byTemplateId.has(daily.templateId)) return;
    byTemplateId.set(daily.templateId, { daily, index });
  });

  const templateDailies = nextTemplate.map((item) => {
    const found = byTemplateId.get(item.id);
    if (found) {
      consumed.add(found.index);
      found.daily.title = item.title;
      return found.daily;
    }
    return createDaily(item);
  });

  const customDailies = character.dailies.filter((daily, index) => {
    if (consumed.has(index)) return false;
    // 明示的にテンプレートから削除されたものだけ削除する。
    if (daily.templateId && previousIds.has(daily.templateId) && !nextIds.has(daily.templateId)) return false;
    return true;
  });

  character.dailies = [...templateDailies, ...customDailies];
  syncCompleted(character);
}

export function syncCompleted(character) {
  character.completed = character.dailies.length > 0 && character.dailies.every((daily) => daily.checked);
}

export function resetDailies(character) {
  if (character.afterDailyExp !== "" && character.afterDailyExp !== null && character.afterDailyExp !== undefined) {
    character.previousExp = character.afterDailyExp;
    character.previousLevel = character.level;
    character.afterDailyExp = "";
  }
  character.dailies.forEach((daily) => { daily.checked = false; });
  syncCompleted(character);
}
