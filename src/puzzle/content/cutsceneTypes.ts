// 過場資料純型別 (零依賴；cutscenes-v0.1 6.2、architecture 4.15)
// 鏡頭秒數不寫在資料裡：一律由 text/readingTime 的公式從文字與 minVisualSec 算出

export type CutsceneId = 'cs:prologue' | 'cs:ch1' | 'cs:ch2' | 'cs:ch3' | 'cs:night' | 'cs:attic' | 'cs:endA' | 'cs:endB';

/** 轉場：淡入 / 淡出 1.0、交叉淡化 0.8、墨水暈開 1.0、翻頁 0.8、紙裂 1.2、切 0 (秒數表在 content/cutscenes) */
export type CutTransition = 'fade' | 'crossfade' | 'inkBleed' | 'pageTurn' | 'paperTear' | 'cut';

/** 運鏡 (減弱動態時忽略)：push 緩推比例、parallax 視差強度、panX 水平平移比例、durSec 運鏡長度 */
export interface ShotMotion { push?: number; parallax?: number; panX?: number; durSec?: number }

/** 剪紙分鏡：sceneId 對應 render/cutscene 的繪製函式；labels = 畫面內要寫的字 (文字 key) */
export interface PaperArt {
  kind: 'paper';
  sceneId: string;
  labels?: Readonly<Record<string, string>>;
  /** 日後可換成引擎鏡頭的關卡 (分鏡原指定引擎鏡頭；驗證器檢查關卡已登錄) */
  engineCandidate?: { levelId: string };
}

/** 音訊提示掛點 (音訊模組實作前，播放器只發事件)：at = 鏡頭開始 / 第 line 段出現 / 鏡頭結束 */
export interface AudioCue { at: 'start' | 'line' | 'end'; line?: number; cue: string }

export interface ShotDef {
  art: PaperArt;
  motion?: ShotMotion;
  transitionIn: CutTransition;
  /** 每個 key 一段 (≤ 2 行 × 16 字)；可含 {name} */
  lines: readonly string[];
  /** 視覺最短秒 (例：標題卡、輪廓淡入淡出需要的時間) */
  minVisualSec?: number;
  audio?: readonly AudioCue[];
}

export interface CutsceneTrigger { afterClear?: string; beforeFirst?: string; ending?: 'A' | 'B' }

export interface CutsceneDef {
  id: CutsceneId;
  /** 回憶頁顯示 */
  titleKey: string;
  trigger: CutsceneTrigger;
  replayable: true;
  shots: readonly ShotDef[];
}
