import { PuzzleGame } from './game';
import { createText } from './text/text';
import { zhHant } from './content/text/zh-Hant';
import { buildPuzzleDom } from './ui/dom';
import { HELP_ROWS } from './ui/help';

const text = createText(zhHant);
buildPuzzleDom(document.getElementById('pz-root')!, text, HELP_ROWS);
const game = new PuzzleGame(text);
// 開發模式暴露給自動化驗證使用
if (import.meta.env.DEV) (window as unknown as { __puzzle: PuzzleGame }).__puzzle = game;
