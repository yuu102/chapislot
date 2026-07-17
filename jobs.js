export const JOB_CATALOG = {
  "戦士": ["ヒーロー", "パラディン", "ダークナイト", "アラン", "ソウルマスター", "デーモンスレイヤー", "デーモンアヴェンジャー", "ブラスター", "カイザー", "ハヤト", "アデル", "エリル"],
  "魔法使い": ["ビショップ", "アークメイジ（火・毒）", "アークメイジ（氷・雷）", "フレイムウィザード", "バトルメイジ", "エヴァン", "ルミナス", "カンナ", "キネシス", "リン", "シア"],
  "弓使い": ["ボウマスター", "クロスボウマスター", "パスファインダー", "ウィンドシューター", "ワイルドハンター", "メルセデス"],
  "盗賊": ["ナイトロード", "シャドー", "デュアルブレイド", "ナイトウォーカー", "ファントム", "ゼノン"],
  "海賊": ["キャプテン", "バイパー", "キャノンシューター", "ストライカー", "メカニック", "隠月", "アーク", "エンジェリックバスター", "ゼノン"],
};

const jobSeries = Object.entries(JOB_CATALOG).reduce((map, [series, jobs]) => {
  jobs.forEach((job) => { map[job] = job === "ゼノン" ? "ハイブリッド" : series; });
  return map;
}, {});

const seriesClasses = { "戦士": "series-warrior", "魔法使い": "series-mage", "盗賊": "series-thief", "弓使い": "series-archer", "海賊": "series-pirate", "ハイブリッド": "series-hybrid" };

export function seriesForJob(job, fallback = "") { return jobSeries[job] || fallback; }
export function seriesClass(series) { return seriesClasses[series] || "series-default"; }

export function createJobSelect(job = "") {
  const select = document.createElement("select");
  const empty = new Option("選択しない", "");
  select.append(empty);
  Object.entries(JOB_CATALOG).forEach(([series, jobs]) => {
    const group = document.createElement("optgroup"); group.label = series;
    jobs.forEach((name) => group.append(new Option(name, name)));
    select.append(group);
  });
  if (job && !Array.from(select.options).some((option) => option.value === job)) select.insertBefore(new Option(`既存職業: ${job}`, job), select.children[1]);
  select.value = job;
  return select;
}
