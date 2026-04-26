import { commandCatalog } from "./commandCatalog";
import type { CaseCommandProfile, Command, CommandId, GameCase, LossCondition, PatientState, ProgressionRule, WinCondition } from "./types";

const vascularAccessRequirement = { commandIds: ["iv"] as CommandId[], message: "ルート確保が必要" };
const intubationRequirement = { commandIds: ["intubation"] as CommandId[], message: "気管挿管が必要" };

function createDefaultArrestProfiles(): Record<CommandId, CaseCommandProfile> {
  const entries = commandCatalog.map((command) => {
    let profile: CaseCommandProfile = {
      grade: "ineffective",
      requiredConditions: ["心肺停止対応"],
      effects: ["本症例では優先度が低い"],
      stateDelta: { shock: 1 }
    };

    if (["ecgMonitor", "bpCuff", "spo2Monitor", "consciousnessCheck"].includes(command.id)) {
      profile = {
        grade: "acceptable",
        requiredConditions: ["初期評価", "モニタリング"],
        effects: ["状態把握に寄与する"],
        stateDelta: { shock: -1 }
      };
    }

    if (["oxygen", "iv"].includes(command.id)) {
      profile = {
        grade: "acceptable",
        requiredConditions: ["蘇生初期対応"],
        effects: ["蘇生の準備を進める"],
        stateDelta: { oxygenation: 4, circulation: 3, shock: -2 }
      };
    }

    if (command.id === "intubation") {
      profile = {
        grade: "acceptable",
        requiredConditions: ["気道管理", "換気確保"],
        effects: ["気道を確保し換気を安定させる"],
        stateDelta: { airway: 8, oxygenation: 8, breathing: 6, shock: -3 }
      };
    }

    if (command.id === "ventilator") {
      profile = {
        grade: "acceptable",
        requiredConditions: ["気管挿管後"],
        effects: ["換気を補助する"],
        stateDelta: { oxygenation: 6, breathing: 5, shock: -2 },
        requiresCompleted: [intubationRequirement]
      };
    }

    if (command.id === "adrenalineIvBolus") {
      profile = {
        grade: "acceptable",
        requiredConditions: ["ルート確保完了", "心肺停止対応"],
        effects: ["蘇生薬投与を行う"],
        stateDelta: { circulation: 5, shock: -4 },
        requiresCompleted: [vascularAccessRequirement]
      };
    }

    if (["cardioversion", "defibrillation", "adrenalineIm", "plainCt", "chestXray", "fast"].includes(command.id)) {
      profile = {
        grade: "harmful",
        requiredConditions: ["適応がある場合のみ"],
        effects: ["この病態では対応を遅らせる"],
        stateDelta: { shock: 8, circulation: -6, oxygenation: -4 }
      };
    }

    if (["massiveFluid", "transfusion", "centralLine", "sheath", "ecmo", "pericardiocentesis", "thoracentesis", "chestTube"].includes(command.id)) {
      profile = {
        grade: "ineffective",
        requiredConditions: ["適応が限定的"],
        effects: ["この病態では優先度が低い"],
        stateDelta: { shock: 2 }
      };
    }

    if (["sedation", "analgesia", "nerveBlock", "temperatureMeasurement", "warming", "thermogardWarming", "thermogardCooling"].includes(command.id)) {
      profile = {
        grade: "ineffective",
        requiredConditions: ["蘇生後に検討"],
        effects: ["初期蘇生には直結しない"],
        stateDelta: { shock: 1 }
      };
    }

    return [command.id, profile] as const;
  });

  return Object.fromEntries(entries) as Record<CommandId, CaseCommandProfile>;
}

function buildCommands(overrides: Partial<Record<CommandId, CaseCommandProfile>>) {
  const baseProfiles = createDefaultArrestProfiles();
  return commandCatalog.map((command) => ({
    ...command,
    ...baseProfiles[command.id],
    ...overrides[command.id]
  })) as Command[];
}

const arrestProgression: ProgressionRule = {
  uncontrolledDelta: {
    oxygenation: -0.04,
    breathing: -0.04,
    circulation: -0.04,
    shock: 0.04,
    consciousness: -0.03
  },
  controlledMultiplier: 0.2
};

