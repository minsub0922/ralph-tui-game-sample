import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DIFFICULTY_IDS } from '../../src/core/difficulty.ts';
import {
  REPLAY_VERSION,
  parseReplay,
  toReplay,
  traceRun,
  verifyReplay,
  type ReplayFile,
  type TraceOptions,
} from '../../src/sim/replay.ts';
import { DEFAULT_SEED, main, type ReplayIo } from '../../src/sim/run.ts';
import { loadReplay, saveReplay } from '../../src/store/replay.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** CLI 가 실제로 쓰는 통로 그대로 테스트한다. */
const io: ReplayIo = { load: loadReplay, save: saveReplay };

/** 임시 디렉터리 안에서만 논다 — 실제 홈이나 저장소를 건드리지 않는다. */
const roots: string[] = [];

function replayPath(name = 'replay.json'): string {
  const created = mkdtempSync(join(tmpdir(), 'tui-dino-replay-'));
  roots.push(created);
  return join(created, name);
}

after(() => {
  for (const created of roots) rmSync(created, { recursive: true, force: true });
});

function record(options: TraceOptions): ReplayFile {
  return toReplay(options, traceRun(options));
}

function read(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

/** 파일을 손으로 고친 상황을 그대로 흉내 낸다. */
function edit(path: string, changes: Record<string, unknown>): void {
  writeFileSync(path, `${JSON.stringify({ ...read(path), ...changes }, null, 2)}\n`, 'utf8');
}

test('record 로 만든 파일을 replay 하면 점수와 tick 이 정확히 일치한다', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const path = replayPath();

    const recorded = main(['--difficulty', difficulty, '--record', path], io);
    assert.equal(recorded.exitCode, 0, recorded.lines.join('\n'));
    assert.match(recorded.lines[0] ?? '', /reason=survived$/);
    assert.deepEqual(recorded.lines[1], `recorded ${path}`);

    const replayed = main(['--replay', path], io);
    assert.equal(replayed.exitCode, 0, replayed.lines.join('\n'));
    assert.deepEqual(replayed.lines.length, 1, replayed.lines.join('\n'));
    assert.match(replayed.lines[0] ?? '', /result=match$/);

    // 줄이 아니라 값으로도 확인한다.
    const file = loadReplay(path);
    const verdict = verifyReplay(file);
    assert.equal(verdict.ok, true);
    assert.deepEqual(verdict.actual, verdict.expected);
    assert.deepEqual(verdict.actual, { ticks: file.ticks, score: file.score });
    assert.equal(verdict.divergedAt, undefined);
  }
});

test('파일의 시드를 손으로 바꾸면 갈라진 tick 을 알려주고 exit code 1 이 된다', () => {
  const path = replayPath();
  main(['--difficulty', 'normal', '--record', path], io);

  edit(path, { seed: DEFAULT_SEED + 1 });

  const { lines, exitCode } = main(['--replay', path], io);
  assert.equal(exitCode, 1, lines.join('\n'));
  assert.match(lines[0] ?? '', /result=mismatch$/);
  assert.match(lines[1] ?? '', /^ {2}tick \d+ 에서 갈라졌다: /);
  assert.match(lines[2] ?? '', /기록 score=\d+ ticks=\d+ \/ 재생 score=\d+ ticks=\d+/);

  const verdict = verifyReplay(loadReplay(path));
  assert.equal(verdict.ok, false);
  assert.equal(typeof verdict.divergedAt, 'number');
});

test('어느 시드로 바꿔도 불일치를 잡아낸다', () => {
  const path = replayPath();
  main(['--difficulty', 'fast', '--record', path], io);
  const original = read(path);

  for (const seed of [0, 1, 42, -7, DEFAULT_SEED + 1, DEFAULT_SEED * 2]) {
    writeFileSync(path, `${JSON.stringify({ ...original, seed }, null, 2)}\n`, 'utf8');

    const { exitCode } = main(['--replay', path], io);
    assert.equal(exitCode, 1, `seed ${seed} 로 바꿨는데 일치한다고 했다`);
  }
});

