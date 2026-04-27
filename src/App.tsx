import { Activity, ChevronDown, Droplets, HeartPulse, Menu, Play, ShieldAlert, Square, Stethoscope, Thermometer, Volume2, VolumeX, Wind } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { gameCases } from "./game/cases";
import { EcgWaveform } from "./game/EcgWaveform";
import { buildQuizQuestion, hasQuiz } from "./game/quizCatalog";
import type { QuizQuestion } from "./game/quizCatalog";
import { commandCategories } from "./game/traumaShockCase";
import {
  applyCommand,
  commandTone,
  deriveVitals,
  formatTime,
  formatTimeWithTenths,
  getActiveRequiredCommands,
  getCommandBlockReason,
  getEffectiveEffects,
  getEffectiveGrade,
  isDiagnosisMet,
  isRequiredCommandSatisfied,
  getOutcome,
  gradeLabel,
  isCommandComplete,
  progressPatient,
} from "./game/simulation";
import type { Command, CommandCategoryId, CompletionTimes, DiagnosisId, GameCase, GameStatus, LogEntry, PatientState } from "./game/types";

function getFaceCell(
  patient: PatientState,
  status: GameStatus
): { col: 0 | 1 | 2; row: 0 | 1 | 2 } {
  if (status === "lost") return { col: 2, row: 2 };
  const col: 0 | 1 | 2 = patient.shock < 45 ? 0 : patient.shock < 80 ? 1 : 2;
  const row: 0 | 1 | 2 = patient.consciousness >= 82 ? 0 : patient.consciousness >= 55 ? 1 : 2;
  return { col, row };
}

function dedupeMessages(items: string[]) {
  return [...new Set(items)];
}

function getLogSummary(command: Command, effects: string[]) {
  const summary = effects[0] ?? `${command.label}を実施`;
  return `${command.label}: ${summary}`;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getDisplayedGrade(
  command: Command,
  patient: PatientState,
  completionTimes: CompletionTimes,
  activeDiagnosisId: DiagnosisId | undefined,
  hasRosc: boolean,
  isCardiacArrestCase: boolean
) {
  if (hasRosc && isCardiacArrestCase && command.id === "adrenalineIvBolus") {
    return "harmful" as const;
  }
  return getEffectiveGrade(command, patient, completionTimes, activeDiagnosisId);
}

function getDisplayedEffects(
  command: Command,
  patient: PatientState,
  completionTimes: CompletionTimes,
  activeDiagnosisId: DiagnosisId | undefined,
  hasRosc: boolean,
  isCardiacArrestCase: boolean
) {
  if (hasRosc && isCardiacArrestCase && command.id === "adrenalineIvBolus") {
    return ["自己心拍再開後のアドレナリン投与で循環を不安定化させる", "悪手として扱う"];
  }
  return getEffectiveEffects(command, patient, completionTimes, activeDiagnosisId);
}

const commandDisplayOrder = {
  confirm: 0,
  test: 1,
  procedure: 2,
  medication: 3
} as const;

const monitorCommandIds = new Set(["ecgMonitor", "bpCuff", "spo2Monitor", "temperatureMeasurement"]);

type PopupState = {
  message: string;
  details?: string[];
  imageSrc?: string;
  imageAlt?: string;
};

type QuizPopupState = {
  pendingCommand: Command;
  question: QuizQuestion;
  selectedIndex: number | null;
  phase: "question" | "result";
  isCorrectAnswer: boolean;
};

type PendingDefibrillation = {
  resolvesAt: number;
  willSucceed: boolean;
};

type AppMode = "learning" | "clinical";

function getAssetUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}

function pickRandomCase() {
  return gameCases[Math.floor(Math.random() * gameCases.length)];
}

