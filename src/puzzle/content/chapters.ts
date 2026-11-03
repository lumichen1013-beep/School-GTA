/** 章節 (選單分組)；levels 為登錄表中的關卡 id */
export interface ChapterDef { id: number; titleKey: string; theme: string; levels: readonly string[] }

export const CHAPTERS: readonly ChapterDef[] = [
  { id: 1, titleKey: 'ch.1.title', theme: 'foyer', levels: ['1-1', '1-2', '1-3'] },
  { id: 2, titleKey: 'ch.2.title', theme: 'study', levels: ['2-1', '2-2', '2-3'] }
];
