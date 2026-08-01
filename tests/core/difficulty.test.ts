import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DIFFICULTY_IDS,
  getConfig,
  type DifficultyConfig,
  type DifficultyId,
} from '../../src/core/difficulty.ts';
import { createGame, step } from '../../src/core/game.ts';
import { Input } from '../../src/core/types.ts';

/**
 * 실제 step() 물리로 점프 한 번을 재현해 궤적을 잰다. 프리셋에 적힌 숫자를
 * 다시 계산하는 대신 게임이 실제로 그리는 궤적을 쓴다.
 *
 * - airTicks: 지면을 떠나 있는 tick 수
 * - clearTicks: 그중 장애물 높이 위에 있어 충돌하지 않는 tick 수
 */
function jumpProfile(config: DifficultyConfig): { airTicks: number; clearTicks: number } {
  const { track, ...withoutTrack } = config;
  const clearY = config.groundY + track.obstacleHeight;

  let state = step(createGame(withoutTrack, 0), Input.Jump);
  let airTicks = 0;
  let clearTicks = 0;

  while (state.dino.y > config.groundY) {
    airTicks += 1;
    if (state.dino.y >= clearY) clearTicks += 1;
    state = step(state, Input.None);
  }

  return { airTicks, clearTicks };
}

/** 공룡이 장애물과 겹칠 수 있는 상대 이동 거리. 이 구간을 체공으로 넘겨야 한다. */
function dangerWidth(config: DifficultyConfig): number {
  return config.track.obstacleWidth + config.track.dinoWidth;
}

/**
 * 앞 장애물을 넘고 착지해 다시 뛰기까지 필요한 최소 간격.
 * 체공 + 착지 1 tick 동안 장애물이 이동한 거리에 위험 구간을 더한 값이다.
 */
function avoidableGap(config: DifficultyConfig): number {
  const { airTicks } = jumpProfile(config);
  return (airTicks + 1) * config.track.obstacleSpeed + dangerWidth(config);
}

const CONFIGS = DIFFICULTY_IDS.map((id) => [id, getConfig(id)] as const);

test('DIFFICULTY_IDS 는 slow / normal / fast 세 개다', () => {
  assert.deepEqual([...DIFFICULTY_IDS], ['slow', 'normal', 'fast']);
});

test('세 난이도 모두 최대 점프 체공 거리가 장애물 폭보다 크다', () => {
  for (const [id, config] of CONFIGS) {
    const { airTicks, clearTicks } = jumpProfile(config);
    const clearDistance = clearTicks * config.track.obstacleSpeed;

    assert.ok(airTicks > 0, `${id}: 점프가 뜨지 않는다`);
    assert.ok(
      clearDistance > config.track.obstacleWidth,
      `${id}: 체공 거리 ${clearDistance} <= 장애물 폭 ${config.track.obstacleWidth}`,
    );
    // 실제로 피하려면 공룡 폭까지 함께 지나가야 한다.
    assert.ok(
      clearDistance > dangerWidth(config),
      `${id}: 체공 거리 ${clearDistance} <= 위험 구간 ${dangerWidth(config)}`,
    );
  }
});

test('세 난이도 모두 minGap 이 회피 가능 최소 간격보다 크고 maxGap 보다 작다', () => {
  for (const [id, config] of CONFIGS) {
    const { minGap, maxGap } = config.track;
    const required = avoidableGap(config);

    assert.ok(minGap > required, `${id}: minGap ${minGap} <= 회피 가능 최소 간격 ${required}`);
    assert.ok(minGap < maxGap, `${id}: minGap ${minGap} >= maxGap ${maxGap}`);
  }
});

test('세 난이도 모두 프레임 간격과 점수 간격이 양수다', () => {
  for (const [id, config] of CONFIGS) {
    assert.ok(config.tickMs > 0, `${id}: tickMs ${config.tickMs}`);
    assert.ok((config.ticksPerPoint ?? 1) >= 1, `${id}: ticksPerPoint ${config.ticksPerPoint}`);
    assert.ok(config.jumpVelocity > config.gravity, `${id}: 점프가 중력보다 약하다`);
    assert.ok(config.track.spawnX > config.track.dinoX, `${id}: 장애물이 공룡 뒤에서 생성된다`);
  }
});

test('난이도가 올라갈수록 장애물이 빨라지고 간격이 좁아지고 프레임이 짧아진다', () => {
  const [slow, normal, fast] = ['slow', 'normal', 'fast'].map((id) => getConfig(id));
  assert.ok(slow !== undefined && normal !== undefined && fast !== undefined);

  assert.ok(
    slow.track.obstacleSpeed < normal.track.obstacleSpeed &&
      normal.track.obstacleSpeed < fast.track.obstacleSpeed,
    `속도가 증가하지 않는다: ${slow.track.obstacleSpeed} / ${normal.track.obstacleSpeed} / ${fast.track.obstacleSpeed}`,
  );
  assert.ok(
    slow.track.minGap > normal.track.minGap && normal.track.minGap > fast.track.minGap,
    `minGap 이 감소하지 않는다: ${slow.track.minGap} / ${normal.track.minGap} / ${fast.track.minGap}`,
  );
  assert.ok(
    slow.track.maxGap > normal.track.maxGap && normal.track.maxGap > fast.track.maxGap,
    `maxGap 이 감소하지 않는다: ${slow.track.maxGap} / ${normal.track.maxGap} / ${fast.track.maxGap}`,
  );
  assert.ok(
    slow.tickMs > normal.tickMs && normal.tickMs > fast.tickMs,
    `tickMs 가 감소하지 않는다: ${slow.tickMs} / ${normal.tickMs} / ${fast.tickMs}`,
  );
});

test('모르는 난이도 id 는 고를 수 있는 값과 함께 거절한다', () => {
  assert.throws(
    () => getConfig('nope'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /nope/);
      for (const id of DIFFICULTY_IDS) {
        assert.ok(error.message.includes(id), `에러 메시지에 '${id}' 가 없다: ${error.message}`);
      }
      return true;
    },
  );

  assert.throws(() => getConfig(''), /사용 가능한 값/);
  assert.throws(() => getConfig('SLOW'), /사용 가능한 값/);
});

test('세 난이도 프리셋으로 실제 판이 돌아간다', () => {
  for (const [id, config] of CONFIGS) {
    let state = createGame(config, 12345);
    for (let i = 0; i < 400 && state.status === 'running'; i += 1) {
      state = step(state, Input.None);
    }

    // 점프하지 않았으니 반드시 장애물에 부딪힌다 — 장애물이 실제로 생성됐다는 뜻이다.
    assert.equal(state.status, 'gameOver', `${id}: 400 tick 동안 장애물을 만나지 못했다`);
    assert.equal(state.score, Math.floor(state.tick / (config.ticksPerPoint ?? 1)));
  }
});

test('같은 id 로 얻은 config 는 항상 같은 값이다', () => {
  for (const id of DIFFICULTY_IDS satisfies readonly DifficultyId[]) {
    assert.deepEqual(getConfig(id), getConfig(id));
  }
});
