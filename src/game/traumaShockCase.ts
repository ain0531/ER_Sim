import { commandCatalog, commandCategories } from "./commandCatalog";
import type { CaseCommandProfile, Command, CommandId, GameCase, LossCondition, PatientState, ProgressionRule, WinCondition } from "./types";

export { commandCategories };

const vascularAccessRequirement = { commandIds: [], anyOfCommandIds: ["iv", "sheath"] as CommandId[], message: "ルート確保またはシース確保が必要" };

export const initialPatient: PatientState = {
  elapsed: 0,
  hr: 132,
  bpSys: 82,
  bpDia: 48,
  spo2: 94,
  temp: 35.8,
  gcs: "E3V4M6",
  consciousness: 74,
  airway: 84,
  breathing: 78,
  circulation: 34,
  bleeding: 72,
  oxygenation: 68,
  shock: 62,
  performed: []
};

export const traumaShockCommandProfiles: Record<CommandId, CaseCommandProfile> = {
  airwayCheck: {
    grade: "acceptable",
    requiredConditions: ["A評価", "気道開通の確認"],
    effects: ["気道評価を進める", "Primary Surveyを構成する"],
    stateDelta: { bleeding: -2, shock: -2 }
  },
  nasalAirway: {
    grade: "ineffective",
    requiredConditions: ["自発呼吸あり", "鼻出血・頭蓋底骨折疑いなし"],
    effects: ["気道開通を補助", "本症例では主問題に影響しにくい"],
    stateDelta: { oxygenation: 2, shock: 1 }
  },
  oralAirway: {
    grade: "ineffective",
    requiredConditions: ["意識低下", "咽頭反射が弱い"],
    effects: ["気道閉塞を予防", "本症例では優先度が低い"],
    stateDelta: { oxygenation: 2, shock: 1 }
  },
  intubation: {
    grade: "harmful",
    requiredConditions: ["大量出血診断後", "気道保護", "手術前管理"],
    effects: ["診断前の挿管で出血制御を遅らせる", "有害手として扱う"],
    stateDelta: { oxygenation: 3, shock: 8, circulation: -4 },
    conditionalProfile: {
      requiresAnyCompleted: [],
      requiresDiagnosisId: "massiveHemorrhage",
      grade: "best",
      effects: ["気道を保護し手術前管理を進める", "大量出血診断後の最善手"],
      stateDelta: { oxygenation: 8, shock: -2, circulation: 2 }
    }
  },
  oxygen: {
    grade: "acceptable",
    requiredConditions: ["低酸素またはショック疑い"],
    effects: ["酸素化を改善", "根本治療ではない"],
    stateDelta: { oxygenation: 14, breathing: 5 }
  },
  spo2Monitor: {
    grade: "acceptable",
    requiredConditions: ["呼吸状態の継続評価が必要"],
    effects: ["SpO2を表示", "酸素化の変化を追跡可能"],
    stateDelta: { shock: -1 }
  },
  niv: {
    grade: "harmful",
    requiredConditions: ["意識清明", "循環が比較的安定", "気道防御可能"],
    effects: ["本症例では循環悪化と対応遅延"],
    stateDelta: { oxygenation: 4, circulation: -7, shock: 8 }
  },
  ventilator: {
    grade: "ineffective",
    requiredConditions: ["気管挿管後"],
    effects: ["換気を補助", "挿管なしでは完遂不可に近い"],
    stateDelta: { oxygenation: 3, shock: 3 }
  },
  thoracentesis: {
    grade: "harmful",
    requiredConditions: ["緊張性気胸疑い"],
    effects: ["適応外では侵襲と遅延"],
    stateDelta: { bleeding: 8, shock: 9 }
  },
  chestTube: {
    grade: "harmful",
    requiredConditions: ["血胸・気胸の所見"],
    effects: ["適応外では出血と遅延"],
    stateDelta: { bleeding: 8, shock: 9 }
  },
  rrObservation: {
    grade: "acceptable",
    requiredConditions: ["B評価", "呼吸数の観察"],
    effects: ["呼吸状態を評価する", "Primary Surveyを構成する"],
    stateDelta: { shock: -1 }
  },
  neckVeinCheck: {
    grade: "acceptable",
    requiredConditions: ["B評価", "頸静脈所見の確認"],
    effects: ["循環・呼吸評価を補強", "Primary Surveyを構成する"],
    stateDelta: { bleeding: -2, shock: -2 }
  },
  subcutaneousEmphysemaCheck: {
    grade: "acceptable",
    requiredConditions: ["B評価", "胸部外傷所見の確認"],
    effects: ["胸部損傷評価を補強", "Primary Surveyを構成する"],
    stateDelta: { bleeding: -2, shock: -2 }
  },
  trachealDeviationCheck: {
    grade: "acceptable",
    requiredConditions: ["B評価", "気管偏位の確認"],
    effects: ["緊張性気胸などの鑑別に寄与", "Primary Surveyを構成する"],
    stateDelta: { bleeding: -2, shock: -2 }
  },
  chestPalpation: {
    grade: "acceptable",
    requiredConditions: ["B評価", "前胸部触診"],
    effects: ["外傷所見を確認", "Primary Surveyを構成する"],
    stateDelta: { bleeding: -2, shock: -2 }
  },
  chestAuscultation: {
    grade: "acceptable",
    requiredConditions: ["C評価", "呼吸音の確認"],
    effects: ["呼吸音を両側で確認する", "Primary Surveyを構成する"],
    stateDelta: { shock: -1 }
  },
  abdominalExam: {
    grade: "best",
    requiredConditions: ["C評価", "腹部の視診・触診"],
    effects: ["腹部膨満や圧痛を確認", "Primary Surveyを構成する"],
    stateDelta: { bleeding: -2, shock: -2 }
  },
  bpCuff: {
    grade: "acceptable",
    requiredConditions: ["循環評価が必要"],
    effects: ["血圧を表示", "ショック進行を追跡可能"],
    stateDelta: { shock: -1 }
  },
  ecgMonitor: {
    grade: "acceptable",
    requiredConditions: ["循環評価が必要", "不整脈監視が必要"],
    effects: ["心拍数と心電図波形を表示", "循環変化を追跡可能"],
    stateDelta: { shock: -1 }
  },
  radialPulseCheck: {
    grade: "acceptable",
    requiredConditions: ["C評価", "末梢循環の確認"],
    effects: ["循環評価を補強", "Primary Surveyを構成する"],
    stateDelta: { bleeding: -2, shock: -2 }
  },
  iv: {
    grade: "best",
    requiredConditions: ["ショック疑い", "薬剤・輸液投与の必要性"],
    effects: ["循環管理の準備", "大量輸液へ接続"],
    stateDelta: { circulation: 6 }
  },
  centralLine: {
    grade: "ineffective",
    requiredConditions: ["末梢路困難", "中心静脈投与が必要"],
    effects: ["投与経路を確保", "初期対応では時間を消費"],
    stateDelta: { circulation: 4, shock: 4 },
    requiresCompleted: [vascularAccessRequirement]
  },
  sheath: {
    grade: "acceptable",
    requiredConditions: ["IVRや血管内治療の見込み"],
    effects: ["血管内治療への準備", "出血制御の選択肢を増やす"],
    stateDelta: { circulation: 3, shock: -2 }
  },
  ecmo: {
    grade: "harmful",
    requiredConditions: ["可逆性の重症心肺不全", "抗凝固を許容"],
    effects: ["本症例では出血と遅延を悪化"],
    stateDelta: { bleeding: 20, shock: 20, circulation: -12 },
    requiresCompleted: [vascularAccessRequirement]
  },
  pericardiocentesis: {
    grade: "harmful",
    requiredConditions: ["心タンポナーデ疑い"],
    effects: ["適応外では侵襲と遅延"],
    stateDelta: { shock: 9, circulation: -6 },
    requiresCompleted: [vascularAccessRequirement]
  },
  massiveFluid: {
    grade: "best",
    requiredConditions: ["ルート確保完了", "バイタル確認済み", "循環不全"],
    effects: ["循環を一時的に改善", "出血を軽度抑制", "シース確保後は止血効果1.5倍", "希釈性凝固障害のリスク"],
    stateDelta: { bpSys: 13.5, circulation: 13.5, shock: -7.5, bleeding: -6 },
    requiresCompleted: [
      vascularAccessRequirement,
      { commandIds: ["ecgMonitor", "bpCuff"], message: "心電図・血圧計の装着が必要" }
    ],
    bonusDelta: { requiresCompleted: ["sheath"], delta: { bpSys: 6.75, bleeding: -3 } }
  },
  cardioversion: {
    grade: "worst",
    requiredConditions: ["心房細動または心房粗動", "同期通電の適応"],
    effects: ["適応外通電で心停止に至る", "禁忌として最悪手に分類"],
    stateDelta: { shock: 70, circulation: -70, oxygenation: -55, consciousness: -45 }
  },
  defibrillation: {
    grade: "worst",
    requiredConditions: ["心室頻拍または心室細動", "除細動の適応"],
    effects: ["適応外通電で心停止に至る", "禁忌として最悪手に分類"],
    stateDelta: { shock: 70, circulation: -70, oxygenation: -55, consciousness: -45 }
  },
  adrenalineIvBolus: {
    grade: "worst",
    requiredConditions: ["ルート確保完了", "心停止またはアナフィラキシー等の適応"],
    effects: ["過度のカテコラミン負荷で重篤な循環悪化を招く", "禁忌として最悪手に分類"],
    stateDelta: { shock: 24, bleeding: 12, circulation: -16, oxygenation: -10, consciousness: -10 },
    requiresCompleted: [vascularAccessRequirement]
  },
  adrenalineIm: {
    grade: "ineffective",
    requiredConditions: ["アナフィラキシーの適応"],
    effects: ["本症例では主病態に寄与しない", "決定的な改善は得られない"],
    stateDelta: { shock: 2 }
  },
  vasopressor: {
    grade: "harmful",
    requiredConditions: ["ルート確保完了", "輸液反応性が乏しい", "血管拡張性ショック疑い"],
    effects: ["一時的に血圧を上げる", "出血性ショックでは根本対応を遅延"],
    stateDelta: { bpSys: 12, shock: 7, bleeding: 5 },
    requiresCompleted: [vascularAccessRequirement],
    conditionalProfile: {
      requiresAnyCompleted: ["massiveFluid", "transfusion"],
      grade: "acceptable",
      effects: ["血圧を一時的に維持", "大量輸液・輸血後の補助として許容", "根本的な出血制御ではない"],
      stateDelta: { bpSys: 18, shock: 2, bleeding: 2 }
    }
  },
  atropineIvBolus: {
    grade: "harmful",
    requiredConditions: ["ルート確保完了", "症候性徐脈の適応"],
    effects: ["適応外投与で循環評価を乱す", "本症例では有害手"],
    stateDelta: { shock: 7, circulation: -2 },
    requiresCompleted: [vascularAccessRequirement]
  },
  transfusion: {
    grade: "best",
    requiredConditions: ["ルート確保完了", "バイタル確認済み", "FASTで出血確認済み"],
    effects: ["循環を改善", "ショックを改善", "出血を中等度抑制", "シース確保後は止血効果1.5倍"],
    stateDelta: { bpSys: 27, circulation: 27, shock: -21, bleeding: -12 },
    requiresCompleted: [
      vascularAccessRequirement,
      { commandIds: ["ecgMonitor", "bpCuff"], message: "心電図・血圧計の装着が必要" },
      { commandIds: ["fast"], message: "FASTで出血確認が必要" }
    ],
    bonusDelta: { requiresCompleted: ["sheath"], delta: { bpSys: 13.5, bleeding: -6 } }
  },
  ivr: {
    grade: "harmful",
    requiredConditions: ["大量出血診断後", "シース確保済み", "血管内治療の適応"],
    effects: ["理由なくIVRを進める", "診断前は有害手として扱う"],
    stateDelta: { shock: 6, circulation: -4 },
    requiresCompleted: [{ commandIds: ["sheath"], message: "シース確保が必要" }],
    conditionalProfile: {
      requiresAnyCompleted: [],
      requiresDiagnosisId: "massiveHemorrhage",
      grade: "acceptable",
      effects: ["出血を最大限抑制", "選択後も他処置を継続可能"],
      stateDelta: { bpSys: 12, bleeding: -16, shock: -5 }
    }
  },
  surgeryContact: {
    grade: "best",
    requiredConditions: ["救命条件の8割以上を達成"],
    effects: ["根本治療へ接続", "出血制御の準備を進める"],
    stateDelta: { shock: -8 },
    requiresWinProgress: { minRatio: 0.8, excludeSelf: true, message: "救命条件8割以上が必要" }
  },
  fast: {
    grade: "best",
    requiredConditions: ["外傷初期評価", "腹腔内出血の評価"],
    effects: ["出血源の推定", "治療方針の決定を支援", "Primary Surveyを構成する"],
    stateDelta: { bleeding: -2, shock: -2 }
  },
  consciousnessCheck: {
    grade: "acceptable",
    requiredConditions: ["D評価", "意識レベルの確認"],
    effects: ["神経学的評価を補強", "Primary Surveyを構成する"],
    stateDelta: { bleeding: -2, shock: -2 }
  },
  sedation: {
    grade: "harmful",
    requiredConditions: ["ルート確保完了", "安全確保", "処置時の鎮静が必要"],
    effects: ["意識と循環を悪化させうる"],
    stateDelta: { shock: 7, consciousness: -8 },
    requiresCompleted: [vascularAccessRequirement]
  },
  analgesia: {
    grade: "acceptable",
    requiredConditions: ["ルート確保完了", "疼痛あり", "循環への影響を監視可能"],
    effects: ["苦痛を軽減", "出血制御は進まない"],
    stateDelta: { consciousness: 1, shock: 1 },
    requiresCompleted: [vascularAccessRequirement]
  },
  nerveBlock: {
    grade: "ineffective",
    requiredConditions: ["局所疼痛", "凝固異常がない"],
    effects: ["疼痛を軽減", "初期救命には寄与しにくい"],
    stateDelta: { shock: 3 }
  },
  temperatureMeasurement: {
    grade: "acceptable",
    requiredConditions: ["初期評価", "低体温リスクの評価"],
    effects: ["体温を表示", "低体温の進行を追跡可能"],
    stateDelta: { shock: -1 }
  },
  warming: {
    grade: "best",
    requiredConditions: ["体温測定済み", "低体温または大量出血"],
    effects: ["低体温を抑制", "外傷死の三徴を軽減"],
    stateDelta: { temp: 0.2, shock: -4 },
    requiresCompleted: [{ commandIds: ["temperatureMeasurement"], message: "体温測定が必要" }]
  },
  thermogardWarming: {
    grade: "acceptable",
    requiredConditions: ["体温測定済み", "高度低体温", "中心静脈アクセス可能"],
    effects: ["体温を上げる", "留置に時間を要する"],
    stateDelta: { temp: 0.5, shock: -2 },
    requiresCompleted: [{ commandIds: ["temperatureMeasurement"], message: "体温測定が必要" }]
  },
  thermogardCooling: {
    grade: "harmful",
    requiredConditions: ["体温測定済み", "体温管理療法の適応"],
    effects: ["本症例では低体温と凝固障害を悪化"],
    stateDelta: { temp: -0.6, shock: 12, bleeding: 8 },
    requiresCompleted: [{ commandIds: ["temperatureMeasurement"], message: "体温測定が必要" }]
  },
  plainCt: {
    grade: "harmful",
    requiredConditions: ["循環が安定", "搬送可能"],
    effects: ["画像診断を追加", "不安定外傷では出血制御を遅らせる"],
    stateDelta: { bleeding: 13, shock: 12, circulation: -9 }
  },
  chestXray: {
    grade: "acceptable",
    requiredConditions: ["外傷初期評価", "胸部外傷の評価"],
    effects: ["胸部損傷を評価", "出血制御は進まない", "Primary Surveyを構成する"],
    stateDelta: { bleeding: -2, shock: -2 }
  }
};

