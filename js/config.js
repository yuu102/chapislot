export const APP_VERSION = "3.0.1";

export const MODES = {
  auto: { label: "自動", help: "現在時刻から朝・昼・夜を自動選択" },
  morning: { label: "朝", help: "前日情報を補助に、今からの着席条件を評価" },
  daytime: { label: "昼", help: "当日状況・現在G・投資リスクをバランス評価" },
  night: { label: "夜", help: "残り時間・投資リスク・取り切りやすさを最重視" }
};

export const AXIS_WEIGHTS = {
  morning: { nowExpectation: .35, investmentSafety: .20, completionSafety: .10, machineCondition: .35 },
  daytime: { nowExpectation: .40, investmentSafety: .25, completionSafety: .15, machineCondition: .20 },
  night: { nowExpectation: .45, investmentSafety: .25, completionSafety: .25, machineCondition: .05 }
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

const defaultTraits = {
  investmentSpeed: "medium", initialHitWeight: "medium", averageATDuration: "medium",
  averageATMinutes: 45, normalGamesPerMinute: 12, lateStartRisk: "medium", ceilingGames: 1000,
  targetGameRanges: [{ min: 0, max: 299, score: 30 }, { min: 300, max: 599, score: 65 }, { min: 600, max: 9999, score: 90 }]
};

export const MACHINE_CHARACTERISTICS = {
  default: defaultTraits,
  "tokyo-ghoul": { ...defaultTraits, investmentSpeed: "high", initialHitWeight: "heavy", averageATDuration: "long", averageATMinutes: 70, lateStartRisk: "high", ceilingGames: 1200 },
  "otome-5": { ...defaultTraits, investmentSpeed: "medium", averageATMinutes: 55, ceilingGames: 1000, targetGameRanges: [{ min: 0, max: 249, score: 25 }, { min: 250, max: 549, score: 65 }, { min: 550, max: 9999, score: 92 }] },
  kabaneri: { ...defaultTraits, investmentSpeed: "medium", averageATMinutes: 45, lateStartRisk: "medium", ceilingGames: 1000 },
  "monkey-v": { ...defaultTraits, investmentSpeed: "high", initialHitWeight: "heavy", averageATMinutes: 60, lateStartRisk: "high", ceilingGames: 1111, targetGameRanges: [{ min: 0, max: 299, score: 18 }, { min: 300, max: 599, score: 58 }, { min: 600, max: 9999, score: 94 }] },
  "sao-2": { ...defaultTraits, investmentSpeed: "medium", averageATMinutes: 55, lateStartRisk: "medium", ceilingGames: 1000 },
  kaguya: { ...defaultTraits, investmentSpeed: "high", initialHitWeight: "heavy", averageATDuration: "long", averageATMinutes: 70, lateStartRisk: "high", ceilingGames: 1000 },
  hokuto: { ...defaultTraits, investmentSpeed: "medium", averageATMinutes: 50, ceilingGames: 1268 }
};

export function resolveMachineCharacteristics(machine = "") {
  const profile = resolveProfile(machine);
  return { ...MACHINE_CHARACTERISTICS.default, ...(MACHINE_CHARACTERISTICS[profile.id] || {}), machineId: profile.id };
}
