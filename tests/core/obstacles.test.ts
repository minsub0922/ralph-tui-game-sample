import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, step } from '../../src/core/game.ts';
import { createRng } from '../../src/core/rng.ts';
import { Input, type GameConfig, type GameState, type TrackConfig } from '../../src/core/types.ts';

const TRACK: TrackConfig = {
  dinoX: 4,
  dinoWidth: 2,
  dinoHeight: 3,
  spawnX: 60,
  obstacleWidth: 2,
  obstacleHeight: 2,
  obstacleSpeed: 1,
  minGap: 20,
  maxGap: 34,
};

const CONFIG: GameConfig = {
  groundY: 0,
  jumpVelocity: 1.6,
  gravity: 0.35,
  ticksPerPoint: 4,
  track: TRACK,
};

/** minGap 불변식을 확인하기에 충분히 긴 판. */
const LONG_RUN = 1500;

const DINO_RIGHT = TRACK.dinoX + TRACK.dinoWidth;

/**
 * 지면에 있고 다음 장애물이 코앞일 때만 점프하는 결정론적 봇.
 *
 * 점프 궤적(jumpVelocity 1.6 / gravity 0.35)은 10 tick 체공하며 그중 7 tick 을
 * obstacleHeight 위에서 보낸다. 장애물과 겹치는 구간은 3 tick 이므로,
 * 앞으로 1~3 칸 남았을 때 뛰면 장애물 바로 위를 지나간다.
 */
function botInput(state: GameState): Input {
  if (state.dino.y > state.config.groundY) return Input.None;

  const ahead = state.obstacles.find((o) => o.x + TRACK.obstacleWidth > TRACK.dinoX);
  if (ahead === undefined) return Input.None;

  const distance = ahead.x - DINO_RIGHT;
  return distance >= 1 && distance <= 3 ? Input.Jump : Input.None;
}

function runWithBot(seed: number, ticks: number, onTick?: (state: GameState) => void): GameState {
  let state = createGame(CONFIG, seed);
  for (let i = 0; i < ticks; i += 1) {
    state = step(state, botInput(state));
    onTick?.(state);
  }
  return state;
}

/**
 * 히트박스 경계만 보기 위해 장애물을 세워 둔 state.
 *
 * obstacleSpeed 0 + 넉넉한 nextGap 이라 step 을 한 번 돌려도 장애물이
 * 움직이거나 새로 생기지 않는다. vy 가 0 이므로 공룡의 y 도 그대로다.
 */
function frozenState(obstacleX: number, dinoY: number): GameState {
  return {
    config: { ...CONFIG, track: { ...TRACK, obstacleSpeed: 0 } },
    status: 'running',
    tick: 0,
    score: 0,
    dino: { y: dinoY, vy: 0 },
    obstacles: [{ x: obstacleX }],
    nextGap: 1000,
    rng: createRng(1),
  };
}

function statusAt(obstacleX: number, dinoY: number): string {
  const after = step(frozenState(obstacleX, dinoY), Input.None);
  assert.deepEqual(after.obstacles, [{ x: obstacleX }], '경계 테스트에서 장애물이 움직였다');
  assert.equal(after.dino.y, dinoY, '경계 테스트에서 공룡이 움직였다');
  return after.status;
}

test('점프하지 않고 방치하면 유한한 tick 안에 gameOver 가 된다', () => {
  let state = createGame(CONFIG, 7);
  for (let i = 0; i < 500 && state.status === 'running'; i += 1) {
    state = step(state, Input.None);
  }

  assert.equal(state.status, 'gameOver');
  assert.ok(state.tick < 500, `너무 오래 살아남았다: tick=${state.tick}`);
});

test('타이밍을 맞춰 점프하면 장애물 위를 지나 계속 살아남는다', () => {
  let spawns = 0;

  const state = runWithBot(4242, LONG_RUN, (current) => {
    assert.equal(current.status, 'running', `tick=${current.tick} 에서 충돌했다`);
    if (current.obstacles.at(-1)?.x === TRACK.spawnX) spawns += 1;
  });

  assert.equal(state.status, 'running');
  assert.equal(state.score, LONG_RUN / 4);
  assert.ok(spawns > 40, `장애물을 충분히 넘지 못했다: ${spawns}개`);
});

