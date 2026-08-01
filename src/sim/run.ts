import { DIFFICULTY_IDS, getConfig, type DifficultyId } from '../core/difficulty.ts';
import { createGame, step } from '../core/game.ts';
import { chooseInput, jumpThreshold } from './bot.ts';

/** 인자 없이 돌릴 때 쓰는 고정 시드. 결과를 재현하려면 이 값이 바뀌면 안 된다. */
export const DEFAULT_SEED = 1337;

/** 한 판의 목표 tick. 도달하면 완주로 친다 (slow 기준 약 2분). */
export const DEFAULT_TICKS = 2000;

export type RunOptions = {
  difficulty: DifficultyId;
  seed: number;
  ticks: number;
  /** 봇이 점프를 시작하는 거리. 생략하면 난이도 속도에 맞춰 계산한다. */
  threshold?: number;
};

/** 판이 끝난 이유. 목표 tick 도달이거나 장애물 충돌이거나 둘 중 하나다. */
export type RunReason = 'survived' | 'collision';

export type RunResult = {
  difficulty: DifficultyId;
  seed: number;
  score: number;
  /** 실제로 진행한 tick 수. 완주하면 목표 tick 과 같다. */
  ticks: number;
  survived: boolean;
  reason: RunReason;
};

/** 봇에게 한 판을 맡겨 목표 tick 까지 돌린다. 같은 인자는 항상 같은 결과를 낸다. */
export function runGame(options: RunOptions): RunResult {
  const config = getConfig(options.difficulty);
  const threshold = options.threshold ?? jumpThreshold(config.track);

  let state = createGame(config, options.seed);
  while (state.tick < options.ticks && state.status === 'running') {
    state = step(state, chooseInput(state, threshold));
  }

  const survived = state.status === 'running';
  return {
    difficulty: options.difficulty,
    seed: options.seed,
    score: state.score,
    ticks: state.tick,
    survived,
    reason: survived ? 'survived' : 'collision',
  };
}

/** 한 판의 결과 한 줄. 열이 맞도록 폭을 고정한다. */
export function formatResult(result: RunResult): string {
  return [
    result.difficulty.padEnd(6),
    `seed=${result.seed}`.padEnd(12),
    `score=${result.score}`.padEnd(12),
    `ticks=${result.ticks}`.padEnd(12),
    `reason=${result.reason}`,
  ].join(' ');
}

export type SimOptions = {
  difficulties: readonly DifficultyId[];
  seed: number;
  ticks: number;
  threshold?: number;
};

function isDifficultyId(value: string): value is DifficultyId {
  return (DIFFICULTY_IDS as readonly string[]).includes(value);
}

function toNumber(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${flag} 값이 숫자가 아니다: '${raw}'`);
  return value;
}

/**
 * 인자를 직접 파싱한다 (의존성 0). `--flag value` 와 `--flag=value` 를 모두 받는다.
 *
 * --difficulty 를 주지 않으면 slow / normal / fast 를 모두 돌린다.
 */
export function parseArgs(argv: readonly string[]): SimOptions {
  const flags = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? '';
    if (!token.startsWith('--')) throw new Error(`알 수 없는 인자: '${token}'`);

    const eq = token.indexOf('=');
    const name = eq === -1 ? token : token.slice(0, eq);
    if (!['--difficulty', '--seed', '--ticks', '--threshold'].includes(name)) {
      throw new Error(
        `알 수 없는 옵션: '${name}'. 사용 가능한 값: --difficulty, --seed, --ticks, --threshold`,
      );
    }

    let value: string | undefined;
    if (eq === -1) {
      value = argv[i + 1];
      i += 1;
    } else {
      value = token.slice(eq + 1);
    }
    if (value === undefined || value === '') throw new Error(`${name} 에 값이 없다`);

    flags.set(name, value);
  }

  const difficulty = flags.get('--difficulty');
  if (difficulty !== undefined && !isDifficultyId(difficulty)) {
    throw new Error(
      `알 수 없는 난이도 '${difficulty}'. 사용 가능한 값: ${DIFFICULTY_IDS.join(', ')}`,
    );
  }

  const seed = flags.get('--seed');
  const ticks = flags.get('--ticks');
  const threshold = flags.get('--threshold');

  return {
    difficulties: difficulty === undefined ? DIFFICULTY_IDS : [difficulty],
    seed: seed === undefined ? DEFAULT_SEED : toNumber('--seed', seed),
    ticks: ticks === undefined ? DEFAULT_TICKS : toNumber('--ticks', ticks),
    ...(threshold === undefined ? {} : { threshold: toNumber('--threshold', threshold) }),
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * CLI 본체를 순수 함수로 둔다 — 출력할 줄과 exit code 만 돌려주고 쓰기는 하지 않는다.
 * 덕분에 테스트가 stdout 을 가로채지 않고 그대로 호출할 수 있다.
 *
 * 한 판이라도 죽거나 도중에 예외가 나면 exit code 는 1 이다.
 */
export function main(argv: readonly string[]): { lines: string[]; exitCode: number } {
  try {
    const options = parseArgs(argv);
    const results = options.difficulties.map((difficulty) =>
      runGame({
        difficulty,
        seed: options.seed,
        ticks: options.ticks,
        ...(options.threshold === undefined ? {} : { threshold: options.threshold }),
      }),
    );

    return {
      lines: results.map(formatResult),
      exitCode: results.every((result) => result.survived) ? 0 : 1,
    };
  } catch (error) {
    return { lines: [`error: ${message(error)}`], exitCode: 1 };
  }
}

if (import.meta.main) {
  const { lines, exitCode } = main(process.argv.slice(2));
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = exitCode;
}
