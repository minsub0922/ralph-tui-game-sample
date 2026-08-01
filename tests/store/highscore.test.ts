import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { mergeHighScores, type HighScores } from '../../src/core/score.ts';
import { defaultScoresPath, loadHighScores, saveHighScores } from '../../src/store/highscore.ts';

/** 실제 홈 디렉터리를 건드리지 않도록 모든 테스트가 임시 디렉터리 안에서만 논다. */
const roots: string[] = [];

function root(): string {
  const created = mkdtempSync(join(tmpdir(), 'tui-dino-'));
  roots.push(created);
  return created;
}

after(() => {
  for (const created of roots) rmSync(created, { recursive: true, force: true });
});

test('기본 경로는 홈 디렉터리 아래 .tui-dino/scores.json 이다', () => {
  assert.equal(defaultScoresPath(), join(homedir(), '.tui-dino', 'scores.json'));
});

test('파일이 없으면 빈 기록으로 시작한다', () => {
  assert.deepEqual(loadHighScores(join(root(), 'scores.json')), {});
});

test('손상된 파일을 읽어도 예외 없이 빈 기록이 된다', () => {
  const broken = ['{ "slow": ', '', 'not json at all', '[1, 2, 3]', 'null', '{"slow": "abc"}'];

  for (const content of broken) {
    const path = join(root(), 'scores.json');
    writeFileSync(path, content, 'utf8');

    assert.deepEqual(loadHighScores(path), {}, `${JSON.stringify(content)} 는 빈 기록이어야 한다`);
  }
});

test('디렉터리를 기록 파일 자리에 둬도 읽기가 크래시하지 않는다', () => {
  const path = join(root(), 'scores.json');
  mkdirSync(path);

  assert.deepEqual(loadHighScores(path), {});
});

test('저장한 뒤 다시 읽으면 같은 값이 나온다', () => {
  const path = join(root(), 'scores.json');
  const scores: HighScores = { slow: 10, normal: 20, fast: 30 };

  assert.equal(saveHighScores(scores, path), true);
  assert.deepEqual(loadHighScores(path), scores);
});

test('없는 디렉터리에도 기록을 만든다', () => {
  const path = join(root(), 'nested', 'deep', 'scores.json');

  assert.equal(saveHighScores({ fast: 7 }, path), true);
  assert.deepEqual(loadHighScores(path), { fast: 7 });
});

test('저장된 파일은 사람이 읽을 수 있는 JSON 이다', () => {
  const path = join(root(), 'scores.json');
  saveHighScores({ normal: 123 }, path);

  const content = readFileSync(path, 'utf8');
  assert.deepEqual(JSON.parse(content), { normal: 123 });
  assert.match(content, /\n/, '한 줄로 뭉쳐 쓰지 않는다');
});

test('저장이 끝나면 임시 파일이 남지 않는다', () => {
  const directory = root();
  const path = join(directory, 'scores.json');

  saveHighScores({ slow: 1 }, path);
  saveHighScores({ slow: 2 }, path);

  assert.deepEqual(readdirSync(directory), ['scores.json']);
});

test('덮어써도 기존 기록이 온전한 JSON 으로 남는다', () => {
  const path = join(root(), 'scores.json');

  saveHighScores({ slow: 1 }, path);
  saveHighScores({ slow: 1, fast: 5 }, path);

  assert.deepEqual(loadHighScores(path), { slow: 1, fast: 5 });
});

test('기존 파일에 직접 쓰지 않고 통째로 갈아 끼운다', () => {
  const directory = root();
  const path = join(directory, 'scores.json');

  saveHighScores({ slow: 1 }, path);
  // 읽기 전용 파일에는 직접 쓸 수 없다. 임시 파일에 쓴 뒤 rename 으로 갈아 끼워야 통과한다.
  chmodSync(path, 0o444);

  assert.equal(saveHighScores({ slow: 2 }, path), true);
  assert.deepEqual(loadHighScores(path), { slow: 2 });
});

test('저장에 실패하면 예외 대신 false 를 주고 임시 파일도 치운다', () => {
  const directory = root();
  // 기록 파일 자리를 비어 있지 않은 디렉터리가 차지하고 있으면 rename 이 실패한다.
  const path = join(directory, 'scores.json');
  mkdirSync(path);
  writeFileSync(join(path, 'blocker'), 'x', 'utf8');

  assert.equal(saveHighScores({ slow: 1 }, path), false);
  assert.deepEqual(readdirSync(directory), ['scores.json'], '임시 파일이 남았다');
});

test('난이도별 기록이 저장을 오가도 서로를 덮어쓰지 않는다', () => {
  const path = join(root(), 'scores.json');

  let scores = loadHighScores(path);
  for (const [difficulty, score] of [
    ['slow', 100],
    ['fast', 5],
    ['fast', 9],
    ['normal', 50],
  ] as const) {
    scores = mergeHighScores(scores, difficulty, score).scores;
    saveHighScores(scores, path);
    scores = loadHighScores(path);
  }

  assert.deepEqual(scores, { slow: 100, normal: 50, fast: 9 });
});
