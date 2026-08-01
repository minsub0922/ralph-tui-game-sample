import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseReplay, type ReplayFile } from '../sim/replay.ts';

/**
 * 리플레이 파일을 읽는다.
 *
 * 최고 기록과 달리 여기서는 실패를 삼키지 않는다 — 재생은 파일이 전부라서,
 * 읽지 못한 것을 빈 값으로 바꿔 재생하면 "일치한다"는 거짓말이 나온다.
 */
export function loadReplay(path: string): ReplayFile {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`리플레이 파일을 읽을 수 없다: ${path}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(`리플레이 파일이 올바른 JSON 이 아니다: ${path}`);
  }

  return parseReplay(value);
}

/** 리플레이를 저장한다. 손으로 열어 시드를 고쳐 볼 수 있도록 들여쓴 JSON 으로 쓴다. */
export function saveReplay(file: ReplayFile, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
}
