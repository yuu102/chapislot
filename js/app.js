import { MODES, evaluateCandidate, evaluationLog } from "./scoring.js";
import {
  appendEvaluationLog, attachPlayResult, deleteEvaluationLogsForCandidate,
  loadAllCandidates, loadComparison, loadEvaluationLogs, loadPatrol, loadSettings,
  normalizeCandidate, saveAllCandidates, saveComparison, savePatrol, saveSettings
} from "./storage.js";

const $ = selector => document.querySelector(selector);
const esc = item => String(item ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const value = number => number === null || number === undefined ? "—" : Number(number).toLocaleString("ja-JP");
const money = number => `${Number(number || 0) >= 0 ? "+" : ""}${Number(number || 0).toLocaleString("ja-JP")}円`;
let allCandidates = loadAllCandidates();
let candidates = allCandidates.filter(candidate => candidate.status === "active");
let settings = loadSettings();
let patrol = loadPatrol();
let comparison = loadComparison();
let editingId = null;
let ranked = [];

function context() {
  return { mode: settings.mode, closingTime: settings.closingTime, preferenceEnabled: settings.preferenceEnabled !== false, now: new Date(), candidates };
}
function persistCandidates() {
  saveAllCandidates(allCandidates);
  candidates = allCandidates.filter(candidate => candidate.status === "active");
}
const confidenceValue = level => level === "high" ? 3 : level === "medium" ? 2 : 1;
const confidenceIcon = level => level === "high" ? "🟢" : level === "medium" ? "🟡" : "🔴";
const riskIcon = level => level === "safe" ? "🟢" : level === "caution" ? "🟡" : "🔴";
function calculateRanking() {
  const initial = candidates.map(candidate => ({ candidate, result: evaluateCandidate(candidate, context(), 1) }))
    .sort((a, b) => b.result.score - a.result.score || confidenceValue(b.result.confidence.level) - confidenceValue(a.result.confidence.level) || new Date(b.candidate.createdAt) - new Date(a.candidate.createdAt));
  return initial.map((entry, index) => ({ ...entry, result: evaluateCandidate(entry.candidate, context(), index + 1), position: index + 1 }));
}
function candidateTitle(candidate) { return `${esc(candidate.machine)} ${esc(candidate.machineNumber)}番台`; }

function renderTopThree() {
  $("#top-three").innerHTML = ranked.slice(0, 3).map(entry => `
    <article class="podium rank-${entry.position}" data-id="${esc(entry.candidate.id)}">
      <div class="podium-rank">${["🥇 第一候補", "🥈 第二候補", "🥉 第三候補"][entry.position - 1]}</div>
      <strong>${candidateTitle(entry.candidate)}</strong>
      <div class="result-line"><b>${entry.result.score}点</b><span class="rank-badge">${entry.result.rank}・${entry.result.rankLabel}</span></div>
      <small>${confidenceIcon(entry.result.confidence.level)} 信頼度：${entry.result.confidence.label}　${riskIcon(entry.result.risk.level)} 危険度：${entry.result.risk.label}</small>
    </article>`).join("");
  const close = ranked.length > 1 && ranked[0].result.rank === ranked[1].result.rank && ranked[0].result.score - ranked[1].result.score <= 3;
  $("#near-tie").classList.toggle("hidden", !close);
  if (close) $("#near-tie").textContent = "第一候補と第二候補はほぼ同評価。空いている方から確認してよさそう。";
}
function factorList(result) {
  return result.factors.slice().sort((a, b) => b.contribution - a.contribution).slice(0, 5)
    .map(item => `<li><span>${esc(item.reason)}</span><small>${item.contribution >= 0 ? "+" : ""}${item.contribution}点</small></li>`).join("");
}
function rawFactorValue(item) {
  if (item.rawValue === null || item.rawValue === "") return "未入力";
  return typeof item.rawValue === "number" ? item.rawValue.toLocaleString("ja-JP") : esc(item.rawValue);
}
function evaluationBreakdown(result) {
  const preference = result.preferenceAdjustment;
  const rows = result.factors.map(item => `
    <div class="breakdown-row"><div class="breakdown-main"><strong>${esc(item.label)}</strong><b>${item.contribution >= 0 ? "+" : ""}${item.contribution}点</b></div>
    <small>入力値：${rawFactorValue(item)} ／ 評価値：${Math.round(item.normalizedValue * 100)}% ／ 重み：${Math.round(item.effectiveWeight * 100)}%</small><p>${esc(item.reason)}</p></div>`).join("");
  const adjusted = result.scoreAdjusted ? `<p class="score-adjustment">計算上${result.rawScore}点のため、${result.score === 100 ? "上限100点" : "下限0点"}に補正</p>` : "";
  return `<details class="evaluation-details"><summary>評価内訳を見る</summary><div class="breakdown"><h4>評価内訳</h4>
    <div class="breakdown-row compact"><div class="breakdown-main"><strong>基本点</strong><b>+${result.baseScore}点</b></div></div>${rows}
    <div class="breakdown-totals"><div><span>factor合計</span><b>+${result.factorScore}点</b></div><div><span>客観評価</span><b>${result.objectiveScore}点</b></div>
    <div><span>${esc(preference.label || "ユーザー嗜好補正")}</span><b>${preference.value >= 0 ? "+" : ""}${preference.value}点</b></div><small>${esc(preference.reason)}</small>
    <div class="final"><span>最終評価</span><b>${result.score}点（${result.rank}・${result.rankLabel}）</b></div>${adjusted}</div></div></details>`;
}
function renderCards() {
  let shown = ranked.slice();
  const sort = $("#sort-order").value;
  if (sort === "games") shown.sort((a, b) => (b.candidate.today.currentGames || 0) - (a.candidate.today.currentGames || 0));
  if (sort === "created") shown.sort((a, b) => new Date(b.candidate.createdAt) - new Date(a.candidate.createdAt));
  $("#candidate-count").textContent = `${shown.length}台`;
  $("#empty").classList.toggle("hidden", shown.length > 0);
  $("#candidate-list").innerHTML = shown.map(entry => {
    const c = entry.candidate, r = entry.result, state = patrol.states[c.id] || "unvisited", selected = comparison.includes(c.id);
    return `<article class="candidate-card ${state}" data-id="${esc(c.id)}">
      <div class="card-head"><div><span class="position">${entry.position}位</span><h3>${candidateTitle(c)}</h3><p>${esc(c.hall || "ホール未設定")}</p></div><div class="score"><b>${r.score}</b><small>点</small><span>${r.rank}・${r.rankLabel}</span></div></div>
      <div class="signals"><span>${confidenceIcon(r.confidence.level)} 信頼度：${r.confidence.label}</span><span>${riskIcon(r.risk.level)} 危険度：${r.risk.label}</span></div>
      <div class="chappy"><strong>${esc(r.comment.headline)}</strong><p>${esc(r.comment.body)}</p>${r.comment.caution ? `<p>${esc(r.comment.caution)}</p>` : ""}</div>
      <div class="reasons"><h4>この順位になった理由</h4><ul>${factorList(r)}</ul><p class="confidence-reason">${esc(r.confidence.reason)}／${esc(r.risk.reason)}</p></div>
      ${evaluationBreakdown(r)}
      <div class="summary"><span>現在 ${value(c.today.currentGames)}G</span><span>前日最終 ${value(c.previousDay.finalGames)}G</span><span>${esc(c.today.graphState || "グラフ未入力")}</span></div>
      <button class="compare-toggle ${selected ? "selected" : ""}" data-action="compare" aria-pressed="${selected}">${selected ? "✓ 比較に追加済み" : "＋ 比較に追加"}</button>
      <div class="patrol-actions four"><button data-action="unavailable">空いていない</button><button data-action="later">あとで見る</button><button data-action="hold">保留</button><button data-action="choose">この台に決める</button></div>
      <div class="edit-actions"><button data-action="edit">編集</button><button data-action="delete">完全削除</button></div>
    </article>`;
  }).join("");
}

function nextCandidate(excludeId = null) {
  const available = entry => entry.candidate.id !== excludeId && !["unavailable", "chosen"].includes(patrol.states[entry.candidate.id]);
  return ranked.find(entry => available(entry) && (patrol.states[entry.candidate.id] || "unvisited") !== "later")
    || ranked.find(available) || null;
}
function renderCurrent() {
  const current = ranked.find(entry => entry.candidate.id === patrol.currentId) || nextCandidate();
  if (current && !patrol.currentId) patrol.currentId = current.candidate.id;
  $("#current-panel").classList.toggle("hidden", !current);
  $("#reset-patrol").classList.toggle("hidden", !ranked.length);
  if (!current) return;
  const chosen = patrol.states[current.candidate.id] === "chosen";
  $("#current-candidate").innerHTML = `<strong>${current.position <= 3 ? ["🥇", "🥈", "🥉"][current.position - 1] : `${current.position}位`} ${candidateTitle(current.candidate)}</strong>
    <p>${esc(current.result.comment.headline)} ${esc(current.result.comment.body)}</p>
    ${chosen ? `<button data-current-action="finish">実戦終了</button>` : `<div class="current-actions"><button data-current-action="unavailable">空いていない → 次へ</button><button data-current-action="later">あとで見る → 次へ</button></div>`}`;
  savePatrol(patrol);
}
function renderComparison() {
  comparison = comparison.filter(id => ranked.some(entry => entry.candidate.id === id)).slice(0, 3);
  saveComparison(comparison);
  const selected = comparison.map(id => ranked.find(entry => entry.candidate.id === id)).filter(Boolean);
  $("#comparison-panel").classList.toggle("hidden", !selected.length);
  $("#comparison-count").textContent = `${selected.length}/3台`;
  $("#comparison-list").innerHTML = selected.map(entry => {
    const c = entry.candidate, r = entry.result;
    return `<article class="compare-card"><div><span>${entry.position}位</span><strong>${candidateTitle(c)}</strong><b>${r.score}点</b></div>
      <dl><dt>現在G</dt><dd>${value(c.today.currentGames)}G</dd><dt>グラフ</dt><dd>${esc(c.today.graphState || "未入力")}</dd>
      <dt>初当たり</dt><dd>${value(c.today.firstHits)}回</dd><dt>最大持玉</dt><dd>${value(c.today.maxCoins)}枚</dd></dl>
      <p>${esc(r.comment.headline)} ${esc(r.comment.body)}</p><button data-compare-remove="${esc(c.id)}">比較から外す</button></article>`;
  }).join("");
}
function renderHistory() {
  const logs = loadEvaluationLogs().filter(log => log.type === "candidateEvaluation" && log.play).sort((a, b) => new Date(b.play.savedAt) - new Date(a.play.savedAt));
  $("#history-empty").classList.toggle("hidden", logs.length > 0);
  $("#history-list").innerHTML = logs.map(log => {
    const date = new Date(log.play.savedAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
    const win = log.play.balance > 0 ? "勝ち" : log.play.balance < 0 ? "負け" : "引き分け";
    return `<article class="history-card"><div><time>${esc(date)}</time><strong>${esc(log.machine)} ${esc(log.machineNumber || "")}</strong></div>
      <p><b>${log.result?.score ?? "—"}点</b><span>${win}</span><strong class="${log.play.balance >= 0 ? "positive" : "negative"}">${money(log.play.balance)}</strong></p>
      <small>投資 ${value(log.play.investment)}円／回収 ${value(log.play.recovery)}円${log.play.note ? `／${esc(log.play.note)}` : ""}</small></article>`;
  }).join("");
}
function renderTime() {
  const now = new Date(), [h, m] = settings.closingTime.split(":").map(Number), close = new Date(now);
  close.setHours(h, m, 0, 0); if (close < now) close.setDate(close.getDate() + 1);
  const remaining = Math.max(0, Math.round((close - now) / 60000));
  $("#current-time").textContent = now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  $("#remaining-time").textContent = `${Math.floor(remaining / 60)}時間${remaining % 60}分`;
}
function render() {
  ranked = calculateRanking();
  document.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === settings.mode));
  $("#mode-help").textContent = MODES[settings.mode].help;
  renderTopThree(); renderCards(); renderCurrent(); renderComparison(); renderHistory(); renderTime();
}

