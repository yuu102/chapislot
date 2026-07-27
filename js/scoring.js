import { APP_VERSION, MODES, resolveProfile } from "./config.js";

const clamp = value => Math.max(0, Math.min(1, value));
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
  return clamp((count / games) * target);
};
const minutesUntil = (closingTime, now) => {
  const [hour, minute] = closingTime.split(":").map(Number);
  const close = new Date(now);
  close.setHours(hour, minute, 0, 0);
  if (close < now) return 0;
  return Math.max(0, Math.round((close - now) / 60000));
};
const rankFor = score => score >= 90 ? ["S", "本命"] : score >= 80 ? ["A", "有力"] : score >= 65 ? ["B", "候補"] : score >= 50 ? ["C", "消去法"] : ["D", "慎重"];

function factor(key, label, rawValue, normalizedValue, weight, reason) {
  return { key, label, rawValue, normalizedValue, weight, contribution: Math.round(normalizedValue * weight * 85), reason };
}

function morningFactors(candidate, weights) {
  const p = candidate.previousDay;
  return [
    factor("previousGames", "前日最終G", p.finalGames, p.finalGames === null ? .35 : clamp(p.finalGames / 500), weights.previousGames, p.finalGames === null ? "前日最終Gが未入力" : `前日最終${p.finalGames}G`),
    factor("previousMaxCoins", "前日最大持玉", p.maxCoins, p.maxCoins === null ? .35 : clamp(p.maxCoins / 3500), weights.previousMaxCoins, p.maxCoins === null ? "前日最大持玉が未入力" : `前日最大持玉${p.maxCoins.toLocaleString()}枚`),
    factor("previousFirstHitRate", "前日初当たり", p.firstHits, rateScore(p.firstHits, p.totalGames, 300), weights.previousFirstHitRate, p.firstHits === null ? "前日初当たりが未入力" : `前日初当たり${p.firstHits}回`),
    factor("previousAtRate", "前日AT", p.atCount, rateScore(p.atCount, p.totalGames, 180), weights.previousAtRate, p.atCount === null ? "前日AT回数が未入力" : `前日AT${p.atCount}回`),
    factor("previousGraph", "前日グラフ", p.graphState, graphScore(p.graphState), weights.previousGraph, p.graphState ? `前日グラフは${p.graphState}` : "前日グラフが未入力")
  ];
}

function nightFactors(candidate, weights, context, profile) {
  const t = candidate.today;
  const remaining = minutesUntil(context.closingTime, context.now);
  const timeFit = remaining >= profile.expectedPlayMinutes + 45 ? 1 : remaining >= profile.expectedPlayMinutes ? .6 : remaining >= 60 ? .3 : .05;
  return [
    factor("currentGames", "現在G", t.currentGames, t.currentGames === null ? .3 : clamp(t.currentGames / 700), weights.currentGames, t.currentGames === null ? "現在ゲーム数が未入力" : `現在${t.currentGames}G`),
    factor("graphState", "当日グラフ", t.graphState, graphScore(t.graphState), weights.graphState, t.graphState ? `当日グラフは${t.graphState}` : "当日グラフが未入力"),
    factor("recentFlow", "直近の流れ", t.recentFlow, flowScore(t.recentFlow), weights.recentFlow, t.recentFlow ? `直近は${t.recentFlow}` : "直近の流れが未入力"),
    factor("firstHitRate", "初当たり", t.firstHits, rateScore(t.firstHits, t.totalGames, 300), weights.firstHitRate, t.firstHits === null ? "初当たりが未入力" : `初当たり${t.firstHits}回`),
    factor("atRate", "AT", t.atCount, rateScore(t.atCount, t.totalGames, 180), weights.atRate, t.atCount === null ? "AT回数が未入力" : `AT${t.atCount}回`),
    factor("maxCoins", "最大持玉", t.maxCoins, t.maxCoins === null ? .35 : clamp(t.maxCoins / 3500), weights.maxCoins, t.maxCoins === null ? "最大持玉が未入力" : `最大持玉${t.maxCoins.toLocaleString()}枚`),
    factor("timeFit", "残り時間", remaining, timeFit, weights.timeFit, `閉店まで${Math.floor(remaining / 60)}時間${remaining % 60}分`)
  ];
}

