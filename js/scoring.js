import { APP_VERSION, MODES, USER_PREFERENCES, resolveProfile } from "./config.js";

const BASE_SCORE = 15;
const FACTOR_POINTS = 85;
const clamp01 = value => Math.max(0, Math.min(1, value));
const clampScore = value => Math.max(0, Math.min(100, value));
const graphScore = value => ({
  "右肩上がり": 1, "緩やかに上昇": .88, "上下しながら上昇": .82,
  "V字回復": .78, "横ばい": .52, "上下に荒い": .45,
  "大きく凹んでいる": .34, "緩やかに下降": .25,
  "上昇後に失速": .18, "右肩下がり": .08,
  "上向き": .85, "下向き": .25
}[value] ?? .45);
const flowScore = value => ({
  "上昇中": 1, "底から回復中": .9, "高い位置で停滞": .75,
  "横ばい": .55, "下降中": .2, "低い位置で停滞": .15
}[value] ?? .45);
const rateScore = (count, games, target) => {
  if (count === null || games === null || games <= 0) return .35;
  return clamp01((count / games) * target);
};
export function minutesUntil(closingTime, now = new Date()) {
  const [hour, minute] = String(closingTime || "22:45").split(":").map(Number);
  const close = new Date(now);
  close.setHours(hour, minute, 0, 0);
  if (close <= now) return 0;
  return Math.round((close - now) / 60000);
}
const rankFor = score => score >= 90 ? ["S", "本命"] : score >= 80 ? ["A", "有力"] : score >= 65 ? ["B", "候補"] : score >= 50 ? ["C", "消去法"] : ["D", "慎重"];

export function applyScoreAdjustments(objectiveRawScore, preferenceValue = 0) {
  const objectiveScore = clampScore(objectiveRawScore);
  const objectiveAdjusted = objectiveRawScore !== objectiveScore;
  const rawScore = objectiveScore + preferenceValue;
  const score = clampScore(rawScore);
  const finalAdjusted = rawScore !== score;
  return { objectiveScore, objectiveAdjusted, rawScore, score, finalAdjusted, scoreAdjusted: objectiveAdjusted || finalAdjusted };
}

function factor(key, label, rawValue, normalizedValue, weight, reason) {
  return {
    key,
    label,
    rawValue: rawValue === undefined ? null : rawValue,
    normalizedValue,
    weight,
    effectiveWeight: 0,
    contribution: 0,
    reason
  };
}

export function evaluateMorning(candidate, context, profile) {
  const p = candidate.previousDay;
  const weights = profile.weights.morning;
  return [
    factor("previousGames", "前日最終ゲーム数", p.finalGames, p.finalGames === null ? .35 : clamp01(p.finalGames / 500), weights.previousGames, p.finalGames === null ? "前日最終ゲーム数が未入力" : `前日最終${p.finalGames}G`),
    factor("previousMaxCoins", "前日最大持玉", p.maxCoins, p.maxCoins === null ? .35 : clamp01(p.maxCoins / 3500), weights.previousMaxCoins, p.maxCoins === null ? "前日最大持玉が未入力" : `前日最大持玉${p.maxCoins.toLocaleString()}枚`),
    factor("previousFirstHitRate", "前日初当たり", p.firstHits, rateScore(p.firstHits, p.totalGames, 300), weights.previousFirstHitRate, p.firstHits === null ? "前日初当たりが未入力" : `前日初当たり${p.firstHits}回`),
    factor("previousAtRate", "前日AT回数", p.atCount, rateScore(p.atCount, p.totalGames, 180), weights.previousAtRate, p.atCount === null ? "前日AT回数が未入力" : `前日AT${p.atCount}回`),
    factor("previousGraph", "前日グラフ", p.graphState, graphScore(p.graphState), weights.previousGraph, p.graphState ? `前日グラフは${p.graphState}` : "前日グラフが未入力")
  ];
}

