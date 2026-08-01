import assert from 'node:assert/strict';
import test from 'node:test';
import { createRng, next, type Rng } from '../../src/core/rng.ts';

function draw(seed: number, count: number): number[] {
  let rng = createRng(seed);
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = next(rng);
    rng = result.rng;
    values.push(result.value);
  }
  return values;
}

test('같은 시드는 항상 같은 수열을 낸다', () => {
  assert.deepEqual(draw(12345, 50), draw(12345, 50));
});

test('다른 시드는 다른 수열을 낸다', () => {
  assert.notDeepEqual(draw(1, 20), draw(2, 20));
});

test('값은 [0, 1) 구간 안에 있다', () => {
  for (const value of draw(987654321, 500)) {
    assert.ok(value >= 0 && value < 1, `범위 밖: ${value}`);
  }
});

test('같은 수열이 반복되지 않는다', () => {
  const values = draw(42, 200);
  assert.equal(new Set(values).size, values.length);
});

test('next 는 인자로 받은 rng 를 변형하지 않는다', () => {
  const rng: Rng = createRng(7);
  const first = next(rng);
  const second = next(rng);

  assert.equal(rng.state, createRng(7).state);
  assert.equal(first.value, second.value);
  assert.deepEqual(first.rng, second.rng);
});

test('음수 시드와 큰 시드도 결정론적으로 동작한다', () => {
  assert.deepEqual(draw(-1, 10), draw(-1, 10));
  assert.deepEqual(draw(2 ** 31, 10), draw(2 ** 31, 10));
});
