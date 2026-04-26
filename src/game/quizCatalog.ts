import type { CommandId } from "./types";
import tensionPneumothoraxQuizzes from "./quizzes/tensionPneumothorax.json";

export type QuizItem = {
  statement: string;
  isCorrect: boolean;
  explanation: string;
};

export type QuizQuestion = {
  questionType: "correct" | "incorrect";
  prompt: string;
  choices: QuizItem[];
  targetIndex: number;
};

const commandQuizPools: Partial<Record<CommandId, QuizItem[]>> = {
  thoracentesis: tensionPneumothoraxQuizzes,
  chestTube: tensionPneumothoraxQuizzes
};

export function hasQuiz(commandId: CommandId): boolean {
  return commandId in commandQuizPools;
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pickN<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

export function buildQuizQuestion(commandId: CommandId): QuizQuestion | undefined {
  const pool = commandQuizPools[commandId];
  if (!pool || pool.length === 0) return undefined;

  const correctItems = pool.filter((q) => q.isCorrect);
  const incorrectItems = pool.filter((q) => !q.isCorrect);
  if (correctItems.length === 0 || incorrectItems.length < 3 || correctItems.length < 3) return undefined;

  const questionType: "correct" | "incorrect" = Math.random() < 0.5 ? "correct" : "incorrect";
  const prompt = questionType === "correct" ? "次のうち正しいものを選べ" : "次のうち間違っているものを選べ";

  let target: QuizItem;
  let distractors: QuizItem[];
  if (questionType === "correct") {
    [target] = pickN(correctItems, 1);
    distractors = pickN(incorrectItems, 3);
  } else {
    [target] = pickN(incorrectItems, 1);
    distractors = pickN(correctItems, 3);
  }

  const choices = shuffle([target, ...distractors]);
  const targetIndex = choices.indexOf(target);

  return { questionType, prompt, choices, targetIndex };
}
