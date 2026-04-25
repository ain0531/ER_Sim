import { commandCatalog, commandCategories } from "./commandCatalog";
import { traumaShockCommandProfiles } from "./traumaShockCase";
import type { CaseCommandProfile, Command, CommandId, GameCase, LossCondition, PatientState, ProgressionRule, WinCondition } from "./types";

export { commandCategories };

export const initialPatient: PatientState = {
  elapsed: 0,
  hr: 126,
  bpSys: 86,
  bpDia: 52,
  spo2: 86,
  temp: 36.4,
  gcs: "E4V5M6",
  consciousness: 82,
  airway: 88,
  breathing: 28,
  circulation: 42,
  bleeding: 8,
  oxygenation: 30,
  shock: 78,
  performed: []
};

export const tensionPneumothoraxCommandProfiles: Record<CommandId, CaseCommandProfile> = {
  ...traumaShockCommandProfiles,
  airwayCheck: {
    grade: "acceptable",
    requiredConditions: ["A評価", "気道開通の確認"],
    effects: ["気道評価を進める"],
    stateDelta: { shock: -1 }
  },
  neckVeinCheck: {
    grade: "best",
    requiredConditions: ["B評価", "頸静脈所見の確認"],
    effects: ["緊張性気胸を示唆する身体所見を確認"],
    stateDelta: { shock: -2 }
  },
  subcutaneousEmphysemaCheck: {
    grade: "acceptable",
    requiredConditions: ["B評価", "胸部外傷所見の確認"],
    effects: ["胸部損傷評価を補強"],
    stateDelta: { shock: -1 }
  },
  trachealDeviationCheck: {
    grade: "best",
    requiredConditions: ["B評価", "気管偏位の確認"],
    effects: ["緊張性気胸を示唆する重要所見を確認"],
    stateDelta: { shock: -2 }
  },
  chestPalpation: {
    grade: "acceptable",
    requiredConditions: ["B評価", "前胸部触診"],
    effects: ["胸部所見を確認"],
    stateDelta: { shock: -1 }
  },
  radialPulseCheck: {
    grade: "acceptable",
    requiredConditions: ["C評価", "末梢循環の確認"],
    effects: ["ショック評価を補強"],
    stateDelta: { shock: -1 }
  },
  consciousnessCheck: {
    grade: "acceptable",
    requiredConditions: ["D評価", "意識レベルの確認"],
    effects: ["神経学的評価を補強"],
    stateDelta: { shock: -1 }
  },
  oxygen: {
    grade: "acceptable",
    requiredConditions: ["低酸素", "呼吸不全"],
    effects: ["酸素化を一時的に改善", "緊張性気胸の根本治療ではない"],
    stateDelta: { oxygenation: 10, breathing: 4 }
  },
  niv: {
    grade: "harmful",
    requiredConditions: ["循環が安定", "気胸が否定的"],
    effects: ["陽圧で緊張性気胸を悪化させる"],
    stateDelta: { oxygenation: -8, breathing: -10, circulation: -12, shock: 15 }
  },
  ventilator: {
    grade: "harmful",
    requiredConditions: ["気管挿管後", "緊張性気胸の解除後"],
    effects: ["減圧前の陽圧換気で循環を悪化させる"],
    stateDelta: { oxygenation: -5, breathing: -8, circulation: -10, shock: 12 },
    requiresCompleted: [{ commandIds: ["intubation"], message: "気管挿管が必要" }]
  },
  thoracentesis: {
    grade: "best",
    requiredConditions: ["緊張性気胸疑い", "呼吸循環不全"],
    effects: ["胸腔内圧を解除", "酸素化と循環を改善"],
    stateDelta: { oxygenation: 26, breathing: 24, circulation: 18, shock: -28 }
  },
  chestTube: {
    grade: "best",
    requiredConditions: ["気胸または緊張性気胸", "再膨張維持が必要"],
    effects: ["脱気を維持", "再緊張化を予防"],
    stateDelta: { oxygenation: 18, breathing: 20, circulation: 12, shock: -18 },
    requiresCompleted: [{ commandIds: ["thoracentesis"], message: "胸腔穿刺が必要" }]
  },
  massiveFluid: {
    grade: "ineffective",
    requiredConditions: ["循環不全", "ルート確保完了", "バイタル確認済み"],
    effects: ["循環改善は限定的", "根本治療を遅らせる"],
    stateDelta: { circulation: 3, shock: 3 },
    requiresCompleted: [
      { commandIds: ["iv"], message: "ルート確保が必要" },
      { commandIds: ["ecgMonitor", "bpCuff"], message: "心電図・血圧計の装着が必要" }
    ]
  },
  transfusion: {
    grade: "ineffective",
    requiredConditions: ["大量出血が疑われる", "バイタル確認済み"],
    effects: ["この症例では主病態に直結しない"],
    stateDelta: { shock: 2 },
    requiresCompleted: [
      { commandIds: ["iv"], message: "ルート確保が必要" },
      { commandIds: ["ecgMonitor", "bpCuff"], message: "心電図・血圧計の装着が必要" }
    ]
  },
  fast: {
    grade: "ineffective",
    requiredConditions: ["腹腔内出血評価"],
    effects: ["緊張性気胸の解除を遅らせる"],
    stateDelta: { shock: 3 }
  },
  plainCt: {
    grade: "harmful",
    requiredConditions: ["循環・呼吸が安定", "搬送可能"],
    effects: ["不安定患者の減圧を遅らせる"],
    stateDelta: { oxygenation: -8, breathing: -8, circulation: -6, shock: 10 }
  },
  chestXray: {
    grade: "acceptable",
    requiredConditions: ["減圧後または比較的安定", "胸部評価"],
    effects: ["気胸を評価", "不安定時は治療を優先"],
    stateDelta: { shock: 1 }
  },
  surgeryContact: {
    grade: "acceptable",
    requiredConditions: ["胸腔ドレーン後も改善不良", "外傷外科対応が必要"],
    effects: ["追加治療へ接続", "初期救命の決定打ではない"],
    stateDelta: { shock: -2 }
  },
  warming: {
    grade: "ineffective",
    requiredConditions: ["体温測定済み", "低体温"],
    effects: ["本症例の主病態には影響しにくい"],
    stateDelta: { shock: 1 },
    requiresCompleted: [{ commandIds: ["temperatureMeasurement"], message: "体温測定が必要" }]
  }
};

