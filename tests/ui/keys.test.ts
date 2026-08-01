import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { Input } from '../../src/core/types.ts';
import { Key, parseKey, toInput } from '../../src/ui/keys.ts';

/** 실제 터미널이 보내는 그대로의 바이트열. */
const ESC = '\x1b';
const ARROW_UP = `${ESC}[A`;
const ARROW_DOWN = `${ESC}[B`;
const ARROW_RIGHT = `${ESC}[C`;
const ARROW_LEFT = `${ESC}[D`;
const CTRL_C = '\x03';

test('src/ui/keys.ts 는 순수 함수만 담는다', () => {
  const source = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'ui', 'keys.ts'), 'utf8');

  assert.doesNotMatch(source, /\bprocess\b/, 'keys.ts 가 process 를 참조한다');
  assert.doesNotMatch(source, /['"]node:/, 'keys.ts 가 node 내장 모듈을 참조한다');
});

test('스페이스는 Jump 다', () => {
  assert.equal(parseKey(' '), Key.Jump);
  assert.equal(toInput(parseKey(' ')), Input.Jump);
});

test('q 와 Q 와 Ctrl+C 는 모두 Quit 이다', () => {
  assert.equal(parseKey('q'), Key.Quit);
  assert.equal(parseKey('Q'), Key.Quit);
  assert.equal(parseKey(CTRL_C), Key.Quit);
});

test('Enter 는 CR 로 오든 LF 로 오든 Enter 다', () => {
  assert.equal(parseKey('\r'), Key.Enter);
  assert.equal(parseKey('\n'), Key.Enter);
});

test('위아래 방향키를 이스케이프 시퀀스에서 읽어낸다', () => {
  assert.equal(parseKey(ARROW_UP), Key.Up);
  assert.equal(parseKey(ARROW_DOWN), Key.Down);

  // application cursor mode 의 터미널은 '[' 대신 'O' 를 보낸다.
  assert.equal(parseKey(`${ESC}OA`), Key.Up);
  assert.equal(parseKey(`${ESC}OB`), Key.Down);
});

test('1 / 2 / 3 은 난이도 선택 키다', () => {
  assert.equal(parseKey('1'), Key.One);
  assert.equal(parseKey('2'), Key.Two);
  assert.equal(parseKey('3'), Key.Three);
});

test('쓰지 않는 키는 전부 무시한다', () => {
  const ignored = [
    'a',
    'Z',
    '0',
    '4',
    '9',
    '\t',
    '\x7f', // Backspace
    ESC, // ESC 단독
    ARROW_LEFT,
    ARROW_RIGHT,
    `${ESC}[H`, // Home
    '', // 빈 덩어리
    '한', // ASCII 가 아닌 입력
  ];

  for (const bytes of ignored) {
    assert.equal(parseKey(bytes), null, `'${JSON.stringify(bytes)}' 는 무시돼야 한다`);
    assert.equal(toInput(parseKey(bytes)), Input.None);
  }
});

test('모르는 이스케이프 시퀀스의 나머지 바이트가 키로 새지 않는다', () => {
  // ESC [ 3 ~ (Delete) 는 통째로 버려야 하고, 뒤에 붙은 스페이스만 남아야 한다.
  assert.equal(parseKey(`${ESC}[3~`), null);
  assert.equal(parseKey(`${ESC}[3~ `), Key.Jump);
});

test('연타로 여러 키가 한 덩어리에 와도 하나로 정리한다', () => {
  assert.equal(parseKey('   '), Key.Jump);
  assert.equal(parseKey(`${ARROW_DOWN}${ARROW_DOWN}`), Key.Down);
  assert.equal(parseKey(`x${ARROW_UP}`), Key.Up, '앞의 무시 대상 키를 건너뛴다');
});

test('한 덩어리에 종료가 섞여 있으면 종료가 이긴다', () => {
  assert.equal(parseKey(' q'), Key.Quit);
  assert.equal(parseKey(`${ARROW_UP}\r${CTRL_C}`), Key.Quit);
});

test('stdin 이 주는 Buffer 와 Uint8Array 를 그대로 받는다', () => {
  assert.equal(parseKey(Buffer.from(' ')), Key.Jump);
  assert.equal(parseKey(Buffer.from(ARROW_UP)), Key.Up);
  assert.equal(parseKey(new Uint8Array([0x03])), Key.Quit);
  assert.equal(parseKey([0x71]), Key.Quit);
});

test('toInput 은 점프 외의 모든 키를 None 으로 낮춘다', () => {
  assert.equal(toInput(Key.Jump), Input.Jump);
  for (const key of [Key.Quit, Key.Up, Key.Down, Key.Enter, Key.One, Key.Two, Key.Three, null]) {
    assert.equal(toInput(key), Input.None);
  }
});
