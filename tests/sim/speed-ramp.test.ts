import assert from 'node:assert/strict';
import test from 'node:test';
import { DIFFICULTY_IDS, getConfig } from '../../src/core/difficulty.ts';
import { createGame, effectiveSpeed, speedMultiplier, step } from '../../src/core/game.ts';
import { Input } from '../../src/core/types.ts';
import { LEAD_TICKS, jumpThreshold, jumpThresholdAt } from '../../src/sim/bot.ts';
import { runGame } from '../../src/sim/run.ts';

/** 상한 배속에 도달하고도 한참 더 도는 길이 (가장 늦게 도달하는 slow 기준 2500 tick). */
const LONG_RUN = 8000;

function stateAt(difficulty: string, tick: number) {
  return { ...createGame(getConfig(difficulty), 0), tick };
}

test('임계 거리는 tick 0 에서 기존 값과 같다', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const { track } = getConfig(difficulty);
    assert.equal(jumpThresholdAt(stateAt(difficulty, 0)), jumpThreshold(track));
  }
});

test('임계 거리가 실효 속도에 비례해 늘어난다', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const config = getConfig(difficulty);
    const { track } = config;
    const early = jumpThresholdAt(stateAt(difficulty, 0));
    const late = jumpThresholdAt(stateAt(difficulty, 2000));

    assert.ok(late > early, `${difficulty}: 속도가 올라도 임계 거리가 그대로다`);
    assert.equal(late, track.dinoX + track.dinoWidth + LEAD_TICKS * effectiveSpeed(track, 2000));

    // 배율이 상한에 걸리면 임계 거리도 함께 멈춘다.
    const capped = track.obstacleSpeed * (track.maxSpeedMultiplier ?? 1);
    assert.equal(
      jumpThresholdAt(stateAt(difficulty, 1_000_000)),
      track.dinoX + track.dinoWidth + LEAD_TICKS * capped,
    );
  }
});

test('track 이 없는 state 에서는 임계 거리가 0 이다', () => {
  const { track: _track, ...physicsOnly } = getConfig('normal');
  assert.equal(jumpThresholdAt(createGame(physicsOnly, 0)), 0);
});

test('봇이 상한 배속에 도달한 뒤에도 세 난이도를 완주한다', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const { track } = getConfig(difficulty);

    for (const seed of [0, 1337, 4242]) {
      const result = runGame({ difficulty, seed, ticks: LONG_RUN });
      assert.equal(
        result.survived,
        true,
        `${difficulty} seed ${seed}: ${result.ticks} tick 에서 죽었다`,
      );
    }

    // 완주 구간 끝에서 배율이 실제로 상한까지 올라가 있었는지 확인한다.
    assert.equal(
      speedMultiplier(track, LONG_RUN),
      track.maxSpeedMultiplier ?? 1,
      `${difficulty}: ${LONG_RUN} tick 까지 상한 배속에 닿지 못했다`,
    );
  }
});

test('상한 배속에서도 봇이 뛰는 순간이 회피 가능 구간 안에 있다', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const config = getConfig(difficulty);
    const { track } = config;
    const { track: _ignored, ...physicsOnly } = config;

    // 점프 한 번의 높이 궤적. 장애물이 없으니 물리만 남는다.
    const heights: number[] = [];
    let jump = step(createGame(physicsOnly, 0), Input.Jump);
    while (jump.dino.y > config.groundY) {
      heights.push(jump.dino.y);
      jump = step(jump, Input.None);
    }

    for (const tick of [0, 2000, 1_000_000]) {
      const speed = effectiveSpeed(track, tick);
      const threshold = jumpThresholdAt(stateAt(difficulty, tick));

      // 봇은 x <= threshold 인 첫 tick 에 뛰므로 실제 x 는 (threshold - speed, threshold] 안이다.
      for (const start of [threshold, threshold - speed + 1e-9]) {
        for (const [index, height] of heights.entries()) {
          const x = start - (index + 1) * speed;
          const overlaps = x < track.dinoX + track.dinoWidth && track.dinoX < x + track.obstacleWidth;
          if (!overlaps) continue;
          assert.ok(
            height >= config.groundY + track.obstacleHeight,
            `${difficulty} tick=${tick}: x=${x} 에서 높이 ${height} 로 장애물에 걸린다`,
          );
        }
      }
    }
  }
});

test('임계 거리를 고정하면 속도가 올라도 그 값을 그대로 쓴다', () => {
  const result = runGame({ difficulty: 'fast', seed: 1337, ticks: 500, threshold: 0 });

  assert.equal(result.survived, false);
  assert.deepEqual(result, runGame({ difficulty: 'fast', seed: 1337, ticks: 500, threshold: 0 }));
});
