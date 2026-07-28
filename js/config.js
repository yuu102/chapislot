export const APP_VERSION = "2.2.0";

export const MODES = {
  morning: { label: "朝", help: "前日最終・前日の当たり・最大持玉・グラフを重視" },
  night: { label: "夜", help: "現在G・当日グラフ・直近の流れ・当たり履歴・残り時間を重視" }
};

const commonMorning = {
  previousGames: .30, previousMaxCoins: .20, previousFirstHitRate: .20,
  previousAtRate: .15, previousGraph: .15
};
const commonNight = {
  currentGames: .28, graphState: .20, recentFlow: .15,
  firstHitRate: .15, atRate: .10, maxCoins: .05, timeFit: .07
};

export const DEFAULT_PROFILE = {
  id: "default", aliases: [], expectedPlayMinutes: 75,
  weights: { morning: commonMorning, night: commonNight }
};

export const MACHINE_PROFILES = [
  {
    id: "monkey-v", aliases: ["モンキーターンV", "モンキー", "モンキーターン"],
    expectedPlayMinutes: 95,
    weights: {
      morning: { ...commonMorning, previousGames: .34, previousGraph: .11 },
      night: { ...commonNight, currentGames: .36, graphState: .15, timeFit: .09 }
    }
  },
  {
    id: "otome-5", aliases: ["戦国乙女5", "戦国乙女"],
    expectedPlayMinutes: 85,
    weights: {
      morning: commonMorning,
      night: { ...commonNight, currentGames: .20, graphState: .28 }
    }
  },
  {
    id: "tokyo-ghoul", aliases: ["L東京喰種", "東京喰種", "グール"],
    expectedPlayMinutes: 100,
    weights: {
      morning: { ...commonMorning, previousMaxCoins: .25, previousFirstHitRate: .25, previousGames: .20 },
      night: { ...commonNight, currentGames: .18, firstHitRate: .24, maxCoins: .14 }
    }
  },
  { id: "kabaneri", aliases: ["甲鉄城のカバネリ", "カバネリ"], expectedPlayMinutes: 80, weights: { morning: commonMorning, night: commonNight } },
  { id: "hokuto", aliases: ["北斗の拳", "北斗"], expectedPlayMinutes: 90, weights: { morning: commonMorning, night: commonNight } },
  { id: "sao-2", aliases: ["ソードアート・オンライン2", "SAO2", "ＳＡＯ２", "SAO"], expectedPlayMinutes: 90, weights: { morning: commonMorning, night: commonNight } },
  { id: "kaguya", aliases: ["かぐや様は告らせたい", "かぐや様", "かぐや"], expectedPlayMinutes: 90, weights: { morning: commonMorning, night: commonNight } }
];

export const USER_PREFERENCES = {
  enabledByDefault: true,
  dislikesLongNormalPlay: true,
  prefersGraphRecovery: true,
  prefersShortSessionFit: true,
  machineAdjustments: {
    "monkey-v": -4,
    "otome-5": 3,
    "tokyo-ghoul": 1,
    kabaneri: 1,
    hokuto: 0,
    "sao-2": 2,
    kaguya: 2,
    default: 0
  },
  adjustmentReasons: {
    "monkey-v": "通常区間が長くなりやすく、好みとの相性を考慮",
    "otome-5": "打ち慣れていて、好みとの相性を軽く考慮",
    "tokyo-ghoul": "遊技の好みとの相性をわずかに考慮",
    kabaneri: "遊技の好みとの相性をわずかに考慮",
    hokuto: "好みによる補正なし",
    "sao-2": "好きな作品のため、遊技満足度を考慮",
    kaguya: "好きな作品のため、遊技満足度を考慮",
    default: "好みによる補正なし"
  },
  machinePreferences: {
    "sao-2": {
      adjustment: 2,
      type: "work",
      label: "作品嗜好補正",
      reasons: ["作品が好き", "演出を楽しみたい", "遊技満足度を考慮"]
    },
    kaguya: {
      adjustment: 2,
      type: "work",
      label: "作品嗜好補正",
      reasons: ["作品が好き", "遊技満足度を考慮"]
    }
  }
};

export function resolveProfile(machine = "") {
  return MACHINE_PROFILES.find(p => p.aliases.some(a => machine.includes(a))) || DEFAULT_PROFILE;
}
