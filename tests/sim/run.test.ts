import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DIFFICULTY_IDS } from '../../src/core/difficulty.ts';
import {
  DEFAULT_SEED,
  DEFAULT_TICKS,
  formatResult,
  main,
  parseArgs,
  runGame,
} from '../../src/sim/run.ts';

const SIM_DIR = fileURLToPath(new URL('../../src/sim/', import.meta.url));

test('세 난이도 모두 봇이 목표 tick 까지 완주한다', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const result = runGame({ difficulty, seed: DEFAULT_SEED, ticks: DEFAULT_TICKS });

    assert.equal(result.survived, true, `${difficulty}: ${result.ticks} tick 에서 죽었다`);
    assert.equal(result.reason, 'survived');
    assert.equal(result.ticks, DEFAULT_TICKS);
    assert.ok(result.score > 0, `${difficulty}: 점수가 오르지 않았다`);
  }
});

test('인자 없이 돌리면 3줄을 내고 exit code 0 이다', () => {
  const { lines, exitCode } = main([]);

  assert.equal(lines.length, 3);
  assert.equal(exitCode, 0);
  for (const [index, difficulty] of DIFFICULTY_IDS.entries()) {
    const line = lines[index];
    assert.ok(line !== undefined);
    assert.ok(line.startsWith(difficulty), `${index}번째 줄이 ${difficulty} 가 아니다: ${line}`);
    assert.match(line, /reason=survived$/);
  }
});

test('결과 줄에 난이도 / 시드 / 점수 / tick / 종료 사유가 모두 들어간다', () => {
  const result = runGame({ difficulty: 'normal', seed: 7, ticks: 300 });
  const line = formatResult(result);

  assert.ok(line.includes('normal'), line);
  assert.ok(line.includes('seed=7'), line);
  assert.ok(line.includes(`score=${result.score}`), line);
  assert.ok(line.includes(`ticks=${result.ticks}`), line);
  assert.ok(line.includes('reason=survived'), line);
});

test('같은 시드로 두 번 돌리면 출력이 문자 단위로 같다', () => {
  assert.equal(main([]).lines.join('\n'), main([]).lines.join('\n'));
  assert.equal(
    main(['--seed', '99']).lines.join('\n'),
    main(['--seed=99']).lines.join('\n'),
  );
  assert.deepEqual(
    runGame({ difficulty: 'fast', seed: 4242, ticks: 900 }),
    runGame({ difficulty: 'fast', seed: 4242, ticks: 900 }),
  );
});

test('시드를 바꿔도, 목표 tick 을 늘려도 봇이 완주한다', () => {
  // 간격이 rng 로 정해지므로 특정 시드 하나만 통과하는 봇이 아닌지 확인한다.
  for (const difficulty of DIFFICULTY_IDS) {
    for (const seed of [0, 1, 2, 7, 42, -13, 99991]) {
      const result = runGame({ difficulty, seed, ticks: 5000 });
      assert.equal(
        result.survived,
        true,
        `${difficulty} seed ${seed}: ${result.ticks} tick 에서 죽었다`,
      );
    }
  }
});

test('봇 임계 거리를 0 으로 만들면 세 판 모두 죽고 exit code 1 이다', () => {
  const { lines, exitCode } = main(['--threshold', '0']);

  assert.equal(exitCode, 1);
  assert.equal(lines.length, 3);
  for (const line of lines) assert.match(line, /reason=collision$/);

  const result = runGame({ difficulty: 'slow', seed: DEFAULT_SEED, ticks: 500, threshold: 0 });
  assert.equal(result.survived, false);
  assert.equal(result.reason, 'collision');
  assert.ok(result.ticks < 500, `죽지 않고 ${result.ticks} tick 을 갔다`);
});

test('난이도 하나만 골라 돌릴 수 있다', () => {
  const { lines, exitCode } = main(['--difficulty', 'fast', '--seed', '5', '--ticks', '600']);

  assert.equal(exitCode, 0);
  assert.deepEqual(lines, [formatResult(runGame({ difficulty: 'fast', seed: 5, ticks: 600 }))]);
});

test('인자 파싱은 기본값과 두 가지 표기를 모두 처리한다', () => {
  assert.deepEqual(parseArgs([]), {
    difficulties: DIFFICULTY_IDS,
    seed: DEFAULT_SEED,
    ticks: DEFAULT_TICKS,
  });
  assert.deepEqual(parseArgs(['--difficulty=slow', '--seed=3', '--ticks=10']), {
    difficulties: ['slow'],
    seed: 3,
    ticks: 10,
  });
  assert.deepEqual(parseArgs(['--difficulty', 'fast', '--threshold', '2.5']), {
    difficulties: ['fast'],
    seed: DEFAULT_SEED,
    ticks: DEFAULT_TICKS,
    threshold: 2.5,
  });
});

test('잘못된 인자는 메시지와 함께 거절되고 exit code 1 이 된다', () => {
  assert.throws(() => parseArgs(['--difficulty', 'nope']), /사용 가능한 값: slow, normal, fast/);
  assert.throws(() => parseArgs(['--bogus', '1']), /알 수 없는 옵션/);
  assert.throws(() => parseArgs(['slow']), /알 수 없는 인자/);
  assert.throws(() => parseArgs(['--seed']), /값이 없다/);
  assert.throws(() => parseArgs(['--ticks', 'abc']), /숫자가 아니다/);

  const { lines, exitCode } = main(['--difficulty', 'nope']);
  assert.equal(exitCode, 1);
  assert.deepEqual(lines, [
    'error: 알 수 없는 난이도 \'nope\'. 사용 가능한 값: slow, normal, fast',
  ]);
});

test('src/sim 은 렌더러나 터미널 코드를 import 하지 않는다', () => {
  const files = readdirSync(SIM_DIR).filter((name) => name.endsWith('.ts'));
  assert.ok(files.length > 0, 'src/sim 에 파일이 없다');

  for (const file of files) {
    const source = readFileSync(path.join(SIM_DIR, file), 'utf8');
    for (const specifier of source.matchAll(/from\s+'([^']+)'/g)) {
      const target = specifier[1] ?? '';
      assert.ok(
        !target.includes('/ui/') && !target.includes('/store/'),
        `${file} 이 ${target} 을 import 한다`,
      );
    }
  }
});
