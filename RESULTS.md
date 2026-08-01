# 실행 결과

- 전체 Task: 9
- 완료 Task: 9
- 남은 Task: 0
- 실행 Loop: 9 (Ralphy Sequential 모드, task 당 1 loop)
- 테스트 결과: 139 pass / 0 fail (`npm run check`), `npm run sim` exit 0

## Ralphy 실행 요약

```
[INFO] Starting Ralphy with Claude Code
[INFO] Tasks remaining: 9
[INFO] Mode: Sequential
[OK] All tasks completed!

  Completed: 9
  Failed:    0
  Duration:  69m 46s
  Tokens:    (446 in / 311,743 out)
```

| Loop | Task | 소요 시간 | 결과 |
|------|------|-----------|------|
| 1 | 게임 상태와 점프 물리 (순수 로직) | 3m 45s | ✔ |
| 2 | 장애물 생성, 충돌 판정, 점수 누적 | 7m 7s | ✔ |
| 3 | 난이도 3단계 프리셋 | 4m 5s | ✔ |
| 4 | 헤드리스 시뮬레이션 (관찰 가능한 결과) | 7m 21s | ✔ |
| 5 | 순수 렌더러 (state -> 화면 문자열) | 5m 12s | ✔ |
| 6 | 터미널 실행 (난이도 메뉴 + 게임 루프 + 안전한 종료) | 14m 20s | ✔ |
| 7 | 게임 오버 처리, R 재시작, 난이도별 최고 기록 저장 | 7m 26s | ✔ |
| 8 | (stretch) 판이 진행될수록 속도 상승 | 7m 3s | ✔ |
| 9 | (stretch) 리플레이 기록 및 재생 검증 | 13m 23s | ✔ |

- 총 9 loop, 실패 0회, 전체 69m 46s (task 실행 합계 69m 42s)
- 가장 오래 걸린 task: 터미널 실행(14m 20s), 리플레이 검증(13m 23s)
- tasks.yaml 의 9개 task 모두 `completed: true`, `.ralphy/progress.txt` 에 9개 섹션 기록

## 완료된 작업

| # | Task ID | 내용 |
|---|---------|------|
| 1 | core-loop-and-jump | 순수 게임 코어(`createGame` / `step`), mulberry32 시드 PRNG, 점프 물리(더블 점프 차단) |
| 2 | obstacles-and-scoring | 장애물 생성·이동·화면 밖 제거, AABB 충돌 판정, tick 기반 점수 누적 |
| 3 | difficulty-presets | slow / normal / fast 프리셋 (obstacleSpeed·minGap·maxGap·tickMs·ticksPerPoint) |
| 4 | headless-sim | 결정론적 자동 점프 봇 + `npm run sim` 러너, exit code 로 성공 판정 |
| 5 | pure-renderer | `renderFrame(state, viewport) -> string[]` 순수 렌더러, HUD·지면·게임오버 박스, 화면 밖 클리핑 |
| 6 | terminal-app | 난이도 메뉴, setInterval 게임 루프, raw mode·대체 화면·커서 복구까지 안전 종료 |
| 7 | gameover-restart-and-highscore | 난이도별 최고 기록 저장(`~/.tui-dino/scores.json`, 임시 파일 + rename), R 재시작 |
| 8 | progressive-speed-ramp (stretch) | tick 기반 속도 배율 + 난이도별 상한 (slow 1.5 / normal 1.4 / fast 1.2) |
| 9 | replay-record-and-verify (stretch) | `--record` / `--replay` 로 시드·입력·spawn 기록 후 재생 검증 |

## 주요 구현 결과

- **런타임 의존성 0개.** devDependency 는 `typescript`, `@types/node` 둘뿐이고 색상·박스 그리기·키 파싱·인자 파싱·PRNG 를 모두 직접 구현했다.
- **빌드 단계 없음.** Node 22 의 네이티브 타입 스트리핑으로 `.ts` 를 그대로 실행한다 (`node src/index.ts`).
- **레이어 분리를 테스트로 강제.** `src/core` 는 process / fs / os 를 모르고, `src/sim` 은 core 만 import 하며, stdout 쓰기는 `src/ui/terminal.ts` 한 곳, 파일시스템 접근은 `src/store` 안에서만 한다. 테스트가 실제 import 문을 읽어 위반을 잡는다.
- **결정론 유지.** core / sim 에서 `Math.random()` · `Date.now()` 를 쓰지 않고, 난수는 시드된 rng, 시간은 tick 으로만 다룬다. 같은 시드 + 같은 입력은 항상 같은 결과를 낸다.
- **회피 가능성 불변식.** 세 난이도 모두 "점프 체공 거리 > 위험 구간", "minGap > 회피 가능 최소 간격" 을 실제 `step()` 궤적으로 재현해 검증한다. 속도 램프 상한도 이 불변식이 정했다.
- **관찰 가능한 성공 판정.** 사람 눈이 아니라 `npm run sim` 의 exit code 가 성공을 판정한다.

