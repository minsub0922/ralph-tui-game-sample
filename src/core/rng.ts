/**
 * mulberry32 기반 결정론적 PRNG.
 *
 * 상태를 변형하지 않는다 — next() 는 새 Rng 와 값을 함께 돌려준다.
 * 같은 시드에서 출발하면 항상 같은 수열이 나온다.
 */
export type Rng = {
  /** 32bit 부호 있는 정수로 유지되는 내부 카운터. */
  readonly state: number;
};

export type RngDraw = {
  readonly rng: Rng;
  /** [0, 1) 구간의 난수. */
  readonly value: number;
};

export function createRng(seed: number): Rng {
  return { state: seed | 0 };
}

export function next(rng: Rng): RngDraw {
  const state = (rng.state + 0x6d2b79f5) | 0;
  let x = state;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return { rng: { state }, value };
}