function clampTone(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createAudioContext() {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioContextCtor ? new AudioContextCtor() : null;
}

function playTone(
  context: AudioContext,
  {
    frequency,
    duration,
    volume,
    type
  }: {
    frequency: number;
    duration: number;
    volume: number;
    type: OscillatorType;
  }
) {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const startAt = context.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(volume, startAt + 0.008);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

function playMonitorBeat(context: AudioContext, spo2: number) {
  const frequency = clampTone(520 + (spo2 - 72) * 22, 420, 1200);
  playTone(context, { frequency, duration: 0.07, volume: 0.11, type: "square" });
}

function playWarningBeep(context: AudioContext) {
  playTone(context, { frequency: 1320, duration: 2, volume: 0.08, type: "triangle" });
}

function playToggleBeep(context: AudioContext) {
  playTone(context, { frequency: 740, duration: 0.08, volume: 0.1, type: "sine" });
}

export function App() {
  const [activeCase, setActiveCase] = useState<GameCase>(gameCases[0]);
  const [mode, setMode] = useState<AppMode>("learning");
  const { commands, initialPatient, lossCondition, progression, winCondition } = activeCase;
  const initialMonitorRhythm =
    activeCase.metadata.monitorRhythms?.[Math.floor(Math.random() * activeCase.metadata.monitorRhythms.length)] ?? activeCase.metadata.monitorRhythm;
  const [patient, setPatient] = useState(activeCase.initialPatient);
  const [status, setStatus] = useState<GameStatus>("ready");
  const [openCategories, setOpenCategories] = useState<CommandCategoryId[]>([]);
  const [categoryLocks, setCategoryLocks] = useState<Partial<Record<CommandCategoryId, number>>>({});
  const [completionTimes, setCompletionTimes] = useState<CompletionTimes>({});
  const [debugOpen, setDebugOpen] = useState(false);
  const [gender, setGender] = useState<"male" | "female">(() => (Math.random() < 0.5 ? "male" : "female"));
  const [log, setLog] = useState<LogEntry[]>(() => [
    { time: 0, message: activeCase.metadata.initialLogs[gender], tone: "neutral", kind: "system" }
  ]);
  const [popupState, setPopupState] = useState<PopupState | null>(null);
  const [seenAlerts, setSeenAlerts] = useState<Record<string, boolean>>({});
  const [seenEndPopup, setSeenEndPopup] = useState(false);
  const [diagnosedMassiveHemorrhage, setDiagnosedMassiveHemorrhage] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hasRosc, setHasRosc] = useState(false);
  const [selectedMonitorRhythm, setSelectedMonitorRhythm] = useState<GameCase["metadata"]["monitorRhythm"] | "bradycardia">(initialMonitorRhythm);
  const [hasDetectableBloodPressure, setHasDetectableBloodPressure] = useState(!activeCase.id.startsWith("cardiac-arrest-"));
  const [menuOpen, setMenuOpen] = useState(false);
  const [quizPopupState, setQuizPopupState] = useState<QuizPopupState | null>(null);
  const [pendingDefibrillation, setPendingDefibrillation] = useState<PendingDefibrillation | null>(null);
  const [displayRemaining, setDisplayRemaining] = useState(lossCondition.maxElapsed);
  const logListRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const beatTimerRef = useRef<number | null>(null);
  const warningTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const elapsedAnchorMsRef = useRef<number | null>(null);
  const hrRef = useRef(patient.hr);
  const spo2Ref = useRef(patient.spo2);
  const hasEcgMonitorRef = useRef(false);
  const hasSpo2MonitorRef = useRef(false);
  const hasDetectableBloodPressureRef = useRef(false);

  async function ensureAudioContext() {
    if (typeof window === "undefined") {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = createAudioContext();
    }

    if (!audioContextRef.current) {
      return null;
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }

  function stopSoundTimers() {
    if (beatTimerRef.current !== null) {
      window.clearTimeout(beatTimerRef.current);
      beatTimerRef.current = null;
    }
    if (warningTimerRef.current !== null) {
      window.clearInterval(warningTimerRef.current);
      warningTimerRef.current = null;
    }
  }

  function stopCountdownTimer() {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (status !== "running" || popupState) {
      return;
    }

    const timer = window.setInterval(() => {
      setPatient((current) => {
        let next = progressPatient(current, completionTimes, winCondition, progression, diagnosedMassiveHemorrhage);
        const nextElapsed = next.elapsed;
        const defibrillationResolved =
          pendingDefibrillation !== null &&
          nextElapsed >= pendingDefibrillation.resolvesAt &&
          selectedMonitorRhythm !== "sinus";
        if (defibrillationResolved) {
          if (pendingDefibrillation.willSucceed) {
            setSelectedMonitorRhythm("sinus");
            setHasDetectableBloodPressure(true);
            setHasRosc(true);
            next = deriveVitals({
              ...next,
              circulation: Math.max(next.circulation, 68),
              oxygenation: Math.max(next.oxygenation, 56),
              breathing: Math.max(next.breathing, 52),
              shock: Math.min(next.shock, 42),
              consciousness: Math.max(next.consciousness, 48)
            });
          }
          setPendingDefibrillation(null);
        }
        const nextDiagnosisMet = diagnosedMassiveHemorrhage || isDiagnosisMet(next, completionTimes, winCondition);
        if (nextDiagnosisMet && !diagnosedMassiveHemorrhage) {
          setDiagnosedMassiveHemorrhage(true);
        }
        const outcome = defibrillationResolved && pendingDefibrillation?.willSucceed
          ? "won"
          : getOutcome(next, completionTimes, winCondition, lossCondition, nextDiagnosisMet);
        if (outcome !== "running") {
          setStatus(outcome);
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [completionTimes, diagnosedMassiveHemorrhage, pendingDefibrillation, popupState, selectedMonitorRhythm, status]);

  useEffect(() => {
    if (!logListRef.current) {
      return;
    }
    logListRef.current.scrollTop = logListRef.current.scrollHeight;
  }, [log]);

  const outcome = useMemo(
    () => (hasRosc ? "won" : getOutcome(patient, completionTimes, winCondition, lossCondition, diagnosedMassiveHemorrhage)),
    [completionTimes, diagnosedMassiveHemorrhage, hasRosc, lossCondition, patient, winCondition]
  );
  const remaining = Math.max(0, lossCondition.maxElapsed - patient.elapsed);
  const countdownTone =
    remaining <= 10 ? "critical" : remaining <= 30 ? "warning" : "normal";
  const isCardiacArrestCase = activeCase.id.startsWith("cardiac-arrest-");
  const initialRequiredCommands = winCondition.requiredCommands;
  const postDiagnosisRequiredCommands = winCondition.diagnosisRule?.additionalRequiredCommands ?? [];
  const computedDiagnosisMet = isDiagnosisMet(patient, completionTimes, winCondition);
  const diagnosisMet = diagnosedMassiveHemorrhage || computedDiagnosisMet;
  const activeDiagnosisId = diagnosisMet ? winCondition.diagnosisRule?.id : undefined;
  const baseRequiredCommands = getActiveRequiredCommands(patient, completionTimes, winCondition, diagnosisMet);
  const requiredCommands =
    hasRosc && isCardiacArrestCase && !isCommandComplete("adrenalineIvBolus", patient, completionTimes)
      ? baseRequiredCommands.filter((id) => id !== "adrenalineIvBolus")
      : baseRequiredCommands;
  const completedRequirements = requiredCommands.filter((id) => isRequiredCommandSatisfied(id, patient, completionTimes)).length;
  const bpStable = hasDetectableBloodPressure && patient.bpSys >= winCondition.stabilization.minBpSys;
  const shockStable = patient.shock < winCondition.stabilization.maxShock;
  const requiresPrimarySurvey = activeCase.metadata.tags?.includes("外傷") ?? false;
  const primarySurveyCommands = winCondition.stabilization.primarySurveyCommands ?? [];
  const primarySurveyDone =
    !requiresPrimarySurvey || primarySurveyCommands.length === 0 || primarySurveyCommands.every((id) => isCommandComplete(id, patient, completionTimes));
  const hasSpo2Monitor = isCommandComplete("spo2Monitor", patient, completionTimes);
  const hasBpCuff = isCommandComplete("bpCuff", patient, completionTimes);
  const hasEcgMonitor = isCommandComplete("ecgMonitor", patient, completionTimes);
  const ecgRequested = patient.performed.includes("ecgMonitor");
  const bpRequested = patient.performed.includes("bpCuff");
  const spo2Requested = patient.performed.includes("spo2Monitor");
  const hasTemperatureMeasurement = isCommandComplete("temperatureMeasurement", patient, completionTimes);
  const tempRequested = patient.performed.includes("temperatureMeasurement");
  const hasConsciousnessCheck = isCommandComplete("consciousnessCheck", patient, completionTimes);
  const hasRadialPulseCheck = isCommandComplete("radialPulseCheck", patient, completionTimes);
  const hasIntubation = isCommandComplete("intubation", patient, completionTimes);
  const hasCardiacArrest = isCardiacArrestCase || (hasRadialPulseCheck && !hasDetectableBloodPressure);
  const displayedGcs = hasIntubation ? patient.gcs.replace(/V\d+/, "VT") : patient.gcs;
  const hasCirculationAssessment = hasBpCuff && hasEcgMonitor;
  const inspectionFindings = activeCase.metadata.inspectionFindings ?? {};
  const radialPulseAbsent = !hasDetectableBloodPressure;
  const bpDisplay = hasBpCuff ? (hasDetectableBloodPressure ? `${patient.bpSys}/${patient.bpDia}` : "測定不能") : "--/--";
  const spo2Display = hasSpo2Monitor ? (hasDetectableBloodPressure ? `${patient.spo2}%` : "測定不能") : "--%";
  const hasRrObservation = isCommandComplete("rrObservation", patient, completionTimes);
  const rr = Math.min(44, Math.max(8, Math.round(10 + (100 - patient.breathing) * 0.28)));
  const rrDisplay = hasRrObservation ? `${rr}` : "--";
  const monitorRhythmHint = selectedMonitorRhythm;
  const monitorHr = monitorRhythmHint === "vt" ? 200 : patient.hr;
  const maskedCaseTitle = requiresPrimarySurvey ? "外傷救急症例" : "内科救急症例";
  const hasFastPositiveFinding = isCommandComplete("fast", patient, completionTimes) && Boolean(inspectionFindings.fast);
  const trachealDeviationFinding = inspectionFindings.trachealDeviationCheck ?? "";
  const neckVeinFinding = inspectionFindings.neckVeinCheck ?? "";
  const hasPositiveTrachealDeviation = isCommandComplete("trachealDeviationCheck", patient, completionTimes) &&
    (trachealDeviationFinding.includes("偏位している") || trachealDeviationFinding.includes("偏位を認める"));
  const hasJvdFinding = isCommandComplete("neckVeinCheck", patient, completionTimes) &&
    neckVeinFinding.includes("怒張を認める");
  const diagnosisCandidateVisible =
    winCondition.diagnosisRule !== undefined &&
    isCommandComplete("fast", patient, completionTimes) &&
    hasBpCuff &&
    hasEcgMonitor;
  const visibleInspectionFindings = Object.entries(inspectionFindings)
    .filter(([id]) => isCommandComplete(id as Command["id"], patient, completionTimes))
    .map(([id, finding]) => {
      if (id === "radialPulseCheck") {
        return [id, hasDetectableBloodPressure ? "橈骨動脈・頸動脈を触知する。" : "橈骨動脈・頸動脈とも触知しない。"] as const;
      }
      if (id === "bpCuff") {
        return [id, hasDetectableBloodPressure ? `血圧は ${patient.bpSys}/${patient.bpDia} mmHg。` : "血圧は測定不能である。"] as const;
      }
      if (id === "spo2Monitor") {
        return [id, hasDetectableBloodPressure ? `SpO2 は ${patient.spo2}%。` : "SpO2 は測定不能である。"] as const;
      }
      return [id, finding] as const;
    });
  const faceCell = status === "won" && bpStable && shockStable && primarySurveyDone ? getFaceCell(initialPatient, "ready") : getFaceCell(patient, status);
  const faceImageUrl = getAssetUrl(
    `images/${
      hasIntubation
        ? (gender === "female" ? "intubated_woman_face" : "intubated_man_face")
        : (gender === "female" ? "patient_woman_face" : "patient_man_face")
    }.png`
  );
  const stabilizationChecks = [bpStable, shockStable, ...(requiresPrimarySurvey && primarySurveyCommands.length > 0 ? [primarySurveyDone] : [])];
  const stabilizationRate = stabilizationChecks.filter(Boolean).length / stabilizationChecks.length;
  const actionLogs = log.filter((entry) => entry.kind === "action");
  const commandQualityRaw = actionLogs.reduce((total, entry) => {
    if (entry.tone === "good") return total + 5;
    if (entry.tone === "neutral") return total + 2;
    if (entry.tone === "bad") return total - 6;
    return total;
  }, 15);
  const timeScore = 35 * (remaining / lossCondition.maxElapsed);
  const stabilizationScore = 35 * stabilizationRate;
  const commandScore = Math.max(0, Math.min(30, commandQualityRaw));
  const totalScore = clampScore(timeScore + stabilizationScore + commandScore);
  const lossReasons = [
    patient.bpSys <= lossCondition.minBpSys ? `SBP ${lossCondition.minBpSys}以下` : null,
    patient.shock >= lossCondition.maxShock ? `shock ${lossCondition.maxShock}以上` : null,
    patient.elapsed >= lossCondition.maxElapsed ? `制限時間 ${formatTime(lossCondition.maxElapsed)} 到達` : null
  ].filter((reason): reason is string => reason !== null);
  const bpCuffCommand = commands.find((command) => command.id === "bpCuff");
  const ecgMonitorCommand = commands.find((command) => command.id === "ecgMonitor");
  const spo2MonitorCommand = commands.find((command) => command.id === "spo2Monitor");
  const temperatureMeasurementCommand = commands.find((command) => command.id === "temperatureMeasurement");
  const orderedCommands = useMemo(
    () =>
      [...commands]
        .filter((command) => !monitorCommandIds.has(command.id))
        .sort((left, right) => {
        const byDisplayKind = commandDisplayOrder[left.displayKind] - commandDisplayOrder[right.displayKind];
        if (byDisplayKind !== 0) {
          return byDisplayKind;
        }
        return 0;
      }),
    [commands]
  );
  const hasAbnormalVitals =
    (hasBpCuff && patient.bpSys <= 90) ||
    (hasEcgMonitor && (patient.hr >= 130 || patient.hr <= 45)) ||
    (hasSpo2Monitor && hasDetectableBloodPressure && patient.spo2 <= 92);
  const ecgCommandLockedUntil = completionTimes.ecgMonitor ?? 0;
  const ecgCommandLocked = Boolean(ecgMonitorCommand?.repeatable) && ecgCommandLockedUntil > patient.elapsed;
  const ecgBlockReason =
    ecgMonitorCommand
      ? getCommandBlockReason(ecgMonitorCommand, patient, completionTimes, winCondition, diagnosisMet)
      : null;
  const ecgButtonDisabled =
    !ecgMonitorCommand ||
    status !== "running" ||
    popupState !== null ||
    ecgRequested ||
    ecgCommandLocked ||
    Boolean(ecgBlockReason);
  const bpCommandLockedUntil = completionTimes.bpCuff ?? 0;
  const bpCommandLocked = Boolean(bpCuffCommand?.repeatable) && bpCommandLockedUntil > patient.elapsed;
  const bpBlockReason =
    bpCuffCommand ? getCommandBlockReason(bpCuffCommand, patient, completionTimes, winCondition, diagnosisMet) : null;
  const bpButtonDisabled =
    !bpCuffCommand || status !== "running" || popupState !== null || bpRequested || bpCommandLocked || Boolean(bpBlockReason);
  const spo2CommandLockedUntil = completionTimes.spo2Monitor ?? 0;
  const spo2CommandLocked = Boolean(spo2MonitorCommand?.repeatable) && spo2CommandLockedUntil > patient.elapsed;
  const spo2BlockReason =
    spo2MonitorCommand
      ? getCommandBlockReason(spo2MonitorCommand, patient, completionTimes, winCondition, diagnosisMet)
      : null;
  const spo2ButtonDisabled =
    !spo2MonitorCommand || status !== "running" || popupState !== null || spo2Requested || spo2CommandLocked || Boolean(spo2BlockReason);
  const tempCommandLockedUntil = completionTimes.temperatureMeasurement ?? 0;
  const tempCommandLocked = Boolean(temperatureMeasurementCommand?.repeatable) && tempCommandLockedUntil > patient.elapsed;
  const tempBlockReason =
    temperatureMeasurementCommand
      ? getCommandBlockReason(temperatureMeasurementCommand, patient, completionTimes, winCondition, diagnosisMet)
      : null;
  const tempButtonDisabled =
    !temperatureMeasurementCommand || status !== "running" || popupState !== null || tempRequested || tempCommandLocked || Boolean(tempBlockReason);

  useEffect(() => {
    hrRef.current = monitorHr;
    spo2Ref.current = patient.spo2;
  }, [monitorHr, patient.spo2]);

  useEffect(() => {
    hasEcgMonitorRef.current = hasEcgMonitor;
    hasSpo2MonitorRef.current = hasSpo2Monitor;
    hasDetectableBloodPressureRef.current = hasDetectableBloodPressure;
  }, [hasDetectableBloodPressure, hasEcgMonitor, hasSpo2Monitor]);

  useEffect(() => {
    if (computedDiagnosisMet && !diagnosedMassiveHemorrhage) {
      setDiagnosedMassiveHemorrhage(true);
    }
  }, [computedDiagnosisMet, diagnosedMassiveHemorrhage]);

  useEffect(() => {
    if (status !== "running" || popupState) {
      elapsedAnchorMsRef.current = null;
      setDisplayRemaining(Math.max(0, lossCondition.maxElapsed - patient.elapsed));
      stopCountdownTimer();
      return;
    }

    elapsedAnchorMsRef.current = performance.now();
    setDisplayRemaining(Math.max(0, lossCondition.maxElapsed - patient.elapsed));
    stopCountdownTimer();

    countdownTimerRef.current = window.setInterval(() => {
      const anchor = elapsedAnchorMsRef.current;
      if (anchor === null) {
        return;
      }
      const elapsedFraction = (performance.now() - anchor) / 1000;
      setDisplayRemaining(Math.max(0, lossCondition.maxElapsed - patient.elapsed - elapsedFraction));
    }, 100);

    return () => stopCountdownTimer();
  }, [lossCondition.maxElapsed, patient.elapsed, popupState, status]);

  useEffect(() => {
    if (popupState || status !== "running") {
      return;
    }

    const hasShockVitals = !hasCardiacArrest && hasCirculationAssessment && patient.hr >= 120 && patient.bpSys <= 90;
    const hasFastPositive = isCommandComplete("fast", patient, completionTimes);
    const hasHypotension = hasBpCuff && patient.bpSys <= 90;
    const hasTensionPneumothoraxTriad = hasPositiveTrachealDeviation && hasJvdFinding && hasHypotension;
    const alerts = [
      { id: "cardiacArrest", active: hasRadialPulseCheck && !hasDetectableBloodPressure, popup: { message: "心停止です！" } },
      { id: "shockVitals", active: hasShockVitals, popup: { message: "ショック状態です！" } },
      {
        id: "fastPositive",
        active: hasFastPositive,
        popup: {
          message: "腹腔内に体液貯留があります！",
          imageSrc: getAssetUrl("images/FAST_abdominal1.jpg"),
          imageAlt: "FAST腹部所見"
        }
      },
      {
        id: "hemorrhagicShock",
        active: hasShockVitals && hasFastPositive,
        popup: { message: "腹腔内出血によるショックが疑われます！" }
      },
      {
        id: "tensionPneumothorax",
        active: hasTensionPneumothoraxTriad,
        popup: {
          message: "緊張性気胸の疑いがあります！",
          details: [
            "気管偏位",
            "頸静脈怒張",
            "低血圧（収縮期血圧 90 mmHg以下）"
          ]
        }
      }
    ];

    const nextAlert = alerts.find((alert) => alert.active && !seenAlerts[alert.id]);
    if (nextAlert) {
      setPopupState(nextAlert.popup);
      setSeenAlerts((current) => ({ ...current, [nextAlert.id]: true }));
    }
  }, [completionTimes, hasBpCuff, hasCardiacArrest, hasCirculationAssessment, hasDetectableBloodPressure, hasJvdFinding, hasPositiveTrachealDeviation, hasRadialPulseCheck, patient.bpSys, patient.hr, popupState, seenAlerts, status]);

  useEffect(() => {
    if (quizPopupState && status !== "running") {
      setQuizPopupState(null);
    }
  }, [quizPopupState, status]);

  useEffect(() => {
    if (popupState || !hasRosc || seenAlerts.rosc) {
      return;
    }

    setPopupState({ message: "自己心拍が再開しました！" });
    setSeenAlerts((current) => ({ ...current, rosc: true }));
  }, [hasRosc, popupState, seenAlerts]);

  useEffect(() => {
    if (popupState || seenEndPopup) {
      return;
    }

    if (status === "won") {
      setPopupState({ message: "救命に成功しました。" });
      setSeenEndPopup(true);
      return;
    }

    if (status === "lost") {
      setPopupState({ message: "救命に失敗しました。" });
      setSeenEndPopup(true);
    }
  }, [popupState, seenEndPopup, status]);

  useEffect(() => {
    stopSoundTimers();

    if (!soundEnabled || status !== "running" || popupState || !hasEcgMonitor) {
      return;
    }

    let disposed = false;

    const scheduleBeat = async () => {
      if (disposed) {
        return;
      }

      const context = await ensureAudioContext();
      if (!context || disposed || !hasEcgMonitorRef.current || monitorRhythmHint === "vf" || monitorRhythmHint === "asystole") {
        return;
      }

      playMonitorBeat(context, hasSpo2MonitorRef.current && hasDetectableBloodPressureRef.current ? spo2Ref.current : 60);
      beatTimerRef.current = window.setTimeout(scheduleBeat, 60000 / Math.max(20, hrRef.current));
    };

    void scheduleBeat();

    return () => {
      disposed = true;
      stopSoundTimers();
    };
  }, [hasEcgMonitor, monitorRhythmHint, popupState, soundEnabled, status]);

  useEffect(() => {
    if (!soundEnabled || status !== "running" || popupState || !hasAbnormalVitals) {
      if (warningTimerRef.current !== null) {
        window.clearInterval(warningTimerRef.current);
        warningTimerRef.current = null;
      }
      return;
    }

    let disposed = false;

    const triggerWarning = async () => {
      const context = await ensureAudioContext();
      if (!context || disposed) {
        return;
      }
      playWarningBeep(context);
    };

    void triggerWarning();
    warningTimerRef.current = window.setInterval(() => {
      void triggerWarning();
    }, 3000);

    return () => {
      disposed = true;
      if (warningTimerRef.current !== null) {
        window.clearInterval(warningTimerRef.current);
        warningTimerRef.current = null;
      }
    };
  }, [hasAbnormalVitals, popupState, soundEnabled, status]);

  useEffect(() => () => stopSoundTimers(), []);
  useEffect(() => () => stopCountdownTimer(), []);

  async function start() {
    if (soundEnabled) {
      await ensureAudioContext();
    }
    setStatus("running");
    setLog((current) => [...current, { time: 0, message: "シミュレーション開始。救急患者の初期対応を進めます。", tone: "neutral", kind: "system" }]);
  }

  function reset() {
    const nextCase = mode === "clinical" ? pickRandomCase() : activeCase;
    setActiveCase(nextCase);
    resetCase(nextCase, Math.random() < 0.5 ? "male" : "female");
  }

  function resetCase(nextCase: GameCase, nextGender: "male" | "female") {
    const nextMonitorRhythm =
      nextCase.metadata.monitorRhythms?.[Math.floor(Math.random() * nextCase.metadata.monitorRhythms.length)] ?? nextCase.metadata.monitorRhythm;
    setGender(nextGender);
    setPatient(nextCase.initialPatient);
    setStatus("ready");
    setOpenCategories([]);
    setCategoryLocks({});
    setCompletionTimes({});
    setSeenAlerts({});
    setSeenEndPopup(false);
    setDiagnosedMassiveHemorrhage(false);
    setHasRosc(false);
    setPendingDefibrillation(null);
    setPopupState(null);
    setSelectedMonitorRhythm(nextMonitorRhythm);
    setHasDetectableBloodPressure(!nextCase.id.startsWith("cardiac-arrest-"));
    setDisplayRemaining(nextCase.lossCondition.maxElapsed);
    setLog([{ time: 0, message: nextCase.metadata.initialLogs[nextGender], tone: "neutral", kind: "system" }]);
    stopSoundTimers();
  }

  function selectCase(caseId: string) {
    const nextCase = gameCases.find((item) => item.id === caseId);
    if (!nextCase) {
      return;
    }

    setActiveCase(nextCase);
    resetCase(nextCase, Math.random() < 0.5 ? "male" : "female");
  }

  function changeMode(nextMode: AppMode) {
    setMode(nextMode);
    const nextCase = nextMode === "clinical" ? pickRandomCase() : activeCase;
    setActiveCase(nextCase);
    resetCase(nextCase, Math.random() < 0.5 ? "male" : "female");
    setMenuOpen(false);
  }

  function runCommand(command: Command, immediate = false) {
    setPatient((current) => {
      const completionTime = immediate ? current.elapsed : current.elapsed + command.duration;
      const nextCompletionTimes = { ...completionTimes, [command.id]: completionTime };
      let next = applyCommand(current, command, completionTimes, activeDiagnosisId);
      const nextDiagnosisMet = diagnosisMet || isDiagnosisMet(next, nextCompletionTimes, winCondition);
      if (nextDiagnosisMet && !diagnosisMet) {
        setDiagnosedMassiveHemorrhage(true);
      }
      const effectiveGrade = getDisplayedGrade(command, current, completionTimes, activeDiagnosisId, hasRosc, isCardiacArrestCase);
      if (
        isCardiacArrestCase &&
        command.id === "defibrillation" &&
        (selectedMonitorRhythm === "vf" || selectedMonitorRhythm === "vt")
      ) {
        const defibrillationSuccessRate = selectedMonitorRhythm === "vt" ? 0.4 : 0.3;
        setPendingDefibrillation({
          resolvesAt: completionTime,
          willSucceed: effectiveGrade !== "worst" && Math.random() < defibrillationSuccessRate
        });
      }
      const nextOutcome = getOutcome(next, nextCompletionTimes, winCondition, lossCondition, nextDiagnosisMet);
      setStatus(nextOutcome);
      if (command.blocksCategory !== false && !monitorCommandIds.has(command.id)) {
        setCategoryLocks((currentLocks) => ({ ...currentLocks, [command.category]: completionTime }));
      }
      setCompletionTimes(nextCompletionTimes);
      const effectiveEffects = dedupeMessages(
        getDisplayedEffects(command, current, completionTimes, activeDiagnosisId, hasRosc, isCardiacArrestCase)
      );
      const nextLogEntry = {
        time: next.elapsed,
        message: getLogSummary(command, effectiveEffects),
        tone: commandTone(effectiveGrade),
        kind: "action" as const
      };
      setLog((entries) => [
        ...entries.filter((entry) => !(entry.time === nextLogEntry.time && entry.message === nextLogEntry.message)),
        nextLogEntry
      ]);
      return next;
    });
  }

  function execute(command: Command) {
    if (status !== "running" || popupState) {
      return;
    }

    const lockedUntil = categoryLocks[command.category] ?? 0;
    const commandLockedUntil = completionTimes[command.id] ?? 0;
    const commandLocked = command.repeatable && commandLockedUntil > patient.elapsed;
    const blockReason = getCommandBlockReason(command, patient, completionTimes, winCondition, diagnosisMet);
    const categoryBlocked = !monitorCommandIds.has(command.id) && command.blocksCategory !== false && lockedUntil > patient.elapsed;
    if (categoryBlocked || commandLocked || blockReason) {
      return;
    }

    if (hasQuiz(command.id) && !quizPopupState) {
      const question = buildQuizQuestion(command.id);
      if (question) {
        setQuizPopupState({ pendingCommand: command, question, selectedIndex: null, phase: "question", isCorrectAnswer: false });
        return;
      }
    }

    runCommand(command);
  }

  function submitQuizAnswer() {
    if (!quizPopupState || quizPopupState.selectedIndex === null) return;
    const isCorrectAnswer = quizPopupState.selectedIndex === quizPopupState.question.targetIndex;
    setQuizPopupState((prev) => prev ? { ...prev, phase: "result", isCorrectAnswer } : null);
  }

  function advanceQuiz() {
    if (!quizPopupState) return;
    if (quizPopupState.isCorrectAnswer) {
      const cmd = quizPopupState.pendingCommand;
      setQuizPopupState(null);
      runCommand(cmd, true);
    } else {
      const nextQuestion = buildQuizQuestion(quizPopupState.pendingCommand.id);
      if (!nextQuestion || status !== "running") {
        setQuizPopupState(null);
        return;
      }
      setQuizPopupState((prev) => prev ? { ...prev, question: nextQuestion, selectedIndex: null, phase: "question", isCorrectAnswer: false } : null);
    }
  }

  async function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) {
      const context = await ensureAudioContext();
      if (context) {
        playToggleBeep(context);
      }
      return;
    }
    stopSoundTimers();
  }

  return (
    <main className="sim-shell">
      {popupState ? (
        <div className="popup-backdrop" role="dialog" aria-modal="true" aria-label="所見ポップアップ">
          <div className="popup-card">
            {popupState.imageSrc ? <img className="popup-image" src={popupState.imageSrc} alt={popupState.imageAlt ?? ""} /> : null}
            <p>{popupState.message}</p>
            {popupState.details ? (
              <ul className="popup-details">
                {popupState.details.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
            <button className="primary-action" onClick={() => setPopupState(null)}>
              OK
            </button>
          </div>
        </div>
      ) : null}

      {quizPopupState ? (
        <div className="quiz-backdrop" role="dialog" aria-modal="true" aria-label="手技確認クイズ">
          <div className="quiz-card">
            <p className="quiz-command-label">{quizPopupState.pendingCommand.label}</p>
            {quizPopupState.phase === "question" ? (
              <>
                <p className="quiz-prompt">{quizPopupState.question.prompt}</p>
                <div className="quiz-choices">
                  {quizPopupState.question.choices.map((choice, index) => (
                    <label key={index} className={`quiz-choice ${quizPopupState.selectedIndex === index ? "quiz-choice-selected" : ""}`}>
                      <input
                        type="radio"
                        name="quiz"
                        checked={quizPopupState.selectedIndex === index}
                        onChange={() => setQuizPopupState((prev) => prev ? { ...prev, selectedIndex: index } : null)}
                      />
                      <span>{choice.statement}</span>
                    </label>
                  ))}
                </div>
                <div className="quiz-actions">
                  <button className="quiz-cancel" onClick={() => setQuizPopupState(null)}>キャンセル</button>
                  <button className="primary-action" disabled={quizPopupState.selectedIndex === null} onClick={submitQuizAnswer}>OK</button>
                </div>
              </>
            ) : (
              <>
                <p className={`quiz-result ${quizPopupState.isCorrectAnswer ? "quiz-result-correct" : "quiz-result-incorrect"}`}>
                  {quizPopupState.isCorrectAnswer ? "正解" : "不正解"}
                </p>
                <p className="quiz-explanation">
                  {quizPopupState.question.choices[quizPopupState.selectedIndex ?? 0].explanation}
                </p>
                <div className="quiz-actions">
                  <button className="primary-action" onClick={advanceQuiz}>
                    {quizPopupState.isCorrectAnswer ? "手技を完遂する" : "次の問題へ"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <section className="case-bar">
        <div className="case-bar-title">
          <p className="eyebrow">{activeCase.metadata.locationLabel}</p>
          <h1>{mode === "clinical" ? maskedCaseTitle : activeCase.metadata.title}</h1>
        </div>
        <button
          className={`icon-action ${status !== "ready" ? "stop-active" : ""}`}
          onClick={status === "ready" ? () => void start() : reset}
          title={status === "ready" ? "開始" : "リセット"}
          aria-label={status === "ready" ? "開始" : "リセット"}
        >
          {status === "ready" ? <Play size={18} /> : <Square size={18} />}
        </button>
        <div className={`status-pill status-${status}`}>
          {status === "ready" && "待機中"}
          {status === "running" && "対応中"}
          {status === "won" && "救命成功"}
          {status === "lost" && "対応失敗"}
        </div>
        <button className={`icon-action ${soundEnabled ? "sound-on" : ""}`} onClick={() => void toggleSound()} type="button" aria-label={soundEnabled ? "サウンドON" : "サウンドOFF"} title={soundEnabled ? "サウンドON" : "サウンドOFF"}>
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <div className="hamburger-menu">
          <button className="hamburger-button" onClick={() => setMenuOpen((prev) => !prev)} aria-label="メニュー">
            <Menu size={20} />
          </button>
          {menuOpen && (
            <div className="hamburger-panel">
              <label className="case-select">
                <span>モード変更</span>
                <select value={mode} onChange={(event) => changeMode(event.target.value as AppMode)}>
                  <option value="learning">学習モード</option>
                  <option value="clinical">臨床モード</option>
                </select>
              </label>
              {mode === "learning" ? (
                <label className="case-select">
                  <span>症例</span>
                  <select value={activeCase.id} onChange={(event) => { selectCase(event.target.value); setMenuOpen(false); }}>
                    {gameCases.map((gameCase) => (
                      <option key={gameCase.id} value={gameCase.id}>
                        {gameCase.metadata.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="sim-grid">
        <aside className="patient-bay">
          <div className="ems-brief">
            <span>救急隊情報</span>
            <p>{activeCase.metadata.emsBriefs[gender]}</p>
          </div>

          <div className="patient-scene" aria-label="患者表示">
            <img className="patient-body-image" src={getAssetUrl("images/wholeBody.png")} alt="患者全身像" />
            {hasFastPositiveFinding ? <img className="patient-fast-image" src={getAssetUrl("images/FAST_abdominal1.jpg")} alt="FAST腹部所見" /> : null}
            {hasJvdFinding ? <img className="patient-jvd-image" src={getAssetUrl("images/juglar vein distention.png")} alt="頸静脈怒張" /> : null}
            <div
              className="patient-face"
              aria-label="患者の顔色・表情"
              style={{
                backgroundImage: `url('${faceImageUrl}')`,
                backgroundSize: "300% 300%",
                backgroundPosition: `${faceCell.col * 50}% ${faceCell.row * 50}%`,
              }}
            />
          </div>

          <div className="finding-panel">
            <div className="panel-title">
              <Stethoscope size={18} />
              <span>確認結果</span>
            </div>
            <div className="finding-list">
              {visibleInspectionFindings.length > 0 ? (
                visibleInspectionFindings.map(([id, finding]) => (
                  <p key={id}>
                    <strong>{commands.find((command) => command.id === id)?.label ?? id}</strong>
                    <span>{finding}</span>
                  </p>
                ))
              ) : (
                <p className="finding-empty">確認結果はまだありません。</p>
              )}
            </div>
          </div>

          <div className="objective-panel">
            <div className="panel-title">
              <ShieldAlert size={18} />
              <span>救命条件</span>
            </div>
            <div className="objective-progress">
              <span>
                {completedRequirements}/{requiredCommands.length}
              </span>
              <div>
                <i style={{ width: `${(completedRequirements / requiredCommands.length) * 100}%` }} />
              </div>
            </div>
            <div className="objective-group-title">必須処置</div>
            {initialRequiredCommands.map((id) => {
              const command = commands.find((item) => item.id === id)!;
              const done = isRequiredCommandSatisfied(id, patient, completionTimes);
              return (
                <p className={done ? "done" : ""} key={id}>
                  {done ? "達成" : "未達成"}{mode === "clinical" ? "" : `: ${command.label}`}
                </p>
              );
            })}
            {diagnosisCandidateVisible ? (
              <>
                <div className="objective-group-title">大量出血</div>
                <p className={diagnosisMet ? "done" : ""}>
                  {diagnosisMet ? "診断済み" : "未診断"}{mode === "clinical" ? "" : ": 頻脈＋低血圧＋FAST陽性"}
                </p>
                {diagnosisMet ? (
                  <>
                    <div className="objective-group-title">大量出血診断後</div>
                    {postDiagnosisRequiredCommands.map((id) => {
                      const command = commands.find((item) => item.id === id)!;
                      const done = isRequiredCommandSatisfied(id, patient, completionTimes);
                      return (
                        <p className={done ? "done" : ""} key={id}>
                          {done ? "達成" : "未達成"}{mode === "clinical" ? "" : `: ${command.label}`}
                        </p>
                      );
                    })}
                  </>
                ) : null}
              </>
            ) : null}
            <div className="objective-group-title">安定化条件</div>
            <p className={bpStable ? "done" : ""}>
              {bpStable ? "達成" : "未達成"}{mode === "clinical" ? "" : `: SBP ${winCondition.stabilization.minBpSys}以上`}
            </p>
            <p className={shockStable ? "done" : ""}>
              {shockStable ? "達成" : "未達成"}{mode === "clinical" ? "" : `: ショック ${winCondition.stabilization.maxShock}未満`}
            </p>
            {requiresPrimarySurvey && primarySurveyCommands.length > 0 ? (
              <p className={primarySurveyDone ? "done" : ""}>
                {primarySurveyDone ? "達成" : "未達成"}{mode === "clinical" ? "" : ": Primary Survey"}
              </p>
            ) : null}
          </div>
        </aside>

        <section className="monitor-panel">
          <div className="monitor-header">
            <div>
              <p className="eyebrow">Patient Monitor</p>
              <h2>バイタルサイン</h2>
            </div>
            <div className={`timer timer-${countdownTone}`} aria-label="カウントダウンタイマー">
              <div className="timer-shell">
                <span className="timer-caption">INTERNAL POWER</span>
                <strong className="timer-digits">{formatTimeWithTenths(displayRemaining)}</strong>
                <span className="timer-subcaption">COUNT DOWN</span>
              </div>
            </div>
          </div>

          {hasEcgMonitor ? (
            <div className="waveform" aria-label="心電図波形">
              <EcgWaveform hr={monitorHr} shock={patient.shock} status={status} rhythmHint={monitorRhythmHint} />
            </div>
          ) : (
            <div className="waveform waveform-off">心電図 未装着</div>
          )}

          <div className="vitals">
            <button
              className={`vital vital-button heart ${ecgRequested ? "vital-on" : "vital-off"}`}
              disabled={ecgButtonDisabled}
              onClick={() => {
                if (ecgMonitorCommand && !ecgRequested) {
                  execute(ecgMonitorCommand);
                }
              }}
              type="button"
              title={ecgRequested ? "心電図 ON" : (ecgBlockReason ?? "心電図 OFF")}
            >
              <Activity size={22} />
              <span>HR</span>
              <strong>{hasEcgMonitor ? monitorHr : "--"}</strong>
              <small className={`vital-state ${ecgRequested ? "vital-state-on" : "vital-state-off"}`}>
                {ecgRequested ? "ECG ON" : "ECG OFF"}
              </small>
            </button>
            <button
              className={`vital vital-button pressure ${bpRequested ? "vital-on" : "vital-off"}`}
              disabled={bpButtonDisabled}
              onClick={() => {
                if (bpCuffCommand && !bpRequested) {
                  execute(bpCuffCommand);
                }
              }}
              type="button"
              title={bpRequested ? "血圧計 ON" : (bpBlockReason ?? "血圧計 OFF")}
            >
              <HeartPulse size={22} />
              <span>BP</span>
              <strong>{bpDisplay}</strong>
              <small className={`vital-state ${bpRequested ? "vital-state-on" : "vital-state-off"}`}>
                {bpRequested ? "BP ON" : "BP OFF"}
              </small>
            </button>
            <button
              className={`vital vital-button oxygen ${spo2Requested ? "vital-on" : "vital-off"}`}
              disabled={spo2ButtonDisabled}
              onClick={() => {
                if (spo2MonitorCommand && !spo2Requested) {
                  execute(spo2MonitorCommand);
                }
              }}
              type="button"
              title={spo2Requested ? "SpO2 ON" : (spo2BlockReason ?? "SpO2 OFF")}
            >
              <Droplets size={22} />
              <span>SpO2</span>
              <strong>{spo2Display}</strong>
              <small className={`vital-state ${spo2Requested ? "vital-state-on" : "vital-state-off"}`}>
                {spo2Requested ? "SpO2 ON" : "SpO2 OFF"}
              </small>
            </button>
            <button
              className={`vital vital-button temp ${tempRequested ? "vital-on" : "vital-off"}`}
              disabled={tempButtonDisabled}
              onClick={() => {
                if (temperatureMeasurementCommand && !tempRequested) {
                  execute(temperatureMeasurementCommand);
                }
              }}
              type="button"
              title={tempRequested ? "体温測定 ON" : (tempBlockReason ?? "体温測定 OFF")}
            >
              <Thermometer size={22} />
              <span>Temp</span>
              <strong>{hasTemperatureMeasurement ? patient.temp : "--"}</strong>
              <small className={`vital-state ${tempRequested ? "vital-state-on" : "vital-state-off"}`}>
                {tempRequested ? "Temp ON" : "Temp OFF"}
              </small>
            </button>
          </div>

          <div className="gcs-row">
            <div className="vital rr">
              <Wind size={22} />
              <span>RR</span>
              <strong>{rrDisplay}</strong>
            </div>
            <div className="vital">
              <Stethoscope size={22} />
              <span>GCS</span>
              <strong>{hasConsciousnessCheck ? displayedGcs : "--"}</strong>
            </div>
          </div>

          <div className="assessment-grid">
            <Meter label="循環" value={hasCirculationAssessment ? patient.circulation : null} dangerLow />
            <Meter label="出血量" value={diagnosisMet ? patient.bleeding : null} dangerHigh />
            <Meter label="酸素化" value={hasSpo2Monitor ? patient.oxygenation : null} dangerLow />
            <Meter label="ショック" value={hasCirculationAssessment ? patient.shock : null} dangerHigh />
          </div>

          {outcome !== "running" && status !== "ready" ? (
            <div className={`result result-${outcome}`}>
              {outcome === "won"
                ? (requiresPrimarySurvey
                  ? "出血制御への導線を確保。患者は手術室へ搬送されました。"
                  : "バイタルが安定しました。患者はICUに搬送されました。")
                : "ショックが進行し、救命に失敗しました。"}
            </div>
          ) : null}

          <div className="score-panel" aria-label="評価スコア">
            <span className="score-label">評価スコア</span>
            {status === "running" || status === "ready" ? (
              <strong className="score-pending">評価中</strong>
            ) : (
              <>
                <strong className="score-value">{totalScore}</strong>
                <div className="score-breakdown">
                  <span>残り時間 {Math.round(timeScore)}点</span>
                  <span>安定化 {Math.round(stabilizationScore)}点</span>
                  <span>処置評価 {Math.round(commandScore)}点</span>
                </div>
              </>
            )}
          </div>

          <div className="log-panel">
            <div className="log-header">
              <h2>処置ログ</h2>
              <span>経過 {formatTime(patient.elapsed)}</span>
            </div>
            <div className="log-list" ref={logListRef}>
              {log.map((entry, index) => (
                <p className={`log-${entry.tone}`} key={`${entry.time}-${index}`}>
                  <span>{formatTime(entry.time)}</span>
                  {entry.message}
                </p>
              ))}
            </div>
          </div>
        </section>

        <aside className="command-panel">

          <div className="category-actions">
            <button onClick={() => setOpenCategories(commandCategories.map((category) => category.id))}>すべてを表示</button>
            <button onClick={() => setOpenCategories([])}>すべてを閉じる</button>
          </div>

          <div className="command-accordion">
            {commandCategories.map((category) => {
              const expanded = openCategories.includes(category.id);
              const categoryCommands = orderedCommands.filter((command) => command.category === category.id);

              return (
                <section className="command-category" key={category.id}>
                  <button
                    className="category-toggle"
                    onClick={() =>
                      setOpenCategories((current) =>
                        expanded ? current.filter((id) => id !== category.id) : [...current, category.id]
                      )
                    }
                  >
                    <span>{category.label}</span>
                    <ChevronDown className={expanded ? "chevron chevron-open" : "chevron"} size={16} />
                  </button>
                  {expanded ? (
                    <div className="command-grid">
                      {categoryCommands.map((command) => {
                        const done = patient.performed.includes(command.id) && !command.repeatable;
                        const lockedUntil = categoryLocks[command.category] ?? 0;
                        const categoryLocked = command.blocksCategory !== false && lockedUntil > patient.elapsed;
                        const commandLockedUntil = completionTimes[command.id] ?? 0;
                        const commandLocked = command.repeatable && commandLockedUntil > patient.elapsed;
                        const blockReason = getCommandBlockReason(command, patient, completionTimes, winCondition, diagnosisMet);
                        const effectiveGrade = getDisplayedGrade(command, patient, completionTimes, activeDiagnosisId, hasRosc, isCardiacArrestCase);
                        const effectiveEffects = dedupeMessages(
                          getDisplayedEffects(command, patient, completionTimes, activeDiagnosisId, hasRosc, isCardiacArrestCase)
                        );
                        return (
                          <button
                            className={`command command-${effectiveGrade}`}
                            disabled={status !== "running" || done || categoryLocked || commandLocked || Boolean(blockReason)}
                            key={command.id}
                            onClick={() => execute(command)}
                            title={`必要条件: ${command.requiredConditions.join(" / ")}\n影響: ${effectiveEffects.join(" / ")}`}
                          >
                            <span>{command.label}</span>
                            <small>
                              {gradeLabel(effectiveGrade)} / {command.duration}秒
                            </small>
                            {categoryLocked ? <small className="lock-note">完遂待ち {formatTime(lockedUntil - patient.elapsed)}</small> : null}
                            {commandLocked ? <small className="lock-note">再実行待ち {formatTime(commandLockedUntil - patient.elapsed)}</small> : null}
                            {blockReason ? <small className="lock-note">{blockReason}</small> : null}
                            <em>条件: {command.requiredConditions.join(" / ")}</em>
                            <em>影響: {effectiveEffects.join(" / ")}</em>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>

          <section className="debug-panel">
            <button className="debug-toggle" onClick={() => setDebugOpen((current) => !current)}>
              {debugOpen ? "デバッグ情報を閉じる" : "デバッグ情報を表示"}
            </button>
            {debugOpen ? (
              <div className="debug-body">
                <div className="debug-grid">
                  <DebugItem label="elapsed" value={formatTime(patient.elapsed)} />
                  <DebugItem label="BP" value={`${patient.bpSys}/${patient.bpDia}`} />
                  <DebugItem label="shock" value={Math.round(patient.shock)} />
                  <DebugItem label="bleeding" value={Math.round(patient.bleeding)} />
                  <DebugItem label="circulation" value={Math.round(patient.circulation)} />
                  <DebugItem label="oxygenation" value={Math.round(patient.oxygenation)} />
                </div>
                <div className="debug-section">
                  <strong>勝利条件</strong>
                  <p>
                    必須処置 {completedRequirements}/{requiredCommands.length} / SBP {winCondition.stabilization.minBpSys}以上 /
                    shock {winCondition.stabilization.maxShock}未満
                    {requiresPrimarySurvey && primarySurveyCommands.length > 0 ? " / Primary Survey" : ""}
                  </p>
                </div>
                <div className="debug-section">
                  <strong>敗北理由</strong>
                  <p>{lossReasons.length > 0 ? lossReasons.join(" / ") : "なし"}</p>
                </div>
                <div className="debug-section">
                  <strong>カテゴリロック</strong>
                  {commandCategories.map((category) => {
                    const lockedUntil = categoryLocks[category.id] ?? 0;
                    const remainingLock = Math.max(0, lockedUntil - patient.elapsed);
                    return (
                      <p key={category.id}>
                        {category.label}: {remainingLock > 0 ? `${formatTime(remainingLock)} 残り` : "なし"}
                      </p>
                    );
                  })}
                </div>
                <div className="debug-section">
                  <strong>処置完遂時刻</strong>
                  {Object.entries(completionTimes).length > 0 ? (
                    Object.entries(completionTimes).map(([id, completedAt]) => (
                      <p key={id}>
                        {commands.find((command) => command.id === id)?.label ?? id}: {formatTime(completedAt)}
                      </p>
                    ))
                  ) : (
                    <p>なし</p>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </aside>
      </section>
    </main>
  );
}

function DebugItem({ label, value }: { label: string; value: string | number }) {
  return (
    <p>
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  );
}

function Meter({ label, value, dangerHigh, dangerLow }: { label: string; value: number | null; dangerHigh?: boolean; dangerLow?: boolean }) {
  if (value === null) {
    return (
      <div className="meter">
        <div>
          <span>{label}</span>
          <strong>--</strong>
        </div>
        <i>
          <b style={{ width: "0%" }} />
        </i>
      </div>
    );
  }

  const dangerous = dangerHigh ? value >= 75 : dangerLow ? value <= 35 : false;

  return (
    <div className={`meter ${dangerous ? "meter-danger" : ""}`}>
      <div>
        <span>{label}</span>
        <strong>{Math.round(value)}</strong>
      </div>
      <i>
        <b style={{ width: `${value}%` }} />
      </i>
    </div>
  );
}
