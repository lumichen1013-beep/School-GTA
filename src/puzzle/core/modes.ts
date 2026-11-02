import type { Mode } from './types';
import { JUMP_V_2D, JUMP_V_3D } from './constants';

/** 2D / 3D 規則差異集中處 (取代散落的 mode === '2d' ? … : …)；只有兩種模式，不是插件點 */
export interface ModeSpec {
  id: Mode;
  other: Mode;
  /** overlaps / sweepAxis / 互動距離的比較軸數 (2D 壓平忽略 z，C2) */
  axes: 2 | 3;
  /** 可沿 z 移動 (2D 只能左右，C2) */
  moveZ: boolean;
  /** 起跳速度 (C4) */
  jumpV: number;
  /** inBounds / 位置夾限是否檢查 z */
  boundsZ: boolean;
}

export const MODES: Readonly<Record<Mode, ModeSpec>> = {
  '3d': { id: '3d', other: '2d', axes: 3, moveZ: true, jumpV: JUMP_V_3D, boundsZ: true },
  '2d': { id: '2d', other: '3d', axes: 2, moveZ: false, jumpV: JUMP_V_2D, boundsZ: false }
};
