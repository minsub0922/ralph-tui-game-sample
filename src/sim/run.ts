import { DIFFICULTY_IDS, type DifficultyId } from '../core/difficulty.ts';
import {
  formatVerdict,
  toReplay,
  traceRun,
  verifyReplay,
  type ReplayFile,
  type Trace,
  type TraceOptions,
} from './replay.ts';

/** 인자 없이 돌릴 때 쓰는 고정 시드. 결과를 재현하려면 이 값이 바뀌면 안 된다. */
export const DEFAULT_SEED = 1337;

/** 한 판의 목표 tick. 도달하면 완주로 친다 (slow 기준 약 2분). */
export const DEFAULT_TICKS = 2000;

/** 한 판을 돌리는 데 필요한 값. 기록에 적히는 값과 같아야 재생이 성립한다. */
export type RunOptions = TraceOptions;

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

/** 돌린 판을 한 줄로 요약할 수 있는 결과로 옮긴다. */
function toResult(options: RunOptions, traced: Trace): RunResult {
  const survived = traced.state.status === 'running';
  return {
    difficulty: options.difficulty,
    seed: options.seed,
    score: traced.state.score,
    ticks: traced.state.tick,
    survived,
    reason: survived ? 'survived' : 'collision',
  };
}

/** 봇에게 한 판을 맡겨 목표 tick 까지 돌린다. 같은 인자는 항상 같은 결과를 낸다. */
export function runGame(options: RunOptions): RunResult {
  return toResult(options, traceRun(options));
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
  /** 이 경로에 한 판을 기록한다. */
  record?: string;
  /** 이 경로의 기록을 재생해 맞는지 확인한다. */
  replay?: string;
};

/** 한 판을 돌리는 옵션 (--difficulty, --seed, --ticks, --threshold). */
const RUN_FLAGS = ['--difficulty', '--seed', '--ticks', '--threshold'] as const;

/** 파일을 가리키는 옵션. 둘은 서로 배타적이다. */
const FILE_FLAGS = ['--record', '--replay'] as const;

const RECORD_NEEDS_ONE_DIFFICULTY =
  '--record 는 --difficulty 와 함께 써야 한다 — 리플레이 파일 하나는 한 판만 담는다';

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
    if (!([...RUN_FLAGS, ...FILE_FLAGS] as readonly string[]).includes(name)) {
      throw new Error(
        `알 수 없는 옵션: '${name}'. 사용 가능한 값: ${[...RUN_FLAGS, ...FILE_FLAGS].join(', ')}`,
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
  const record = flags.get('--record');
  const replay = flags.get('--replay');

  if (record !== undefined && replay !== undefined) {
    throw new Error('--record 와 --replay 는 함께 쓸 수 없다');
  }
  if (replay !== undefined) {
    // 재생에 쓸 값은 전부 파일 안에 있다. 여기서 시드를 덮어쓸 수 있으면 검증이 의미를 잃는다.
    const conflicts = RUN_FLAGS.filter((name) => flags.has(name));
    if (conflicts.length > 0) {
      throw new Error(`--replay 는 파일에 담긴 값으로만 돌린다. 함께 쓸 수 없다: ${conflicts.join(', ')}`);
    }
  }
  if (record !== undefined && difficulty === undefined) {
    throw new Error(RECORD_NEEDS_ONE_DIFFICULTY);
  }

  return {
    difficulties: difficulty === undefined ? DIFFICULTY_IDS : [difficulty],
    seed: seed === undefined ? DEFAULT_SEED : toNumber('--seed', seed),
    ticks: ticks === undefined ? DEFAULT_TICKS : toNumber('--ticks', ticks),
    ...(threshold === undefined ? {} : { threshold: toNumber('--threshold', threshold) }),
    ...(record === undefined ? {} : { record }),
    ...(replay === undefined ? {} : { replay }),
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 리플레이 파일을 읽고 쓰는 통로. 구현은 엔트리포인트가 store 에서 끼워 넣는다 —
 * 덕분에 src/sim 은 파일시스템을 모르는 채로 남는다.
 */
export type ReplayIo = {
  load(path: string): ReplayFile;
  save(file: ReplayFile, path: string): void;
};

function ports(io: ReplayIo | undefined): ReplayIo {
  if (io === undefined) throw new Error('--record / --replay 를 쓰려면 파일 접근이 필요하다');
  return io;
}

/** 한 판을 돌려 파일로 남긴다. 출력은 평소와 같은 결과 줄 + 기록한 경로다. */
function record(options: SimOptions, path: string, io: ReplayIo): CliOutput {
  const [difficulty, ...rest] = options.difficulties;
  if (difficulty === undefined || rest.length > 0) throw new Error(RECORD_NEEDS_ONE_DIFFICULTY);

  const runOptions: RunOptions = {
    difficulty,
    seed: options.seed,
    ticks: options.ticks,
    ...(options.threshold === undefined ? {} : { threshold: options.threshold }),
  };

  const traced = traceRun(runOptions);
  io.save(toReplay(runOptions, traced), path);

  const result = toResult(runOptions, traced);
  return { lines: [formatResult(result), `recorded ${path}`], exitCode: result.survived ? 0 : 1 };
}

/** 파일을 재생해 기록과 맞는지 본다. 갈라지면 그 tick 을 출력하고 exit code 1 이다. */
function replay(path: string, io: ReplayIo): CliOutput {
  const file = io.load(path);
  const verdict = verifyReplay(file);

  return { lines: formatVerdict(file, verdict), exitCode: verdict.ok ? 0 : 1 };
}

export type CliOutput = { lines: string[]; exitCode: number };

/**
 * CLI 본체를 순수 함수로 둔다 — 출력할 줄과 exit code 만 돌려주고 쓰기는 하지 않는다.
 * 덕분에 테스트가 stdout 을 가로채지 않고 그대로 호출할 수 있다.
 *
 * 한 판이라도 죽거나 도중에 예외가 나면 exit code 는 1 이다.
 *
 * 파일을 읽고 쓰는 --record / --replay 는 io 를 통해서만 한다. 엔트리포인트가
 * store 구현을 끼워 넣으므로 이 모듈은 파일시스템을 모른 채로 남는다.
 */
export function main(argv: readonly string[], io?: ReplayIo): CliOutput {
  try {
    const options = parseArgs(argv);
    if (options.replay !== undefined) return replay(options.replay, ports(io));
    if (options.record !== undefined) return record(options, options.record, ports(io));

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
