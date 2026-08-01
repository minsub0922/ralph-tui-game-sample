import { DIFFICULTY_IDS, type DifficultyId } from '../core/difficulty.ts';
import { Key } from './keys.ts';
import type { Viewport } from './render.ts';

/** 난이도 선택 화면의 상태. 커서 위치가 전부다. */
export type MenuState = {
  /** DIFFICULTY_IDS 안의 위치. 항상 유효 범위 안이다. */
  index: number;
};

/** 키 하나를 먹은 뒤의 결과. 화면에 남거나, 게임을 시작하거나, 프로그램을 끝낸다. */
export type MenuOutcome =
  | { kind: 'open'; menu: MenuState }
  | { kind: 'start'; difficulty: DifficultyId }
  | { kind: 'quit' };

/** 처음 커서는 normal 에 둔다 — 부스에서 그냥 Enter 만 쳐도 표준 난이도가 시작된다. */
const DEFAULT_INDEX = 1;

const DESCRIPTIONS: Record<DifficultyId, string> = {
  slow: 'take your time',
  normal: 'the real thing',
  fast: 'good luck',
};

export function createMenu(): MenuState {
  return { index: DEFAULT_INDEX };
}

function clamp(index: number): number {
  return Math.min(DIFFICULTY_IDS.length - 1, Math.max(0, index));
}

function difficultyAt(index: number): DifficultyId {
  return DIFFICULTY_IDS[clamp(index)] ?? DIFFICULTY_IDS[0];
}

/**
 * 메뉴에서 키 하나를 처리한다. 기존 state 를 변형하지 않는 순수 함수다.
 *
 * 1 / 2 / 3 은 Enter 없이 바로 시작한다 — 30초짜리 체험에서 두 번 누르게 할 이유가 없다.
 * 방향키로 고를 때만 Enter 로 확정한다.
 */
export function stepMenu(menu: MenuState, key: Key | null): MenuOutcome {
  switch (key) {
    case Key.Up:
      return { kind: 'open', menu: { index: clamp(menu.index - 1) } };
    case Key.Down:
      return { kind: 'open', menu: { index: clamp(menu.index + 1) } };
    case Key.One:
      return { kind: 'start', difficulty: difficultyAt(0) };
    case Key.Two:
      return { kind: 'start', difficulty: difficultyAt(1) };
    case Key.Three:
      return { kind: 'start', difficulty: difficultyAt(2) };
    case Key.Enter:
      return { kind: 'start', difficulty: difficultyAt(menu.index) };
    case Key.Quit:
      return { kind: 'quit' };
    default:
      return { kind: 'open', menu };
  }
}

/**
 * 메뉴를 화면 문자열로 바꾼다. renderFrame 과 같은 계약을 지키는 순수 함수다 —
 * 항상 viewport.height 개의 줄이고 각 줄 길이는 정확히 viewport.width 다.
 */
export function renderMenu(menu: MenuState, viewport: Viewport): string[] {
  const width = Math.max(0, Math.trunc(viewport.width));
  const height = Math.max(0, Math.trunc(viewport.height));
  const body = menuLines(menu);
  const top = Math.max(0, Math.floor((height - body.length) / 2));

  return Array.from({ length: height }, (_cell, row) => fit(body[row - top] ?? '', width));
}

/** 블록 전체를 같은 열에 왼쪽 정렬한다 — 커서를 옮겨도 글자가 흔들리지 않는다. */
function menuLines(menu: MenuState): string[] {
  const options = DIFFICULTY_IDS.map((id, index) => {
    const cursor = index === menu.index ? '>' : ' ';
    return `   ${cursor} ${index + 1}  ${id.toUpperCase().padEnd(6)}  ${DESCRIPTIONS[id]}`;
  });

  return [
    '   T-REX RUNNER',
    '',
    '   SELECT DIFFICULTY',
    '',
    ...options,
    '',
    '   UP / DOWN + ENTER   or   1 / 2 / 3',
    '   SPACE = JUMP        Q = QUIT',
  ];
}

/** 화면 폭에 맞춰 자르거나 채운다. 폭보다 긴 줄은 잘리는 것이 정상 동작이다. */
function fit(text: string, width: number): string {
  return text.padEnd(width).slice(0, width);
}