const arrestLossCondition: LossCondition = {
  minBpSys: 45,
  maxShock: 99,
  maxElapsed: 180
};

function createArrestCase(config: {
  id: string;
  title: string;
  locationLabel: string;
  emsMale: string;
  emsFemale: string;
  logMale: string;
  logFemale: string;
  initialPatient: PatientState;
  winCondition: WinCondition;
  inspectionFindings: Partial<Record<CommandId, string>>;
  overrides: Partial<Record<CommandId, CaseCommandProfile>>;
}): GameCase {
  return {
    id: config.id,
    metadata: {
      title: config.title,
      locationLabel: config.locationLabel,
      category: "心肺停止",
      monitorRhythm:
        config.id === "cardiac-arrest-vf"
          ? "vf"
          : config.id === "cardiac-arrest-vt"
            ? "vt"
            : config.id === "cardiac-arrest-asystole"
              ? "asystole"
              : "sinus",
      monitorRhythms: config.id === "cardiac-arrest-pea" ? ["sinus", "bradycardia"] : undefined,
      difficulty: "高",
      summary: "心肺停止患者に対してリズムに応じた蘇生介入を行う。",
      emsBriefs: {
        male: config.emsMale,
        female: config.emsFemale
      },
      initialLogs: {
        male: config.logMale,
        female: config.logFemale
      },
      inspectionFindings: config.inspectionFindings
    },
    initialPatient: config.initialPatient,
    commands: buildCommands(config.overrides),
    winCondition: config.winCondition,
    progression: arrestProgression,
    lossCondition: arrestLossCondition
  };
}

export const ventricularFibrillationCase = createArrestCase({
  id: "cardiac-arrest-vf",
  title: "心室細動",
  locationLabel: "Resuscitation Bay 01",
  emsMale: "60代男性。自宅で突然倒れているところを家族が発見。救急隊到着時に意識・呼吸なし、モニターで心室細動を認める。",
  emsFemale: "60代女性。自宅で突然倒れているところを家族が発見。救急隊到着時に意識・呼吸なし、モニターで心室細動を認める。",
  logMale: "60代男性、心肺停止。救急隊モニターで心室細動。蘇生を開始してください。",
  logFemale: "60代女性、心肺停止。救急隊モニターで心室細動。蘇生を開始してください。",
  initialPatient: {
    elapsed: 0,
    hr: 0,
    bpSys: 50,
    bpDia: 30,
    spo2: 72,
    temp: 36.0,
    gcs: "E1V1M1",
    consciousness: 10,
    airway: 42,
    breathing: 20,
    circulation: 28,
    bleeding: 0,
    oxygenation: 24,
    shock: 88,
    performed: []
  },
  winCondition: {
    requiredCommands: ["ecgMonitor", "defibrillation", "iv", "adrenalineIvBolus", "intubation"],
    stabilization: {
      minBpSys: 80,
      maxShock: 70
    }
  },
  inspectionFindings: {
    ecgMonitor: "心電図で心室細動を認める。",
    consciousnessCheck: "反応はなく、GCS E1V1M1。",
    radialPulseCheck: "橈骨動脈は触知しない。"
  },
  overrides: {
    ecgMonitor: {
      grade: "best",
      requiredConditions: ["蘇生初期評価", "リズム確認"],
      effects: ["心室細動を確認する"],
      stateDelta: { shock: -2 }
    },
    defibrillation: {
      grade: "best",
      requiredConditions: ["心室細動", "除細動適応"],
      effects: ["除細動を行い自己心拍再開を目指す"],
      stateDelta: { circulation: 16, shock: -18, oxygenation: 8 }
    },
    cardioversion: {
      grade: "worst",
      requiredConditions: ["心房頻拍性不整脈"],
      effects: ["適応外で蘇生を妨げる"],
      stateDelta: { shock: 26, circulation: -22, oxygenation: -12 }
    },
    adrenalineIvBolus: {
      grade: "best",
      requiredConditions: ["ルート確保完了", "蘇生薬投与"],
      effects: ["蘇生薬投与を行う"],
      stateDelta: { circulation: 8, shock: -6 },
      requiresCompleted: [vascularAccessRequirement]
    }
  }
});

