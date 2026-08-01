import { Input } from '../core/types.ts';

/**
 * 터미널이 한 번에 넘겨주는 입력 덩어리.
 *
 * raw mode 의 stdin 은 Buffer(=Uint8Array) 를 주고, 테스트는 문자열이 편하다.
 * 둘 다 받되 안에서는 코드 배열 하나로 다룬다.
 */
export type KeyBytes = Uint8Array | readonly number[] | string;

/** 이 게임이 알아듣는 키 전부. 여기 없는 키는 전부 무시된다. */
export const Key = {
  Jump: 'jump',
  Quit: 'quit',
  Retry: 'retry',
  Up: 'up',
  Down: 'down',
  Enter: 'enter',
  One: 'one',
  Two: 'two',
  Three: 'three',
} as const;

export type Key = (typeof Key)[keyof typeof Key];

const ESC = 0x1b;
/** ESC 다음에 오는 도입 문자. '[' 는 일반, 'O' 는 application cursor mode 다. */
const CSI = 0x5b;
const SS3 = 0x4f;
const ARROW_UP = 0x41;
const ARROW_DOWN = 0x42;

/** raw mode 에서 Ctrl+C 는 시그널이 아니라 0x03 바이트로 들어온다. */
function keyOf(code: number): Key | null {
  switch (code) {
    case 0x20:
      return Key.Jump;
    case 0x03:
    case 0x71:
    case 0x51:
      return Key.Quit;
    case 0x72:
    case 0x52:
      return Key.Retry;
    case 0x0d:
    case 0x0a:
      return Key.Enter;
    case 0x31:
      return Key.One;
    case 0x32:
      return Key.Two;
    case 0x33:
      return Key.Three;
    default:
      return null;
  }
}

function codesOf(bytes: KeyBytes): number[] {
  if (typeof bytes !== 'string') return Array.from(bytes);

  const codes: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) codes.push(bytes.charCodeAt(index));
  return codes;
}

/**
 * 한 덩어리를 키 목록으로 쪼갠다.
 *
 * 방향키는 ESC [ A 처럼 세 바이트로 오므로, 모르는 이스케이프 시퀀스도 세 바이트를
 * 통째로 버린다 — 그래야 남은 바이트가 엉뚱한 키로 새어 들어가지 않는다.
 */
function tokenize(codes: readonly number[]): Key[] {
  const keys: Key[] = [];

  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index];
    if (code === undefined) continue;

    if (code === ESC) {
      const introducer = codes[index + 1];
      if (introducer !== CSI && introducer !== SS3) continue;

      const final = codes[index + 2];
      if (final === ARROW_UP) keys.push(Key.Up);
      else if (final === ARROW_DOWN) keys.push(Key.Down);
      index += 2;
      continue;
    }

    const key = keyOf(code);
    if (key !== null) keys.push(key);
  }

  return keys;
}

/**
 * 입력 바이트를 키 하나로 바꾸는 순수 함수. 알아듣지 못하는 입력은 null 이다.
 *
 * 키를 빠르게 연타하면 한 덩어리에 여러 키가 섞여 오는데, 그중 종료가 있으면
 * 무조건 종료를 낸다 — 종료 입력은 어떤 경우에도 놓치면 안 된다.
 */
export function parseKey(bytes: KeyBytes): Key | null {
  const keys = tokenize(codesOf(bytes));
  if (keys.includes(Key.Quit)) return Key.Quit;
  return keys[0] ?? null;
}

/** 게임 코어가 받는 입력으로 낮춘다. 코어가 아는 조작은 점프 하나뿐이다. */
export function toInput(key: Key | null): Input {
  return key === Key.Jump ? Input.Jump : Input.None;
}
