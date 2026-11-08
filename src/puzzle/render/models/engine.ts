import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { mergeParts, placed } from '../geometry';
import type { ModelCtx, PropModel } from './types';

// 第五章 5-5 最後的機關的外觀 (規格 6「5-5 最後的機關（細化）」)：
// - 三道光槽 starSlots：齒輪牆上三道直立的槽 (黃銅框一個網格 + 深色槽底一個網格)；槽內的光帶 = 那扇窗的星光此刻照得進機關 (ext.starlight.reach)：
//   亮 = 暖白光帶 0.6 秒緩亮 / 緩暗 (不閃爍；亮度漸變不是動態，減弱動態照樣)；兩個視角都畫 (藏寶圖：亮的槽填色、暗的只剩槽底)
// 同材質零件合成一個網格；共面規則 (tests/puzzle/render/coplanar)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const BRASS = 0xb08a4a;
const SLOT_DARK = 0x231c16;
const LIGHT = 0xf2dda6;
/** 光帶緩亮 / 緩暗的秒數 */
const FADE_SEC = 0.6;

/** 三道光槽：order 依序 = 槽 x = −gap / 0 / +gap (相對物件中心)；槽高 2.4、底 0.3 */
export function starSlotsModel(p: Painter, d: ObjDef, _t: Theme): PropModel {
  const g = new THREE.Group();
  if (d.type !== 'starSlots') return { root: g };
  const gap = d.w / 3;
  const xs = d.order.map((_, i) => (i - (d.order.length - 1) / 2) * gap);
  const H = 2.4, Y0 = 0.3, W = 0.22;
  const frame: THREE.BufferGeometry[] = [];
  const back: THREE.BufferGeometry[] = [];
  for (const x of xs) {
    // 黃銅框：左右兩條直框 + 上下橫框 + 槽下的小銘牌
    frame.push(placed(box(0.06, H + 0.12, 0.08), x - W / 2 - 0.03, Y0 + H / 2, 0));
    frame.push(placed(box(0.06, H + 0.12, 0.08), x + W / 2 + 0.03, Y0 + H / 2, 0));
    frame.push(placed(box(W + 0.12, 0.06, 0.08), x, Y0 + H + 0.03, 0));
    frame.push(placed(box(W + 0.12, 0.06, 0.08), x, Y0 - 0.03, 0));
    frame.push(placed(box(0.4, 0.16, 0.04), x, Y0 - 0.22, 0.02));
    back.push(placed(box(W, H, 0.04), x, Y0 + H / 2, -0.03));
  }
  g.add(p.mesh(mergeParts(frame), BRASS, { metalness: 0.65, roughness: 0.35, outline: false }));
  g.add(p.mesh(mergeParts(back), SLOT_DARK, { roughness: 0.9, outline: false, shadow: false }));
  // 光帶：每道一個網格 (專屬材質：各自緩亮)；完全暗 = 不畫 (省繪製次數)
  const bars = xs.map(x => {
    const m = p.mesh(box(W * 0.7, H * 0.96, 0.02), LIGHT, { emissive: LIGHT, emissiveIntensity: 0.9, outline: false, shadow: false, unique: true, opacity: 0.95 });
    m.position.set(x, Y0 + H / 2, 0.01);
    m.scale.y = 0.001;
    m.visible = false;
    g.add(m);
    return m;
  });
  const level = xs.map(() => 0);
  const update = (c: ModelCtx) => {
    if (c.obj.def.type !== 'starSlots') return;
    const reach = c.world.ext.starlight?.reach ?? [];
    c.obj.def.order.forEach((room, i) => {
      const want = reach.includes(room) ? 1 : 0;
      level[i] = want > level[i] ? Math.min(want, level[i] + c.dt / FADE_SEC) : Math.max(want, level[i] - c.dt / FADE_SEC);
      bars[i].scale.y = Math.max(0.001, level[i]);
      bars[i].visible = level[i] > 0.01;
    });
  };
  return { root: g, update };
}
