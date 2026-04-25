import { Activity, ChevronDown, Clock, Droplets, HeartPulse, Play, RotateCcw, ShieldAlert, Stethoscope } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { gameCases } from "./game/cases";
import { EcgWaveform } from "./game/EcgWaveform";
import { commandCategories } from "./game/traumaShockCase";
import {
  applyCommand,
  commandTone,
  formatTime,
  getCommandBlockReason,
  getOutcome,
  gradeLabel,
  isCommandComplete,
  progressPatient,
  shuffleCommands
} from "./game/simulation";
import type { Command, CommandCategoryId, CompletionTimes, GameCase, GameStatus, LogEntry } from "./game/types";

export function App() {
  const [activeCase, setActiveCase] = useState<GameCase>(gameCases[0]);
  const { commands, initialPatient, lossCondition, progression, winCondition } = activeCase;
  const [patient, setPatient] = useState(activeCase.initialPatient);
  const [status, setStatus] = useState<GameStatus>("ready");
  const [openCategories, setOpenCategories] = useState<CommandCategoryId[]>([]);
  const [shuffledCommands, setShuffledCommands] = useState<Command[]>(() => shuffleCommands(commands));
  const [categoryLocks, setCategoryLocks] = useState<Partial<Record<CommandCategoryId, number>>>({});
  const [completionTimes, setCompletionTimes] = useState<CompletionTimes>({});
  const [debugOpen, setDebugOpen] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([
    { time: 0, message: activeCase.metadata.initialLog, tone: "neutral" }
  ]);

  useEffect(() => {
    if (status !== "running") {
      return;
    }

    const timer = window.setInterval(() => {
      setPatient((current) => {
        const next = progressPatient(current, completionTimes, winCondition, progression);
        const outcome = getOutcome(next, completionTimes, winCondition, lossCondition);
        if (outcome !== "running") {
          setStatus(outcome);
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [completionTimes, status]);

  const outcome = useMemo(() => getOutcome(patient, completionTimes, winCondition, lossCondition), [completionTimes, lossCondition, patient, winCondition]);
  const remaining = Math.max(0, 360 - patient.elapsed);
  const requiredCommands = winCondition.requiredCommands;
  const completedRequirements = requiredCommands.filter((id) => isCommandComplete(id, patient, completionTimes)).length;
  const bpStable = patient.bpSys >= winCondition.stabilization.minBpSys;
  const shockStable = patient.shock < winCondition.stabilization.maxShock;
  const hasSpo2Monitor = isCommandComplete("spo2Monitor", patient, completionTimes);
  const hasBpCuff = isCommandComplete("bpCuff", patient, completionTimes);
  const hasEcgMonitor = isCommandComplete("ecgMonitor", patient, completionTimes);
  const hasTemperatureMeasurement = isCommandComplete("temperatureMeasurement", patient, completionTimes);

  function start() {
    setStatus("running");
    setLog((current) => [{ time: 0, message: "シミュレーション開始。出血性ショックとして初期対応を進めます。", tone: "neutral" }, ...current]);
  }

  function reset() {
    resetCase(activeCase);
  }

  function resetCase(nextCase: GameCase) {
    setPatient(nextCase.initialPatient);
    setStatus("ready");
    setOpenCategories([]);
    setShuffledCommands(shuffleCommands(nextCase.commands));
    setCategoryLocks({});
    setCompletionTimes({});
    setLog([{ time: 0, message: nextCase.metadata.initialLog, tone: "neutral" }]);
  }

  function selectCase(caseId: string) {
    const nextCase = gameCases.find((item) => item.id === caseId);
    if (!nextCase) {
      return;
    }

    setActiveCase(nextCase);
    resetCase(nextCase);
  }

  function execute(command: Command) {
    if (status !== "running") {
      return;
    }

    const lockedUntil = categoryLocks[command.category] ?? 0;
    const blockReason = getCommandBlockReason(command, patient, completionTimes, winCondition);
    if ((command.blocksCategory !== false && lockedUntil > patient.elapsed) || blockReason) {
      return;
    }

    setPatient((current) => {
      const next = applyCommand(current, command);
      const nextOutcome = getOutcome(next, completionTimes, winCondition, lossCondition);
      setStatus(nextOutcome);
      if (command.blocksCategory !== false) {
        setCategoryLocks((currentLocks) => ({ ...currentLocks, [command.category]: current.elapsed + command.duration }));
      }
      setCompletionTimes((currentTimes) => ({ ...currentTimes, [command.id]: current.elapsed + command.duration }));
      setLog((entries) => [
        {
          time: next.elapsed,
          message: `${command.label}を実施。${gradeLabel(command.grade)}: ${command.effects.join(" / ")}`,
          tone: commandTone(command.grade)
        },
        ...entries
      ]);
      return next;
    });
  }

  return (
    <main className="sim-shell">
      <section className="case-bar">
        <div>
          <p className="eyebrow">{activeCase.metadata.locationLabel}</p>
          <h1>{activeCase.metadata.title}</h1>
        </div>
        <label className="case-select">
          <span>症例</span>
          <select value={activeCase.id} onChange={(event) => selectCase(event.target.value)}>
            {gameCases.map((gameCase) => (
              <option key={gameCase.id} value={gameCase.id}>
                {gameCase.metadata.title}
              </option>
            ))}
          </select>
        </label>
        <div className={`status-pill status-${status}`}>
          {status === "ready" && "待機中"}
          {status === "running" && "対応中"}
          {status === "won" && "救命成功"}
          {status === "lost" && "対応失敗"}
        </div>
      </section>

      <section className="sim-grid">
        <aside className="patient-bay">
          <div className="ems-brief">
            <span>救急隊情報</span>
            <p>{activeCase.metadata.emsBrief}</p>
          </div>

          <div className="patient-scene" aria-label="患者表示">
            <div className="light-rig" />
            <div className="patient-figure">
              <div className="head" />
              <div className="torso">
                <div className="trauma-mark" />
              </div>
              <div className="arm left" />
              <div className="arm right" />
              <div className="leg left" />
              <div className="leg right" />
            </div>
            <div className="stretcher" />
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
            {requiredCommands.map((id) => {
              const command = commands.find((item) => item.id === id)!;
              const done = isCommandComplete(id, patient, completionTimes);
              return (
                <p className={done ? "done" : ""} key={id}>
                  {done ? "完了" : "未実施"}: {command.label}
                </p>
              );
            })}
            <div className="objective-group-title">安定化条件</div>
            <p className={bpStable ? "done" : ""}>
              {bpStable ? "達成" : "未達成"}: SBP {winCondition.stabilization.minBpSys}以上
            </p>
            <p className={shockStable ? "done" : ""}>
              {shockStable ? "達成" : "未達成"}: ショック {winCondition.stabilization.maxShock}未満
            </p>
          </div>
        </aside>

        <section className="monitor-panel">
          <div className="monitor-header">
            <div>
              <p className="eyebrow">Patient Monitor</p>
              <h2>バイタルサイン</h2>
            </div>
            <div className="timer">
              <Clock size={18} />
              {formatTime(remaining)}
            </div>
          </div>

          {hasEcgMonitor ? (
            <div className="waveform" aria-label="心電図波形">
              <EcgWaveform hr={patient.hr} shock={patient.shock} status={status} />
            </div>
          ) : (
            <div className="waveform waveform-off">心電図 未装着</div>
          )}

          <div className="vitals">
            <div className="vital heart">
              <HeartPulse size={22} />
              <span>HR</span>
              <strong>{hasEcgMonitor ? patient.hr : "--"}</strong>
            </div>
            <div className="vital pressure">
              <Activity size={22} />
              <span>BP</span>
              <strong>{hasBpCuff ? `${patient.bpSys}/${patient.bpDia}` : "--/--"}</strong>
            </div>
            <div className="vital oxygen">
              <Droplets size={22} />
              <span>SpO2</span>
              <strong>{hasSpo2Monitor ? `${patient.spo2}%` : "--%"}</strong>
            </div>
            <div className="vital temp">
              <Stethoscope size={22} />
              <span>Temp</span>
              <strong>{hasTemperatureMeasurement ? patient.temp : "--"}</strong>
            </div>
          </div>

          <div className="assessment-grid">
            <Meter label="循環" value={patient.circulation} dangerLow />
            <Meter label="出血量" value={patient.bleeding} dangerHigh />
            <Meter label="酸素化" value={patient.oxygenation} dangerLow />
            <Meter label="ショック" value={patient.shock} dangerHigh />
          </div>

          <div className="gcs-row">
            <span>GCS</span>
            <strong>{patient.gcs}</strong>
            <span>経過 {formatTime(patient.elapsed)}</span>
          </div>

          {outcome !== "running" && status !== "ready" ? (
            <div className={`result result-${outcome}`}>
              {outcome === "won" ? "出血制御への導線を確保。患者は手術室へ搬送されました。" : "ショックが進行し、救命に失敗しました。"}
            </div>
          ) : null}

          <div className="log-panel">
            <h2>処置ログ</h2>
            <div className="log-list">
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
          <div className="action-row">
            <button className="primary-action" onClick={start} disabled={status !== "ready"}>
              <Play size={18} />
              開始
            </button>
            <button className="icon-action" onClick={reset} title="リセット" aria-label="リセット">
              <RotateCcw size={18} />
            </button>
          </div>

          <div className="category-actions">
            <button onClick={() => setOpenCategories(commandCategories.map((category) => category.id))}>すべてを表示</button>
            <button onClick={() => setOpenCategories([])}>すべてを閉じる</button>
          </div>

          <div className="command-accordion">
            {commandCategories.map((category) => {
              const expanded = openCategories.includes(category.id);
              const categoryCommands = shuffledCommands.filter((command) => command.category === category.id);

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
                        const done = patient.performed.includes(command.id);
                        const lockedUntil = categoryLocks[command.category] ?? 0;
                        const categoryLocked = command.blocksCategory !== false && lockedUntil > patient.elapsed;
                        const blockReason = getCommandBlockReason(command, patient, completionTimes, winCondition);
                        return (
                          <button
                            className={`command command-${command.grade}`}
                            disabled={status !== "running" || done || categoryLocked || Boolean(blockReason)}
                            key={command.id}
                            onClick={() => execute(command)}
                            title={`必要条件: ${command.requiredConditions.join(" / ")}\n影響: ${command.effects.join(" / ")}`}
                          >
                            <span>{command.label}</span>
                            <small>
                              {gradeLabel(command.grade)} / {command.duration}秒
                            </small>
                            {categoryLocked ? <small className="lock-note">完遂待ち {formatTime(lockedUntil - patient.elapsed)}</small> : null}
                            {blockReason ? <small className="lock-note">{blockReason}</small> : null}
                            <em>条件: {command.requiredConditions.join(" / ")}</em>
                            <em>影響: {command.effects.join(" / ")}</em>
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
                  </p>
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

function Meter({ label, value, dangerHigh, dangerLow }: { label: string; value: number; dangerHigh?: boolean; dangerLow?: boolean }) {
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
