export type CommandId =
  | "nasalAirway"
  | "oralAirway"
  | "intubation"
  | "oxygen"
  | "spo2Monitor"
  | "niv"
  | "ventilator"
  | "thoracentesis"
  | "chestTube"
  | "bpCuff"
  | "ecgMonitor"
  | "iv"
  | "centralLine"
  | "sheath"
  | "ecmo"
  | "pericardiocentesis"
  | "massiveFluid"
  | "vasopressor"
  | "transfusion"
  | "ivr"
  | "surgeryContact"
  | "fast"
  | "sedation"
  | "analgesia"
  | "nerveBlock"
  | "temperatureMeasurement"
  | "warming"
  | "thermogardWarming"
  | "thermogardCooling"
  | "plainCt"
  | "chestXray";

export type GameStatus = "ready" | "running" | "won" | "lost";
export type CommandGrade = "best" | "acceptable" | "ineffective" | "harmful";
export type CommandCategoryId = "A" | "B" | "C" | "D" | "E" | "X";

export type PatientState = {
  elapsed: number;
  hr: number;
  bpSys: number;
  bpDia: number;
  spo2: number;
  temp: number;
  gcs: string;
  consciousness: number;
  airway: number;
  breathing: number;
  circulation: number;
  bleeding: number;
  oxygenation: number;
  shock: number;
  performed: CommandId[];
};

export type BaseCommand = {
  id: CommandId;
  category: CommandCategoryId;
  label: string;
  duration: number;
  blocksCategory?: boolean;
};

export type CaseCommandProfile = {
  grade: CommandGrade;
  requiredConditions: string[];
  effects: string[];
  stateDelta?: Partial<Record<keyof Omit<PatientState, "performed" | "gcs">, number>>;
  requiresCompleted?: {
    commandIds: CommandId[];
    message: string;
  }[];
  requiresWinProgress?: {
    minRatio: number;
    excludeSelf?: boolean;
    message: string;
  };
};

export type Command = BaseCommand & CaseCommandProfile;

export type LogEntry = {
  time: number;
  message: string;
  tone: "neutral" | "good" | "warn" | "bad";
};

export type CompletionTimes = Partial<Record<CommandId, number>>;

export type WinCondition = {
  requiredCommands: CommandId[];
  stabilization: {
    minBpSys: number;
    maxShock: number;
  };
};

export type ProgressionRule = {
  uncontrolledDelta: Partial<Record<keyof Omit<PatientState, "performed" | "gcs">, number>>;
  controlledMultiplier: number;
};

export type LossCondition = {
  minBpSys: number;
  maxShock: number;
  maxElapsed: number;
};

export type GameCase = {
  id: string;
  metadata: {
    title: string;
    locationLabel: string;
    category: string;
    difficulty: string;
    summary: string;
    emsBriefs: { male: string; female: string };
    initialLogs: { male: string; female: string };
  };
  initialPatient: PatientState;
  commands: Command[];
  winCondition: WinCondition;
  progression: ProgressionRule;
  lossCondition: LossCondition;
};