test('난이도나 입력을 손으로 고쳐도 불일치가 된다', () => {
  const path = replayPath();
  main(['--difficulty', 'slow', '--record', path], io);
  const original = read(path);
  const inputs = original['inputs'] as number[];

  // 결과를 바꾸는 수정만 불일치다. 뛰는 tick 을 1 만큼 밀거나 목표 tick 을 1 줄이는 것처럼
  // 그래도 같은 결과가 나오는 수정은 실제로 일치하는 파일이고, 그걸 틀렸다고 하면 거짓말이다.
  const tampered: Record<string, unknown>[] = [
    { difficulty: 'fast' },
    { inputs: [] },
    { inputs: inputs.slice(1) },
    { inputs: inputs.map((tick) => tick + 20) },
    { score: (original['score'] as number) + 1 },
    { spawns: (original['spawns'] as number[]).map((tick) => tick + 2) },
  ];

  for (const changes of tampered) {
    writeFileSync(path, `${JSON.stringify({ ...original, ...changes }, null, 2)}\n`, 'utf8');

    const { lines, exitCode } = main(['--replay', path], io);
    assert.equal(exitCode, 1, `${JSON.stringify(changes)} 를 잡지 못했다: ${lines.join('\n')}`);
    assert.match(lines[1] ?? '', /tick \d+ 에서 갈라졌다/);
  }
});

test('리플레이 파일은 사람이 읽을 수 있는 JSON 이다', () => {
  const path = replayPath();
  main(['--difficulty', 'normal', '--seed', '7', '--ticks', '400', '--record', path], io);

  const content = readFileSync(path, 'utf8');
  assert.match(content, /\n/, '한 줄로 뭉쳐 쓰지 않는다');

  const file = read(path);
  assert.equal(file['version'], REPLAY_VERSION);
  assert.equal(file['difficulty'], 'normal');
  assert.equal(file['seed'], 7);
  assert.equal(file['ticks'], 400);
  assert.ok(Array.isArray(file['inputs']), 'inputs 가 배열이 아니다');
  assert.ok((file['inputs'] as number[]).length > 0, '400 tick 동안 한 번도 뛰지 않았다');
});

test('inputs 는 봇이 Jump 를 넣은 tick 이고, 그대로 넣으면 같은 판이 된다', () => {
  const options: TraceOptions = { difficulty: 'normal', seed: 99, ticks: 600 };
  const traced = traceRun(options);
  const file = record(options);

  assert.deepEqual(file.inputs, traced.jumps);
  assert.ok(file.inputs.length > 0);

  // 파일에 적힌 tick 에서만 뛰었고, 그 tick 은 전부 판 안에 있다.
  for (const tick of file.inputs) assert.ok(tick >= 0 && tick < file.ticks, `tick ${tick}`);

  const verdict = verifyReplay(file);
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.actual, { ticks: 600, score: traced.state.score });
});

test('기록은 결정론적이다 — 같은 옵션은 언제나 같은 파일을 낸다', () => {
  const options: TraceOptions = { difficulty: 'fast', seed: 4242, ticks: 900 };

  assert.deepEqual(record(options), record(options));

  const first = replayPath();
  const second = replayPath();
  main(['--difficulty', 'fast', '--seed', '4242', '--ticks', '900', '--record', first], io);
  main(['--difficulty', 'fast', '--seed', '4242', '--ticks', '900', '--record', second], io);
  assert.equal(readFileSync(first, 'utf8'), readFileSync(second, 'utf8'));
});

test('죽는 판도 기록되고, 재생하면 죽은 tick 까지 그대로 재현된다', () => {
  const path = replayPath();

  // 임계 거리 0 이면 봇은 뛰지 못하고 반드시 죽는다.
  const recorded = main(
    ['--difficulty', 'slow', '--threshold', '0', '--ticks', '500', '--record', path],
    io,
  );
  assert.equal(recorded.exitCode, 1, '죽은 판인데 exit code 가 0 이다');
  assert.match(recorded.lines[0] ?? '', /reason=collision$/);

  const file = loadReplay(path);
  assert.ok(file.ticks < 500, `죽지 않고 ${file.ticks} tick 을 갔다`);
  assert.deepEqual(file.inputs, []);

  const replayed = main(['--replay', path], io);
  assert.equal(replayed.exitCode, 0, replayed.lines.join('\n'));
  assert.match(replayed.lines[0] ?? '', new RegExp(`ticks=${file.ticks}\\b`));
});

