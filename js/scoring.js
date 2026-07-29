import { APP_VERSION, AXIS_WEIGHTS, MODES, USER_PREFERENCES, resolveMachineCharacteristics, resolveProfile } from "./config.js";

const clamp = value => Math.max(0, Math.min(100, Math.round(value)));
const graphValue = value => ({
  "右肩上がり": 82, "緩やかに上昇": 76, "上下しながら上昇": 72, "V字回復": 68,
  "横ばい": 52, "上下に荒い": 45, "大きく凹んでいる": 35, "緩やかに下降": 30,
  "上昇後に失速": 24, "右肩下がり": 18, "安定した右肩上がり": 78,
  "一撃上昇": 55, "大きく凹んで終了": 24, "大きく出た後に下降": 22, "不明": 45
}[value] ?? 45);
const flowValue = value => ({ "上昇中": 82, "底から回復中": 78, "高い位置で停滞": 68, "横ばい": 52, "下降中": 24, "低い位置で停滞": 28 }[value] ?? 45);
const sevenDayValue = value => ({ "継続して強め": 72, "強い日が複数ある": 66, "一撃中心": 48, "上下が激しい": 45, "横ばい中心": 50, "弱い日が多い": 38, "継続して弱め": 32, "不明": 45 }[value] ?? 45);
const levelValue = value => ({ low: 25, medium: 50, high: 75, heavy: 78, long: 78 }[value] ?? 50);
const rateQuality = (count, games, target) => count === null || games === null || games <= 0 ? 45 : clamp((count / games) * target * 100);

export function minutesUntil(closingTime, now = new Date()) {
  const [hour, minute] = String(closingTime || "22:45").split(":").map(Number);
  const close = new Date(now);
  close.setHours(hour, minute, 0, 0);
  if (close <= now) return 0;
  return Math.round((close - now) / 60000);
}
export function resolveMode(mode, now = new Date()) {
  if (mode && mode !== "auto") return mode;
  const hour = now.getHours();
  return hour < 12 ? "morning" : hour < 18 ? "daytime" : "night";
}
const gamePosition = (games, traits) => {
  if (games === null) return 40;
  return traits.targetGameRanges.find(range => games >= range.min && games <= range.max)?.score ?? 40;
};
const riskLabel = score => score <= 25 ? "低い" : score <= 42 ? "やや低い" : score <= 60 ? "普通" : score <= 78 ? "やや高い" : "高い";
const safetyLabel = score => score >= 80 ? "高い" : score >= 65 ? "やや高い" : score >= 45 ? "普通" : score >= 25 ? "やや低い" : "低い";
const recommendation = score => score >= 72 ? { level: "green", icon: "🟢", label: "今からなら座る候補" } : score >= 52 ? { level: "yellow", icon: "🟡", label: "今日打つなら候補" } : { level: "red", icon: "🔴", label: "他に台がなければ" };

function resolvePreferenceAdjustment(profile, enabled) {
  const configured = USER_PREFERENCES.machinePreferences?.[profile.id];
  const value = enabled ? Math.max(-5, Math.min(5, Number(configured?.adjustment ?? USER_PREFERENCES.machineAdjustments[profile.id] ?? 0) || 0)) : 0;
  return {
    enabled: Boolean(enabled), value, type: configured?.type || "general",
    label: configured?.label || "ユーザー嗜好補正",
    reason: enabled ? (configured?.reasons?.includes("作品が好き") ? "好きな作品のため、遊技満足度を考慮" : USER_PREFERENCES.adjustmentReasons[profile.id] || "好みによる補正なし") : "好み補正OFF"
  };
}