export function evaluateNight(candidate, context, profile) {
  const t = candidate.today;
  const weights = profile.weights.night;
  const remaining = minutesUntil(context.closingTime, context.now);
  const timeFit = remaining >= profile.expectedPlayMinutes + 45 ? 1 : remaining >= profile.expectedPlayMinutes ? .6 : remaining >= 60 ? .3 : .05;
  return [
    factor("currentGames", "現在ゲーム数", t.currentGames, t.currentGames === null ? .3 : clamp01(t.currentGames / 700), weights.currentGames, t.currentGames === null ? "現在ゲーム数が未入力" : `現在${t.currentGames}G`),
    factor("graphState", "当日グラフ", t.graphState, graphScore(t.graphState), weights.graphState, t.graphState ? `当日グラフは${t.graphState}` : "当日グラフが未入力"),
    factor("recentFlow", "直近の流れ", t.recentFlow, flowScore(t.recentFlow), weights.recentFlow, t.recentFlow ? `直近は${t.recentFlow}` : "直近の流れが未入力"),
    factor("firstHitRate", "初当たり", t.firstHits, rateScore(t.firstHits, t.totalGames, 300), weights.firstHitRate, t.firstHits === null ? "初当たりが未入力" : `初当たり${t.firstHits}回`),
    factor("atRate", "AT回数", t.atCount, rateScore(t.atCount, t.totalGames, 180), weights.atRate, t.atCount === null ? "AT回数が未入力" : `AT${t.atCount}回`),
    factor("maxCoins", "最大持玉", t.maxCoins, t.maxCoins === null ? .35 : clamp01(t.maxCoins / 3500), weights.maxCoins, t.maxCoins === null ? "最大持玉が未入力" : `最大持玉${t.maxCoins.toLocaleString()}枚`),
    factor("timeFit", "残り時間", remaining, timeFit, weights.timeFit, `閉店まで${Math.floor(remaining / 60)}時間${remaining % 60}分`)
  ];
}

function scoreFactors(factors) {
  const totalWeight = factors.reduce((sum, item) => sum + item.weight, 0) || 1;
  const exact = factors.map(item => item.normalizedValue * (item.weight / totalWeight) * FACTOR_POINTS);
  const factorScore = Math.round(exact.reduce((sum, points) => sum + points, 0));
  const rounded = exact.map(Math.round);
  const difference = factorScore - rounded.reduce((sum, points) => sum + points, 0);
  if (rounded.length) rounded[rounded.length - 1] += difference;
  factors.forEach((item, index) => {
    item.effectiveWeight = item.weight / totalWeight;
    item.contribution = rounded[index];
  });
  return factorScore;
}

function preferenceAdjustment(profile, enabled) {
  const configured = USER_PREFERENCES.machinePreferences?.[profile.id];
  const value = enabled
    ? Math.max(-5, Math.min(5, Number(configured?.adjustment ?? USER_PREFERENCES.machineAdjustments[profile.id] ?? USER_PREFERENCES.machineAdjustments.default) || 0))
    : 0;
  return {
    enabled: Boolean(enabled),
    value,
    type: configured?.type || "general",
    label: configured?.label || "ユーザー嗜好補正",
    reasons: configured?.reasons || [],
    reason: enabled
      ? configured?.reasons?.includes("作品が好き")
        ? "好きな作品のため、遊技満足度を考慮"
        : USER_PREFERENCES.adjustmentReasons[profile.id] || USER_PREFERENCES.adjustmentReasons.default
      : "自分の好みを評価に反映する設定がOFF"
  };
}

function confidence(candidate, mode, closingTime) {
  const source = mode === "morning" ? candidate.previousDay : candidate.today;
  const important = mode === "morning"
    ? [source.finalGames, source.totalGames, source.firstHits, source.atCount, source.maxCoins, source.graphState]
    : [source.currentGames, source.totalGames, source.firstHits, source.atCount, source.maxCoins, source.graphState, source.recentFlow, closingTime];
  const filled = important.filter(item => item !== null && item !== "").length;
  const ratio = filled / important.length;
  const level = ratio >= .75 ? "high" : ratio >= .45 ? "medium" : "low";
  const missing = important.length - filled;
  return { level, label: level === "high" ? "高い" : level === "medium" ? "普通" : "低い", reason: missing ? `主要データ${missing}項目が未入力` : "主要データが揃っています" };
}

function danger(candidate, context, profile, score) {
  const remaining = minutesUntil(context.closingTime, context.now);
  const current = candidate.today.currentGames || 0;
  if (context.mode === "night" && (remaining < 60 || (remaining < profile.expectedPlayMinutes && current >= 400))) {
    return { level: "danger", label: "危険", reason: `閉店まで${remaining}分。取り切れない可能性に注意` };
  }
  if (context.mode === "night" && (remaining < 120 || score < 50)) return { level: "caution", label: "注意", reason: remaining < 120 ? `閉店まで${remaining}分` : "候補内でも条件が弱め" };
  return { level: "safe", label: "安全", reason: context.mode === "morning" ? "時間に余裕があります" : `閉店まで${remaining}分` };
}

