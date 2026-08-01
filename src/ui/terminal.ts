import { parseKey, type Key } from './keys.ts';
import type { Viewport } from './render.ts';

/** PRODUCT.md 가 정한 최소 터미널 크기. 이보다 작으면 게임을 시작하지 않는다. */
export const MIN_VIEWPORT: Viewport = { width: 60, height: 16 };

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
/** 대체 화면 버퍼. 나갈 때 원래 터미널 내용이 그대로 돌아온다. */
const ENTER_ALT_SCREEN = '\x1b[?1049h';
const LEAVE_ALT_SCREEN = '\x1b[?1049l';
const CURSOR_HOME = '\x1b[H';

/** Ctrl+C 로 죽은 프로세스의 관례적 종료 코드. */
const SIGINT_EXIT_CODE = 130;

/**
 * 게임이 도는 동안 잡고 있는 터미널. 이 모듈만 stdout 에 쓴다.
 *
 * viewport 는 열 때 한 번 재고 그대로 유지한다 — 실행 중 리사이즈 대응은 non-goal 이다.
 */
export type Terminal = {
  readonly viewport: Viewport;
  /** 한 프레임을 화면에 덮어 그린다. 줄 수와 길이는 호출자가 맞춰서 준다. */
  draw(lines: readonly string[]): void;
  /** 키 처리기를 갈아 끼운다. 메뉴와 게임이 같은 stdin 을 나눠 쓴다. */
  onKey(handler: (key: Key) => void): void;
  /** raw mode 와 커서를 원래대로 되돌린다. 여러 번 불러도 안전하다. */
  close(): void;
};

/** TTY 가 아니면 크기를 알 수 없으므로 최소 규격으로 간주한다. */
export function readViewport(): Viewport {
  return {
    width: process.stdout.columns ?? MIN_VIEWPORT.width,
    height: process.stdout.rows ?? MIN_VIEWPORT.height,
  };
}

export function isTooSmall(viewport: Viewport): boolean {
  return viewport.width < MIN_VIEWPORT.width || viewport.height < MIN_VIEWPORT.height;
}

export function tooSmallMessage(viewport: Viewport): string {
  return [
    `터미널이 너무 작다: ${viewport.width}x${viewport.height}`,
    `최소 ${MIN_VIEWPORT.width}x${MIN_VIEWPORT.height} 이 필요하다. 창을 키운 뒤 다시 실행한다.`,
  ].join('\n');
}

/** 게임 화면이 아닌 안내 문구. 화면을 잡기 전이나 놓은 뒤에만 쓴다. */
export function printNotice(message: string): void {
  process.stderr.write(`${message}\n`);
}

/**
 * 터미널을 게임용으로 바꾼다: raw mode, 커서 숨김, 대체 화면.
 *
 * 정상 종료 / Ctrl+C(raw mode 에서는 0x03 바이트, 아니면 SIGINT) / 예외 어느 경로로 끝나도
 * close 가 한 번은 불리도록 process 이벤트에도 같은 함수를 걸어 둔다.
 */
export function openTerminal(): Terminal {
  const { stdin, stdout } = process;
  const viewport = readViewport();

  let handler: (key: Key) => void = () => {};
  let closed = false;

  const onData = (chunk: Buffer): void => {
    const key = parseKey(chunk);
    if (key !== null) handler(key);
  };

  const close = (): void => {
    if (closed) return;
    closed = true;

    stdin.off('data', onData);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
    stdout.write(`${SHOW_CURSOR}${LEAVE_ALT_SCREEN}`);

    process.off('exit', close);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  };

  const onSignal = (): void => {
    close();
    process.exit(SIGINT_EXIT_CODE);
  };

  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.on('data', onData);
  process.on('exit', close);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  stdout.write(`${ENTER_ALT_SCREEN}${HIDE_CURSOR}`);

  return {
    viewport,
    draw(lines) {
      stdout.write(`${CURSOR_HOME}${lines.join('\r\n')}`);
    },
    onKey(next) {
      handler = next;
    },
    close,
  };
}
