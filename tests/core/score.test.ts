import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { DIFFICULTY_IDS } from '../../src/core/difficulty.ts';
import {
  highScoreOf,
  mergeHighScores,
  NO_HIGH_SCORES,
  parseHighScores,
  type HighScores,
} from '../../src/core/score.ts';

test('src/core/score.ts 는 process 나 파일시스템을 참조하지 않는다', () => {
  const source = readFileSync(
    join(import.meta.dirname, '..', '..', 'src', 'core', 'score.ts'),
    'utf8',
  );

  assert.doesNotMatch(source, /\bprocess\b/, 'score.ts 가 process 를 참조한다');
  assert.doesNotMatch(source, /['"]node:/, 'score.ts 가 node 내장 모듈을 참조한다');
});

test('기록이 없는 난이도의 최고 점수는 0 이다', () => {
  assert.equal(highScoreOf(NO_HIGH_SCORES, 'normal'), 0);
  assert.equal(highScoreOf({ slow: 42 }, 'normal'), 0);
  assert.equal(highScoreOf({ slow: 42 }, 'slow'), 42);
});

test('빈 기록에서 첫 판은 곧바로 신기록이 된다', () => {
  const result = mergeHighScores(NO_HIGH_SCORES, 'normal', 37);

  assert.equal(result.isNewRecord, true);
  assert.equal(highScoreOf(result.scores, 'normal'), 37);
});

test('기존 기록보다 높을 때만 신기록이고 기록이 갱신된다', () => {
  const current: HighScores = { normal: 100 };

  const lower = mergeHighScores(current, 'normal', 99);
  assert.equal(lower.isNewRecord, false);
  assert.equal(highScoreOf(lower.scores, 'normal'), 100);

  const tied = mergeHighScores(current, 'normal', 100);
  assert.equal(tied.isNewRecord, false, '동점은 신기록이 아니다');
  assert.equal(highScoreOf(tied.scores, 'normal'), 100);

  const higher = mergeHighScores(current, 'normal', 101);
  assert.equal(higher.isNewRecord, true);
  assert.equal(highScoreOf(higher.scores, 'normal'), 101);
});

test('갱신되지 않으면 받은 기록을 그대로 돌려준다', () => {
  const current: HighScores = { normal: 100 };

  assert.equal(mergeHighScores(current, 'normal', 5).scores, current);
});

test('받은 기록을 변형하지 않는다', () => {
  const current: HighScores = { normal: 10 };
  const result = mergeHighScores(current, 'normal', 500);

  assert.deepEqual(current, { normal: 10 }, '원본 기록이 바뀌었다');
  assert.notEqual(result.scores, current);
});

test('난이도별 기록은 서로 독립적이다', () => {
  let scores: HighScores = NO_HIGH_SCORES;
  for (const [index, id] of DIFFICULTY_IDS.entries()) {
    scores = mergeHighScores(scores, id, (index + 1) * 10).scores;
  }

  assert.deepEqual(scores, { slow: 10, normal: 20, fast: 30 });

  // fast 에서 크게 이겨도 다른 난이도의 기록은 그대로다.
  const after = mergeHighScores(scores, 'fast', 9999);
  assert.equal(after.isNewRecord, true);
  assert.deepEqual(after.scores, { slow: 10, normal: 20, fast: 9999 });

  // slow 는 자기 기록(10)만 넘으면 되고, fast 의 9999 에 영향받지 않는다.
  const slow = mergeHighScores(after.scores, 'slow', 11);
  assert.equal(slow.isNewRecord, true);
  assert.deepEqual(slow.scores, { slow: 11, normal: 20, fast: 9999 });
});

test('0점과 이상한 점수는 기록으로 남지 않는다', () => {
  for (const score of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = mergeHighScores(NO_HIGH_SCORES, 'normal', score);

    assert.equal(result.isNewRecord, false, `${score} 는 기록이 되면 안 된다`);
    assert.deepEqual(result.scores, {});
  }
});

test('기록으로 볼 수 없는 파일 내용은 빈 기록이 된다', () => {
  const rejected: unknown[] = [
    null,
    undefined,
    'slow=10',
    42,
    [1, 2, 3],
    { slow: 'abc' },
    { slow: -3 },
    { slow: null },
    { nope: 500 },
  ];

  for (const value of rejected) {
    assert.deepEqual(parseHighScores(value), {}, `${JSON.stringify(value)} 는 버려야 한다`);
  }
});

test('아는 난이도의 유효한 점수만 골라 읽는다', () => {
  assert.deepEqual(parseHighScores({ slow: 12, nope: 99, fast: 'x', normal: 7.9 }), {
    slow: 12,
    normal: 7,
  });
});
