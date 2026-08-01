import type { Rng } from './rng.ts';

/** 게임 진행 상태. */
export type GameStatus = 'running' | 'gameOver';

/** 한 tick 에 게임 코어가 받는 입력. 조작은 스페이스(=Jump) 하나뿐이다. */
export const Input = {
  None: 'none',
  Jump: 'jump',
} as const;

export type Input = (typeof Input)[keyof typeof Input];

/** 한 판 동안 바뀌지 않는 규칙 값. */
export type GameConfig = {
  /** 지면의 y 좌표. 위로 갈수록 y 가 커진다. */
  groundY: number;
  /** 점프 순간 얻는 위쪽 속도 (tick 당 y 증가량). */
  jumpVelocity: number;
  /** 매 tick 속도에서 빼는 값. */
  gravity: number;
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
  dino: Dino;
  rng: Rng;
};
