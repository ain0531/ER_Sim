import { asystoleCase, peaCase, ventricularFibrillationCase, ventricularTachycardiaCase } from "./cardiacArrestCases";
import { traumaShockCase } from "./traumaShockCase";
import { tensionPneumothoraxCase } from "./tensionPneumothoraxCase";

export const gameCases = [
  traumaShockCase,
  tensionPneumothoraxCase,
  ventricularFibrillationCase,
  ventricularTachycardiaCase,
  asystoleCase,
  peaCase
];
