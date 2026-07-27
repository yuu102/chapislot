import { MODES } from "./scoring.js";
import { evaluateCandidate, evaluationLog } from "./scoring.js";
import { loadCandidates, saveCandidates, loadSettings, saveSettings, loadPatrol, savePatrol, normalizeCandidate, appendEvaluationLog } from "./storage.js";

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const value = number => number === null || number === undefined ? "—" : Number(number).toLocaleString("ja-JP");
let candidates = loadCandidates();
let settings = loadSettings();
let patrol = loadPatrol();
let editingId = null;
let ranked = [];

function context() { return { mode: settings.mode, closingTime: settings.closingTime, now: new Date(), candidates }; }

function calculateRanking() {
  const initial = candidates.map(candidate => ({ candidate, result: evaluateCandidate(candidate, context(), 1) }))
    .sort((a, b) => b.result.score - a.result.score || confidenceValue(b.result.confidence.level) - confidenceValue(a.result.confidence.level) || new Date(b.candidate.createdAt) - new Date(a.candidate.createdAt));
  return initial.map((entry, index) => ({ candidate: entry.candidate, result: evaluateCandidate(entry.candidate, context(), index + 1), position: index + 1 }));
}
const confidenceValue = level => level === "high" ? 3 : level === "medium" ? 2 : 1;
const confidenceIcon = level => level === "high" ? "🟢" : level === "medium" ? "🟡" : "🔴";
const riskIcon = level => level === "safe" ? "🟢" : level === "caution" ? "🟡" : "🔴";

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
    .map(f => `<li><span>${esc(f.reason)}</span><small>${f.contribution >= 0 ? "+" : ""}${f.contribution}点</small></li>`).join("");
}

function renderCards() {
  let shown = ranked.slice();
  const sort = $("#sort-order").value;
  if (sort === "games") shown.sort((a, b) => (b.candidate.today.currentGames || 0) - (a.candidate.today.currentGames || 0));
  if (sort === "created") shown.sort((a, b) => new Date(b.candidate.createdAt) - new Date(a.candidate.createdAt));
  $("#candidate-count").textContent = `${shown.length}台`;
  $("#empty").classList.toggle("hidden", shown.length > 0);
  $("#candidate-list").innerHTML = shown.map(entry => {
    const c = entry.candidate, r = entry.result, state = patrol.states[c.id] || "unvisited";
    return `<article class="candidate-card ${state}" data-id="${esc(c.id)}">
      <div class="card-head"><div><span class="position">${entry.position}位</span><h3>${candidateTitle(c)}</h3><p>${esc(c.hall || "ホール未設定")}</p></div><div class="score"><b>${r.score}</b><small>点</small><span>${r.rank}・${r.rankLabel}</span></div></div>
      <div class="signals"><span>${confidenceIcon(r.confidence.level)} 信頼度：${r.confidence.label}</span><span>${riskIcon(r.risk.level)} 危険度：${r.risk.label}</span></div>
      <div class="chappy"><strong>${esc(r.comment.headline)}</strong><p>${esc(r.comment.body)}</p>${r.comment.caution ? `<p>${esc(r.comment.caution)}</p>` : ""}</div>
      <div class="reasons"><h4>この順位になった理由</h4><ul>${factorList(r)}</ul><p class="confidence-reason">${esc(r.confidence.reason)}／${esc(r.risk.reason)}</p></div>
      <div class="summary"><span>現在 ${value(c.today.currentGames)}G</span><span>前日最終 ${value(c.previousDay.finalGames)}G</span><span>${esc(c.today.graphState || "グラフ未入力")}</span></div>
      <div class="patrol-actions"><button data-action="unavailable">空いていない</button><button data-action="hold">保留</button><button data-action="choose">この台に決める</button></div>
      <div class="edit-actions"><button data-action="edit">編集</button><button data-action="delete">削除</button></div>
    </article>`;
  }).join("");
}

function nextCandidate() {
  return ranked.find(entry => !["unavailable", "chosen"].includes(patrol.states[entry.candidate.id])) || null;
}
function renderCurrent() {
  const current = ranked.find(entry => entry.candidate.id === patrol.currentId) || nextCandidate();
  if (current && !patrol.currentId) patrol.currentId = current.candidate.id;
  $("#current-panel").classList.toggle("hidden", !current);
  $("#reset-patrol").classList.toggle("hidden", !ranked.length);
  if (!current) return;
  $("#current-candidate").innerHTML = `<strong>${current.position <= 3 ? ["🥇", "🥈", "🥉"][current.position - 1] : `${current.position}位`} ${candidateTitle(current.candidate)}</strong><p>${esc(current.result.comment.headline)} ${esc(current.result.comment.body)}</p><button data-current-action="unavailable">空いていない → 次へ</button>`;
  savePatrol(patrol);
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
  renderTopThree(); renderCards(); renderCurrent(); renderTime();
}

