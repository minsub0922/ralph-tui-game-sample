import { DIFFICULTY_IDS, getConfig, type DifficultyId } from '../core/difficulty.ts';
import { createGame, step } from '../core/game.ts';
import { Input, type GameConfig, type GameState } from '../core/types.ts';
import { chooseInput, jumpThresholdAt } from './bot.ts';

/** 리플레이 파일 포맷 버전. 포맷이 바뀌면 올리고, 모르는 버전은 읽지 않는다. */
export const REPLAY_VERSION = 1;

/** 한 판을 돌리는 데 필요한 값 전부. 이 값이 같으면 언제나 같은 판이 나온다. */
export type TraceOptions = {
  difficulty: DifficultyId;
  seed: number;
  ticks: number;
  /** 봇이 점프를 시작하는 거리. 생략하면 매 tick 의 실효 속도에 맞춰 계산한다. */
  threshold?: number;
};

/** 한 판을 돌리면서 같이 받아 적은 것. 재생과 비교할 재료가 전부 여기 있다. */
export type Trace = {
  /** 판이 끝난 시점의 state. */
  state: GameState;
  /** Jump 를 넣은 step 의 index (0-based). 나머지 step 의 입력은 None 이다. */
  jumps: readonly number[];
  /** 장애물이 생성된 tick. */
  spawns: readonly number[];
};

/**
 * 사람이 읽고 고칠 수 있는 리플레이 파일.
 *
 * inputs 는 입력 시퀀스를 그대로 담되 Jump 가 들어간 tick 만 적는다 —
 * 조작이 스페이스 하나뿐이라 나머지 tick 은 전부 None 이고, 2000줄짜리
 * 'none' 목록보다 이쪽이 눈으로 읽힌다.
 *
 * spawns 는 시드의 지문이다. 시드나 난이도를 손으로 고치면 장애물 배치가 달라지므로
 * 최종 점수가 어쩌다 같더라도 여기서 먼저 갈라진다.
 */
export type ReplayFile = {
  version: number;
  difficulty: DifficultyId;
  seed: number;
  /** 기록된 판이 진행한 tick 수. */
  ticks: number;
  /** 기록된 판의 최종 점수. */
  score: number;
  inputs: readonly number[];
  spawns: readonly number[];
};

/** 기록과 재생을 맞춰 본 결과. */
export type ReplayVerdict = {
  ok: boolean;
  /** 파일에 적힌 결과. */
  expected: { ticks: number; score: number };
  /** 재생해서 나온 결과. */
  actual: { ticks: number; score: number };
  /** 기록과 재생이 처음으로 갈라진 tick. 일치하면 없다. */
  divergedAt?: number;
  /** 무엇이 갈라졌는지. 일치하면 없다. */
  detail?: string;
};

/** 마지막 장애물의 x. 장애물이 없으면 어떤 좌표보다도 작게 친다. */
function lastX(state: GameState): number {
  const last = state.obstacles[state.obstacles.length - 1];
  return last === undefined ? Number.NEGATIVE_INFINITY : last.x;
}

/**
 * 이 tick 에 새 장애물이 생겼는지. 기존 장애물은 왼쪽으로만 가고 새 장애물은
 * 항상 트랙 오른쪽 끝에 놓이므로, 마지막 장애물의 x 가 커졌다면 생성된 것이다.
 */
function spawned(before: GameState, after: GameState): boolean {
  return lastX(after) > lastX(before);
}

/** 입력을 정하는 방식만 갈아 끼우고 한 판을 돌린다. 봇도 재생도 같은 루프를 쓴다. */
function trace(
  config: GameConfig,
  seed: number,
  ticks: number,
  choose: (state: GameState) => Input,
): Trace {
  const jumps: number[] = [];
  const spawns: number[] = [];

  let state = createGame(config, seed);
  while (state.tick < ticks && state.status === 'running') {
    const input = choose(state);
    if (input === Input.Jump) jumps.push(state.tick);

    const next = step(state, input);
    if (spawned(state, next)) spawns.push(next.tick);
    state = next;
  }

  return { state, jumps, spawns };
}

/** 봇에게 한 판을 맡겨 목표 tick 까지 돌린다. 같은 인자는 항상 같은 trace 를 낸다. */
export function traceRun(options: TraceOptions): Trace {
  return trace(getConfig(options.difficulty), options.seed, options.ticks, (state) =>
    // 임계 거리를 고정하지 않으면 매 tick 의 실효 속도에 맞춰 다시 계산한다.
    chooseInput(state, options.threshold ?? jumpThresholdAt(state)),
  );
}

/** 파일에 적힌 입력을 그대로 다시 넣어 판을 돌린다. 봇은 쓰지 않는다. */
export function traceReplay(file: ReplayFile): Trace {
  const jumps = new Set(file.inputs);
  return trace(getConfig(file.difficulty), file.seed, file.ticks, (state) =>
    jumps.has(state.tick) ? Input.Jump : Input.None,
  );
}

/** 돌린 판을 파일로 옮긴다. */
export function toReplay(options: TraceOptions, traced: Trace): ReplayFile {
  return {
    version: REPLAY_VERSION,
    difficulty: options.difficulty,
    seed: options.seed,
    ticks: traced.state.tick,
    score: traced.state.score,
    inputs: traced.jumps,
    spawns: traced.spawns,
  };
}

