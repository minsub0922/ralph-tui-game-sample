# AGENTS.md

이 저장소에서 작업하는 에이전트를 위한 규칙. `PRODUCT.md` 가 무엇을 만드는지, `tasks.yaml` 이 어떤 순서로 만드는지를 정의한다. 이 문서는 어떻게 작업하는지를 정의한다.

## 프로젝트 명령

| 명령 | 하는 일 |
|---|---|
| `npm start` | 게임 실행. 난이도 메뉴 → 게임 루프 |
| `npm run sim` | 헤드리스 시뮬레이션. 난이도 3종 완주 시 exit 0 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `node --test` (Node 내장 테스트 러너) |
| `npm run check` | `typecheck` + `test`. **완료 판정 기준** |

`npm run check` 는 타입 체크와 테스트를 합친 것이다. 별도 린터는 두지 않는다 — 의존성 0 원칙을 지키기 위해 TypeScript strict 모드가 그 역할을 대신한다.

## 디렉터리 구조

```
src/
  core/          # 순수 게임 로직. 터미널·파일시스템 무관
    types.ts     #   GameState, GameConfig, Input, GameStatus
    rng.ts       #   시드 기반 결정론적 PRNG
    game.ts      #   createGame(config, seed), step(state, input) -> state
    difficulty.ts#   slow / normal / fast 프리셋
    score.ts     #   최고 기록 병합 (순수 함수)
  sim/           # 헤드리스 시뮬레이션
    bot.ts       #   결정론적 자동 점프 봇
    run.ts       #   난이도별 러너 + CLI 인자 처리
  ui/            # 표시와 입력
    render.ts    #   renderFrame(state, viewport) -> string[] (순수)
    keys.ts      #   parseKey(bytes) -> Input (순수)
    terminal.ts  #   raw mode, 커서, stdout 쓰기  ← 유일한 출력 지점
    menu.ts      #   난이도 선택 화면
  store/
    highscore.ts # ~/.tui-dino/scores.json 읽기/쓰기
  index.ts       # 엔트리포인트
tests/
  core/ sim/ ui/ store/   # src 구조를 그대로 반영
```

### 레이어 규칙

- `src/core/` 는 `process`, `node:fs`, `node:os` 를 **참조하지 않는다**. 오직 순수 함수와 데이터만.
- `src/sim/` 은 `src/core/` 만 import 한다. `src/ui/` 를 import 하지 않는다.
- `src/ui/render.ts` 와 `src/ui/keys.ts` 는 순수 함수다. I/O 는 `terminal.ts` 한 곳에만 있다.
- 파일시스템 접근은 `src/store/` 안에서만 한다.
- 새 파일이 어느 레이어에 속하는지 애매하면, 순수 로직과 I/O 를 나눠 두 파일로 만든다.

## 수정 금지 영역

- **`PRODUCT.md`** — 제품 정의는 확정됐다. 구현하다 불일치를 발견하면 문서를 고치지 말고 작업을 멈추고 사람에게 보고한다.
- **`tasks.yaml` 의 task 내용** — `completed` 값만 `false` → `true` 로 바꾼다. task 를 추가·삭제·재정렬하거나 acceptance criteria 를 낮추지 않는다.
- **`AGENTS.md`** — 이 문서.
- **`.git/`**, 기존 커밋 히스토리.
- **다른 task 가 만든 테스트** — 현재 task 와 무관한 테스트는 건드리지 않는다.

## 작업 규칙

### 한 번에 한 task 만 수행한다

`tasks.yaml` 에서 `completed: false` 이고 의존성이 모두 완료된 **가장 위의 task 하나**를 고른다. 그 task 의 acceptance criteria 를 전부 만족시키고, `npm run check` 를 통과시키고, `completed: true` 로 바꾼 뒤 커밋한다. 그 다음에야 다음 task 를 본다.

다음 task 의 코드를 미리 작성하지 않는다. "어차피 필요하니까"는 이유가 되지 않는다.

### dependency 를 임의로 추가하지 않는다

런타임 의존성은 **0개**다. Node.js 내장 모듈만 쓴다. devDependencies 는 `typescript` 하나뿐이며, 테스트는 `node:test` 와 `node:assert` 를 쓴다.

`npm install <pkg>` 를 실행하지 않는다. 어떤 패키지가 꼭 필요하다고 판단되면, 설치하지 말고 **왜 필요한지와 대안을 사람에게 물어본다.** 색상, 박스 그리기, 키 파싱, 인자 파싱 모두 직접 구현한다 — 각각 수십 줄이면 된다.

### 완료 전에 `npm run check` 를 실행한다

task 를 완료로 표시하기 전에 반드시 `npm run check` 를 실행하고 통과를 확인한다. 통과하지 못한 상태로 `completed: true` 를 쓰지 않는다. 커밋 전에도 실행한다.

`npm run sim` 이 검증 명령에 포함된 task 는 그것도 함께 통과해야 한다.

### 테스트를 삭제하거나 약화하지 않는다

- 기존 테스트를 지우거나 `skip` / 주석 처리하지 않는다.
- 통과시키려고 단언(assertion)을 느슨하게 바꾸지 않는다. 임계값을 늘리거나, 정확한 비교를 부분 문자열 비교로 바꾸거나, 검사 항목을 빼는 것 전부 해당한다.
- 테스트가 깨지면 테스트가 아니라 코드를 고친다.
- 테스트가 정말로 잘못됐다고 판단되면, 고치지 말고 **어디가 왜 잘못됐는지 근거와 함께 사람에게 보고한다.**
- 새 동작을 추가하면 테스트도 함께 추가한다.

### 결정론을 깨지 않는다

이 프로젝트의 검증은 재현성에 의존한다. `src/core/` 와 `src/sim/` 안에서 `Math.random()`, `Date.now()`, `new Date()` 를 쓰지 않는다. 난수는 항상 시드된 `rng` 를 통해서만 얻는다. 시간이 필요하면 tick 수를 쓴다.

### 커밋

task 하나당 커밋 하나. 메시지는 `feat(<task-id>): <한 줄 요약>` 형식으로 쓴다. 여러 task 를 한 커밋에 묶지 않는다.

### 막혔을 때

같은 오류를 두 번 이상 같은 방식으로 고치려 하지 않는다. 30분 안에 끝나야 할 task 가 그 이상 걸리면, 지금까지 시도한 것과 막힌 지점을 정리해 사람에게 보고한다. 범위를 임의로 줄이거나 acceptance criteria 를 낮춰서 "완료" 처리하지 않는다.
