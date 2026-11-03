import type { CutTransition, CutsceneDef, CutsceneId } from '../cutsceneTypes';
import { prologue } from './prologue';

export type { CutsceneDef, CutsceneId, ShotDef, CutTransition } from '../cutsceneTypes';

/** 轉場秒數 (cutscenes-v0.1 2.2) */
export const TRANSITION_SEC: Readonly<Record<CutTransition, number>> = {
  fade: 1.0, crossfade: 0.8, inkBleed: 1.0, pageTurn: 0.8, paperTear: 1.2, cut: 0
};
/** 減弱動態：轉場一律改為 0.6 秒淡入淡出 (切仍為切) (cutscenes-v0.1 2.4) */
export const REDUCED_TRANSITION_SEC = 0.6;

/**
 * 過場登錄表 (順序 = 回憶頁順序)。新增過場 = content/cutscenes/<id>.ts + 文字表 cs-<id>.ts + 這裡加一行
 * (+ render/cutscene/scenes 的 sceneId 繪製函式)。
 */
export const CUTSCENES: readonly CutsceneDef[] = [prologue];

export const cutsceneById = (id: string): CutsceneDef | undefined => CUTSCENES.find(c => c.id === id);
export const PROLOGUE_ID: CutsceneId = 'cs:prologue';
