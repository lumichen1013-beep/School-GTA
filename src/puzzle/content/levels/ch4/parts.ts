import type { ObjDef } from '../../../core/types';
import type { DoorKind, Side } from '../../../core/cube';

// 第四章房間共用的物件工廠 (門、梯口、紙籤、地板；規格 6「第四章骨架與銜接」)：rooms.ts 與各關另檔共用 (另檔不 import rooms.ts，避免循環)
/** 墨線鎖封住的門 (門縫纏著乾掉的墨線)：until = 打開它的旗標 */
export const inkSealed = (until: string) => ({ sealed: { until, text: 'lvl.ch4.inkSealed' } });

/** 門的名稱 (文字 key；門位 → key) */
const DOOR_KEYS: Readonly<Record<'E' | 'W' | 'N' | 'S', string>> = { N: 'lvl.ch4.doorN', S: 'lvl.ch4.doorS', E: 'lvl.ch4.doorE', W: 'lvl.ch4.doorW' };

/** 一扇門 / 拱門 / 章門：E / W 在側牆 (z = 0)、N 在後牆、S 在前緣 (只在實景) */
export function door(side: 'E' | 'W' | 'N' | 'S', kind: DoorKind, x: number, extra: Partial<ObjDef & { type: 'cubeDoor' }> = {}): ObjDef {
  const ew = side === 'E' || side === 'W';
  const id = kind === 'chapter' ? `chapter${side}` : `door${side}`;
  return {
    id, type: 'cubeDoor', side, kind, x, y: 0, z: ew ? 0 : side === 'N' ? -4.8 : 4.8,
    w: ew ? 0.4 : 1.6, h: 2.4, d: ew ? 1.6 : 0.4, visible: side === 'S' ? '3d' : 'both', solid: false, interactable: true, interactIn: '3d',
    labelKey: kind === 'chapter' ? 'lvl.ch4.chapterDoor' : DOOR_KEYS[side], ...extra
  } as ObjDef;
}

/**
 * 梯口：U = 靠後牆的梯子 (1.0 × 3.0 × 0.4，往天花板的梯口)、D = 地上的活板門 (高 0.12)；kind arch = 寬 (木箱落得過)、door = 窄 (只有人過)。
 * id 預設 hatchU / hatchD；兩個視角都畫 (藏寶圖裡是地上的一道縫 / 牆邊的梯子)，只在實景按 E
 */
export function hatch(side: 'U' | 'D', kind: DoorKind, x: number, z: number, extra: Partial<ObjDef & { type: 'cubeDoor' }> & { id?: string; labelKey?: string } = {}): ObjDef {
  const up = side === 'U';
  return {
    id: `hatch${side}`, type: 'cubeDoor', side: side as Side, kind, x, y: 0, z,
    w: up ? (kind === 'arch' ? 1.6 : 1.0) : 1.8, h: up ? 3.0 : 0.12, d: up ? 0.4 : 1.4,
    visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: up ? 'lvl.ch4.hatchU' : 'lvl.ch4.hatchD', ...extra
  } as ObjDef;
}

/** 紙籤 (資訊物件，不計入字條預算)：釘在石欄 / 木柱上 */
export const plaque = (id: string, textKey: string, x: number, y: number, z: number, visible: 'both' | '3d' = 'both'): ObjDef =>
  ({ id, type: 'remark', textKey, x, y, z, w: 1.4, h: 0.42, d: 0.04, visible, solid: false, interactable: true, labelKey: 'lvl.ch4.plaque' });

export const floor = (minX: number, maxX: number): ObjDef =>
  ({ id: 'floor', type: 'floor', x: (minX + maxX) / 2, y: -1, z: 0, w: maxX - minX, h: 1, d: 10, visible: 'both', solid: true });

