import { getConfig, type DifficultyId } from './core/difficulty.ts';
import { createGame, step } from './core/game.ts';
import { Input } from './core/types.ts';
import { Key, toInput } from './ui/keys.ts';
import { createMenu, renderMenu, stepMenu } from './ui/menu.ts';
import { renderFrame } from './ui/render.ts';
import {
  isTooSmall,
  openTerminal,
  printNotice,
  readViewport,
  tooSmallMessage,
  type Terminal,
} from './ui/terminal.ts';

/**
 * 사람이 하는 판은 매번 다른 배치여야 한다.
 *
 * 결정론 규칙이 걸린 곳은 core 와 sim 이고, 여기서 뽑은 시드는 그 아래로 그대로 흘러가
 * 판 하나 안에서는 여전히 재현 가능하다.
 */
function seed(): number {
  return Date.now() >>> 0;
}

/** 난이도가 정해지면 그 id 를, Q 로 나가면 null 을 준다. */
function chooseDifficulty(terminal: Terminal): Promise<DifficultyId | null> {
  return new Promise((resolve) => {
    let menu = createMenu();
    terminal.draw(renderMenu(menu, terminal.viewport));

    terminal.onKey((key) => {
      const outcome = stepMenu(menu, key);
      if (outcome.kind === 'quit') {
        resolve(null);
        return;
      }
      if (outcome.kind === 'start') {
        resolve(outcome.difficulty);
        return;
      }

      menu = outcome.menu;
      terminal.draw(renderMenu(menu, terminal.viewport));
    });
  });
}

/**
 * 한 판을 돌린다. 게임 오버가 나면 루프를 멈추고 패널을 띄운 채 Q 를 기다린다.
 *
 * 점프는 누른 즉시가 아니라 다음 tick 에 반영된다 — tick 사이에 여러 번 눌러도
 * step 은 tick 당 한 번만 받으므로 입력이 쌓여 이중 점프가 되지 않는다.
 */
function playGame(terminal: Terminal, difficulty: DifficultyId): Promise<void> {
  return new Promise((resolve) => {
    const config = getConfig(difficulty);
    let game = createGame(config, seed());
    let pending: Input = Input.None;

    const paint = (): void => {
      terminal.draw(
        renderFrame({ game, difficulty, highScore: 0, isNewRecord: false }, terminal.viewport),
      );
    };

    paint();
    const timer = setInterval(() => {
      game = step(game, pending);
      pending = Input.None;
      paint();

      if (game.status === 'gameOver') clearInterval(timer);
    }, config.tickMs);

    terminal.onKey((key) => {
      if (key === Key.Quit) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (toInput(key) === Input.Jump) pending = Input.Jump;
    });
  });
}

async function main(): Promise<number> {
  const viewport = readViewport();
  if (isTooSmall(viewport)) {
    printNotice(tooSmallMessage(viewport));
    return 1;
  }

  const terminal = openTerminal();
  try {
    const difficulty = await chooseDifficulty(terminal);
    if (difficulty !== null) await playGame(terminal, difficulty);
    return 0;
  } finally {
    // 예외로 빠져나가도 raw mode 와 커서는 여기서 복구된다.
    terminal.close();
  }
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    printNotice(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
