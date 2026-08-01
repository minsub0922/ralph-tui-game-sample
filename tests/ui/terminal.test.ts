import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { isTooSmall, MIN_VIEWPORT, tooSmallMessage } from '../../src/ui/terminal.ts';

const SRC = join(import.meta.dirname, '..', '..', 'src');

test('최소 크기는 PRODUCT.md 가 정한 60x16 이다', () => {
  assert.deepEqual(MIN_VIEWPORT, { width: 60, height: 16 });
});

test('가로나 세로 어느 한쪽만 모자라도 너무 작다고 판정한다', () => {
  assert.equal(isTooSmall({ width: 60, height: 16 }), false);
  assert.equal(isTooSmall({ width: 80, height: 24 }), false);

  assert.equal(isTooSmall({ width: 59, height: 16 }), true);
  assert.equal(isTooSmall({ width: 60, height: 15 }), true);
  assert.equal(isTooSmall({ width: 0, height: 0 }), true);
});

test('안내 문구는 현재 크기와 필요한 크기를 함께 알려준다', () => {
  const message = tooSmallMessage({ width: 40, height: 10 });

  assert.match(message, /40x10/);
  assert.match(message, /60x16/);
});

test('렌더 결과를 stdout 에 쓰는 코드는 terminal.ts 한 곳뿐이다', () => {
  const files = [
    ...readdirSync(join(SRC, 'ui')).map((name) => join('ui', name)),
    'index.ts',
  ];

  for (const file of files) {
    const source = readFileSync(join(SRC, file), 'utf8');
    const writesToStdio = /process\.(stdout|stderr|stdin)/.test(source);

    if (file === join('ui', 'terminal.ts')) {
      assert.ok(writesToStdio, 'terminal.ts 는 실제로 stdio 를 다룬다');
    } else {
      assert.equal(writesToStdio, false, `${file} 가 stdio 를 직접 만진다`);
    }
  }
});
