import { PuzzleApp } from './app/app';

const app = new PuzzleApp(document.getElementById('pz-root')!);
// 開發模式暴露給自動化驗證使用 (__puzzle.world 為目前關卡的世界)
if (import.meta.env.DEV) (window as unknown as { __puzzle: PuzzleApp }).__puzzle = app;