export const ventricularTachycardiaCase = createArrestCase({
  id: "cardiac-arrest-vt",
  title: "心室性頻拍",
  locationLabel: "Resuscitation Bay 02",
  emsMale: "50代男性。職場で動悸を訴えた直後に意識消失。救急隊到着時に呼吸なし、モニターで幅広い頻拍を認める。",
  emsFemale: "50代女性。職場で動悸を訴えた直後に意識消失。救急隊到着時に呼吸なし、モニターで幅広い頻拍を認める。",
  logMale: "50代男性、心肺停止。救急隊モニターで心室性頻拍。蘇生を開始してください。",
  logFemale: "50代女性、心肺停止。救急隊モニターで心室性頻拍。蘇生を開始してください。",
  initialPatient: {
    elapsed: 0,
    hr: 0,
    bpSys: 54,
    bpDia: 32,
    spo2: 74,
    temp: 36.1,
    gcs: "E1V1M1",
    consciousness: 12,
    airway: 45,
    breathing: 22,
    circulation: 30,
    bleeding: 0,
    oxygenation: 26,
    shock: 86,
    performed: []
  },
  winCondition: {
    requiredCommands: ["ecgMonitor", "defibrillation", "iv", "adrenalineIvBolus"],
    stabilization: {
      minBpSys: 80,
      maxShock: 70
    }
  },
  inspectionFindings: {
    ecgMonitor: "心電図で幅広い単形性心室頻拍を認める。",
    consciousnessCheck: "反応はなく、GCS E1V1M1。",
    radialPulseCheck: "脈拍は触知しない。"
  },
  overrides: {
    ecgMonitor: {
      grade: "best",
      requiredConditions: ["蘇生初期評価", "リズム確認"],
      effects: ["心室性頻拍を確認する"],
      stateDelta: { shock: -2 }
    },
    defibrillation: {
      grade: "best",
      requiredConditions: ["脈なし心室性頻拍", "除細動適応"],
      effects: ["除細動を行う"],
      stateDelta: { circulation: 14, shock: -16, oxygenation: 8 }
    },
    cardioversion: {
      grade: "harmful",
      requiredConditions: ["脈あり心室頻拍"],
      effects: ["脈なしVTでは優先が低く、蘇生を遅らせる"],
      stateDelta: { shock: 12, circulation: -10 }
    },
    adrenalineIvBolus: {
      grade: "best",
      requiredConditions: ["ルート確保完了", "蘇生薬投与"],
      effects: ["蘇生薬投与を行う"],
      stateDelta: { circulation: 8, shock: -6 },
      requiresCompleted: [vascularAccessRequirement]
    }
  }
});