export const commands: Command[] = commandCatalog.map((command) => ({
  ...command,
  ...traumaShockCommandProfiles[command.id]
}));

export const winCondition: WinCondition = {
  requiredCommands: ["iv", "warming", "fast"],
  diagnosisRule: {
    id: "massiveHemorrhage",
    shockVital: {
      maxBpSys: 90,
      minHr: 120
    },
    requiresCompleted: ["fast"],
    additionalRequiredCommands: ["massiveFluid", "transfusion", "intubation", "surgeryContact"]
  },
  stabilization: {
    minBpSys: 90,
    maxShock: 60,
    primarySurveyCommands: [
      "airwayCheck",
      "neckVeinCheck",
      "subcutaneousEmphysemaCheck",
      "trachealDeviationCheck",
      "chestPalpation",
      "abdominalExam",
      "radialPulseCheck",
      "consciousnessCheck",
      "fast",
      "chestXray"
    ]
  }
};

export const winRequirements: CommandId[] = winCondition.requiredCommands;

export const progression: ProgressionRule = {
  uncontrolledDelta: {
    bleeding: 0.06,
    shock: 0.08,
    circulation: -0.06,
    consciousness: -0.04,
    oxygenation: -0.02
  },
  controlledMultiplier: 0.25,
  suppressedByCompleted: [{ stateKey: "bleeding", commandIds: ["ivr"] }]
};