function moveToNext(id, state) {
  patrol.states[id] = state;
  patrol.currentId = nextCandidate(id)?.candidate.id || (state === "later" ? id : null);
  savePatrol(patrol); render();
  if (patrol.currentId) document.querySelector(`[data-id="${CSS.escape(patrol.currentId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}
function fillForm(candidate) {
  const form = $("#candidate-form").elements, today = candidate.today, previous = candidate.previousDay;
  const values = { hall: candidate.hall, machine: candidate.machine, machineNumber: candidate.machineNumber, currentGames: today.currentGames, totalGames: today.totalGames, firstHits: today.firstHits, atCount: today.atCount, maxCoins: today.maxCoins, graphState: today.graphState, recentFlow: today.recentFlow, previousGames: previous.finalGames, previousTotalGames: previous.totalGames, previousFirstHits: previous.firstHits, previousAtCount: previous.atCount, previousMaxCoins: previous.maxCoins, previousGraph: previous.graphState, note: candidate.note };
  Object.entries(values).forEach(([key, storedValue]) => { if (form[key]) form[key].value = storedValue ?? ""; });
}
function resetForm() {
  editingId = null; $("#candidate-form").reset(); $("#form-title").textContent = "候補台を追加"; $("#cancel-edit").classList.add("hidden"); $("#form-error").textContent = "";
}
function openResultDialog() {
  const entry = ranked.find(item => item.candidate.id === patrol.currentId);
  if (!entry || patrol.states[entry.candidate.id] !== "chosen") return;
  $("#result-candidate").textContent = `${entry.candidate.machine} ${entry.candidate.machineNumber}番台`;
  $("#result-form").reset(); $("#balance-preview").textContent = "収支 0円";
  $("#result-dialog").showModal();
}

document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => { settings.mode = button.dataset.mode; saveSettings(settings); render(); }));
$("#closing-time").value = settings.closingTime;
$("#closing-time").addEventListener("change", event => { settings.closingTime = event.target.value || "22:45"; saveSettings(settings); render(); });
$("#preference-enabled").checked = settings.preferenceEnabled !== false;
$("#preference-enabled").addEventListener("change", event => { settings.preferenceEnabled = event.target.checked; saveSettings(settings); render(); toast(event.target.checked ? "好み補正をONにしました" : "客観評価だけで並び替えました"); });
$("#sort-order").addEventListener("change", renderCards);
$("#reset-patrol").addEventListener("click", () => { patrol = { currentId: null, states: {}, selectedLogId: null }; savePatrol(patrol); render(); });
$("#reset-candidates").addEventListener("click", () => {
  if (!candidates.length || !confirm("今日の候補をすべてリセットしますか？\n\n評価履歴は保存されます。")) return;
  const count = candidates.length;
  allCandidates = allCandidates.map(candidate => candidate.status === "active" ? { ...candidate, status: "hidden", updatedAt: new Date().toISOString() } : candidate);
  appendEvaluationLog({ type: "resetCandidates", resetAt: new Date().toISOString(), candidateCount: count });
  patrol = { currentId: null, states: {}, selectedLogId: null }; comparison = [];
  persistCandidates(); savePatrol(patrol); saveComparison(comparison); render(); toast(`${count}台をリセットしました`);
});
$("#open-history").addEventListener("click", () => { renderHistory(); $("#history-dialog").showModal(); });
$("#close-history").addEventListener("click", () => $("#history-dialog").close());
$("#current-panel").addEventListener("click", event => {
  if (!patrol.currentId) return;
  if (event.target.dataset.currentAction === "unavailable") moveToNext(patrol.currentId, "unavailable");
  if (event.target.dataset.currentAction === "later") moveToNext(patrol.currentId, "later");
  if (event.target.dataset.currentAction === "finish") openResultDialog();
});
$("#comparison-list").addEventListener("click", event => {
  const id = event.target.dataset.compareRemove;
  if (!id) return;
  comparison = comparison.filter(item => item !== id); saveComparison(comparison); render();
});
$("#candidate-list").addEventListener("click", event => {
  const button = event.target.closest("button[data-action]"); if (!button) return;
  const id = button.closest("[data-id]").dataset.id, entry = ranked.find(item => item.candidate.id === id); if (!entry) return;
  if (button.dataset.action === "compare") {
    if (comparison.includes(id)) comparison = comparison.filter(item => item !== id);
    else if (comparison.length >= 3) return toast("比較できるのは最大3台です");
    else comparison.push(id);
    saveComparison(comparison); render(); return;
  }
  if (button.dataset.action === "unavailable") return moveToNext(id, "unavailable");
  if (button.dataset.action === "later") return moveToNext(id, "later");
  if (button.dataset.action === "hold") return moveToNext(id, "hold");
  if (button.dataset.action === "choose") {
    patrol.states[id] = "chosen"; patrol.currentId = id;
    const log = appendEvaluationLog({ ...evaluationLog(entry.candidate, context(), entry.result, entry.position), machineNumber: entry.candidate.machineNumber });
    patrol.selectedLogId = log.id; savePatrol(patrol); render(); return toast("この台に決めました。終了時に実戦結果を残せます");
  }
  if (button.dataset.action === "edit") {
    editingId = id; fillForm(entry.candidate); $("#form-title").textContent = `${entry.candidate.machine} ${entry.candidate.machineNumber}番台を編集`; $("#cancel-edit").classList.remove("hidden"); return $(".register").scrollIntoView({ behavior: "smooth" });
  }
  if (button.dataset.action === "delete" && confirm("完全削除すると履歴も失われます。\n\n本当に削除しますか？")) {
    allCandidates = allCandidates.filter(candidate => candidate.id !== id);
    comparison = comparison.filter(item => item !== id); delete patrol.states[id];
    if (patrol.currentId === id) patrol.currentId = null;
    deleteEvaluationLogsForCandidate(id); persistCandidates(); saveComparison(comparison); savePatrol(patrol); render(); toast("完全削除しました");
  }
});
$("#candidate-form").addEventListener("submit", event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget)), old = allCandidates.find(candidate => candidate.id === editingId);
  if (!data.machine.trim() || !data.machineNumber.trim()) return $("#form-error").textContent = "機種名と台番号は必須です。";
  const candidate = normalizeCandidate({ id: old?.id, status: "active", hall: data.hall.trim(), machine: data.machine.trim(), machineNumber: data.machineNumber.trim(), currentGames: data.currentGames, totalGames: data.totalGames, firstHits: data.firstHits, atCount: data.atCount, maxCoins: data.maxCoins, graphState: data.graphState, recentFlow: data.recentFlow, previousGames: data.previousGames, previousTotalGames: data.previousTotalGames, previousFirstHits: data.previousFirstHits, previousAtCount: data.previousAtCount, previousMaxCoins: data.previousMaxCoins, previousGraph: data.previousGraph, note: data.note, createdAt: old?.createdAt, updatedAt: new Date().toISOString() });
  allCandidates = old ? allCandidates.map(item => item.id === old.id ? candidate : item) : [...allCandidates, candidate];
  persistCandidates(); resetForm(); render(); toast(old ? "候補を更新しました" : "候補を追加しました");
});
$("#cancel-edit").addEventListener("click", resetForm);
$("#import-button").addEventListener("click", () => {
  try {
    const parsed = JSON.parse($("#import-json").value);
    if (!Array.isArray(parsed)) throw new Error("JSONは配列形式にしてください。");
    const imported = parsed.slice(0, 200).map(item => normalizeCandidate({ ...item, status: "active", importSource: "JSON貼り付け" })).filter(candidate => candidate.machine && candidate.machineNumber);
    const map = new Map(allCandidates.map(candidate => [`${candidate.hall}|${candidate.machine}|${candidate.machineNumber}`, candidate]));
    imported.forEach(candidate => {
      const key = `${candidate.hall}|${candidate.machine}|${candidate.machineNumber}`, old = map.get(key);
      map.set(key, old ? { ...candidate, status: "active", id: old.id, createdAt: old.createdAt, note: old.note || candidate.note, today: { ...candidate.today, graphState: candidate.today.graphState || old.today.graphState, recentFlow: candidate.today.recentFlow || old.today.recentFlow } } : candidate);
    });
    allCandidates = [...map.values()]; persistCandidates(); $("#import-error").textContent = ""; render(); toast(`${imported.length}台を取り込みました`);
  } catch (error) { $("#import-error").textContent = error.message; }
});
$("#result-form").addEventListener("input", () => {
  const data = new FormData($("#result-form")), balance = Number(data.get("recovery") || 0) - Number(data.get("investment") || 0);
  $("#balance-preview").textContent = `収支 ${money(balance)}`;
});
$("#result-form").addEventListener("submit", event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget)), investment = Math.max(0, Number(data.investment || 0)), recovery = Math.max(0, Number(data.recovery || 0)), balance = recovery - investment;
  if (!patrol.selectedLogId || !attachPlayResult(patrol.selectedLogId, { investment, recovery, balance, result: balance > 0 ? "win" : balance < 0 ? "loss" : "draw", note: data.note.trim() })) return toast("保存する評価履歴が見つかりません");
  const chosenId = patrol.currentId;
  if (chosenId) {
    allCandidates = allCandidates.map(candidate => candidate.id === chosenId ? { ...candidate, status: "archived", updatedAt: new Date().toISOString() } : candidate);
  }
  patrol = { currentId: null, states: {}, selectedLogId: null }; comparison = comparison.filter(id => id !== chosenId);
  persistCandidates(); savePatrol(patrol); saveComparison(comparison); $("#result-dialog").close(); render(); toast(`実戦結果を保存しました（${money(balance)}）`);
});
$("#cancel-result").addEventListener("click", () => $("#result-dialog").close());
function toast(message) {
  const element = $("#toast"); element.textContent = message; element.classList.add("show"); setTimeout(() => element.classList.remove("show"), 2200);
}
render();
setInterval(renderTime, 60000);
