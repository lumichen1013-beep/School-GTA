import type * as THREE from 'three';
import type { Mode, ObjState, World } from '../../logic/types';

export interface ModelCtx { obj: ObjState; world: World; mode: Mode; t: number; dt: number }

/** 物件模型：root 原點 = 邏輯盒的底面中心 */
export interface PropModel {
  root: THREE.Object3D;
  update?(ctx: ModelCtx): void;
  /** 需要在相機與玩家之間時淡出的網格 (隔牆) */
  occluders?: THREE.Mesh[];
}