function comment(score, position, risk, preference, objectiveScore) {
  if (risk.level === "danger") {
    return {
      headline: preference.enabled && preference.type === "work" ? "好きな作品ではあるけど、今日は残り時間を優先したいところです。" : "今日は残り時間を優先したいところです。",
      body: "取り切れない可能性があります。",
      caution: "条件や好みより時間を優先して、深追いはしないでいこう。"
    };
  }
  let result;
  if (position === 1 && score >= 80) result = { headline: "今日はこの台かな。", body: "空いていたら、まずはこの台を確認してよさそう。", caution: "座る前に最新データだけもう一度確認しよう。" };
  else if (position === 1) result = { headline: "今日は少し迷うところ。", body: "それでも、この中ならこの台が一番後悔しにくそう。", caution: "無理に追わず、区切りを決めておこう。" };
  else if (position <= 3) result = { headline: "次に見るならこの台。", body: "上の候補が空いていなければ、移動先として残しておこう。", caution: "" };
  else result = { headline: "優先度は少し下がります。", body: "上位候補が埋まっていたときの控えです。", caution: "" };
  if (preference.enabled && preference.value >= 3 && risk.level !== "danger") result.body = "条件も悪くないし、相性を考えると今日はこの台かな。";
  if (preference.enabled && preference.value <= -3) result.caution = "数値上は候補だけど、通常区間の長さは少し気になるところ。";
  if (preference.enabled && preference.type === "work") {
    if (objectiveScore >= 80) result.body = "条件も悪くないし、好きな作品なら今日はかなり座りやすい候補です。";
    else if (objectiveScore >= 65) result.body = "数値だけなら強い候補ではないけど、好きな作品という点も含めれば候補に残してよさそう。";
    else result.body = "条件は少し厳しめ。ただ、作品が好きなら打った満足感は残りやすそう。";
  }
  return result;
}

export function evaluateCandidate(candidate, context, position = 1) {
  const profile = resolveProfile(candidate.machine);
  const factors = context.mode === "morning"
    ? evaluateMorning(candidate, context, profile)
    : evaluateNight(candidate, context, profile);
  const factorScore = scoreFactors(factors);
  const objectiveRawScore = BASE_SCORE + factorScore;
  const preference = preferenceAdjustment(profile, context.preferenceEnabled !== false);
  const { objectiveScore, objectiveAdjusted, rawScore, score, finalAdjusted, scoreAdjusted } = applyScoreAdjustments(objectiveRawScore, preference.value);
  const [rank, rankLabel] = rankFor(score);
  const result = {
    baseScore: BASE_SCORE,
    factorScore,
    objectiveRawScore,
    objectiveScore,
    objectiveAdjusted,
    preferenceAdjustment: preference,
    rawScore,
    score,
    finalAdjusted,
    scoreAdjusted,
    rank,
    rankLabel,
    factors,
    confidence: confidence(candidate, context.mode, context.closingTime)
  };
  result.risk = danger(candidate, context, profile, score);
  result.comment = comment(score, position, result.risk, preference, objectiveScore);
  return result;
}

export function evaluationLog(candidate, context, result, position) {
  return {
    type: "candidateEvaluation",
    logVersion: 1,
    scorerVersion: APP_VERSION,
    evaluatedAt: new Date().toISOString(),
    candidateId: candidate.id,
    hall: candidate.hall,
    machine: candidate.machine,
    machineId: resolveProfile(candidate.machine).id,
    weekday: new Date().getDay(),
    context: { mode: context.mode, closingTime: context.closingTime, preferenceEnabled: context.preferenceEnabled !== false },
    factors: result.factors,
    result: {
      baseScore: result.baseScore,
      factorScore: result.factorScore,
      rawScore: result.rawScore,
      objectiveScore: result.objectiveScore,
      objectiveRawScore: result.objectiveRawScore,
      objectiveAdjusted: result.objectiveAdjusted,
      preferenceAdjustment: result.preferenceAdjustment,
      rawScore: result.rawScore,
      finalAdjusted: result.finalAdjusted,
      score: result.score,
      rank: result.rank,
      confidence: result.confidence.level,
      risk: result.risk.level,
      position
    }
  };
}

export { MODES };
