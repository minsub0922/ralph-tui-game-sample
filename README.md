# tui-dino-game

터미널에서 스페이스 한 키로 즐기는 공룡 점프 게임. 시작할 때 `slow` / `normal` / `fast` 난이도를 고르고, 이후 조작은 스페이스 하나로 고정된다.

- 런타임 의존성 0개 (Node.js 내장 모듈만 사용)
- 빌드 단계 없음 — Node 22 네이티브 타입 스트리핑으로 `.ts` 를 그대로 실행
- 순수 게임 로직(`src/core`)과 I/O(`src/ui/terminal.ts`, `src/store`)를 분리, 같은 시드 + 같은 입력은 항상 같은 결과

> 이 프로젝트는 Claude Code 의 **Ralphy** 자율 루프로 작성되었다.
> 9개 task 를 9 loop 에 걸쳐 순차 구현했으며, 루프별 실행 결과와 소요 시간은 **[RESULTS.md](./RESULTS.md)** 에 정리되어 있다.

## Demo

<!-- 데모 영상 -->

_(여기에 데모 영상 추가)_

## 설치

Node.js >= 22.6 필요.

```bash
git clone https://github.com/minsub0922/ralph-tui-game-sample.git
cd ralph-tui-game-sample
npm install          # devDependencies(typescript, @types/node)만 설치
```

## 실행

```bash
npm start            # 터미널 게임 (최소 터미널 크기 60x16)
```

헤드리스 시뮬레이션 — 사람 없이 성공/실패를 판정한다 (완주 시 exit 0):

```bash
npm run sim
npm run sim -- --difficulty fast --seed 1337 --ticks 2000
```

리플레이 기록 / 재생 검증:

```bash
npm run sim -- --difficulty normal --record run.json
npm run sim -- --replay run.json
```

## 조작

| 상황 | 키 |
|------|-----|
| 메뉴 | `1` `2` `3` 으로 slow / normal / fast 즉시 시작, 또는 `↑` `↓` 후 `Enter` |
| 게임 중 | `Space` — 점프 (지면에 있을 때만, 더블 점프 없음) |
| 게임 오버 | `R` 재시작 / `Q` 종료 |
| 종료 | `Q` 또는 `Ctrl+C` — raw mode·커서·화면을 원복하고 정상 종료 |

## 테스트

```bash
npm run check        # tsc --noEmit + node --test  (139 pass / 0 fail)
```

## 구조

```
src/core/     순수 게임 로직 (상태, 물리, 충돌, 점수, 난이도, 기록 병합)
src/sim/      헤드리스 봇과 리플레이 (core 만 import)
src/ui/       키 파싱·메뉴·렌더러(순수) + terminal.ts (유일한 stdout 지점)
src/store/    파일시스템 접근 전용 (최고 기록, 리플레이 파일)
tests/        src 와 같은 디렉터리 구조
```

자세한 제품 정의는 [PRODUCT.md](./PRODUCT.md), 작업 순서는 [tasks.yaml](./tasks.yaml), 작업 규칙은 [AGENTS.md](./AGENTS.md) 참고.
