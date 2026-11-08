import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { mergeParts, placed } from '../geometry';
import { labelBadge, scaleCorner, scaleRatio } from './label';
import type { ModelCtx, PropModel } from './types';

// 第五章 5-3 西窗的機關外觀 (規格 6「5-3 西窗（細化）」)：
// - 合成台 writingDesk：爸爸書桌上攤開的筆記本與吸墨墊 (左頁有字、右頁空白；合成之後右頁上多一張淡格線的手記頁)
// - 墨水瓶 inkBottle：深色玻璃瓶身 + 黃銅蓋、瓶口一點墨漬 (只在實景)
// - 羊皮紙 parchment：靠在書架上的一捲奶油色羊皮紙 + 細繩 (尺度卡照縮放)；藏寶圖照扁平色 + 描邊、標籤徽章與方槽

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const approach = (cur: number, target: number, k: number) => cur + (target - cur) * Math.min(1, k);
const BLOTTER = 0x3e4a3a;
const PARCHMENT = 0xe8dcb8;
const INK = 0x1c2030;

/** 筆記本與吸墨墊：墊 (深綠) + 攤開的本子 (兩頁)；左頁幾行字 (深色細條)；used = 右頁上的手記頁淡入 */
export function writingDeskModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  g.add(p.mesh(placed(box(d.w, 0.012, d.d), 0, 0.006, 0), BLOTTER, { outline: false, shadow: false }));
  const pw = d.w * 0.42, pd = d.d * 0.72;
  g.add(p.mesh(mergeParts([placed(box(pw, 0.02, pd), -pw / 2 - 0.005, 0.022, 0, 0, 0, 0.04), placed(box(pw, 0.02, pd), pw / 2 + 0.005, 0.022, 0, 0, 0, -0.04)]), pal.paperNote, { outline: true }));
  const lines: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) lines.push(placed(box(pw * 0.7, 0.004, 0.012), -pw / 2, 0.036, -pd / 2 + 0.06 + i * pd * 0.16));
  g.add(p.mesh(mergeParts(lines), INK, { outline: false, shadow: false }));
  const page = p.mesh(placed(box(pw * 0.86, 0.006, pd * 0.9), pw / 2 + 0.005, 0.038, 0), PARCHMENT, { outline: false, shadow: false, unique: true, opacity: 1 });
  g.add(page);
  let k = 0;
  const update = (c: ModelCtx) => {
    k = approach(k, c.obj.used ? 1 : 0, c.calm ? 1 : c.dt * 2);
    page.visible = k > 0.02;
    (page.material as THREE.MeshStandardMaterial).opacity = k;
  };
  return { root: g, update };
}

/** 墨水瓶：方肩的深色玻璃瓶 + 黃銅蓋 + 瓶頸上的一圈墨漬 */
export function inkBottleModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const bh = d.h * 0.7;
  g.add(p.mesh(mergeParts([placed(new THREE.CylinderGeometry(d.w * 0.42, d.w * 0.46, bh, 12), 0, bh / 2, 0), placed(new THREE.CylinderGeometry(d.w * 0.2, d.w * 0.4, d.h * 0.1, 12), 0, bh + d.h * 0.05, 0)]), INK, { metalness: 0.2, roughness: 0.15 }));
  g.add(p.mesh(placed(new THREE.CylinderGeometry(d.w * 0.22, d.w * 0.22, d.h * 0.16, 10), 0, bh + d.h * 0.18, 0), 0xb08a4a, { metalness: 0.7, roughness: 0.3, outline: false }));
  return { root: g };
}

/** 羊皮紙捲：斜靠著的一捲 (奶油色圓柱 + 捲邊 + 中間一圈細繩)；尺度卡照比例縮放；藏寶圖有標籤徽章與方槽 */
export function parchmentModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const r = d.w * 0.4, len = d.h;
  body.add(p.mesh(mergeParts([placed(new THREE.CylinderGeometry(r, r, len, 14), 0, len / 2, 0), placed(box(r * 0.2, len * 0.96, r * 1.6), r * 0.9, len / 2, 0)]), PARCHMENT, { flat: PARCHMENT }));
  body.add(p.mesh(placed(new THREE.TorusGeometry(r * 1.04, 0.012, 6, 16), 0, len * 0.55, 0, Math.PI / 2, 0, 0), 0x8a5a3a, { outline: false, shadow: false }));
  // 靠在書架上：往後牆 (−z) 微微傾斜
  body.rotation.x = -0.12;
  g.add(body);
  const badge = labelBadge(p, d, theme, g, new THREE.Vector3(0, d.h + 0.15, 0.1), 0.45);
  const corner = scaleCorner(p, d, theme, g, 0.26);
  const at = new THREE.Vector3();
  const update = (c: ModelCtx) => {
    const k = scaleRatio(c);
    body.scale.setScalar(k);
    badge(c);
    corner(c, at.set(r * k + 0.2, d.h * k * 0.9, 0.1));
  };
  return { root: g, update };
}
