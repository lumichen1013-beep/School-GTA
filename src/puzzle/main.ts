import { PuzzleGame } from './game';

const game = new PuzzleGame();
// 開發模式暴露給自動化驗證使用
if (import.meta.env.DEV) (window as unknown as { __puzzle: PuzzleGame }).__puzzle = game;