파일 구성:

```
src/core/    types.ts  rng.ts  game.ts  difficulty.ts  score.ts   (순수 로직)
src/sim/     bot.ts  run.ts  replay.ts                            (헤드리스 + 리플레이)
src/ui/      keys.ts  menu.ts  render.ts  terminal.ts             (렌더 순수 / stdout 은 terminal.ts)
src/store/   highscore.ts  replay.ts                              (파일시스템 전용)
src/index.ts  src/sim.ts                                          (엔트리포인트)
tests/       core(6) sim(4) ui(4) store(1) — 총 15개 테스트 파일
```

## Git Commit 내역

```
7f1d2f7 feat(replay-record-and-verify): 시드와 입력을 기록해 재생 검증하는 --record / --replay
5f26de8 feat(progressive-speed-ramp): 판이 진행될수록 붙는 장애물 속도 배율과 상한
f39c7af feat(gameover-restart-and-highscore): 난이도별 최고 기록 저장과 R 재시작
7b58eca feat(terminal-app): 난이도 메뉴, 게임 루프, 안전한 종료로 npm start 완성
8a7c819 feat(pure-renderer): state 를 화면 문자열로 바꾸는 순수 렌더러
241039b feat(headless-sim): 결정론적 자동 점프 봇과 난이도별 헤드리스 러너
c0ce7a8 feat(difficulty-presets): slow / normal / fast 난이도 프리셋
3106fdd feat(obstacles-and-scoring): 장애물 생성, 충돌 판정, 점수 누적
b8b6b78 feat(core-loop-and-jump): 순수 게임 코어와 점프 물리 구현
5b8c900 chore: initialize repository
e522627 chore: initialize repository
```

task 당 feature 커밋 1개(9개) + 초기화 커밋 2개 = 총 11 커밋.

## 테스트 실행 결과

```
$ npm run check
# tests 139
# pass  139
# fail  0
# duration_ms 360.5

$ npm run sim
slow   seed=1337    score=333    ticks=2000   reason=survived
normal seed=1337    score=400    ticks=2000   reason=survived
fast   seed=1337    score=500    ticks=2000   reason=survived
exit 0
```

- 타입 체크(`tsc --noEmit`) 통과, `node --test` 139개 전부 통과
- 고정 시드 1337 로 세 난이도 모두 2000 tick 완주 → exit 0
- 각 task 는 완료 전에 구현을 일부러 깨뜨려(mutation) 테스트가 실제로 잡는지 확인한 뒤 되돌렸다

## 프로그램 실행 방법

```bash
# 설치 (Node.js >= 22.6 필요, 런타임 의존성 없음)
cd /Users/minseop/Dev/projects/ralph/test/test_tui_dino_game
npm install          # devDependencies(typescript, @types/node)만 설치

# 실행 — 터미널 게임 (최소 터미널 크기 60x16)
npm start

# 헤드리스 시뮬레이션 (사람 없이 성공/실패 판정, 성공 시 exit 0)
npm run sim
npm run sim -- --difficulty fast --seed 1337 --ticks 2000

# 리플레이 기록 / 재생 검증
npm run sim -- --difficulty normal --record run.json
npm run sim -- --replay run.json

# 테스트 / 타입 체크
npm test        # node --test
npm run check   # typecheck + test
```

## 프로그램 조작 및 종료 방법

- **메뉴**: `1` / `2` / `3` 으로 slow / normal / fast 즉시 시작, 또는 `↑` `↓` 로 선택 후 `Enter`
- **게임 중**: `Space` = 점프 (지면에 있을 때만, 더블 점프 없음)
- **게임 오버**: `R` = 같은 난이도로 재시작, `Q` = 종료
- **종료**: `Q`(또는 `q`) 또는 `Ctrl+C`. 어느 경로든 raw mode·커서·대체 화면을 원복하고 exit 0 (시그널 경로는 exit 130)
- 터미널이 60x16 보다 작으면 안내 메시지 출력 후 exit 1
