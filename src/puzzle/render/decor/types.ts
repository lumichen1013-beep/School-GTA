import type * as THREE from 'three';
import type { DecorItem, LevelDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';

/** 建一件裝飾時可用的環境：nth = 這件是同 kind 的第幾件 (0 起；例：吊燈光暈錯開閃爍相位) */
export interface DecorCtx { level: LevelDef; theme: Theme; nth: number }

/** 一件裝飾的外觀 */
export interface DecorPart {
  root: THREE.Object3D;
  /** 只在現實 (3D) 顯示的節點 (圖紙裡隱藏)；其餘在圖紙裡當淡色背景 */
  only3d?: THREE.Object3D[];
  /** 在鏡頭與玩家之間 / 離視線太近時淡出的網格 (吊燈) */
  occluders?: THREE.Mesh[];
  /** 每幀 (只讀時間與模式；不讀世界) */
  update?(t: number, is2d: boolean): void;
}

export type DecorFactory = (paint: Painter, item: DecorItem, ctx: DecorCtx) => DecorPart;
