import { createRng } from './rng.ts';
import { Input, type GameConfig, type GameState } from './types.ts';

/** 시드로부터 한 판의 초기 상태를 만든다. 공룡은 지면 위에 정지해 있다. */
export function createGame(config: GameConfig, seed: number): GameState {
  return {
    config,
    status: 'running',
    tick: 0,
    dino: { y: config.groundY, vy: 0 },
    rng: createRng(seed),
  };
}

/**
 * 한 tick 진행한 새 상태를 반환한다. 인자로 받은 state 는 변형하지 않는다.
 *
 * 지면에 있을 때만 Jump 가 위쪽 속도로 바뀐다 — 체공 중 입력은 무시되므로
 * 더블 점프가 없고, 최고 높이는 언제나 1회 점프와 같다.
 */
export function step(state: GameState, input: Input): GameState {
  const { config, dino } = state;
  const onGround = dino.y <= config.groundY;

  let vy = onGround && input === Input.Jump ? config.jumpVelocity : dino.vy;
  let y = dino.y + vy;
  vy -= config.gravity;

  if (y <= config.groundY) {
    y = config.groundY;
    vy = 0;
  }

  return { ...state, tick: state.tick + 1, dino: { y, vy } };
}