function unavailable(id) {
  patrol.states[id] = "unavailable";
  const next = ranked.find(entry => entry.candidate.id !== id && !["unavailable", "chosen"].includes(patrol.states[entry.candidate.id]));
  patrol.currentId = next?.candidate.id || null;
  savePatrol(patrol); render();
  if (next) document.querySelector(`[data-id="${CSS.escape(next.candidate.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function fillForm(candidate) {
  const f = $("#candidate-form").elements, t = candidate.today, p = candidate.previousDay;
  const values = { hall: candidate.hall, machine: candidate.machine, machineNumber: candidate.machineNumber, currentGames: t.currentGames, totalGames: t.totalGames, firstHits: t.firstHits, atCount: t.atCount, maxCoins: t.maxCoins, graphState: t.graphState, recentFlow: t.recentFlow, previousGames: p.finalGames, previousTotalGames: p.totalGames, previousFirstHits: p.firstHits, previousAtCount: p.atCount, previousMaxCoins: p.maxCoins, previousGraph: p.graphState, note: candidate.note };
  Object.entries(values).forEach(([key, val]) => { if (f[key]) f[key].value = val ?? ""; });
}
function resetForm() { editingId = null; $("#candidate-form").reset(); $("#form-title").textContent = "候補台を追加"; $("#cancel-edit").classList.add("hidden"); $("#form-error").textContent = ""; }

document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => { settings.mode = button.dataset.mode; saveSettings(settings); render(); }));
$("#closing-time").value = settings.closingTime;
$("#closing-time").addEventListener("change", event => { settings.closingTime = event.target.value || "22:45"; saveSettings(settings); render(); });
$("#sort-order").addEventListener("change", renderCards);
$("#reset-patrol").addEventListener("click", () => { patrol = { currentId: null, states: {} }; savePatrol(patrol); render(); });
$("#current-panel").addEventListener("click", event => { if (event.target.dataset.currentAction === "unavailable" && patrol.currentId) unavailable(patrol.currentId); });

$("#candidate-list").addEventListener("click", event => {
  const button = event.target.closest("button[data-action]"); if (!button) return;
  const id = button.closest("[data-id]").dataset.id, entry = ranked.find(item => item.candidate.id === id); if (!entry) return;
  if (button.dataset.action === "unavailable") return unavailable(id);
  if (button.dataset.action === "hold") { patrol.states[id] = "hold"; if (patrol.currentId === id) patrol.currentId = nextCandidate()?.candidate.id || null; savePatrol(patrol); return render(); }
  if (button.dataset.action === "choose") { patrol.states[id] = "chosen"; patrol.currentId = id; savePatrol(patrol); appendEvaluationLog(evaluationLog(entry.candidate, context(), entry.result, entry.position)); render(); return toast("この台に決めました"); }
  if (button.dataset.action === "edit") { editingId = id; fillForm(entry.candidate); $("#form-title").textContent = `${entry.candidate.machine} ${entry.candidate.machineNumber}番台を編集`; $("#cancel-edit").classList.remove("hidden"); return $(".register").scrollIntoView({ behavior: "smooth" }); }
  if (button.dataset.action === "delete" && confirm("この候補を削除しますか？")) { candidates = candidates.filter(c => c.id !== id); delete patrol.states[id]; saveCandidates(candidates); savePatrol(patrol); render(); }
});

$("#candidate-form").addEventListener("submit", event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); const old = candidates.find(c => c.id === editingId);
  if (!data.machine.trim() || !data.machineNumber.trim()) return $("#form-error").textContent = "機種名と台番号は必須です。";
  const candidate = normalizeCandidate({ id: old?.id, hall: data.hall.trim(), machine: data.machine.trim(), machineNumber: data.machineNumber.trim(), currentGames: data.currentGames, totalGames: data.totalGames, firstHits: data.firstHits, atCount: data.atCount, maxCoins: data.maxCoins, graphState: data.graphState, recentFlow: data.recentFlow, previousGames: data.previousGames, previousTotalGames: data.previousTotalGames, previousFirstHits: data.previousFirstHits, previousAtCount: data.previousAtCount, previousMaxCoins: data.previousMaxCoins, previousGraph: data.previousGraph, note: data.note, createdAt: old?.createdAt, updatedAt: new Date().toISOString() });
  candidates = old ? candidates.map(c => c.id === old.id ? candidate : c) : [...candidates, candidate];
  saveCandidates(candidates); resetForm(); render(); toast(old ? "候補を更新しました" : "候補を追加しました");
});
$("#cancel-edit").addEventListener("click", resetForm);
$("#import-button").addEventListener("click", () => {
  try {
    const parsed = JSON.parse($("#import-json").value);
    if (!Array.isArray(parsed)) throw new Error("JSONは配列形式にしてください。");
    const imported = parsed.slice(0, 200).map(item => normalizeCandidate({ ...item, importSource: "JSON貼り付け" })).filter(c => c.machine && c.machineNumber);
    const map = new Map(candidates.map(c => [`${c.hall}|${c.machine}|${c.machineNumber}`, c]));
    imported.forEach(candidate => {
      const key = `${candidate.hall}|${candidate.machine}|${candidate.machineNumber}`, old = map.get(key);
      map.set(key, old ? {
        ...candidate,
        id: old.id,
        createdAt: old.createdAt,
        note: old.note || candidate.note,
        today: {
          ...candidate.today,
          graphState: candidate.today.graphState || old.today.graphState,
          recentFlow: candidate.today.recentFlow || old.today.recentFlow
        }
      } : candidate);
    });
    candidates = [...map.values()]; saveCandidates(candidates); $("#import-error").textContent = ""; render(); toast(`${imported.length}台を取り込みました`);
  } catch (error) { $("#import-error").textContent = error.message; }
});

function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 1800); }
render(); setInterval(renderTime, 60000);