/** 기록과 재생이 처음 갈라진 지점. 이른 신호부터 본다 — 장애물 배치, 끝난 tick, 점수 순이다. */
function diverge(file: ReplayFile, traced: Trace): { tick: number; detail: string } | undefined {
  for (const [index, recorded] of file.spawns.entries()) {
    const replayed = traced.spawns[index];
    if (replayed === undefined) break;
    if (recorded !== replayed) {
      return {
        tick: Math.min(recorded, replayed),
        detail: `${index + 1}번째 장애물이 생성된 tick 이 다르다 (기록 ${recorded}, 재생 ${replayed})`,
      };
    }
  }

  if (traced.state.tick !== file.ticks) {
    return {
      tick: Math.min(traced.state.tick, file.ticks),
      detail: `판이 끝난 tick 이 다르다 (기록 ${file.ticks}, 재생 ${traced.state.tick})`,
    };
  }

  if (traced.state.score !== file.score) {
    return {
      tick: file.ticks,
      detail: `최종 점수가 다르다 (기록 ${file.score}, 재생 ${traced.state.score})`,
    };
  }

  if (traced.spawns.length !== file.spawns.length) {
    const shared = Math.min(traced.spawns.length, file.spawns.length);
    return {
      tick: file.spawns[shared] ?? traced.spawns[shared] ?? file.ticks,
      detail: `장애물 수가 다르다 (기록 ${file.spawns.length}, 재생 ${traced.spawns.length})`,
    };
  }

  return undefined;
}

/** 파일을 재생해 기록과 맞춰 본다. 결정론이 지켜지면 언제나 ok 다. */
export function verifyReplay(file: ReplayFile): ReplayVerdict {
  const traced = traceReplay(file);
  const expected = { ticks: file.ticks, score: file.score };
  const actual = { ticks: traced.state.tick, score: traced.state.score };

  const divergence = diverge(file, traced);
  if (divergence === undefined) return { ok: true, expected, actual };

  return { ok: false, expected, actual, divergedAt: divergence.tick, detail: divergence.detail };
}

/** 재생 결과를 사람이 읽을 줄로 만든다. 첫 줄은 한 판 요약이고, 갈라졌을 때만 뒤가 붙는다. */
export function formatVerdict(file: ReplayFile, verdict: ReplayVerdict): string[] {
  const summary = [
    'replay'.padEnd(6),
    file.difficulty.padEnd(6),
    `seed=${file.seed}`.padEnd(12),
    `score=${verdict.actual.score}`.padEnd(12),
    `ticks=${verdict.actual.ticks}`.padEnd(12),
    `result=${verdict.ok ? 'match' : 'mismatch'}`,
  ].join(' ');

  if (verdict.ok) return [summary];

  return [
    summary,
    `  tick ${verdict.divergedAt} 에서 갈라졌다: ${verdict.detail}`,
    `  기록 score=${file.score} ticks=${file.ticks}` +
      ` / 재생 score=${verdict.actual.score} ticks=${verdict.actual.ticks}`,
  ];
}

function isDifficultyId(value: unknown): value is DifficultyId {
  return typeof value === 'string' && (DIFFICULTY_IDS as readonly string[]).includes(value);
}

/** 유한한 수. 시드처럼 정수가 아니어도 되는 값에 쓴다. */
function finite(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`리플레이 파일의 ${key} 가 숫자가 아니다`);
  }
  return value;
}

/** 0 이상의 정수. tick 수와 점수에 쓴다. */
function count(source: Record<string, unknown>, key: string): number {
  const value = finite(source, key);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`리플레이 파일의 ${key} 가 0 이상의 정수가 아니다`);
  }
  return value;
}

/** tick 번호 목록. 오름차순이어야 같은 tick 을 두 번 적거나 뒤섞어 놓을 수 없다. */
function ticks(source: Record<string, unknown>, key: string): number[] {
  const value = source[key];
  if (!Array.isArray(value)) throw new Error(`리플레이 파일의 ${key} 가 배열이 아니다`);

  let previous = -1;
  return value.map((entry, index) => {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0) {
      throw new Error(`리플레이 파일의 ${key}[${index}] 가 tick 번호가 아니다`);
    }
    if (entry <= previous) {
      throw new Error(`리플레이 파일의 ${key} 가 tick 순서대로 있지 않다 (${index}번째: ${entry})`);
    }
    previous = entry;
    return entry;
  });
}

/**
 * 파일에서 읽은 값을 리플레이로 바꾼다.
 *
 * 손으로 고칠 수 있는 파일이라 아무것도 믿지 않는다. 다만 여기서 막는 것은 "읽을 수 없는
 * 파일" 뿐이고, 값이 판과 맞는지(시드를 바꿨는지)는 재생해 봐야 알 수 있다.
 */
export function parseReplay(value: unknown): ReplayFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('리플레이 파일이 JSON 객체가 아니다');
  }

  const source = value as Record<string, unknown>;
  if (source['version'] !== REPLAY_VERSION) {
    throw new Error(
      `읽을 수 없는 리플레이 버전 '${String(source['version'])}'. 이 빌드는 ${REPLAY_VERSION} 만 읽는다`,
    );
  }

  const difficulty = source['difficulty'];
  if (!isDifficultyId(difficulty)) {
    throw new Error(
      `리플레이 파일의 난이도 '${String(difficulty)}' 를 모른다. 사용 가능한 값: ${DIFFICULTY_IDS.join(', ')}`,
    );
  }

  return {
    version: REPLAY_VERSION,
    difficulty,
    seed: finite(source, 'seed'),
    ticks: count(source, 'ticks'),
    score: count(source, 'score'),
    inputs: ticks(source, 'inputs'),
    spawns: ticks(source, 'spawns'),
  };
}
