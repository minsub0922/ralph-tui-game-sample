import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { getConfig } from '../../src/core/difficulty.ts';
import { createGame, step } from '../../src/core/game.ts';
import { createRng } from '../../src/core/rng.ts';
import { Input, type GameConfig, type GameState, type TrackConfig } from '../../src/core/types.ts';
import { renderFrame, type RenderState, type Viewport } from '../../src/ui/render.ts';

const TRACK: TrackConfig = {
  dinoX: 6,
  dinoWidth: 2,
  dinoHeight: 3,
  spawnX: 60,
  obstacleWidth: 2,
  obstacleHeight: 2,
  obstacleSpeed: 1,
  minGap: 26,
  maxGap: 40,
};

const CONFIG: GameConfig = {
  groundY: 0,
  jumpVelocity: 1.6,
  gravity: 0.35,
  ticksPerPoint: 5,
  track: TRACK,
};

/** PRODUCT.md 가 요구하는 최소 터미널 크기. */
const MIN_VIEWPORT: Viewport = { width: 60, height: 16 };

function gameOf(overrides: Partial<GameState> = {}): GameState {
  return {
    config: CONFIG,
    status: 'running',
    tick: 0,
    score: 0,
    dino: { y: CONFIG.groundY, vy: 0 },
    obstacles: [],
    nextGap: 1000,
    rng: createRng(1),
    ...overrides,
  };
}

function stateOf(overrides: Partial<RenderState> = {}): RenderState {
  return {
    game: gameOf(),
    difficulty: 'normal',
    highScore: 0,
    isNewRecord: false,
    ...overrides,
  };
}

/** 특정 문자가 그려진 [행, 열] 좌표를 모두 찾는다. */
function positionsOf(lines: readonly string[], char: string): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  lines.forEach((line, row) => {
    for (let column = 0; column < line.length; column += 1) {
      if (line[column] === char) found.push([row, column]);
    }
  });
  return found;
}

