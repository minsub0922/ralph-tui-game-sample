import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DIFFICULTY_IDS,
  getConfig,
  type DifficultyConfig,
} from '../../src/core/difficulty.ts';
import { createGame, effectiveSpeed, speedMultiplier, step } from '../../src/core/game.ts';
import { createRng } from '../../src/core/rng.ts';
import { Input, type GameState, type TrackConfig } from '../../src/core/types.ts';

/** acceptance criteria 가 기준으로 삼는 관측 시점. */
const RAMP_TICK = 2000;

const CONFIGS = DIFFICULTY_IDS.map((id) => [id, getConfig(id)] as const);

/** 배율 설정이 없는 트랙. 램프를 붙이기 전의 config 를 대표한다. */
const FLAT_TRACK: TrackConfig = {
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

/** 체공 tick 수를 실제 물리로 잰다 — 프리셋 숫자를 다시 계산하지 않기 위해서다. */
function airTicks(config: DifficultyConfig): number {
  const { track: _track, ...physicsOnly } = config;

  let state = step(createGame(physicsOnly, 0), Input.Jump);
  let ticks = 0;
  while (state.dino.y > config.groundY) {
    ticks += 1;
    state = step(state, Input.None);
  }
  return ticks;
}

/** 앞 장애물을 넘고 착지해 다시 뛰기까지 필요한 최소 간격. */
function avoidableGap(config: DifficultyConfig, speed: number): number {
  return (airTicks(config) + 1) * speed + config.track.obstacleWidth + config.track.dinoWidth;
}

/**
 * 그 tick 에 장애물이 실제로 움직인 거리를 step() 으로 직접 잰다.
 *
 * nextGap 을 크게 잡아 두면 새 장애물이 끼어들지 않으므로 하나의 x 변화만 남는다.
 */
function movedDistanceAt(config: DifficultyConfig, tick: number): number {
  const start = 50;
  const state: GameState = {
    config,
    status: 'running',
    tick,
    score: 0,
    dino: { y: config.groundY, vy: 0 },
    obstacles: [{ x: start }],
    nextGap: 1000,
    rng: createRng(1),
  };

  const after = step(state, Input.None);
  assert.equal(after.obstacles.length, 1, '측정 도중 장애물이 생성됐다');
  return start - (after.obstacles[0]?.x ?? start);
}

test('배율은 1 에서 시작해 tick 이 지나면 올라간다', () => {
  for (const [id, config] of CONFIGS) {
    assert.equal(speedMultiplier(config.track, 0), 1, `${id}: 시작 배율이 1 이 아니다`);
    assert.ok(
      speedMultiplier(config.track, RAMP_TICK) > 1,
      `${id}: ${RAMP_TICK} tick 에도 배율이 오르지 않는다`,
    );
  }
});

test('2000 tick 의 실효 속도는 0 tick 보다 크고 상한 배속을 넘지 않는다', () => {
  for (const [id, config] of CONFIGS) {
    const { track } = config;
    const cap = track.maxSpeedMultiplier ?? 1;
    const start = effectiveSpeed(track, 0);
    const ramped = effectiveSpeed(track, RAMP_TICK);

    assert.equal(start, track.obstacleSpeed, `${id}: 시작 속도가 프리셋과 다르다`);
    assert.ok(ramped > start, `${id}: ${RAMP_TICK} tick 속도 ${ramped} <= 시작 속도 ${start}`);
    assert.ok(
      ramped <= track.obstacleSpeed * cap,
      `${id}: ${RAMP_TICK} tick 속도 ${ramped} 가 상한 ${track.obstacleSpeed * cap} 을 넘는다`,
    );
    assert.ok(cap > 1, `${id}: 상한 배속 ${cap} 이 1 보다 크지 않다`);
  }
});

test('배율은 단조 증가하다 상한에서 멈춘다', () => {
  for (const [id, config] of CONFIGS) {
    const { track } = config;
    const cap = track.maxSpeedMultiplier ?? 1;

    let previous = speedMultiplier(track, 0);
    for (let tick = 0; tick <= 20000; tick += 100) {
      const current = speedMultiplier(track, tick);
      assert.ok(current >= previous, `${id}: tick=${tick} 에서 배율이 줄었다`);
      assert.ok(current <= cap, `${id}: tick=${tick} 배율 ${current} 이 상한 ${cap} 을 넘는다`);
      previous = current;
    }

    assert.equal(speedMultiplier(track, 1_000_000), cap, `${id}: 아주 긴 판에서 상한이 풀린다`);
    assert.equal(speedMultiplier(track, -5), 1, `${id}: 음수 tick 에서 배율이 1 이 아니다`);
  }
});

test('램프 설정이 없는 트랙은 언제나 시작 속도 그대로다', () => {
  for (const tick of [0, 1, 2000, 100000]) {
    assert.equal(speedMultiplier(FLAT_TRACK, tick), 1);
    assert.equal(effectiveSpeed(FLAT_TRACK, tick), FLAT_TRACK.obstacleSpeed);
  }
});

test('기존 난이도 프리셋의 시작 속도는 그대로다', () => {
  const speeds = DIFFICULTY_IDS.map((id) => getConfig(id).track.obstacleSpeed);
  assert.deepEqual(speeds, [0.7, 1, 1.4]);
});

test('상한 배속에서도 minGap 이 회피 가능 최소 간격보다 크다', () => {
  for (const [id, config] of CONFIGS) {
    const { track } = config;
    const cap = track.maxSpeedMultiplier ?? 1;
    const required = avoidableGap(config, track.obstacleSpeed * cap);

    assert.ok(
      track.minGap > required,
      `${id}: 상한 배속에서 minGap ${track.minGap} <= 회피 가능 최소 간격 ${required}`,
    );
  }
});

test('판이 진행되면 장애물이 실제로 더 멀리 움직인다', () => {
  // x 좌표 뺄셈에서 나오는 부동소수점 오차만 허용한다.
  const EPSILON = 1e-9;

  for (const [id, config] of CONFIGS) {
    const early = movedDistanceAt(config, 0);
    const late = movedDistanceAt(config, RAMP_TICK);

    assert.ok(
      Math.abs(early - config.track.obstacleSpeed) < EPSILON,
      `${id}: 첫 tick 이동 거리 ${early} 가 시작 속도 ${config.track.obstacleSpeed} 와 다르다`,
    );
    assert.ok(late > early, `${id}: ${RAMP_TICK} tick 이동 거리 ${late} <= ${early}`);
    assert.ok(
      Math.abs(late - effectiveSpeed(config.track, RAMP_TICK)) < EPSILON,
      `${id}: 이동 거리 ${late} 가 실효 속도 ${effectiveSpeed(config.track, RAMP_TICK)} 와 다르다`,
    );
  }
});

test('속도가 올라가도 장애물 간격은 minGap 이상 maxGap 이하로 유지된다', () => {
  for (const [id, config] of CONFIGS) {
    const { track } = config;
    let state = createGame(config, 2024);
    let checked = 0;

    // 상한 배속에 도달하고도 한참 더 도는 길이. 충돌은 무시하고 배치만 본다.
    for (let i = 0; i < 12000; i += 1) {
      state = step(state, Input.None);
      if (state.status === 'gameOver') {
        state = { ...state, status: 'running' };
      }

      for (let index = 1; index < state.obstacles.length; index += 1) {
        const left = state.obstacles[index - 1];
        const right = state.obstacles[index];
        assert.ok(left !== undefined && right !== undefined);

        const gap = right.x - left.x;
        assert.ok(gap >= track.minGap, `${id}: tick=${state.tick} 간격 ${gap} < ${track.minGap}`);
        assert.ok(
          gap <= track.maxGap + effectiveSpeed(track, state.tick),
          `${id}: tick=${state.tick} 간격 ${gap} 이 maxGap 을 넘는다`,
        );
        checked += 1;
      }
    }

    assert.ok(checked > 1000, `${id}: 간격을 충분히 검사하지 못했다: ${checked}회`);
  }
});

test('속도가 올라가도 같은 시드 + 같은 입력은 같은 결과를 낸다', () => {
  const config = getConfig('normal');
  const play = (): GameState => {
    let state = createGame(config, 777);
    for (let i = 0; i < 3000; i += 1) {
      state = step(state, i % 17 === 0 ? Input.Jump : Input.None);
    }
    return state;
  };

  assert.deepEqual(play(), play());
});