function buildAxes(candidate, context, mode, traits) {
  const today = candidate.today, previous = candidate.previousDay;
  const remaining = minutesUntil(context.closingTime, context.now);
  const games = today.currentGames;
  const position = gamePosition(games, traits);
  const ceilingDistance = games === null ? traits.ceilingGames : Math.max(0, traits.ceilingGames - games);
  const expectedNormalMinutes = ceilingDistance / traits.normalGamesPerMinute;
  const neededMinutes = expectedNormalMinutes + traits.averageATMinutes;
  const completionSafety = clamp(remaining <= 0 ? 0 : remaining >= neededMinutes + 60 ? 92 : remaining >= neededMinutes ? 68 : remaining / Math.max(neededMinutes, 1) * 60);
  const graph = graphValue(today.graphState), flow = flowValue(today.recentFlow);
  const firstHit = rateQuality(today.firstHits, today.totalGames, 300);
  const at = rateQuality(today.atCount, today.totalGames, 180);
  const volume = today.totalGames === null ? 42 : clamp(today.totalGames / 6000 * 100);
  const maxCoins = today.maxCoins === null ? 45 : clamp(today.maxCoins / 4000 * 100);
  let machineCondition = clamp(firstHit * .28 + at * .22 + graph * .20 + flow * .12 + volume * .12 + maxCoins * .06);
  if (mode === "morning") {
    const previousCondition = graphValue(previous.graphState) * .35 + rateQuality(previous.firstHits, previous.totalGames, 300) * .25 + rateQuality(previous.atCount, previous.totalGames, 180) * .20 + (previous.maxCoins === null ? 45 : clamp(previous.maxCoins / 4000 * 100)) * .10 + sevenDayValue(candidate.sevenDayTrend) * .10;
    machineCondition = clamp(machineCondition * .35 + previousCondition * .65);
  } else if (mode === "daytime") machineCondition = clamp(machineCondition * .9 + sevenDayValue(candidate.sevenDayTrend) * .1);
  const speedRisk = levelValue(traits.investmentSpeed);
  const depthSafety = position;
  const estimatedInvestment = Math.round(ceilingDistance * (traits.investmentSpeed === "high" ? 42 : traits.investmentSpeed === "low" ? 26 : 34));
  let investmentRisk = clamp(100 - depthSafety * .55 + speedRisk * .30 + (100 - completionSafety) * (mode === "night" ? .28 : .12) + (flow < 35 ? 8 : 0));
  if (Number(context.budget) > 0 && estimatedInvestment > Number(context.budget)) investmentRisk = clamp(investmentRisk + 12);
  if (traits.machineId === "monkey-v" && position < 75) investmentRisk = clamp(investmentRisk + 8);
  const progressTowardTarget = games === null ? 40 : clamp(games / Math.max(traits.ceilingGames, 1) * 100);
  const nowExpectation = clamp(position * .75 + progressTowardTarget * .25);
  return {
    remainingMinutes: remaining, ceilingDistance,
    nowExpectation,
    investmentRisk: { score: investmentRisk, label: riskLabel(investmentRisk) },
    completionSafety: { score: completionSafety, label: safetyLabel(completionSafety) },
    machineCondition,
    details: { gamePosition: position, progressTowardTarget, neededMinutes: Math.round(neededMinutes), estimatedInvestment, graph, flow, firstHit, at }
  };
}

function reasonsFor(candidate, axes, mode) {
  const reasons = [];
  if (axes.details.gamePosition >= 70) reasons.push({ tone: "plus", text: `現在${candidate.today.currentGames}Gで狙い位置が良い` });
  else reasons.push({ tone: "minus", text: `現在${candidate.today.currentGames ?? "未入力"}Gで投資開始位置は弱め` });
  if (axes.completionSafety.score >= 65) reasons.push({ tone: "plus", text: `閉店まで${axes.remainingMinutes}分あり取り切りやすい` });
  else reasons.push({ tone: "minus", text: `閉店まで${axes.remainingMinutes}分で時間に注意` });
  const isPostPeakDecline = candidate.today.graphState === "上昇後に失速" || candidate.today.recentFlow === "下降中";
  if (candidate.today.maxCoins >= 3500 && isPostPeakDecline) reasons.push({ tone: "minus", text: "大きく出た後に失速している可能性" });
  else if (axes.machineCondition >= 65) reasons.push({ tone: "plus", text: "当日の初当たり・AT・グラフ状態が候補材料" });
  else reasons.push({ tone: "minus", text: "当日状態は強い材料が少ない" });
  if (mode === "morning" && candidate.previousDay.finalGames !== null) reasons.push({ tone: "plus", text: `朝評価で前日最終${candidate.previousDay.finalGames}Gを補助参照` });
  return reasons.slice(0, 3);
}

function commentFor(result, preference) {
  if (result.risk.level === "danger") return {
    headline: preference.enabled && preference.type === "work" ? "好きな作品ではあるけど、今からは時間を優先したいところです。" : "今からは時間を優先したいところです。",
    body: "取り切れない可能性があり、候補内でも時間と投資の軽い台を優先したいです。", caution: "深追いは避けよう。"
  };
  let body = result.axes.investmentRisk.score <= 45
    ? "現在ゲーム数と残り時間のバランスが良く、今からなら追加投資を抑えて当たりを狙えそうです。"
    : result.axes.machineCondition >= 65
      ? "台の状態は候補材料ですが、今から追う投資と時間も合わせて判断したいです。"
      : "条件は強くありませんが、この候補の中では今から座る条件を比較して残ります。";
  if (preference.enabled && preference.type === "work") body += result.finalScore >= 60 ? " 好きな作品なら満足感も含めて候補です。" : " 作品としては楽しめますが、今からの勝ちやすさでは優先度が下がります。";
  return { headline: result.recommendation.label, body, caution: result.axes.completionSafety.score < 50 ? "終了時間を先に決めておこう。" : "" };
}

