export const APP_VERSION = "2.0.0";

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
  { id: "hokuto", aliases: ["北斗の拳", "北斗"], expectedPlayMinutes: 90, weights: { morning: commonMorning, night: commonNight } }
];

export function resolveProfile(machine = "") {
  return MACHINE_PROFILES.find(p => p.aliases.some(a => machine.includes(a))) || DEFAULT_PROFILE;
}