function confidence(candidate, mode, closingTime) {
  const source = mode === "morning" ? candidate.previousDay : candidate.today;
  const important = mode === "morning"
    ? [source.finalGames, source.totalGames, source.firstHits, source.atCount, source.maxCoins, source.graphState]
    : [source.currentGames, source.totalGames, source.firstHits, source.atCount, source.maxCoins, source.graphState, source.recentFlow, closingTime];
  const filled = important.filter(value => value !== null && value !== "").length;
  const ratio = filled / important.length;
  const level = ratio >= .75 ? "high" : ratio >= .45 ? "medium" : "low";
  const missing = important.length - filled;
  return { level, label: level === "high" ? "高い" : level === "medium" ? "普通" : "低い", reason: missing ? `主要データが${missing}項目未入力` : "主要データが揃っています" };
}

function danger(candidate, context, profile, score) {
  const remaining = minutesUntil(context.closingTime, context.now);
  const current = candidate.today.currentGames || 0;
  if (context.mode === "night" && (remaining < 60 || (remaining < profile.expectedPlayMinutes && current >= 400))) {
    return { level: "danger", label: "危険", reason: `閉店まで${remaining}分。取り切れない可能性に注意` };
  }
  if (context.mode === "night" && (remaining < 120 || score < 50)) return { level: "caution", label: "注意", reason: remaining < 120 ? `閉店まで${remaining}分` : "候補全体の条件が弱め" };
  return { level: "safe", label: "安全", reason: context.mode === "morning" ? "時間に余裕があります" : `閉店まで${remaining}分` };
}

function comment(score, position, risk) {
  if (position === 1 && score >= 80) return { headline: "今日はこの台かな。", body: "空いていたら、まずはこの台を確認してよさそう。", caution: risk.level === "danger" ? "条件より時間を優先して、深追いはしないでいこう。" : "打つ前に最新データだけもう一度確認しよう。" };
  if (position === 1) return { headline: "今日は少し迷うところ。", body: "それでも、この中ならこの台が一番後悔しにくそう。", caution: "無理に追わず、区切りを決めていこう。" };
  if (position <= 3) return { headline: "次に見るならこの台。", body: "上の候補が空いていなければ、移動先として残しておこう。", caution: risk.level === "danger" ? "残り時間には注意。" : "" };
  return { headline: "優先度は少し下がります。", body: "上位候補が埋まっていたときの控えです。", caution: "" };
}

export function evaluateCandidate(candidate, context, position = 1) {
  const profile = resolveProfile(candidate.machine);
  const weights = profile.weights[context.mode];
  const factors = context.mode === "morning" ? morningFactors(candidate, weights) : nightFactors(candidate, weights, context, profile);
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0) || 1;
  const score = Math.max(0, Math.min(100, Math.round(15 + factors.reduce((sum, f) => sum + f.contribution, 0) / totalWeight)));
  const [rank, rankLabel] = rankFor(score);
  const result = { score, rank, rankLabel, factors, confidence: confidence(candidate, context.mode, context.closingTime) };
  result.risk = danger(candidate, context, profile, score);
  result.comment = comment(score, position, result.risk);
  return result;
}

export function evaluationLog(candidate, context, result, position) {
  return { logVersion: 1, scorerVersion: APP_VERSION, evaluatedAt: new Date().toISOString(), candidateId: candidate.id, hall: candidate.hall, machine: candidate.machine, weekday: new Date().getDay(), context: { mode: context.mode, closingTime: context.closingTime }, factors: result.factors, result: { score: result.score, rank: result.rank, confidence: result.confidence.level, risk: result.risk.level, position } };
}

export { MODES };