export const commands: Command[] = commandCatalog.map((command) => ({
  ...command,
  ...tensionPneumothoraxCommandProfiles[command.id]
}));

export const winCondition: WinCondition = {
  requiredCommands: ["oxygen", "thoracentesis", "chestTube"],
  stabilization: {
    minBpSys: 75,
    maxShock: 70
  }
};

export const progression: ProgressionRule = {
  uncontrolledDelta: {
    oxygenation: -0.24,
    breathing: -0.22,
    circulation: -0.2,
    shock: 0.28,
    consciousness: -0.08
  },
  controlledMultiplier: 0.2
};

export const lossCondition: LossCondition = {
  minBpSys: 55,
  maxShock: 98,
  maxElapsed: 300
};

export const tensionPneumothoraxCase: GameCase = {
  id: "tension-pneumothorax",
  metadata: {
    title: "緊張性気胸",
    locationLabel: "Trauma Bay 02",
    category: "外傷",
    difficulty: "標準",
    summary: "胸部外傷後の緊張性気胸に対して、低酸素と閉塞性ショックを迅速に解除する。",
    emsBriefs: {
      male: "30代男性。胸部外傷後から呼吸苦が増悪。右胸部呼吸音低下、頸静脈怒張、血圧低下あり。",
      female: "30代女性。胸部外傷後から呼吸苦が増悪。右胸部呼吸音低下、頸静脈怒張、血圧低下あり。"
    },
    initialLogs: {
      male: "30代男性、胸部外傷。呼吸苦と低酸素が進行しています。緊張性気胸を念頭に初期対応してください。",
      female: "30代女性、胸部外傷。呼吸苦と低酸素が進行しています。緊張性気胸を念頭に初期対応してください。"
    },
    inspectionFindings: {
      airwayCheck: "気道は開通している。",
      neckVeinCheck: "頸静脈怒張を認める。",
      subcutaneousEmphysemaCheck: "右前胸部から頸部に皮下気腫を触れる。",
      trachealDeviationCheck: "気管は左偏位している。",
      chestPalpation: "右前胸部に圧痛と握雪感を認める。",
      radialPulseCheck: "橈骨動脈は微弱である。",
      consciousnessCheck: "不穏だが呼名に応答する。",
      chestXray: "右肺虚脱と縦隔偏位を認める。",
      fast: "FASTで腹腔内出血を示す所見は乏しい。"
    }
  },
  initialPatient,
  commands,
  winCondition,
  progression,
  lossCondition
};
