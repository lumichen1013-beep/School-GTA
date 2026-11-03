/** 章節 (選單分組)；levels 為登錄表中的關卡 id */
export interface ChapterDef { id: number; titleKey: string; theme: string; levels: readonly string[] }

export const CHAPTERS: readonly ChapterDef[] = [
  { id: 1, titleKey: 'ch.1.title', theme: 'foyer', levels: ['1-1', '1-2', '1-3'] },
  { id: 2, titleKey: 'ch.2.title', theme: 'study', levels: ['2-1', '2-2', '2-3', '2-4', '2-5'] },
  // 第三章 溫室 (3×3 滑動)：骨架先登錄 3-1 苗圃；3-2～3-4 逐關登錄
  { id: 3, titleKey: 'ch.3.title', theme: 'greenhouse', levels: ['3-1'] }
];
