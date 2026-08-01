import { createRng, next, type Rng } from './rng.ts';
import {
  Input,
  type Dino,
  type GameConfig,
  type GameState,
  type Obstacle,
  type TrackConfig,
} from './types.ts';

/** 시드로부터 한 판의 초기 상태를 만든다. 공룡은 지면 위에 정지해 있고 트랙은 비어 있다. */
export function createGame(config: GameConfig, seed: number): GameState {
  return {
    config,
    status: 'running',
    tick: 0,
    score: 0,
    dino: { y: config.groundY, vy: 0 },
    obstacles: [],
    nextGap: 0,
    rng: createRng(seed),
  };
}

/**
 * 그 tick 의 장애물 속도 배율. 1 에서 시작해 maxSpeedMultiplier 까지만 오른다.
 *
 * tick 만으로 정해지는 순수 함수라 같은 시드 + 같은 입력은 여전히 같은 결과를 낸다.
 */
export function speedMultiplier(track: TrackConfig, tick: number): number {
  const ramp = track.speedRampPerTick ?? 0;
  const cap = track.maxSpeedMultiplier ?? 1;
  return Math.min(1 + ramp * Math.max(tick, 0), Math.max(cap, 1));
}

/** 그 tick 에 장애물이 실제로 움직이는 거리. */
export function effectiveSpeed(track: TrackConfig, tick: number): number {
  return track.obstacleSpeed * speedMultiplier(track, tick);
}

/**
 * 한 tick 진행한 새 상태를 반환한다. 인자로 받은 state 는 변형하지 않는다.
 *
 * 이미 끝난 판은 더 이상 움직이지 않는다 — 같은 state 를 그대로 돌려주므로
 * 점수도 장애물 배치도 게임 오버 순간에 고정된다.
 */
export function step(state: GameState, input: Input): GameState {
  if (state.status === 'gameOver') return state;

  const { config } = state;
  const tick = state.tick + 1;
  const dino = stepDino(config, state.dino, input);
  const track = config.track;

  if (track === undefined) {
    return { ...state, tick, score: scoreAt(config, tick), dino };
  }

  const moved = advance(track, state.obstacles, effectiveSpeed(track, state.tick));
  const spawned = spawn(track, moved, state.rng, state.nextGap);

  return {
    ...state,
    status: hits(track, config.groundY, dino, spawned.obstacles) ? 'gameOver' : 'running',
    tick,
    score: scoreAt(config, tick),
    dino,
    obstacles: spawned.obstacles,
    nextGap: spawned.nextGap,
    rng: spawned.rng,
  };
}

/**
 * 지면에 있을 때만 Jump 가 위쪽 속도로 바뀐다 — 체공 중 입력은 무시되므로
 * 더블 점프가 없고, 최고 높이는 언제나 1회 점프와 같다.
 */
function stepDino(config: GameConfig, dino: Dino, input: Input): Dino {
  const onGround = dino.y <= config.groundY;

  let vy = onGround && input === Input.Jump ? config.jumpVelocity : dino.vy;
  let y = dino.y + vy;
  vy -= config.gravity;

  if (y <= config.groundY) {
    y = config.groundY;
    vy = 0;
  }

  return { y, vy };
}

function scoreAt(config: GameConfig, tick: number): number {
  return Math.floor(tick / (config.ticksPerPoint ?? 1));
}

/**
 * 장애물을 왼쪽으로 밀고, 화면 왼쪽 밖으로 완전히 빠져나간 것은 버린다.
 *
 * 한 tick 안에서는 모든 장애물이 같은 거리를 움직이므로, 속도가 올라가도
 * 이미 생성된 장애물 사이의 간격은 그대로다.
 */
function advance(track: TrackConfig, obstacles: readonly Obstacle[], speed: number): Obstacle[] {
  return obstacles
    .map((obstacle) => ({ x: obstacle.x - speed }))
    .filter((obstacle) => obstacle.x + track.obstacleWidth > 0);
}

/**
 * 마지막 장애물이 nextGap 이상 멀어졌으면 트랙 오른쪽 끝에 새 장애물을 낸다.
 *
 * 새 장애물은 항상 spawnX 에 놓이므로 실제 간격은 nextGap 이상이 되고,
 * nextGap 은 [minGap, maxGap) 에서 뽑히므로 minGap 불변식이 깨지지 않는다.
 */
function spawn(
  track: TrackConfig,
  obstacles: Obstacle[],
  rng: Rng,
  nextGap: number,
): { obstacles: Obstacle[]; rng: Rng; nextGap: number } {
  const last = obstacles[obstacles.length - 1];
  if (last !== undefined && last.x > track.spawnX - nextGap) {
    return { obstacles, rng, nextGap };
  }

  const draw = next(rng);
  return {
    obstacles: [...obstacles, { x: track.spawnX }],
    rng: draw.rng,
    nextGap: track.minGap + draw.value * (track.maxGap - track.minGap),
  };
}

/** 두 히트박스의 AABB 겹침. 모서리가 정확히 맞닿기만 한 상태는 아직 충돌이 아니다. */
function hits(
  track: TrackConfig,
  groundY: number,
  dino: Dino,
  obstacles: readonly Obstacle[],
): boolean {
  const dinoRight = track.dinoX + track.dinoWidth;
  const dinoTop = dino.y + track.dinoHeight;
  const obstacleTop = groundY + track.obstacleHeight;

  return obstacles.some(
    (obstacle) =>
      obstacle.x < dinoRight &&
      track.dinoX < obstacle.x + track.obstacleWidth &&
      dino.y < obstacleTop &&
      groundY < dinoTop,
  );
}