export function evaluateCandidate(candidate, context, position = 1) {
  const now = context.now || new Date();
  const mode = resolveMode(context.mode, now);
  const profile = resolveProfile(candidate.machine);
  const traits = resolveMachineCharacteristics(candidate.machine);
  const axes = buildAxes(candidate, { ...context, now }, mode, traits);
  const weights = AXIS_WEIGHTS[mode];
  const objectiveScore = clamp(
    axes.nowExpectation * weights.nowExpectation +
    (100 - axes.investmentRisk.score) * weights.investmentSafety +
    axes.completionSafety.score * weights.completionSafety +
    axes.machineCondition * weights.machineCondition
  );
  const preferenceAdjustment = resolvePreferenceAdjustment(profile, context.preferenceEnabled !== false);
  const finalScore = clamp(objectiveScore + preferenceAdjustment.value);
  const confidenceFields = mode === "morning"
    ? [candidate.today.currentGames, candidate.previousDay.finalGames, candidate.previousDay.totalGames, candidate.previousDay.firstHits, candidate.previousDay.atCount, candidate.previousDay.maxCoins, candidate.previousDay.graphState, candidate.sevenDayTrend]
    : [candidate.today.currentGames, candidate.today.totalGames, candidate.today.firstHits, candidate.today.atCount, candidate.today.maxCoins, candidate.today.graphState, candidate.today.recentFlow];
  const filled = confidenceFields.filter(item => item !== null && item !== undefined && item !== "").length;
  const confidenceLevel = filled >= 6 ? "high" : filled >= 3 ? "medium" : "low";
  const confidenceText = confidenceLevel === "high" ? "主要データが十分入力されています" : confidenceLevel === "medium" ? "一部未入力項目があるため参考評価です" : "入力データが少ないため順位の信頼度は低めです";
  const result = {
    score: finalScore, finalScore, objectiveScore, rank: "", rankLabel: "",
    mode, axes, weights, preferenceAdjustment, recommendation: recommendation(finalScore),
    confidence: { level: confidenceLevel, label: confidenceLevel === "high" ? "高い" : confidenceLevel === "medium" ? "普通" : "低い", reason: confidenceText, filled, total: confidenceFields.length },
    reasons: reasonsFor(candidate, axes, mode)
  };
  result.rank = finalScore >= 80 ? "A" : finalScore >= 60 ? "B" : "C";
  result.rankLabel = result.recommendation.label;
  result.risk = axes.remainingMinutes <= 0 || axes.completionSafety.score < 25 ? { level: "danger", label: "危険", reason: `閉店まで${axes.remainingMinutes}分。取り切れない可能性` } : axes.investmentRisk.score >= 70 || axes.completionSafety.score < 50 ? { level: "caution", label: "注意", reason: "投資または残り時間に注意" } : { level: "safe", label: "安全", reason: "候補内では時間と投資のバランスが良い" };
  result.comment = commentFor(result, preferenceAdjustment);
  return result;
}

export function evaluationLog(candidate, context, result, position) {
  return {
    type: "candidateEvaluation", logVersion: 2, scorerVersion: APP_VERSION, scoringVersion: APP_VERSION,
    evaluatedAt: new Date().toISOString(), candidateId: candidate.id, hall: candidate.hall,
    machine: candidate.machine, machineId: resolveProfile(candidate.machine).id, weekday: new Date().getDay(),
    mode: result.mode, remainingMinutes: result.axes.remainingMinutes, finalScore: result.finalScore, rank: position,
    nowExpectation: result.axes.nowExpectation, investmentRisk: result.axes.investmentRisk,
    completionSafety: result.axes.completionSafety, machineCondition: result.axes.machineCondition,
    preferenceAdjustment: result.preferenceAdjustment,
    candidateSnapshot: JSON.parse(JSON.stringify(candidate)),
    context: { mode: result.mode, selectedMode: context.mode, closingTime: context.closingTime, preferenceEnabled: context.preferenceEnabled !== false },
    result: { score: result.finalScore, rank: result.rank, position, objectiveScore: result.objectiveScore, axes: result.axes, preferenceAdjustment: result.preferenceAdjustment, confidence: result.confidence.level, risk: result.risk.level }
  };
}

export { MODES };
