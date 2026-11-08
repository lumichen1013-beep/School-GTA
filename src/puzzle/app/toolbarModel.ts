// 畫面上方的工具列 (純函式，Node 可測；ui/toolbar.ts 只負責畫)：「重置」(重新進房，沿用確認窗) 與三個模式鈕「魔方 / 2D / 3D」
// - 魔方 = 開 / 關展開圖 + 轉動模式 (同 Tab /「轉」頁籤；控制盤章節、魔方儀已啟動才可用；不能進時由 LevelSession.toggleTurnMode 說明原因)
// - 2D / 3D = 切到藏寶圖 / 實景 (同 F / Q 的切換：送一次世界動作 flip，切不切得過去照世界規則)
// - 第一章 (拉桿章) 的魔方鈕停用 (點了說明怎麼轉、怎麼看展開圖)；不在魔方上的單房關卡不顯示魔方鈕
import type { Mode } from '../core/types';
import type { Text } from '../text/text';
import type { ToolbarButton, ToolbarView } from '../ui/toolbar';

export type { ToolbarButton, ToolbarView } from '../ui/toolbar';

export type BarMode = 'cube' | '2d' | '3d';

/** 此刻畫面上的狀態 (外殼每幀由 LevelSession 取得) */
export interface ToolbarContext {
  /** 在關卡畫面 (選單 / 通關畫面 / 過場 = false：整排不顯示) */
  inLevel: boolean;
  renderMode: Mode;
  /** 在魔方上 (單房關卡 = false) */
  onCube: boolean;
  /** 控制盤章節 (第二章起) */
  dialChapter: boolean;
  /** 魔方儀已啟動 */
  dialActive: boolean;
  /** 展開圖開著 (含轉動模式) */
  mapOpen: boolean;
}


/** 目前高亮的模式：控制盤章節展開圖開著 = 魔方；否則依實景 / 藏寶圖 */
export function activeMode(ctx: ToolbarContext): BarMode {
  if (ctx.dialChapter && ctx.mapOpen && ctx.renderMode === '2d') return 'cube';
  return ctx.renderMode === '2d' ? '2d' : '3d';
}

export function deriveToolbar(ctx: ToolbarContext, text: Text): ToolbarView {
  const act = activeMode(ctx);
  const buttons: ToolbarButton[] = [{ id: 'reset', label: text('ui.bar.reset'), aria: text('ui.bar.reset.aria'), active: false, enabled: true }];
  if (ctx.onCube) buttons.push({ id: 'cube', label: text('ui.bar.cube'), aria: text('ui.bar.cube.aria'), active: act === 'cube', enabled: ctx.dialChapter && ctx.dialActive });
  buttons.push(
    { id: '2d', label: text('ui.bar.mode2d'), aria: text('ui.bar.mode2d.aria'), active: act === '2d', enabled: true },
    { id: '3d', label: text('ui.bar.mode3d'), aria: text('ui.bar.mode3d.aria'), active: act === '3d', enabled: true }
  );
  return { show: ctx.inLevel, buttons };
}

/** 點模式鈕要做的事 (LevelSession.requestMode 依序執行)：closeMap = 收起展開圖 / 轉動模式；flip = 下一幀送一次切換；turnMode = 進轉動模式 (含進入條件)；say = 只說明 */
export interface ModeIntent { closeMap?: true; flip?: true; turnMode?: true; say?: string }

export function modeIntent(target: BarMode, ctx: ToolbarContext): ModeIntent {
  const act = activeMode(ctx);
  if (target === 'cube') {
    if (!ctx.onCube) return {};
    if (!ctx.dialChapter) return { say: 'msg.bar.leverCube' };
    if (act === 'cube') return { closeMap: true };
    // 進入條件 (已啟動 / 藏寶圖 / 站穩) 由 toggleTurnMode 判斷並說明原因
    return { turnMode: true };
  }
  if (target === '2d') {
    if (ctx.renderMode === '3d') return { flip: true };
    return act === 'cube' ? { closeMap: true } : {};
  }
  if (ctx.renderMode === '3d') return {};
  return ctx.mapOpen ? { closeMap: true, flip: true } : { flip: true };
}
