import { useEffect, useRef } from "react";
import type { GameStatus } from "./types";

type Props = {
  hr: number;
  shock: number;
  status: GameStatus;
  rhythmHint?: Rhythm;
};

type Rhythm = "sinus" | "bradycardia" | "vt" | "vf" | "asystole";

const SCROLL_PPS = 150;
const LINE_COLOR = "#74ff93";
const GLOW_COLOR = "rgba(116,255,147,0.9)";
const BG_COLOR = "#06110b";

function getRhythm(shock: number, status: GameStatus, lostSec: number, rhythmHint?: Rhythm): Rhythm {
  if (status === "lost") return rhythmHint === "vf" && lostSec < 2.5 ? "vf" : "asystole";
  if (status === "won") return "sinus";
  if (rhythmHint) return rhythmHint;
  if (shock >= 94) return "bradycardia";
  if (shock >= 88) return "vt";
  return "sinus";
}

function getRr(hr: number, rhythm: Rhythm): number {
  if (rhythm === "vf" || rhythm === "asystole") return 1;
  return 60 / Math.max(20, hr);
}

// Standard PQRST complex — phase 0..1 within one RR interval
function pqrst(phase: number): number {
  // P wave
  if (phase >= 0.10 && phase < 0.22) return Math.sin(((phase - 0.10) / 0.12) * Math.PI) * 0.18;
  // Q
  if (phase >= 0.23 && phase < 0.27) return -Math.sin(((phase - 0.23) / 0.04) * Math.PI) * 0.10;
  // R
  if (phase >= 0.27 && phase < 0.36) return Math.sin(((phase - 0.27) / 0.09) * Math.PI) * 1.0;
  // S
  if (phase >= 0.36 && phase < 0.42) return -Math.sin(((phase - 0.36) / 0.06) * Math.PI) * 0.22;
  // T wave
  if (phase >= 0.45 && phase < 0.67) return Math.sin(((phase - 0.45) / 0.22) * Math.PI) * 0.34;
  return 0;
}

// Extreme VT as continuous QRS-only repetition: one broad tall positive limb and one narrow deep negative limb
function vtWave(phase: number): number {
  if (phase < 0.76) {
    const x = phase / 0.76;
    return 1.04 * (1 - (x * 2 - 1) ** 2);
  }
  const x = (phase - 0.76) / 0.24;
  return -1.02 * Math.sin(x * Math.PI);
}

// Chaotic multi-frequency noise — simulates coarse VF
function vfWave(t: number): number {
  const a = Math.sin(t * Math.PI * 2 * 5.3) * 0.55;
  const b = Math.sin(t * Math.PI * 2 * 7.7 + 1.2) * 0.35;
  const c = Math.sin(t * Math.PI * 2 * 3.1 + 0.8) * 0.42;
  const d = Math.sin(t * Math.PI * 2 * 11.3 + 2.1) * 0.20;
  return (a + b + c + d) / 1.52;
}

function getY(t: number, rhythm: Rhythm, rr: number): number {
  if (rhythm === "asystole") return Math.sin(t * 180) * 0.025;
  if (rhythm === "vf") return vfWave(t);
  const phase = (t % rr) / rr;
  return rhythm === "vt" ? vtWave(phase) : pqrst(phase);
}

function getAmplitudeScale(height: number, rhythm: Rhythm): number {
  if (rhythm === "vt") return height * 0.47;
  return height * 0.42;
}

export function EcgWaveform({ hr, shock, status, rhythmHint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef(performance.now());
  const lostAtRef = useRef<number | null>(null);
  const frozenAtRef = useRef<number | null>(null);

  // Mirror props into refs so the animation loop always reads the latest values
  // without needing to restart the loop on every prop change
  const hrRef = useRef(hr);
  const shockRef = useRef(shock);
  const statusRef = useRef(status);
  const rhythmHintRef = useRef(rhythmHint);

  useEffect(() => {
    hrRef.current = hr;
  }, [hr]);

  useEffect(() => {
    shockRef.current = shock;
  }, [shock]);

  useEffect(() => {
    rhythmHintRef.current = rhythmHint;
  }, [rhythmHint]);

  useEffect(() => {
    if (status === "lost" && statusRef.current !== "lost") {
      lostAtRef.current = performance.now();
    }
    if (status !== "lost") {
      lostAtRef.current = null;
    }
    if ((status === "won" || status === "lost") && statusRef.current === "running") {
      frozenAtRef.current = performance.now();
    }
    if (status === "ready" || status === "running") {
      frozenAtRef.current = null;
    }
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = () => window.devicePixelRatio || 1;

    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * dpr();
      canvas.height = canvas.offsetHeight * dpr();
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth * dpr();
    canvas.height = canvas.offsetHeight * dpr();

    function draw(now: number) {
      const ctx = canvas!.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const scale = dpr();
      const W = canvas!.width;
      const H = canvas!.height;

      if (W === 0 || H === 0) {
        canvas!.width = canvas!.offsetWidth * scale;
        canvas!.height = canvas!.offsetHeight * scale;
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const lostSec = lostAtRef.current !== null ? (now - lostAtRef.current) / 1000 : 0;
      const rhythm = getRhythm(shockRef.current, statusRef.current, lostSec, rhythmHintRef.current);
      const rr = getRr(hrRef.current, rhythm);
      const renderNow = frozenAtRef.current ?? now;
      const currentT = (renderNow - startRef.current) / 1000;

      ctx.clearRect(0, 0, W, H);

      ctx.beginPath();
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = 2.5 * scale;
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      const midY = H / 2;
      const amp = getAmplitudeScale(H, rhythm);
      const pxPerSec = SCROLL_PPS * scale;

      for (let x = 0; x <= W; x++) {
        const t = currentT - (W - x) / pxPerSec;
        const y = midY - getY(t, rhythm, rr) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Fade left edge to give a clean scroll appearance
      const fade = ctx.createLinearGradient(0, 0, W * 0.10, 0);
      fade.addColorStop(0, BG_COLOR);
      fade.addColorStop(1, "transparent");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, W * 0.10, H);

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />;
}
