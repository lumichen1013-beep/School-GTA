import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { mergeParts, placed } from '../geometry';
import type { ModelCtx, PropModel } from './types';

// N19 守衛殘影 (追逐 1；規格 4.2、9.1 手法 A、story-bible 8.2「半透明灰藍 #8A96B0、0.35～0.5」)：
// 只在藏寶圖 (物件 visible '2d'，scene 依模式藏起)。模糊的人形剪影 (頭、身、腿、往前伸的手) 一個網格；
// obj.used = 此刻在場 (預兆 / 追) → 不透明度 1 秒緩入、離場 1 秒淡出 (9.1 光敏：沒有閃爍)；完全淡出時不畫 (省繪製次數)。
// 身體不晃：減弱動態也是同一個靜止剪影 (只有位置隨邏輯移動)

/** 殘影的色與最濃的不透明度 (同 cs:ch2 / 3-4 舊羅盤架的殘影) */
export const CHASER_COLOR = 0x8a96b0;
export const CHASER_ALPHA = 0.4;
/** 淡入 / 淡出秒數 */
const FADE_SEC = 1;

export function chaserModel(_p: Painter, d: ObjDef, _t: Theme): PropModel {
  const g = new THREE.Group();
  const H = d.h;
  // 往 +x (追的方向) 微微前傾：手往前伸 (攔)，不是撲抓；零件互不重疊 (半透明重疊處會變濃)
  const body = mergeParts([
    placed(new THREE.CircleGeometry(0.16, 18), 0.05, H - 0.17, 0),
    placed(new THREE.PlaneGeometry(0.44, 0.78), 0.02, H * 0.56, 0, 0, 0, -0.06),
    placed(new THREE.PlaneGeometry(0.16, 0.5), -0.1, 0.27, 0, 0, 0, 0.08),
    placed(new THREE.PlaneGeometry(0.16, 0.5), 0.12, 0.27, 0, 0, 0, -0.12),
    placed(new THREE.PlaneGeometry(0.42, 0.09), 0.5, H * 0.66, 0, 0, 0, 0.12)
  ]);
  const mat = new THREE.MeshBasicMaterial({ color: CHASER_COLOR, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const figure = new THREE.Mesh(body, mat);
  figure.renderOrder = 2;
  figure.visible = false;
  g.add(figure);
  let a = 0;
  const update = (c: ModelCtx) => {
    const target = c.obj.used ? CHASER_ALPHA : 0;
    const step = (CHASER_ALPHA / FADE_SEC) * Math.max(0, c.dt);
    a = target > a ? Math.min(target, a + step) : Math.max(target, a - step);
    mat.opacity = a;
    figure.visible = a > 0.005;
  };
  return { root: g, update };
}
