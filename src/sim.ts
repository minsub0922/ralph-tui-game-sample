import { main } from './sim/run.ts';
import { loadReplay, saveReplay } from './store/replay.ts';

/**
 * 헤드리스 시뮬레이션 엔트리포인트 (`npm run sim`).
 *
 * 파일 접근을 여기서만 끼워 넣는다 — src/sim 은 순수하게 남고, 리플레이 파일을
 * 읽고 쓰는 일은 store 가 맡는다.
 */
const { lines, exitCode } = main(process.argv.slice(2), { load: loadReplay, save: saveReplay });

process.stdout.write(`${lines.join('\n')}\n`);
process.exitCode = exitCode;
