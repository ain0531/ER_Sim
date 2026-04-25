import { commandCatalog, commandCategories } from "./commandCatalog";
import type { CaseCommandProfile, Command, CommandId, GameCase, LossCondition, PatientState, ProgressionRule, WinCondition } from "./types";

export { commandCategories };

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
  bleeding: 82,
  oxygenation: 68,
  shock: 70,
  performed: []
};

export const traumaShockCommandProfiles: Record<CommandId, CaseCommandProfile> = {
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
    grade: "ineffective",
    requiredConditions: ["気道不安定", "換気不全", "高度意識障害"],
    effects: ["酸素化を少し改善", "出血制御を遅らせる"],
    stateDelta: { oxygenation: 5, shock: 4 }
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
    requiresCompleted: [{ commandIds: ["iv"], message: "ルート確保が必要" }]
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
    requiresCompleted: [{ commandIds: ["iv"], message: "ルート確保が必要" }]
  },
  pericardiocentesis: {
    grade: "harmful",
    requiredConditions: ["心タンポナーデ疑い"],
    effects: ["適応外では侵襲と遅延"],
    stateDelta: { shock: 9, circulation: -6 },
    requiresCompleted: [{ commandIds: ["iv"], message: "ルート確保が必要" }]
  },
  massiveFluid: {
    grade: "best",
    requiredConditions: ["ルート確保完了", "循環不全"],
    effects: ["循環を一時的に改善", "希釈性凝固障害のリスク"],
    stateDelta: { circulation: 9, shock: -5 },
    requiresCompleted: [{ commandIds: ["iv"], message: "ルート確保が必要" }]
  },
  vasopressor: {
    grade: "harmful",
    requiredConditions: ["ルート確保完了", "輸液反応性が乏しい", "血管拡張性ショック疑い"],
    effects: ["一時的に血圧を上げる", "出血性ショックでは根本対応を遅延"],
    stateDelta: { bpSys: 8, shock: 9, bleeding: 6 },
    requiresCompleted: [{ commandIds: ["iv"], message: "ルート確保が必要" }]
  },
  transfusion: {
    grade: "best",
    requiredConditions: ["ルート確保完了", "FASTで出血確認済み"],
    effects: ["輸血確保に時間を要する", "循環を改善", "ショックを改善"],
    stateDelta: { circulation: 18, shock: -14, bleeding: -6 },
    requiresCompleted: [
      { commandIds: ["iv"], message: "ルート確保が必要" },
      { commandIds: ["fast"], message: "FASTで出血確認が必要" }
    ]
  },
  ivr: {
    grade: "acceptable",
    requiredConditions: ["シース確保済み", "血管内治療の適応"],
    effects: ["出血制御の選択肢", "選択後も他処置を継続可能"],
    stateDelta: { bleeding: -12, shock: -5 },
    requiresCompleted: [{ commandIds: ["sheath"], message: "シース確保が必要" }]
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
    effects: ["出血源の推定", "治療方針の決定を支援"],
    stateDelta: { shock: -4 }
  },
  sedation: {
    grade: "harmful",
    requiredConditions: ["ルート確保完了", "安全確保", "処置時の鎮静が必要"],
    effects: ["意識と循環を悪化させうる"],
    stateDelta: { shock: 7, consciousness: -8 },
    requiresCompleted: [{ commandIds: ["iv"], message: "ルート確保が必要" }]
  },
  analgesia: {
    grade: "acceptable",
    requiredConditions: ["ルート確保完了", "疼痛あり", "循環への影響を監視可能"],
    effects: ["苦痛を軽減", "出血制御は進まない"],
    stateDelta: { consciousness: 1, shock: 1 },
    requiresCompleted: [{ commandIds: ["iv"], message: "ルート確保が必要" }]
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
    requiredConditions: ["低体温または大量出血"],
    effects: ["低体温を抑制", "外傷死の三徴を軽減"],
    stateDelta: { temp: 0.2, shock: -4 }
  },
  thermogardWarming: {
    grade: "acceptable",
    requiredConditions: ["高度低体温", "中心静脈アクセス可能"],
    effects: ["体温を上げる", "留置に時間を要する"],
    stateDelta: { temp: 0.5, shock: -2 }
  },
  thermogardCooling: {
    grade: "harmful",
    requiredConditions: ["体温管理療法の適応"],
    effects: ["本症例では低体温と凝固障害を悪化"],
    stateDelta: { temp: -0.6, shock: 12, bleeding: 8 }
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
    effects: ["胸部損傷を評価", "出血制御は進まない"],
    stateDelta: { shock: 1 }
  }
};

export const commands: Command[] = commandCatalog.map((command) => ({
  ...command,
  ...traumaShockCommandProfiles[command.id]
}));

export const winCondition: WinCondition = {
  requiredCommands: ["iv", "massiveFluid", "warming", "transfusion", "fast", "surgeryContact"],
  stabilization: {
    minBpSys: 75,
    maxShock: 82
  }
};

export const winRequirements: CommandId[] = winCondition.requiredCommands;

export const progression: ProgressionRule = {
  uncontrolledDelta: {
    bleeding: 0.18,
    shock: 0.25,
    circulation: -0.19,
    consciousness: -0.08,
    oxygenation: -0.04
  },
  controlledMultiplier: 0.25
};

export const lossCondition: LossCondition = {
  minBpSys: 55,
  maxShock: 98,
  maxElapsed: 360
};

export const traumaShockCase: GameCase = {
  id: "trauma-hemorrhagic-shock",
  metadata: {
    title: "外傷性出血性ショック",
    locationLabel: "Trauma Bay 01",
    category: "外傷",
    difficulty: "標準",
    summary: "交通外傷後の出血性ショックに対して、初期評価、循環確保、出血制御への接続を行う。",
    emsBrief: "40代男性。交通外傷。車外救出後、顔面蒼白、冷汗あり。現場血圧低値、会話は可能だが反応は鈍い。",
    initialLog: "40代男性、交通外傷。顔面蒼白、冷汗あり。初期評価を開始してください。"
  },
  initialPatient,
  commands,
  winCondition,
  progression,
  lossCondition
};
