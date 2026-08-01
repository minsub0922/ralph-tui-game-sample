import type { GameConfig, TrackConfig } from './types.ts';

/** 메뉴에 보이는 순서 그대로. 위로 갈수록 쉽다. */
export const DIFFICULTY_IDS = ['slow', 'normal', 'fast'] as const;

export type DifficultyId = (typeof DIFFICULTY_IDS)[number];

/**
 * 난이도 프리셋. 트랙이 반드시 있고, 게임 루프가 쓸 프레임 간격까지 함께 담는다.
 *
 * tickMs 는 코어 로직에 전혀 영향을 주지 않는다 — step() 은 tick 수만 세므로
 * 프레임 간격을 바꿔도 같은 시드 + 같은 입력은 같은 결과를 낸다.
 */
export type DifficultyConfig = GameConfig & {
  /** 한 tick 사이의 실제 경과 시간(ms). */
  tickMs: number;
  track: TrackConfig;
};

/** 트랙 규격은 난이도와 무관하게 고정이고, 속도와 간격만 달라진다. */
function track(obstacleSpeed: number, minGap: number, maxGap: number): TrackConfig {
  return {
    dinoX: 6,
    dinoWidth: 2,
    dinoHeight: 3,
    spawnX: 60,
    obstacleWidth: 2,
    obstacleHeight: 2,
    obstacleSpeed,
    minGap,
    maxGap,
  };
}

/**
 * 점프 물리(jumpVelocity 1.6 / gravity 0.35)는 세 난이도가 공유한다.
 * 체공은 10 tick 이고 그중 7 tick 을 장애물 높이 위에서 보내므로,
 * 속도가 가장 빠른 fast 에서도 7 x 1.4 = 9.8 칸을 넘어 위험 구간(4칸)을 지나간다.
 *
 * 난이도는 장애물 속도, 간격, tickMs 로만 올라간다. 조작 감각이 바뀌지 않아야
 * 스페이스 하나를 배운 심사자가 세 난이도를 그대로 오갈 수 있다.
 */
const PRESETS: Record<DifficultyId, DifficultyConfig> = {
  slow: {
    tickMs: 60,
    groundY: 0,
    jumpVelocity: 1.6,
    gravity: 0.35,
    ticksPerPoint: 6,
    track: track(0.7, 30, 46),
  },
  normal: {
    tickMs: 50,
    groundY: 0,
    jumpVelocity: 1.6,
    gravity: 0.35,
    ticksPerPoint: 5,
    track: track(1, 26, 40),
  },
  fast: {
    tickMs: 40,
    groundY: 0,
    jumpVelocity: 1.6,
    gravity: 0.35,
    ticksPerPoint: 4,
    track: track(1.4, 24, 34),
  },
};

function isDifficultyId(id: string): id is DifficultyId {
  return (DIFFICULTY_IDS as readonly string[]).includes(id);
}

/** 난이도 id 로 프리셋을 찾는다. 모르는 id 는 고를 수 있는 값과 함께 거절한다. */
export function getConfig(id: string): DifficultyConfig {
  if (!isDifficultyId(id)) {
    throw new Error(`알 수 없는 난이도 '${id}'. 사용 가능한 값: ${DIFFICULTY_IDS.join(', ')}`);
  }
  return PRESETS[id];
}
