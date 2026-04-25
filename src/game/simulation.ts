import type {
  Command,
  CommandGrade,
  CommandId,
  CompletionTimes,
  GameStatus,
  LogEntry,
  LossCondition,
  PatientState,
  ProgressionRule,
  WinCondition
} from "./types";

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function shuffleCommands(items: Command[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function deriveVitals(state: PatientState): PatientState {
  const compensation = Math.max(0, state.shock - state.circulation) * 0.4;
  const bpSys = clamp(Math.round(112 - state.shock * 0.55 + state.circulation * 0.18 - state.bleeding * 0.18), 42, 138);
  const bpDia = clamp(Math.round(bpSys * 0.58), 24, 86);
  const hr = clamp(Math.round(96 + state.shock * 0.42 + state.bleeding * 0.18 + compensation), 62, 172);
  const spo2 = clamp(Math.round(89 + state.oxygenation * 0.12 + state.breathing * 0.03), 72, 99);
  const temp = clamp(Number((36.6 - state.bleeding * 0.008 - state.elapsed * 0.001).toFixed(1)), 34.2, 37.2);
  const gcs = state.consciousness < 42 ? "E2V3M5" : state.consciousness < 60 ? "E3V3M6" : "E3V4M6";

  return { ...state, bpSys, bpDia, hr, spo2, temp, gcs };
}

export function isCommandComplete(commandId: CommandId, state: PatientState, completionTimes: CompletionTimes) {
  return state.performed.includes(commandId) && (completionTimes[commandId] ?? Number.POSITIVE_INFINITY) <= state.elapsed;
}

export function isDiagnosisMet(state: PatientState, completionTimes: CompletionTimes, winCondition: WinCondition) {
  const diagnosisRule = winCondition.diagnosisRule;
  if (!diagnosisRule) {
    return false;
  }

  const hasRequiredData = diagnosisRule.requiresCompleted.every((id) => isCommandComplete(id, state, completionTimes));
  const hasShockVital = state.bpSys <= diagnosisRule.shockVital.maxBpSys && state.hr >= diagnosisRule.shockVital.minHr;
  return hasRequiredData && hasShockVital;
}

export function getActiveRequiredCommands(state: PatientState, completionTimes: CompletionTimes, winCondition: WinCondition) {
  if (!winCondition.diagnosisRule) {
    return winCondition.requiredCommands;
  }

  const diagnosisMet = isDiagnosisMet(state, completionTimes, winCondition);
  const activeCommands = diagnosisMet
    ? [...winCondition.requiredCommands, ...winCondition.diagnosisRule.additionalRequiredCommands]
    : winCondition.requiredCommands;

  return [...new Set(activeCommands)];
}

function applyProgressionDelta(
  state: PatientState,
  completionTimes: CompletionTimes,
  progression: ProgressionRule,
  multiplier: number
): PatientState {
  const next = { ...state };

  for (const [key, value] of Object.entries(progression.uncontrolledDelta)) {
    if (value === undefined) {
      continue;
    }

    const stateKey = key as keyof typeof progression.uncontrolledDelta;
    const suppressed = progression.suppressedByCompleted?.some(
      (rule) => rule.stateKey === stateKey && rule.commandIds.every((id) => isCommandComplete(id, state, completionTimes))
    );
    if (suppressed) {
      continue;
    }
    const currentValue = next[stateKey];
    if (typeof currentValue !== "number") {
      continue;
    }

    if (stateKey === "temp") {
      next.temp = clamp(Number((currentValue + value * multiplier).toFixed(1)), 34.2, 37.2);
    } else if (stateKey === "bpSys") {
      next.bpSys = clamp(currentValue + value * multiplier, 0, 160);
    } else if (stateKey === "bpDia") {
      next.bpDia = clamp(currentValue + value * multiplier, 0, 100);
    } else {
      next[stateKey] = clamp(currentValue + value * multiplier, 0, 100) as never;
    }
  }

  return next;
}

export function progressPatient(
  state: PatientState,
  completionTimes: CompletionTimes,
  winCondition: WinCondition,
  progression: ProgressionRule
): PatientState {
  const controlled = getActiveRequiredCommands(state, completionTimes, winCondition).every((id) => isCommandComplete(id, state, completionTimes));
  const multiplier = controlled ? progression.controlledMultiplier : 1;
  const next = applyProgressionDelta({ ...state, elapsed: state.elapsed + 1 }, completionTimes, progression, multiplier);

  return deriveVitals(next);
}

type StateDelta = Partial<Record<keyof Omit<PatientState, "performed" | "gcs">, number>>;

function applyDelta(state: PatientState, delta: StateDelta): PatientState {
  const next = { ...state };

  for (const [key, value] of Object.entries(delta)) {
    if (value === undefined) continue;

    const stateKey = key as keyof StateDelta;
    const currentValue = next[stateKey];
    if (typeof currentValue !== "number") continue;

    if (stateKey === "temp") {
      next.temp = clamp(Number((currentValue + value).toFixed(1)), 34.2, 37.2);
    } else if (stateKey === "bpSys") {
      next.bpSys = clamp(currentValue + value, 0, 160);
    } else if (stateKey === "bpDia") {
      next.bpDia = clamp(currentValue + value, 0, 100);
    } else {
      next[stateKey] = clamp(currentValue + value, 0, 100) as never;
    }
  }

  return next;
}

function applyStateDelta(state: PatientState, command: Command): PatientState {
  return applyDelta(state, command.stateDelta ?? {});
}

function isConditionalProfileActive(command: Command, state: PatientState, completionTimes: CompletionTimes): boolean {
  return (
    command.conditionalProfile !== undefined &&
    (command.conditionalProfile.requiresAnyCompleted.length === 0 ||
      command.conditionalProfile.requiresAnyCompleted.some((id) => isCommandComplete(id, state, completionTimes))) &&
    (command.conditionalProfile.requiresDiagnosisId === undefined ||
      (command.conditionalProfile.requiresDiagnosisId === "massiveHemorrhage" && isDiagnosisMet(state, completionTimes, {
        requiredCommands: [],
        diagnosisRule: {
          id: "massiveHemorrhage",
          shockVital: { maxBpSys: 90, minHr: 120 },
          requiresCompleted: ["fast"],
          additionalRequiredCommands: []
        },
        stabilization: { minBpSys: 0, maxShock: 100 }
      })))
  );
}

export function getEffectiveGrade(command: Command, state: PatientState, completionTimes: CompletionTimes): CommandGrade {
  if (isConditionalProfileActive(command, state, completionTimes)) {
    return command.conditionalProfile!.grade;
  }
  return command.grade;
}

export function getEffectiveEffects(command: Command, state: PatientState, completionTimes: CompletionTimes): string[] {
  if (isConditionalProfileActive(command, state, completionTimes)) {
    return command.conditionalProfile!.effects;
  }
  return command.effects;
}

export function applyCommand(state: PatientState, command: Command, completionTimes: CompletionTimes): PatientState {
  const alreadyDone = state.performed.includes(command.id) && !command.repeatable;
  let next = { ...state };

  if (alreadyDone) {
    next.shock = clamp(next.shock + 2, 0, 100);
    return deriveVitals(next);
  }

  if (!state.performed.includes(command.id)) {
    next.performed = [...next.performed, command.id];
  }

  const conditionalActive = isConditionalProfileActive(command, state, completionTimes);
  const activeDelta =
    conditionalActive && command.conditionalProfile!.stateDelta
      ? command.conditionalProfile!.stateDelta
      : command.stateDelta;
  next = applyDelta(next, activeDelta ?? {});

  if (command.bonusDelta) {
    const prereqsMet = command.bonusDelta.requiresCompleted.every(
      (id) => isCommandComplete(id, state, completionTimes)
    );
    if (prereqsMet) {
      next = applyDelta(next, command.bonusDelta.delta);
    }
  }

  return deriveVitals(next);
}

export function getOutcome(
  state: PatientState,
  completionTimes: CompletionTimes,
  winCondition: WinCondition,
  lossCondition: LossCondition
): GameStatus {
  if (getActiveRequiredCommands(state, completionTimes, winCondition).every((id) => isCommandComplete(id, state, completionTimes))) {
    return "won";
  }

  if (state.bpSys <= lossCondition.minBpSys || state.shock >= lossCondition.maxShock || state.elapsed >= lossCondition.maxElapsed) {
    return "lost";
  }

  return "running";
}

export function commandTone(grade: CommandGrade): LogEntry["tone"] {
  if (grade === "best") return "good";
  if (grade === "harmful") return "bad";
  if (grade === "ineffective") return "warn";
  return "neutral";
}

export function gradeLabel(grade: CommandGrade) {
  const labels: Record<CommandGrade, string> = {
    best: "最善手",
    acceptable: "許容手",
    ineffective: "無効手",
    harmful: "有害手"
  };
  return labels[grade];
}

export function getCommandBlockReason(command: Command, state: PatientState, completionTimes: CompletionTimes, winCondition: WinCondition) {
  for (const requirement of command.requiresCompleted ?? []) {
    const allCompleted = requirement.commandIds.every((id) => isCommandComplete(id, state, completionTimes));
    const anyCompleted =
      requirement.anyOfCommandIds === undefined ||
      requirement.anyOfCommandIds.some((id) => isCommandComplete(id, state, completionTimes));
    const completed = allCompleted && anyCompleted;
    if (!completed) {
      return requirement.message;
    }
  }

  if (command.requiresWinProgress) {
    const requirementsBeforeCommand = command.requiresWinProgress.excludeSelf
      ? getActiveRequiredCommands(state, completionTimes, winCondition).filter((id) => id !== command.id)
      : getActiveRequiredCommands(state, completionTimes, winCondition);
    const completedBeforeCommand = requirementsBeforeCommand.filter((id) => isCommandComplete(id, state, completionTimes)).length;
    if (completedBeforeCommand / requirementsBeforeCommand.length < command.requiresWinProgress.minRatio) {
      return command.requiresWinProgress.message;
    }
  }

  return null;
}
