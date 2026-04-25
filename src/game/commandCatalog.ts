import type { BaseCommand, CommandCategoryId } from "./types";

export const commandCategories: { id: CommandCategoryId; label: string }[] = [
  { id: "A", label: "A 気道" },
  { id: "B", label: "B 呼吸" },
  { id: "C", label: "C 循環" },
  { id: "D", label: "D 中枢神経" },
  { id: "E", label: "E 環境" },
  { id: "X", label: "X 検査" }
];

export const commandCatalog: BaseCommand[] = [
  { id: "nasalAirway", category: "A", label: "経鼻エアウェイ", duration: 15 },
  { id: "oralAirway", category: "A", label: "経口エアウェイ", duration: 10 },
  { id: "intubation", category: "A", label: "気管挿管", duration: 35 },
  { id: "oxygen", category: "B", label: "酸素投与", duration: 10 },
  { id: "spo2Monitor", category: "B", label: "SpO2モニターを装着", duration: 10 },
  { id: "niv", category: "B", label: "NIV装着", duration: 25 },
  { id: "ventilator", category: "B", label: "人工呼吸器装着", duration: 25 },
  { id: "thoracentesis", category: "B", label: "胸腔穿刺", duration: 15 },
  { id: "chestTube", category: "B", label: "胸腔ドレーン留置", duration: 35 },
  { id: "bpCuff", category: "C", label: "血圧計を装着", duration: 5 },
  { id: "ecgMonitor", category: "C", label: "心電図を装着", duration: 5 },
  { id: "iv", category: "C", label: "ルート確保", duration: 20 },
  { id: "centralLine", category: "C", label: "CV確保", duration: 45 },
  { id: "sheath", category: "C", label: "シース確保", duration: 30 },
  { id: "ecmo", category: "C", label: "ECMO留置", duration: 90 },
  { id: "pericardiocentesis", category: "C", label: "心嚢腔穿刺", duration: 25 },
  { id: "massiveFluid", category: "C", label: "大量輸液", duration: 25 },
  { id: "vasopressor", category: "C", label: "昇圧薬投与", duration: 20 },
  { id: "transfusion", category: "C", label: "輸血", duration: 60, blocksCategory: false },
  { id: "ivr", category: "C", label: "IVR", duration: 45, blocksCategory: false },
  { id: "surgeryContact", category: "C", label: "外科医へ連絡", duration: 15 },
  { id: "fast", category: "C", label: "FAST（超音波検査）", duration: 20 },
  { id: "sedation", category: "D", label: "鎮静薬投与", duration: 10 },
  { id: "analgesia", category: "D", label: "鎮痛薬投与", duration: 10 },
  { id: "nerveBlock", category: "D", label: "神経ブロック", duration: 30 },
  { id: "temperatureMeasurement", category: "E", label: "体温測定", duration: 10 },
  { id: "warming", category: "E", label: "保温", duration: 10 },
  { id: "thermogardWarming", category: "E", label: "サーモガード留置: 加温", duration: 45 },
  { id: "thermogardCooling", category: "E", label: "サーモガード留置: 冷却", duration: 45 },
  { id: "plainCt", category: "X", label: "CT検査（単純）", duration: 45 },
  { id: "chestXray", category: "X", label: "胸部X線検査", duration: 20 }
];