test('읽을 수 없는 파일은 이유와 함께 거절되고 exit code 1 이 된다', () => {
  const path = replayPath();

  assert.throws(() => loadReplay(join(replayPath(), 'nope.json')), /읽을 수 없다/);

  writeFileSync(path, '{ "version": ', 'utf8');
  assert.throws(() => loadReplay(path), /올바른 JSON 이 아니다/);
  assert.deepEqual(main(['--replay', path], io).exitCode, 1);

  const valid = record({ difficulty: 'normal', seed: 1, ticks: 200 });
  const broken: [unknown, RegExp][] = [
    [null, /JSON 객체가 아니다/],
    [[1, 2], /JSON 객체가 아니다/],
    [{ ...valid, version: 99 }, /읽을 수 없는 리플레이 버전/],
    [{ ...valid, difficulty: 'nope' }, /사용 가능한 값: slow, normal, fast/],
    [{ ...valid, seed: 'abc' }, /seed 가 숫자가 아니다/],
    [{ ...valid, ticks: -1 }, /ticks 가 0 이상의 정수가 아니다/],
    [{ ...valid, score: 1.5 }, /score 가 0 이상의 정수가 아니다/],
    [{ ...valid, inputs: 3 }, /inputs 가 배열이 아니다/],
    [{ ...valid, inputs: ['x'] }, /inputs\[0\] 가 tick 번호가 아니다/],
    [{ ...valid, inputs: [5, 5] }, /inputs 가 tick 순서대로 있지 않다/],
    [{ ...valid, spawns: [9, 3] }, /spawns 가 tick 순서대로 있지 않다/],
  ];

  for (const [value, expected] of broken) {
    assert.throws(() => parseReplay(value), expected, `${JSON.stringify(value)} 를 통과시켰다`);

    writeFileSync(path, JSON.stringify(value), 'utf8');
    const { lines, exitCode } = main(['--replay', path], io);
    assert.equal(exitCode, 1);
    assert.match(lines[0] ?? '', /^error: /);
  }
});

test('멀쩡한 파일은 읽고 써도 값이 그대로다', () => {
  const path = replayPath();
  const file = record({ difficulty: 'fast', seed: -13, ticks: 700 });

  saveReplay(file, path);
  assert.deepEqual(loadReplay(path), file);
});

test('없는 디렉터리에도 기록을 만든다', () => {
  const path = join(replayPath(), 'nested', 'deep', 'replay.json');

  assert.equal(main(['--difficulty', 'slow', '--ticks', '100', '--record', path], io).exitCode, 0);
  assert.equal(loadReplay(path).ticks, 100);
});

test('서로 맞지 않는 인자 조합은 거절된다', () => {
  const path = replayPath();

  const rejected: [string[], RegExp][] = [
    [['--record', path], /--record 는 --difficulty 와 함께 써야 한다/],
    [['--record', path, '--replay', path], /함께 쓸 수 없다/],
    [['--replay', path, '--seed', '1'], /--replay 는 파일에 담긴 값으로만 돌린다/],
    [['--replay', path, '--difficulty', 'fast'], /함께 쓸 수 없다: --difficulty/],
    [['--replay'], /값이 없다/],
    [['--record'], /값이 없다/],
  ];

  for (const [argv, expected] of rejected) {
    const { lines, exitCode } = main(argv, io);
    assert.equal(exitCode, 1, argv.join(' '));
    assert.match(lines[0] ?? '', expected);
  }
});

test('파일 통로 없이 --record / --replay 를 쓰면 거절된다', () => {
  const { lines, exitCode } = main(['--replay', 'somewhere.json']);

  assert.equal(exitCode, 1);
  assert.match(lines[0] ?? '', /파일 접근이 필요하다/);
});

test('실제 CLI 로 record -> replay 를 돌리면 exit code 가 0 이고, 시드를 고치면 1 이다', () => {
  const path = replayPath();

  function sim(...argv: string[]): { stdout: string; status: number | null } {
    const run = spawnSync(process.execPath, ['src/sim.ts', ...argv], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return { stdout: run.stdout, status: run.status };
  }

  const recorded = sim('--difficulty', 'normal', '--ticks', '800', '--record', path);
  assert.equal(recorded.status, 0, recorded.stdout);
  assert.match(recorded.stdout, /recorded /);

  const replayed = sim('--replay', path);
  assert.equal(replayed.status, 0, replayed.stdout);
  assert.match(replayed.stdout, /result=match/);

  edit(path, { seed: 20260801 });

  const tampered = sim('--replay', path);
  assert.equal(tampered.status, 1, tampered.stdout);
  assert.match(tampered.stdout, /result=mismatch/);
  assert.match(tampered.stdout, /tick \d+ 에서 갈라졌다/);
});
