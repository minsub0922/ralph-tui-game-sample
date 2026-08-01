import { DIFFICULTY_IDS, type DifficultyId } from './difficulty.ts';

/** 난이도별 최고 점수. 아직 한 판도 끝내지 않은 난이도는 키가 없다. */
export type HighScores = Readonly<Partial<Record<DifficultyId, number>>>;

/** 기록이 하나도 없는 상태. 저장 파일이 없거나 읽을 수 없을 때의 출발점이다. */
export const NO_HIGH_SCORES: HighScores = {};

/** 한 판의 결과를 합친 뒤의 기록과, 그 판이 기록을 갈아치웠는지 여부. */
export type MergeResult = {
  scores: HighScores;
  isNewRecord: boolean;
};

/** 점수로 인정할 수 있는 값만 남긴다. 숫자가 아니거나 음수, NaN, 0 이하는 전부 0 이다. */
function points(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** 해당 난이도의 최고 기록. 기록이 없으면 0 이다. */
export function highScoreOf(scores: HighScores, difficulty: DifficultyId): number {
  return points(scores[difficulty]);
}

/**
 * 한 판의 결과를 기록에 합친다. 받은 기록을 변형하지 않는 순수 함수다.
 *
 * 기존 기록을 넘어설 때만 새 기록을 만든다 — 그렇지 않으면 받은 기록을 그대로
 * 돌려주므로 다른 난이도의 값이 이 판 때문에 흔들릴 일이 없다.
 */
export function mergeHighScores(
  current: HighScores,
  difficulty: DifficultyId,
  score: number,
): MergeResult {
  const earned = points(score);
  if (earned <= highScoreOf(current, difficulty)) return { scores: current, isNewRecord: false };

  const scores: Partial<Record<DifficultyId, number>> = { ...current };
  scores[difficulty] = earned;
  return { scores, isNewRecord: true };
}

/**
 * 저장 파일에서 읽은 값을 기록으로 바꾼다.
 *
 * 손으로 고칠 수 있는 파일에서 오는 값이라 아무것도 믿지 않는다 — 아는 난이도의
 * 유효한 점수만 남기고 나머지는 조용히 버린다.
 */
export function parseHighScores(value: unknown): HighScores {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return NO_HIGH_SCORES;

  const source = value as Record<string, unknown>;
  const scores: Partial<Record<DifficultyId, number>> = {};
  for (const id of DIFFICULTY_IDS) {
    const score = points(source[id]);
    if (score > 0) scores[id] = score;
  }
  return scores;
}
