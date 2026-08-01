import assert from 'node:assert/strict';
import test from 'node:test';
import { DIFFICULTY_IDS } from '../../src/core/difficulty.ts';
import { Key } from '../../src/ui/keys.ts';
import { createMenu, renderMenu, stepMenu, type MenuState } from '../../src/ui/menu.ts';
import type { Viewport } from '../../src/ui/render.ts';

const MIN_VIEWPORT: Viewport = { width: 60, height: 16 };

function menuAt(index: number): MenuState {
  return { index };
}

test('처음 커서는 normal 에 있다', () => {
  assert.equal(DIFFICULTY_IDS[createMenu().index], 'normal');
});

test('위아래 방향키로 커서를 옮기고 끝에서 멈춘다', () => {
  const down = stepMenu(createMenu(), Key.Down);
  assert.deepEqual(down, { kind: 'open', menu: { index: 2 } });

  const up = stepMenu(createMenu(), Key.Up);
  assert.deepEqual(up, { kind: 'open', menu: { index: 0 } });

  // 양쪽 끝을 넘지 않는다.
  assert.deepEqual(stepMenu(menuAt(0), Key.Up), { kind: 'open', menu: { index: 0 } });
  assert.deepEqual(stepMenu(menuAt(2), Key.Down), { kind: 'open', menu: { index: 2 } });
});

test('Enter 는 커서가 가리키는 난이도로 시작한다', () => {
  DIFFICULTY_IDS.forEach((difficulty, index) => {
    assert.deepEqual(stepMenu(menuAt(index), Key.Enter), { kind: 'start', difficulty });
  });
});

test('1 / 2 / 3 은 커서 위치와 무관하게 해당 난이도로 바로 시작한다', () => {
  const digits = [Key.One, Key.Two, Key.Three];

  digits.forEach((key, index) => {
    const difficulty = DIFFICULTY_IDS[index];
    assert.deepEqual(stepMenu(menuAt(0), key), { kind: 'start', difficulty });
    assert.deepEqual(stepMenu(menuAt(2), key), { kind: 'start', difficulty });
  });
});

test('Q 는 메뉴에서 바로 종료한다', () => {
  assert.deepEqual(stepMenu(createMenu(), Key.Quit), { kind: 'quit' });
});

test('무시 대상 키는 메뉴를 그대로 둔다', () => {
  const menu = menuAt(2);
  for (const key of [null, Key.Jump]) {
    assert.deepEqual(stepMenu(menu, key), { kind: 'open', menu });
  }
});

test('stepMenu 는 받은 state 를 변형하지 않는다', () => {
  const menu = createMenu();
  stepMenu(menu, Key.Down);
  stepMenu(menu, Key.Up);

  assert.deepEqual(menu, { index: 1 });
});

test('어떤 viewport 에서도 height 개의 줄과 정확히 width 인 줄 길이를 낸다', () => {
  const viewports: Viewport[] = [
    MIN_VIEWPORT,
    { width: 80, height: 24 },
    { width: 120, height: 40 },
    { width: 20, height: 8 },
    { width: 4, height: 2 },
    { width: 0, height: 0 },
  ];

  for (const viewport of viewports) {
    const lines = renderMenu(createMenu(), viewport);

    assert.equal(lines.length, viewport.height, `${viewport.width}x${viewport.height} 줄 수`);
    for (const line of lines) {
      assert.equal(line.length, viewport.width, `${viewport.width}x${viewport.height} 줄 길이`);
    }
  }
});

test('메뉴 화면에 세 난이도와 조작 안내가 보인다', () => {
  const screen = renderMenu(createMenu(), MIN_VIEWPORT).join('\n');

  assert.match(screen, /SLOW/);
  assert.match(screen, /NORMAL/);
  assert.match(screen, /FAST/);
  assert.match(screen, /1 \/ 2 \/ 3/);
  assert.match(screen, /ENTER/);
  assert.match(screen, /Q = QUIT/);
});

test('커서 표시는 선택된 난이도 줄에만 붙는다', () => {
  DIFFICULTY_IDS.forEach((difficulty, index) => {
    const marked = renderMenu(menuAt(index), MIN_VIEWPORT).filter((line) => line.includes('>'));

    assert.equal(marked.length, 1, `${difficulty} 선택 시 커서는 한 줄에만 있다`);
    assert.match(marked[0] ?? '', new RegExp(difficulty.toUpperCase()));
  });
});
