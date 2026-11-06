import type { DecorItem, ObjDef } from '../../../core/types';
import type { DoorKind, Side } from '../../../core/cube';

// 第五章房間共用的物件工廠 (門、梯口、紙籤、地板、窗；規格 6「第五章骨架與銜接」)：rooms.ts 與各關另檔共用 (另檔不 import rooms.ts，避免循環)
// 座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5。E / W 門 z = 0、N 門 z = -4.8、S 門 z = 4.8 (只在實景)；
// U 梯口 = 靠後牆的梯子 (1.0 × 3.0 × 0.4)、D 梯口 = 地上的活板門 (高 0.12)；梯口都只在實景按 E

/** 封住的門：until = 打開它的旗標 (本步沒有任何東西會打開它)、text = 按 E 的說明 */
export const sealedBy = (until: string, text: string) => ({ sealed: { until, text } });

/** 門的名稱 (文字 key；門位 → key) */
const DOOR_KEYS: Readonly<Record<'E' | 'W' | 'N' | 'S', string>> = { N: 'lvl.ch5.doorN', S: 'lvl.ch5.doorS', E: 'lvl.ch5.doorE', W: 'lvl.ch5.doorW' };

/** 一扇門 / 拱門：E / W 在側牆 (z = 0)、N 在後牆、S 在前緣 (只在實景) */
export function door(side: 'E' | 'W' | 'N' | 'S', kind: DoorKind, x: number, extra: Partial<ObjDef & { type: 'cubeDoor' }> = {}): ObjDef {
  const ew = side === 'E' || side === 'W';
  return {
    id: `door${side}`, type: 'cubeDoor', side, kind, x, y: 0, z: ew ? 0 : side === 'N' ? -4.8 : 4.8,
    w: ew ? 0.4 : 1.6, h: 2.4, d: ew ? 1.6 : 0.4, visible: side === 'S' ? '3d' : 'both', solid: false, interactable: true, interactIn: '3d',
    labelKey: DOOR_KEYS[side], ...extra
  } as ObjDef;
}

/**
 * 梯口：U = 靠後牆的梯子 (往天花板的梯口)、D = 地上的活板門；kind arch = 寬、door = 窄 (只有人過)。
 * id 預設 hatchU / hatchD；兩個視角都畫，只在實景按 E
 */
export function hatch(side: 'U' | 'D', kind: DoorKind, x: number, z: number, extra: Partial<ObjDef & { type: 'cubeDoor' }> & { id?: string; labelKey?: string } = {}): ObjDef {
  const up = side === 'U';
  return {
    id: `hatch${side}`, type: 'cubeDoor', side: side as Side, kind, x, y: 0, z,
    w: up ? (kind === 'arch' ? 1.6 : 1.0) : 1.8, h: up ? 3.0 : 0.12, d: up ? 0.4 : 1.4,
    visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: up ? 'lvl.ch5.hatchU' : 'lvl.ch5.hatchD', ...extra
  } as ObjDef;
}

/** 紙籤 (資訊物件，不計入字條預算)：釘在樑柱 / 箱子 / 窗台上 */
export const plaque = (id: string, textKey: string, x: number, y: number, z: number, visible: 'both' | '3d' = 'both', labelKey = 'lvl.ch5.plaque'): ObjDef =>
  ({ id, type: 'remark', textKey, x, y, z, w: 1.4, h: 0.42, d: 0.04, visible, solid: false, interactable: true, labelKey });

export const floor = (minX: number, maxX: number): ObjDef =>
  ({ id: 'floor', type: 'floor', x: (minX + maxX) / 2, y: -1, z: 0, w: maxX - minX, h: 1, d: 10, visible: 'both', solid: true });

/**
 * 窗 (裝飾；牆上的方窗、窗外深靛星空與星點)：side N = 後牆 (x 位置)、E / W = 側牆 (z = 0)；w / h = 窗洞尺寸、y = 窗洞中心高。
 * 之後各關加玻璃物件 (5-2 倒讀的詩、5-5c 窗縫)
 */
export const atticWindow = (side: 'N' | 'E' | 'W', x: number, w = 2.4, h = 2.0, y = 2.8): DecorItem => ({ kind: 'atticWindow', side, x, w, h, y });