test('src/ui/render.ts 는 process 나 파일시스템을 참조하지 않는다', () => {
  const source = readFileSync(
    join(import.meta.dirname, '..', '..', 'src', 'ui', 'render.ts'),
    'utf8',
  );

  assert.doesNotMatch(source, /\bprocess\b/, 'render.ts 가 process 를 참조한다');
  assert.doesNotMatch(source, /['"]node:/, 'render.ts 가 node 내장 모듈을 참조한다');
});

test('어떤 viewport 에서도 height 개의 줄과 정확히 width 인 줄 길이를 낸다', () => {
  const viewports: Viewport[] = [
    MIN_VIEWPORT,
    { width: 80, height: 24 },
    { width: 120, height: 40 },
    // 규격 미만이거나 퇴화한 크기에서도 크래시 없이 같은 규칙을 지킨다.
    { width: 20, height: 8 },
    { width: 10, height: 3 },
    { width: 4, height: 2 },
    { width: 1, height: 1 },
    { width: 0, height: 0 },
  ];

  const states = [
    stateOf(),
    stateOf({ game: gameOf({ status: 'gameOver', score: 1234 }), highScore: 1234, isNewRecord: true }),
  ];

  for (const viewport of viewports) {
    for (const state of states) {
      const lines = renderFrame(state, viewport);

      assert.equal(lines.length, viewport.height, `${viewport.width}x${viewport.height} 줄 수`);
      for (const line of lines) {
        assert.equal(line.length, viewport.width, `${viewport.width}x${viewport.height} 줄 길이`);
      }
    }
  }
});

test('공룡과 장애물이 좌표에 맞는 행과 열에 그려진다', () => {
  const lines = renderFrame(
    stateOf({ game: gameOf({ obstacles: [{ x: 12 }] }) }),
    { width: 20, height: 8 },
  );

  assert.deepEqual(lines, [
    ' NORMAL  SCORE 00000',
    '                    ',
    '                    ',
    '                    ',
    '      -@            ',
    '      ##    \\|      ',
    '      /\\     |      ',
    '====================',
  ]);
});

test('점프한 높이만큼 공룡이 위쪽 행으로 올라간다', () => {
  const viewport: Viewport = { width: 20, height: 8 };
  const grounded = renderFrame(stateOf(), viewport);
  const airborne = renderFrame(stateOf({ game: gameOf({ dino: { y: 3, vy: 0.5 } }) }), viewport);

  // 몸통('#')은 공룡 스프라이트 가운데 줄이라 행 이동을 그대로 보여준다.
  assert.deepEqual(positionsOf(grounded, '#'), [
    [5, 6],
    [5, 7],
  ]);
  assert.deepEqual(positionsOf(airborne, '#'), [
    [2, 6],
    [2, 7],
  ]);
});

test('소수점 좌표의 장애물은 가장 가까운 열에 그려진다', () => {
  const viewport: Viewport = { width: 40, height: 10 };
  const at = (x: number): number[] =>
    positionsOf(renderFrame(stateOf({ game: gameOf({ obstacles: [{ x }] }) }), viewport), '\\')
      .filter(([, column]) => column !== TRACK.dinoX + 1) // 공룡 다리('/\')의 오른쪽 칸은 제외
      .map(([, column]) => column);

  assert.deepEqual(at(20), [20]);
  assert.deepEqual(at(20.4), [20]);
  assert.deepEqual(at(20.6), [21]);
});

test('화면 경계를 넘는 장애물도 예외 없이 잘려서 렌더된다', () => {
  const viewport: Viewport = { width: 20, height: 8 };
  const state = stateOf({
    game: gameOf({ obstacles: [{ x: -1 }, { x: 19 }, { x: 1000 }, { x: -1000 }] }),
  });

  const lines = renderFrame(state, viewport);
  assert.equal(lines.length, 8);
  for (const line of lines) assert.equal(line.length, 20);

  // x=-1 은 오른쪽 칸('|')만, x=19 는 왼쪽 칸('\')만 화면에 남는다.
  assert.deepEqual(positionsOf(lines, '|'), [
    [5, 0],
    [6, 0],
  ]);
  assert.equal(lines[5]?.[19], '\\');
});

test('HUD 에 난이도와 현재 점수, 최고 점수가 함께 보인다', () => {
  const lines = renderFrame(
    stateOf({ game: gameOf({ score: 42 }), difficulty: 'fast', highScore: 128 }),
    MIN_VIEWPORT,
  );

  const hud = lines[0] ?? '';
  assert.match(hud, /FAST/);
  assert.match(hud, /SCORE 00042/);
  assert.match(hud, /HI 00128/);
  assert.equal(hud.length, MIN_VIEWPORT.width);
});

test('gameOver 는 GAME OVER 와 R / Q 안내를 담은 박스를 화면 중앙에 덮어 그린다', () => {
  const lines = renderFrame(
    stateOf({
      game: gameOf({ status: 'gameOver', score: 77, obstacles: [{ x: 7 }] }),
      highScore: 77,
      isNewRecord: true,
    }),
    MIN_VIEWPORT,
  );

  const screen = lines.join('\n');
  assert.match(screen, /GAME OVER/);
  assert.match(screen, /SCORE 00077/);
  assert.match(screen, /BEST  00077/);
  assert.match(screen, /\* NEW RECORD \*/);
  assert.match(screen, /R = RETRY/);
  assert.match(screen, /Q = QUIT/);

  // 박스는 화면 한가운데에 있고, 위아래로 본문이 남아 있다.
  const boxRows = lines
    .map((line, row) => (line.includes('+---') ? row : -1))
    .filter((row) => row >= 0);
  assert.equal(boxRows.length, 2, '박스 테두리는 위아래 두 줄이다');
  const [top, bottom] = boxRows;
  assert.ok(top !== undefined && bottom !== undefined);
  assert.ok(top > 0, 'HUD 줄을 덮지 않는다');
  assert.ok(bottom < MIN_VIEWPORT.height - 1, '지면 줄을 덮지 않는다');
});

test('신기록이 아니면 NEW RECORD 문구가 없다', () => {
  const lines = renderFrame(
    stateOf({ game: gameOf({ status: 'gameOver', score: 10 }), highScore: 99 }),
    MIN_VIEWPORT,
  );

  const screen = lines.join('\n');
  assert.match(screen, /GAME OVER/);
  assert.doesNotMatch(screen, /NEW RECORD/);
});

test('실제 난이도 프리셋으로 진행한 판을 최소 크기 화면에 그려도 규칙이 유지된다', () => {
  const config = getConfig('fast');

  let game = createGame(config, 1337);
  for (let i = 0; i < 300; i += 1) {
    game = step(game, i % 20 === 0 ? Input.Jump : Input.None);

    const lines = renderFrame(
      { game, difficulty: 'fast', highScore: 500, isNewRecord: false },
      MIN_VIEWPORT,
    );

    assert.equal(lines.length, MIN_VIEWPORT.height);
    for (const line of lines) assert.equal(line.length, MIN_VIEWPORT.width);
  }
});

test('track 이 없는 config 도 공룡과 지면을 그린다', () => {
  const { track: _track, ...noTrack } = CONFIG;
  const lines = renderFrame(stateOf({ game: gameOf({ config: noTrack }) }), {
    width: 20,
    height: 8,
  });

  assert.deepEqual(positionsOf(lines, '@'), [[4, 7]]);
  assert.equal(lines[7], '='.repeat(20));
});
