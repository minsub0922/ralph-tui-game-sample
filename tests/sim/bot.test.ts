import assert from 'node:assert/strict';
import test from 'node:test';
import { DIFFICULTY_IDS, getConfig } from '../../src/core/difficulty.ts';
import { createGame, step } from '../../src/core/game.ts';
import { Input, type GameState, type Obstacle } from '../../src/core/types.ts';
import { LEAD_TICKS, chooseInput, jumpThreshold } from '../../src/sim/bot.ts';

/** 장애물 위치만 바꾼 state 를 만든다. 봇 판단에 필요한 것은 공룡 높이와 장애물 x 뿐이다. */
function stateWith(difficulty: string, obstacles: Obstacle[], dinoY = 0): GameState {
  const config = getConfig(difficulty);
  return { ...createGame(config, 0), obstacles, dino: { y: config.groundY + dinoY, vy: 0 } };
}

test('임계 거리는 공룡 오른쪽 끝에서 LEAD_TICKS tick 만큼 앞이다', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const { track } = getConfig(difficulty);
    assert.equal(
      jumpThreshold(track),
      track.dinoX + track.dinoWidth + LEAD_TICKS * track.obstacleSpeed,
    );
    // 속도가 빠를수록 더 일찍 뛰어야 한다.
    assert.ok(jumpThreshold(track) > track.dinoX + track.dinoWidth);
  }
});

test('임계 거리 안에 든 장애물에만 점프한다', () => {
  const { track } = getConfig('normal');
  const threshold = jumpThreshold(track);

  assert.equal(chooseInput(stateWith('normal', [{ x: threshold + 0.1 }]), threshold), Input.None);
  assert.equal(chooseInput(stateWith('normal', [{ x: threshold }]), threshold), Input.Jump);
  assert.equal(chooseInput(stateWith('normal', [{ x: threshold - 1 }]), threshold), Input.Jump);
});

test('장애물이 없으면 점프하지 않는다', () => {
  const threshold = jumpThreshold(getConfig('normal').track);
  assert.equal(chooseInput(stateWith('normal', []), threshold), Input.None);
});

test('체공 중에는 임계 거리 안에 장애물이 있어도 입력을 내지 않는다', () => {
  const threshold = jumpThreshold(getConfig('normal').track);
  assert.equal(chooseInput(stateWith('normal', [{ x: 8 }], 1.6), threshold), Input.None);
});

test('이미 지나간 장애물은 무시하고 그 다음 장애물을 본다', () => {
  const { track } = getConfig('normal');
  const threshold = jumpThreshold(track);
  const passed = { x: track.dinoX - track.obstacleWidth };

  assert.equal(chooseInput(stateWith('normal', [passed]), threshold), Input.None);
  assert.equal(
    chooseInput(stateWith('normal', [passed, { x: threshold - 0.5 }]), threshold),
    Input.Jump,
  );
  assert.equal(
    chooseInput(stateWith('normal', [passed, { x: threshold + 5 }]), threshold),
    Input.None,
  );
});

test('임계 거리가 0 이면 봇은 뛰지 않고 죽는다', () => {
  const config = getConfig('normal');
  let state = createGame(config, 1);
  for (let i = 0; i < 200 && state.status === 'running'; i += 1) {
    assert.equal(chooseInput(state, 0), Input.None);
    state = step(state, chooseInput(state, 0));
  }
  assert.equal(state.status, 'gameOver');
});

test('봇이 뛰는 순간의 장애물 위치가 세 난이도 모두 회피 가능 구간 안에 있다', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const config = getConfig(difficulty);
    const { track } = config;
    const threshold = jumpThreshold(track);

    // 점프를 시작해도 되는 x 구간: 뛴 직후 1 tick 은 아직 낮고, 마지막 1~2 tick 도 낮다.
    // 그 사이 tick 동안만 장애물이 위험 구간(dinoX - obstacleWidth ~ dinoX + dinoWidth)을 지나야 한다.
    const { track: _ignored, ...physicsOnly } = config;
    let state = createGame(physicsOnly, 0);
    const heights: number[] = [];
    state = step(state, Input.Jump);
    while (state.dino.y > config.groundY) {
      heights.push(state.dino.y);
      state = step(state, Input.None);
    }

    // 봇은 x <= threshold 인 첫 tick 에 뛰므로 실제 x 는 (threshold - speed, threshold] 안이다.
    for (const start of [threshold, threshold - track.obstacleSpeed + 1e-9]) {
      for (const [index, height] of heights.entries()) {
        const x = start - (index + 1) * track.obstacleSpeed;
        const overlaps = x < track.dinoX + track.dinoWidth && track.dinoX < x + track.obstacleWidth;
        if (!overlaps) continue;
        assert.ok(
          height >= config.groundY + track.obstacleHeight,
          `${difficulty}: x=${x} 에서 높이 ${height} 로 장애물(높이 ${track.obstacleHeight})에 걸린다`,
        );
      }
    }
  }
});