export const asystoleCase = createArrestCase({
  id: "cardiac-arrest-asystole",
  title: "心静止",
  locationLabel: "Resuscitation Bay 03",
  emsMale: "70代男性。自宅で倒れており、救急隊到着時から反応・呼吸なし。モニターで心静止を認める。",
  emsFemale: "70代女性。自宅で倒れており、救急隊到着時から反応・呼吸なし。モニターで心静止を認める。",
  logMale: "70代男性、心肺停止。救急隊モニターで心静止。蘇生を開始してください。",
  logFemale: "70代女性、心肺停止。救急隊モニターで心静止。蘇生を開始してください。",
  initialPatient: {
    elapsed: 0,
    hr: 0,
    bpSys: 48,
    bpDia: 28,
    spo2: 70,
    temp: 35.9,
    gcs: "E1V1M1",
    consciousness: 8,
    airway: 40,
    breathing: 18,
    circulation: 26,
    bleeding: 0,
    oxygenation: 22,
    shock: 90,
    performed: []
  },
  winCondition: {
    requiredCommands: ["ecgMonitor", "iv", "adrenalineIvBolus", "intubation"],
    stabilization: {
      minBpSys: 75,
      maxShock: 72
    }
  },
  inspectionFindings: {
    ecgMonitor: "心電図で心静止を認める。",
    consciousnessCheck: "反応はなく、GCS E1V1M1。",
    radialPulseCheck: "脈拍は触知しない。"
  },
  overrides: {
    ecgMonitor: {
      grade: "best",
      requiredConditions: ["蘇生初期評価", "リズム確認"],
      effects: ["心静止を確認する"],
      stateDelta: { shock: -2 }
    },
    defibrillation: {
      grade: "worst",
      requiredConditions: ["心室細動または脈なしVT"],
      effects: ["心静止に対する除細動は禁忌に近い"],
      stateDelta: { shock: 24, circulation: -20, oxygenation: -10 }
    },
    cardioversion: {
      grade: "worst",
      requiredConditions: ["同期通電の適応"],
      effects: ["心静止では無効かつ有害"],
      stateDelta: { shock: 24, circulation: -20, oxygenation: -10 }
    },
    adrenalineIvBolus: {
      grade: "best",
      requiredConditions: ["ルート確保完了", "蘇生薬投与"],
      effects: ["蘇生薬投与を行う"],
      stateDelta: { circulation: 9, shock: -6 },
      requiresCompleted: [vascularAccessRequirement]
    }
  }
});

export const peaCase = createArrestCase({
  id: "cardiac-arrest-pea",
  title: "PEA",
  locationLabel: "Resuscitation Bay 04",
  emsMale: "50代男性。突然意識消失し、救急隊到着時に呼吸なし。モニター上は電気活動があるが脈拍を触知しない。",
  emsFemale: "50代女性。突然意識消失し、救急隊到着時に呼吸なし。モニター上は電気活動があるが脈拍を触知しない。",
  logMale: "50代男性、心肺停止。PEA が疑われます。蘇生を開始してください。",
  logFemale: "50代女性、心肺停止。PEA が疑われます。蘇生を開始してください。",
  initialPatient: {
    elapsed: 0,
    hr: 72,
    bpSys: 52,
    bpDia: 30,
    spo2: 73,
    temp: 36.2,
    gcs: "E1V1M1",
    consciousness: 10,
    airway: 42,
    breathing: 20,
    circulation: 27,
    bleeding: 0,
    oxygenation: 24,
    shock: 89,
    performed: []
  },
  winCondition: {
    requiredCommands: ["ecgMonitor", "bpCuff", "iv", "adrenalineIvBolus", "intubation"],
    stabilization: {
      minBpSys: 75,
      maxShock: 72
    }
  },
  inspectionFindings: {
    ecgMonitor: "電気活動はあるが、脈拍触知を伴わない。",
    bpCuff: "血圧は測定不能である。",
    consciousnessCheck: "反応はなく、GCS E1V1M1。",
    radialPulseCheck: "橈骨動脈は触知しない。"
  },
  overrides: {
    ecgMonitor: {
      grade: "best",
      requiredConditions: ["蘇生初期評価", "リズム確認"],
      effects: ["PEAを疑う所見を得る"],
      stateDelta: { shock: -2 }
    },
    bpCuff: {
      grade: "acceptable",
      requiredConditions: ["循環評価"],
      effects: ["血圧が保てていないことを確認する"],
      stateDelta: { shock: -1 }
    },
    defibrillation: {
      grade: "worst",
      requiredConditions: ["心室細動または脈なしVT"],
      effects: ["PEAに対する除細動は禁忌に近い"],
      stateDelta: { shock: 24, circulation: -20, oxygenation: -10 }
    },
    cardioversion: {
      grade: "worst",
      requiredConditions: ["同期通電の適応"],
      effects: ["PEAでは無効かつ有害"],
      stateDelta: { shock: 24, circulation: -20, oxygenation: -10 }
    },
    adrenalineIvBolus: {
      grade: "best",
      requiredConditions: ["ルート確保完了", "蘇生薬投与"],
      effects: ["蘇生薬投与を行う"],
      stateDelta: { circulation: 9, shock: -6 },
      requiresCompleted: [vascularAccessRequirement]
    }
  }
});
