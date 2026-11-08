/** 章節 (選單分組)；levels 為登錄表中的關卡 id */
export interface ChapterDef { id: number; titleKey: string; theme: string; levels: readonly string[] }

export const CHAPTERS: readonly ChapterDef[] = [
  { id: 1, titleKey: 'ch.1.title', theme: 'foyer', levels: ['1-1', '1-2', '1-3'] },
  // 第二章 書房 (2×3 列 / 行轉)：2-1～2-5、H1 夾層 (隱藏房，排在 2-5 之後；解鎖前選單不列)
  { id: 2, titleKey: 'ch.2.title', theme: 'study', levels: ['2-1', '2-2', '2-3', '2-4', '2-5', 'H1'] },
  // 第三章 溫室 (3×3 滑動)：3-1 苗圃、3-2 玻璃長廊、3-3 夜溫室、3-4 溫室深處 (章末)
  { id: 3, titleKey: 'ch.3.title', theme: 'greenhouse', levels: ['3-1', '3-2', '3-3', '3-4'] },
  // 第四章 地下室 (3×3×2 層轉)：4-1 根窖走廊、4-2 墨爐間 (4-3、4-4 逐關登錄)
  { id: 4, titleKey: 'ch.4.title', theme: 'cellar', levels: ['4-1', '4-2', '4-3', '4-4'] },
  // 第五章 閣樓 (3×3×3 切片轉)：5-1 天窗間、5-2 東窗 (5-3～5-5 逐關登錄)；終章 草地 (6-1) 在 6-1 實作時登錄
  { id: 5, titleKey: 'ch.5.title', theme: 'attic', levels: ['5-1', '5-2'] }
];