export const lossCondition: LossCondition = {
  minBpSys: 55,
  maxShock: 98,
  maxElapsed: 180
};

export const traumaShockCase: GameCase = {
  id: "trauma-hemorrhagic-shock",
  metadata: {
    title: "外傷性出血性ショック",
    locationLabel: "Trauma Bay 01",
    category: "外傷",
    tags: ["外傷"],
    difficulty: "標準",
    summary: "交通外傷後の出血性ショックに対して、初期評価、循環確保、出血制御への接続を行う。",
    emsBriefs: {
      male: "40代男性。交通外傷。車外救出後、顔面蒼白、冷汗あり。現場血圧低値、会話は可能だが反応は鈍い。",
      female: "40代女性。交通外傷。車外救出後、顔面蒼白、冷汗あり。現場血圧低値、会話は可能だが反応は鈍い。"
    },
    initialLogs: {
      male: "40代男性、交通外傷。顔面蒼白、冷汗あり。初期評価を開始してください。",
      female: "40代女性、交通外傷。顔面蒼白、冷汗あり。初期評価を開始してください。"
    },
    inspectionFindings: {
      airwayCheck: "気道は開通している。",
      neckVeinCheck: "頸静脈怒張は明らかでない。",
      subcutaneousEmphysemaCheck: "皮下気腫は触れない。",
      trachealDeviationCheck: "気管偏位は認めない。",
      chestPalpation: "前胸部に明らかな不安定性はない。",
      chestAuscultation: "両側の呼吸音は清明。心音は正常で雑音なし。",
      abdominalExam: "腹部は膨満し、圧痛を認める。",
      radialPulseCheck: "橈骨動脈は微弱に触知する。",
      consciousnessCheck: "呼びかけで開眼し、受け答えはやや緩慢。",
      fast: "FASTで腹腔内液体貯留を認める。",
      chestXray: "胸部X線で明らかな緊張性気胸所見はない。"
    }
  },
  initialPatient,
  commands,
  winCondition,
  progression,
  lossCondition
};
