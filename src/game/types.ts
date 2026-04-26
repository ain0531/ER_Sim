export type CommandId =
  | "airwayCheck"
  | "neckVeinCheck"
  | "subcutaneousEmphysemaCheck"
  | "trachealDeviationCheck"
  | "chestPalpation"
  | "abdominalExam"
  | "radialPulseCheck"
  | "consciousnessCheck"
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
  | "cpr"
  | "cardioversion"
  | "defibrillation"
  | "adrenalineIvBolus"
  | "adrenalineIm"
  | "vasopressor"
  | "atropineIvBolus"
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
export type CommandGrade = "best" | "acceptable" | "ineffective" | "harmful" | "worst";
export type CommandCategoryId = "A" | "B" | "C" | "D" | "E" | "X";
export type CommandDisplayKind = "confirm" | "test" | "procedure" | "medication";

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
  displayKind: CommandDisplayKind;
  label: string;
  duration: number;
  blocksCategory?: boolean;
  repeatable?: boolean;
};

export type CaseCommandProfile = {
  grade: CommandGrade;
  requiredConditions: string[];
  effects: string[];
  stateDelta?: Partial<Record<keyof Omit<PatientState, "performed" | "gcs">, number>>;
  requiresCompleted?: {
    commandIds: CommandId[];
    anyOfCommandIds?: CommandId[];
    message: string;
  }[];
  requiresWinProgress?: {
    minRatio: number;
    excludeSelf?: boolean;
    message: string;
  };
  bonusDelta?: {
    requiresCompleted: CommandId[];
    delta: Partial<Record<keyof Omit<PatientState, "performed" | "gcs">, number>>;
  };
  conditionalProfile?: {
    requiresAnyCompleted: CommandId[];
    requiresDiagnosisId?: "massiveHemorrhage";
    grade: CommandGrade;
    effects: string[];
    stateDelta?: Partial<Record<keyof Omit<PatientState, "performed" | "gcs">, number>>;
  };
};

export type Command = BaseCommand & CaseCommandProfile;

export type LogEntry = {
  time: number;
  message: string;
  tone: "neutral" | "good" | "warn" | "bad";
  kind?: "system" | "action";
};

export type CompletionTimes = Partial<Record<CommandId, number>>;

export type WinCondition = {
  requiredCommands: CommandId[];
  diagnosisRule?: {
    id: "massiveHemorrhage";
    shockVital: {
      maxBpSys: number;
      minHr: number;
    };
    requiresCompleted: CommandId[];
    additionalRequiredCommands: CommandId[];
  };
  stabilization: {
    minBpSys: number;
    maxShock: number;
    primarySurveyCommands?: CommandId[];
  };
};

export type ProgressionRule = {
  uncontrolledDelta: Partial<Record<keyof Omit<PatientState, "performed" | "gcs">, number>>;
  controlledMultiplier: number;
  suppressedByCompleted?: {
    stateKey: keyof Omit<PatientState, "performed" | "gcs">;
    commandIds: CommandId[];
  }[];
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
    tags?: string[];
    monitorRhythm?: "sinus" | "vt" | "vf" | "asystole";
    monitorRhythms?: ("sinus" | "vt" | "vf" | "asystole" | "bradycardia")[];
    difficulty: string;
    summary: string;
    emsBriefs: { male: string; female: string };
    initialLogs: { male: string; female: string };
    inspectionFindings?: Partial<Record<CommandId, string>>;
  };
  initialPatient: PatientState;
  commands: Command[];
  winCondition: WinCondition;
  progression: ProgressionRule;
  lossCondition: LossCondition;
};
