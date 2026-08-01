import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { NO_HIGH_SCORES, parseHighScores, type HighScores } from '../core/score.ts';

/** 기록 파일 위치. 난이도 전부를 홈 디렉터리 아래 한 파일에 담는다. */
export function defaultScoresPath(): string {
  return join(homedir(), '.tui-dino', 'scores.json');
}

/**
 * 기록을 읽는다. 파일이 없든 JSON 이 깨졌든 내용이 엉뚱하든 빈 기록을 준다 —
 * 저장 파일 하나 때문에 게임이 시작조차 못 하는 일은 없어야 한다.
 */
export function loadHighScores(path: string = defaultScoresPath()): HighScores {
  try {
    return parseHighScores(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return NO_HIGH_SCORES;
  }
}

/**
 * 기록을 저장한다. 임시 파일에 다 쓴 뒤 rename 으로 갈아 끼우므로,
 * 쓰는 도중에 프로세스가 죽어도 기존 파일은 온전한 JSON 으로 남는다.
 *
 * 저장에 실패해도 게임을 멈출 이유는 없다 — 예외를 삼키고 성공 여부만 돌려준다.
 */
export function saveHighScores(scores: HighScores, path: string = defaultScoresPath()): boolean {
  const temporary = `${path}.tmp`;

  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temporary, `${JSON.stringify(scores, null, 2)}\n`, 'utf8');
    renameSync(temporary, path);
    return true;
  } catch {
    discard(temporary);
    return false;
  }
}

/** 갈아 끼우지 못한 임시 파일을 치운다. 못 지워도 다음 저장 때 덮어쓴다. */
function discard(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // 임시 파일이 남는 것뿐이고, 기존 기록 파일은 그대로다.
  }
}
