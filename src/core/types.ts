import type { Rng } from './rng.ts';

/** 게임 진행 상태. */
export type GameStatus = 'running' | 'gameOver';

/** 한 tick 에 게임 코어가 받는 입력. 조작은 스페이스(=Jump) 하나뿐이다. */
export const Input = {
  None: 'none',
  Jump: 'jump',
} as const;

export type Input = (typeof Input)[keyof typeof Input];

/**
 * 장애물이 오가는 트랙의 규격. 히트박스 좌표와 생성 규칙이 모두 여기 모인다.
 *
 * minGap 은 "한 번 점프해 착지한 뒤 다시 점프할 수 있는" 거리여야 한다 —
 * 그보다 좁으면 물리적으로 회피 불가능한 배치가 나온다.
 */
export type TrackConfig = {
  /** 공룡 히트박스. 세로는 dino.y 에서 dinoHeight 만큼 위로 올라간다. */
  dinoX: number;
  dinoWidth: number;
  dinoHeight: number;
  /** 장애물이 생성되는 x. 트랙의 오른쪽 끝. */
  spawnX: number;
  /** 장애물 히트박스. 세로는 항상 groundY 에서 시작한다. */
  obstacleWidth: number;
  obstacleHeight: number;
  /** 장애물이 매 tick 왼쪽으로 이동하는 거리. */
  obstacleSpeed: number;
  /** 앞뒤 장애물의 x 간격 범위. 실제 간격은 이 사이에서 rng 로 정해진다. */
  minGap: number;
  maxGap: number;
};

/** 장애물 하나. x 는 왼쪽 모서리, 세로는 언제나 지면에서 시작한다. */
export type Obstacle = {
  x: number;
};

/** 한 판 동안 바뀌지 않는 규칙 값. */
export type GameConfig = {
  /** 지면의 y 좌표. 위로 갈수록 y 가 커진다. */
  groundY: number;
  /** 점프 순간 얻는 위쪽 속도 (tick 당 y 증가량). */
  jumpVelocity: number;
  /** 매 tick 속도에서 빼는 값. */
  gravity: number;
  /** 1점에 필요한 tick 수. 생략하면 tick 당 1점. */
  ticksPerPoint?: number;
  /** 트랙 규격. 생략하면 장애물 없이 점프 물리만 도는 게임이 된다. */
  track?: TrackConfig;
};

/** 공룡의 수직 운동 상태. x 는 고정이라 담지 않는다. */
export type Dino = {
  y: number;
  vy: number;
};

/** step 이 매번 새로 만들어 반환하는 불변 상태. */
export type GameState = {
  config: GameConfig;
  status: GameStatus;
  tick: number;
  score: number;
  dino: Dino;
  /** 왼쪽(먼저 생성된 것)부터 오른쪽 순으로 정렬돼 있다. */
  obstacles: readonly Obstacle[];
  /** 마지막으로 생성된 장애물 뒤에 둘 x 간격. 생성 시점에 rng 로 뽑는다. */
  nextGap: number;
  rng: Rng;
};
