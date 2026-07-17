export const MAX_LEVEL = 300;

export function createId() {
  return window.crypto?.randomUUID?.()
    ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function toHalfWidth(value) {
  return String(value).replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
}

export function normalizeLevel(value) {
  const digits = toHalfWidth(value).replace(/[^0-9]/g, "");
  if (!digits) return "";
  return String(Math.min(MAX_LEVEL, Math.max(1, Number(digits))));
}

// previousExp is always the previous day's EXP percentage, not an EXP amount.
export function normalizePercentage(value) {
  const cleaned = toHalfWidth(value).replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return "";
  const [integer = "", ...decimal] = cleaned.split(".");
  const number = Math.min(100, Math.max(0, Number(`${integer}.${decimal.join("")}`)));
  return String(Math.round(number * 100) / 100);
}

/**
 * フォーム入力専用のEXP整形。小数点なしの3桁以上は「百の位以下」を小数部として扱う。
 * データ読込時は従来どおり normalizePercentage() を使用する。
 */
export function normalizeExpInput(value) {
  const raw = toHalfWidth(value).trim();
  if (!raw) return "";
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return "";
  const hasDecimalPoint = cleaned.includes(".");
  const [integerPart = "", ...fractionParts] = cleaned.split(".");
  const fractionPart = fractionParts.join("");
  let number;
  if (hasDecimalPoint) {
    number = Number(`${integerPart || "0"}.${fractionPart}`);
  } else {
    const whole = Number(integerPart);
    number = whole <= 100 ? whole : whole / 100;
  }
  if (!Number.isFinite(number)) return "";
  return Math.min(100, Math.max(0, number)).toFixed(2);
}

export function getPercentage(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

/**
 * 日課開始時から終了時までのEXP相当量を計算する。比較不能な値はnullを返す。
 */
export function calculateDailyExpGain({ level, previousLevel, previousExp, afterDailyExp }) {
  if (afterDailyExp === "" || afterDailyExp === null || afterDailyExp === undefined) return null;
  const currentLevel = Number(level);
  const startLevel = Number(previousLevel);
  const startExp = Number(previousExp);
  const endExp = Number(afterDailyExp);
  if (![currentLevel, startLevel, startExp, endExp].every(Number.isFinite) || currentLevel < startLevel) return null;
  return Math.round(((currentLevel - startLevel) * 100 + endExp - startExp) * 100) / 100;
}

export function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
