import { getConfig, type DifficultyId } from './core/difficulty.ts';
import { createGame, step } from './core/game.ts';
import { highScoreOf, mergeHighScores, type HighScores, type MergeResult } from './core/score.ts';
import { Input } from './core/types.ts';
import { loadHighScores, saveHighScores } from './store/highscore.ts';
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

/** 게임 오버 패널에서 고른 다음 흐름. */
type RoundOutcome = 'retry' | 'quit';

/** 한 판의 결과. 기록은 이 판에서 갱신됐을 수 있으므로 함께 돌려준다. */
type RoundResult = {
  outcome: RoundOutcome;
  scores: HighScores;
};

/**
 * 한 판을 돌리고, 게임 오버 패널에서 R 이나 Q 를 받을 때까지 기다린다.
 *
 * 점프는 누른 즉시가 아니라 다음 tick 에 반영된다 — tick 사이에 여러 번 눌러도
 * step 은 tick 당 한 번만 받으므로 입력이 쌓여 이중 점프가 되지 않는다.
 */
function playRound(
  terminal: Terminal,
  difficulty: DifficultyId,
  scores: HighScores,
): Promise<RoundResult> {
  return new Promise((resolve) => {
    const config = getConfig(difficulty);
    let game = createGame(config, seed());
    let pending: Input = Input.None;
    let record: MergeResult = { scores, isNewRecord: false };

    const paint = (): void => {
      terminal.draw(
        renderFrame(
          {
            game,
            difficulty,
            highScore: highScoreOf(record.scores, difficulty),
            isNewRecord: record.isNewRecord,
          },
          terminal.viewport,
        ),
      );
    };

    paint();
    const timer = setInterval(() => {
      game = step(game, pending);
      pending = Input.None;

      // 판이 끝나는 순간 기록을 합쳐 저장한다. 패널은 갱신된 기록을 그대로 보여준다.
      if (game.status === 'gameOver') {
        clearInterval(timer);
        record = mergeHighScores(record.scores, difficulty, game.score);
        saveHighScores(record.scores);
      }

      paint();
    }, config.tickMs);

    terminal.onKey((key) => {
      if (key === Key.Quit) {
        clearInterval(timer);
        resolve({ outcome: 'quit', scores: record.scores });
        return;
      }
      // R 은 패널이 떠 있을 때만 듣는다 — 달리는 중에 눌러도 판이 날아가지 않는다.
      if (game.status === 'gameOver') {
        if (key === Key.Retry) resolve({ outcome: 'retry', scores: record.scores });
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
    if (difficulty === null) return 0;

    // R 은 메뉴로 돌아가지 않고 같은 난이도로 곧장 다음 판을 연다.
    let scores = loadHighScores();
    let outcome: RoundOutcome = 'retry';
    while (outcome === 'retry') {
      const round = await playRound(terminal, difficulty, scores);
      scores = round.scores;
      outcome = round.outcome;
    }
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