test('통과한 장애물이 화면 왼쪽 밖에서 목록에서 제거된다', () => {
  let onScreen = 0;

  const state = runWithBot(11, LONG_RUN, (current) => {
    for (const obstacle of current.obstacles) {
      assert.ok(
        obstacle.x + TRACK.obstacleWidth > 0,
        `화면 밖 장애물이 남아 있다: x=${obstacle.x}`,
      );
    }
    onScreen = Math.max(onScreen, current.obstacles.length);
  });

  // spawnX 60 에 minGap 20 이면 화면 위에 동시에 존재할 수 있는 장애물은 넉넉히 잡아도 4개다.
  assert.ok(onScreen <= 4, `장애물이 쌓이고 있다: 최대 ${onScreen}개`);
  assert.equal(state.tick, LONG_RUN);
});

test('공룡과 장애물이 x 축으로 맞닿기 직전은 running, 겹치면 gameOver', () => {
  // 장애물 왼쪽 모서리가 공룡 오른쪽 모서리에 정확히 닿은 상태.
  assert.equal(statusAt(DINO_RIGHT, 0), 'running');
  assert.equal(statusAt(DINO_RIGHT - 0.01, 0), 'gameOver');

  // 장애물 오른쪽 모서리가 공룡 왼쪽 모서리에 정확히 닿은 상태.
  assert.equal(statusAt(TRACK.dinoX - TRACK.obstacleWidth, 0), 'running');
  assert.equal(statusAt(TRACK.dinoX - TRACK.obstacleWidth + 0.01, 0), 'gameOver');
});

test('x 가 겹쳐도 장애물 높이만큼 떠 있으면 running, 그보다 낮으면 gameOver', () => {
  const overlappingX = DINO_RIGHT - 1;

  assert.equal(statusAt(overlappingX, CONFIG.groundY + TRACK.obstacleHeight), 'running');
  assert.equal(statusAt(overlappingX, CONFIG.groundY + TRACK.obstacleHeight - 0.01), 'gameOver');
});

test('어떤 두 장애물의 간격도 minGap 이상이다', () => {
  let checked = 0;

  runWithBot(20260801, LONG_RUN, (current) => {
    for (let i = 1; i < current.obstacles.length; i += 1) {
      const left = current.obstacles[i - 1];
      const right = current.obstacles[i];
      assert.ok(left !== undefined && right !== undefined);

      const gap = right.x - left.x;
      assert.ok(gap >= TRACK.minGap, `tick=${current.tick} 에서 간격 ${gap} < ${TRACK.minGap}`);
      assert.ok(gap <= TRACK.maxGap + TRACK.obstacleSpeed, `tick=${current.tick} 간격 ${gap} 초과`);
      checked += 1;
    }
  });

  assert.ok(checked > 1000, `간격을 충분히 검사하지 못했다: ${checked}회`);
});

test('gameOver 뒤에는 step 을 100번 호출해도 state 가 그대로다', () => {
  let state = createGame(CONFIG, 7);
  while (state.status === 'running') {
    state = step(state, Input.None);
  }

  const dead = structuredClone(state);
  for (let i = 0; i < 100; i += 1) {
    state = step(state, i % 2 === 0 ? Input.Jump : Input.None);
  }

  assert.equal(state.status, 'gameOver');
  assert.equal(state.score, dead.score);
  assert.deepEqual(state, dead);
});

test('같은 시드는 항상 같은 장애물 배치를 만든다', () => {
  const gapsOf = (seed: number): number[] => {
    const gaps: number[] = [];
    runWithBot(seed, LONG_RUN, (current) => {
      if (current.obstacles.at(-1)?.x === TRACK.spawnX) gaps.push(current.nextGap);
    });
    return gaps;
  };

  const first = gapsOf(99);
  assert.deepEqual(first, gapsOf(99));
  assert.ok(first.length > 10, `장애물이 충분히 생성되지 않았다: ${first.length}개`);

  assert.notDeepEqual(first, gapsOf(100), '다른 시드가 같은 배치를 냈다');
  assert.deepEqual(runWithBot(99, LONG_RUN), runWithBot(99, LONG_RUN));
});

test('점수는 살아 있는 동안 ticksPerPoint 마다 1점씩 오른다', () => {
  let state = createGame(CONFIG, 4242);
  for (let i = 0; i < 200; i += 1) {
    state = step(state, botInput(state));
    assert.equal(state.status, 'running');
    assert.equal(state.score, Math.floor(state.tick / 4));
  }
});

test('track 이 없는 config 는 장애물 없이 점수만 쌓는다', () => {
  const { track: _track, ...noTrack } = CONFIG;

  let state = createGame(noTrack, 1);
  for (let i = 0; i < 200; i += 1) {
    state = step(state, Input.None);
  }

  assert.equal(state.status, 'running');
  assert.deepEqual(state.obstacles, []);
  assert.equal(state.score, 50);
});
