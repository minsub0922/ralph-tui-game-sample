import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createGame, step } from '../../src/core/game.ts';
import { Input, type GameConfig, type GameState } from '../../src/core/types.ts';

const CONFIG: GameConfig = {
  groundY: 0,
  jumpVelocity: 1.6,
  gravity: 0.35,
};

/** 지면이 0 이 아닐 때도 같은 규칙이 성립하는지 보기 위한 두 번째 설정. */
const RAISED_GROUND: GameConfig = { ...CONFIG, groundY: 4 };

/** 점프가 끝나고도 남을 만큼 충분한 tick 수. */
const PLENTY_OF_TICKS = 40;

function run(state: GameState, inputs: readonly Input[]): GameState {
  return inputs.reduce((current, input) => step(current, input), state);
}

function repeat(input: Input, count: number): Input[] {
  return Array.from({ length: count }, () => input);
}

function maxHeight(state: GameState, inputs: readonly Input[]): number {
  let current = state;
  let peak = current.dino.y;
  for (const input of inputs) {
    current = step(current, input);
    peak = Math.max(peak, current.dino.y);
  }
  return peak;
}

test('src/core 는 process 나 파일시스템을 참조하지 않는다', () => {
  const coreDir = join(import.meta.dirname, '..', '..', 'src', 'core');
  const files = readdirSync(coreDir).filter((name) => name.endsWith('.ts'));

  assert.ok(files.length > 0, 'src/core 에 소스 파일이 있어야 한다');
  for (const file of files) {
    const source = readFileSync(join(coreDir, file), 'utf8');
    assert.doesNotMatch(source, /\bprocess\b/, `${file} 이 process 를 참조한다`);
    assert.doesNotMatch(source, /['"]node:(fs|os)['"]/, `${file} 이 node:fs / node:os 를 참조한다`);
  }
});

test('새 게임은 지면 위에 멈춘 채 running 으로 시작한다', () => {
  const state = createGame(CONFIG, 1);

  assert.equal(state.status, 'running');
  assert.equal(state.tick, 0);
  assert.equal(state.dino.y, CONFIG.groundY);
  assert.equal(state.dino.vy, 0);
});

test('지면에서 Jump 를 받으면 다음 tick 에 y 가 groundY 보다 커진다', () => {
  for (const config of [CONFIG, RAISED_GROUND]) {
    const jumped = step(createGame(config, 1), Input.Jump);
    assert.ok(
      jumped.dino.y > config.groundY,
      `groundY=${config.groundY} 에서 점프 후 y=${jumped.dino.y}`,
    );
  }
});

test('입력이 없으면 공룡은 지면에 그대로 있는다', () => {
  const state = run(createGame(CONFIG, 1), repeat(Input.None, PLENTY_OF_TICKS));

  assert.equal(state.dino.y, CONFIG.groundY);
  assert.equal(state.dino.vy, 0);
  assert.equal(state.tick, PLENTY_OF_TICKS);
});

test('점프 뒤 아무 입력이 없으면 정확히 groundY 로 돌아오고 그 아래로 내려가지 않는다', () => {
  for (const config of [CONFIG, RAISED_GROUND]) {
    let state = step(createGame(config, 1), Input.Jump);
    let landed = false;

    for (let i = 0; i < PLENTY_OF_TICKS; i += 1) {
      state = step(state, Input.None);
      assert.ok(state.dino.y >= config.groundY, `y=${state.dino.y} 가 지면 아래로 내려갔다`);
      landed ||= state.dino.y === config.groundY;
    }

    assert.ok(landed, '충분한 tick 안에 착지해야 한다');
    assert.equal(state.dino.y, config.groundY);
    assert.equal(state.dino.vy, 0);
  }
});

test('체공 중 Jump 를 계속 눌러도 최고 높이가 1회 점프와 같다', () => {
  const single = maxHeight(createGame(CONFIG, 1), [
    Input.Jump,
    ...repeat(Input.None, PLENTY_OF_TICKS),
  ]);
  const held = maxHeight(createGame(CONFIG, 1), repeat(Input.Jump, PLENTY_OF_TICKS + 1));

  assert.ok(single > CONFIG.groundY, '점프는 실제로 떠올라야 한다');
  assert.equal(held, single);
});

test('체공 중 Jump 는 궤적 자체를 바꾸지 않는다', () => {
  const heldJump = run(createGame(CONFIG, 1), repeat(Input.Jump, 6));
  const singleJump = run(createGame(CONFIG, 1), [Input.Jump, ...repeat(Input.None, 5)]);

  assert.deepEqual(heldJump, singleJump);
});

test('step 은 기존 state 를 변형하지 않는다', () => {
  const state = createGame(CONFIG, 99);
  const snapshot = structuredClone(state);

  step(state, Input.Jump);
  step(state, Input.None);

  assert.deepEqual(state, snapshot);
});

test('같은 시드 + 같은 입력 시퀀스는 완전히 같은 최종 state 를 낸다', () => {
  const inputs: Input[] = Array.from({ length: 300 }, (_, i) =>
    i % 7 === 0 || i % 11 === 0 ? Input.Jump : Input.None,
  );

  const a = run(createGame(CONFIG, 20260801), inputs);
  const b = run(createGame(CONFIG, 20260801), inputs);

  assert.deepEqual(a, b);
});

test('상태는 항상 running 이다', () => {
  let state = createGame(CONFIG, 5);
  for (let i = 0; i < 200; i += 1) {
    state = step(state, i % 3 === 0 ? Input.Jump : Input.None);
    assert.equal(state.status, 'running');
  }
});
