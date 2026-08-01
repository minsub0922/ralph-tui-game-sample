import { effectiveSpeed } from '../core/game.ts';
import { Input, type GameState, type TrackConfig } from '../core/types.ts';

/**
 * 장애물이 위험 구간에 닿기 몇 tick 전에 뛸지. 클수록 일찍 뛴다.
 *
 * 점프는 지면을 떠난 직후 1 tick 동안 아직 장애물 높이 아래에 있으므로 2 이상이어야 하고,
 * 너무 크면 장애물이 도착하기 전에 착지해 버린다. 3 은 세 난이도 모두에서 그 사이에 있다.
 */
export const LEAD_TICKS = 3;

/**
 * 봇이 점프를 시작하는 거리 — 장애물의 왼쪽 모서리 x 가 이 값 이하로 내려오면 뛴다.
 *
 * 기준점은 공룡의 오른쪽 끝(dinoX + dinoWidth)이다. 장애물이 그 지점에 닿는 순간부터
 * 충돌이 가능하므로, 거기서 LEAD_TICKS tick 만큼의 이동 거리를 앞당겨 잡는다.
 * 속도에 비례하므로 난이도가 빨라져도 같은 여유가 유지된다.
 */
export function jumpThreshold(track: TrackConfig, leadTicks: number = LEAD_TICKS): number {
  return track.dinoX + track.dinoWidth + leadTicks * track.obstacleSpeed;
}

/**
 * 지금 state 에서의 임계 거리. 판이 진행돼 속도가 올라가면 그만큼 더 일찍 뛴다.
 *
 * 속도 배율이 붙지 않는 트랙에서는 jumpThreshold(track) 와 같은 값이다.
 */
export function jumpThresholdAt(state: GameState, leadTicks: number = LEAD_TICKS): number {
  const track = state.config.track;
  if (track === undefined) return 0;
  return track.dinoX + track.dinoWidth + leadTicks * effectiveSpeed(track, state.tick);
}

/**
 * 지금 state 에서 봇이 낼 입력. 같은 state 는 항상 같은 입력을 낸다.
 *
 * 지면에 있고, 아직 지나가지 않은 가장 가까운 장애물이 threshold 안에 들어왔을 때만 Jump.
 * 체공 중에는 어차피 입력이 무시되므로 None 을 낸다.
 */
export function chooseInput(state: GameState, threshold: number): Input {
  const track = state.config.track;
  if (track === undefined) return Input.None;
  if (state.dino.y > state.config.groundY) return Input.None;

  const nearest = state.obstacles.find(
    (obstacle) => obstacle.x + track.obstacleWidth > track.dinoX,
  );
  if (nearest === undefined) return Input.None;

  return nearest.x <= threshold ? Input.Jump : Input.None;
}
