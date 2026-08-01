import type { DifficultyId } from '../core/difficulty.ts';
import type { GameState } from '../core/types.ts';

/** 그릴 화면 크기. 단위는 문자다. */
export type Viewport = {
  width: number;
  height: number;
};

/**
 * 한 프레임을 그리는 데 필요한 전부.
 *
 * 최고 기록과 신기록 여부는 게임 코어가 아니라 저장소에서 오므로 따로 받는다 —
 * 덕분에 renderFrame 은 파일시스템을 몰라도 HUD 와 게임 오버 패널을 그릴 수 있다.
 */
export type RenderState = {
  game: GameState;
  difficulty: DifficultyId;
  highScore: number;
  isNewRecord: boolean;
};

/** 공룡(2x3)과 선인장(2x2). 히트박스 크기와 같고, 공백 칸은 배경을 덮지 않는다. */
const DINO_SPRITE = ['-@', '##', '/\\'] as const;
const CACTUS_SPRITE = ['\\|', ' |'] as const;

/** 맨 아랫줄을 채우는 지면 문자. */
const GROUND_CHAR = '=';

/** 화면 맨 윗줄은 HUD 전용이다. 본문은 이 줄부터 시작한다. */
const BODY_TOP_ROW = 1;

/** track 이 없는 config(점프 물리만 도는 게임)에서 공룡을 세워 둘 x. */
const FALLBACK_DINO_X = 6;

/**
 * state 를 화면 문자열로 바꾼다. 어떤 I/O 도 하지 않는 순수 함수다.
 *
 * 반환은 언제나 viewport.height 개의 줄이고 각 줄 길이는 정확히 viewport.width 다 —
 * 좌표가 화면 밖으로 나가도 잘릴 뿐 줄 수와 길이는 변하지 않는다.
 */
export function renderFrame(state: RenderState, viewport: Viewport): string[] {
  const width = Math.max(0, Math.trunc(viewport.width));
  const height = Math.max(0, Math.trunc(viewport.height));
  const grid: string[][] = Array.from({ length: height }, () => new Array<string>(width).fill(' '));

  put(grid, 0, 0, hudLine(state));
  drawGround(grid, width, height);
  drawTrack(grid, state.game, height);
  if (state.game.status === 'gameOver') drawGameOver(grid, state, width, height);

  return grid.map((row) => row.join(''));
}

/** 난이도 / 현재 점수 / 최고 점수 한 줄. 자릿수를 고정해 매 tick 마다 폭이 흔들리지 않게 한다. */
function hudLine(state: RenderState): string {
  const difficulty = state.difficulty.toUpperCase().padEnd(6);
  return ` ${difficulty}  SCORE ${digits(state.game.score)}  HI ${digits(state.highScore)}`;
}

function digits(value: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(5, '0');
}

function drawGround(grid: string[][], width: number, height: number): void {
  if (height <= BODY_TOP_ROW) return;
  put(grid, height - 1, 0, GROUND_CHAR.repeat(width));
}

/**
 * 지면 바로 윗줄에 공룡과 선인장을 세운다.
 *
 * 세계 좌표는 위로 갈수록 y 가 커지고 화면은 위로 갈수록 행이 작아지므로,
 * groundY 로부터의 높이를 그대로 빼서 행을 구한다.
 */
function drawTrack(grid: string[][], game: GameState, height: number): void {
  const groundRow = height - 2;
  if (groundRow < BODY_TOP_ROW) return;

  const { config } = game;
  for (const obstacle of game.obstacles) {
    drawSprite(grid, CACTUS_SPRITE, groundRow, Math.round(obstacle.x));
  }

  const dinoRow = groundRow - Math.round(game.dino.y - config.groundY);
  drawSprite(grid, DINO_SPRITE, dinoRow, config.track?.dinoX ?? FALLBACK_DINO_X);
}

/** sprite 의 마지막 줄이 bottomRow 에 오도록 그린다. 화면 밖 칸과 공백 칸은 건너뛴다. */
function drawSprite(
  grid: string[][],
  sprite: readonly string[],
  bottomRow: number,
  left: number,
): void {
  sprite.forEach((line, index) => {
    const row = bottomRow - (sprite.length - 1 - index);
    if (row < BODY_TOP_ROW) return;

    for (let column = 0; column < line.length; column += 1) {
      const char = line[column];
      if (char === undefined || char === ' ') continue;
      setCell(grid, row, left + column, char);
    }
  });
}

/** 화면 한가운데에 게임 오버 박스를 덮어 그린다. 화면보다 크면 잘린다. */
function drawGameOver(grid: string[][], state: RenderState, width: number, height: number): void {
  const lines = boxed([
    'GAME OVER',
    `SCORE ${digits(state.game.score)}`,
    `BEST  ${digits(state.highScore)}`,
    state.isNewRecord ? '* NEW RECORD *' : '',
    'R = RETRY   Q = QUIT',
  ]);

  const boxWidth = lines[0]?.length ?? 0;
  const top = Math.floor((height - lines.length) / 2);
  const left = Math.floor((width - boxWidth) / 2);

  lines.forEach((line, index) => put(grid, top + index, left, line));
}

/** 내용 줄들을 가운데 정렬해 ASCII 테두리로 감싼다. */
function boxed(lines: readonly string[]): string[] {
  const inner = Math.max(...lines.map((line) => line.length)) + 2;
  const border = `+${'-'.repeat(inner)}+`;
  return [border, ...lines.map((line) => `|${centered(line, inner)}|`), border];
}

function centered(text: string, width: number): string {
  const left = Math.max(0, Math.floor((width - text.length) / 2));
  return `${' '.repeat(left)}${text}`.padEnd(width);
}

/** 한 줄을 덮어쓴다. 공백도 그대로 쓰므로 박스 안쪽이 배경을 가린다. */
function put(grid: string[][], row: number, column: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== undefined) setCell(grid, row, column + index, char);
  }
}

/** 화면 밖 좌표는 조용히 버린다 — 잘림이 곧 정상 동작이다. */
function setCell(grid: string[][], row: number, column: number, char: string): void {
  const line = grid[row];
  if (line === undefined || column < 0 || column >= line.length) return;
  line[column] = char;
}
