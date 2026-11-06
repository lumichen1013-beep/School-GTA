import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { mergeParts, placed } from '../geometry';
import { inscription } from '../textures';
import type { ModelCtx, PropModel } from './types';

// 4-3 封存書庫的機關外觀 (規格 6「4-3 封存書庫（細化）」)：符號櫃、四塊符號鍵、爸爸畫到一半的展開圖、封存櫃、驚嚇 (燈慢慢暗一瞬與殘影；不閃爍)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const approach = (cur: number, target: number, k: number) => cur + (target - cur) * Math.min(1, k);
const GHOST = 0x8a96b0;

/** 符號櫃：抽屜牆中央的一格大抽屜 (黃銅框 + 鎖板)；開 = 抽屜拉出 0.3 */
export function symbolLockModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const front = new THREE.Group();
  front.add(p.mesh(mergeParts([placed(box(d.w, d.h, 0.08), 0, d.h / 2, 0)]), 0x5d6a57, { metalness: 0.35, roughness: 0.55 }));
  front.add(p.mesh(mergeParts([placed(box(d.w + 0.06, 0.05, 0.1), 0, d.h, 0), placed(box(d.w + 0.06, 0.05, 0.1), 0, 0, 0), placed(box(0.2, 0.26, 0.04), 0, d.h / 2, 0.05)]), pal.brass, { metalness: 0.7, roughness: 0.3, outline: false }));
  g.add(front);
  return { root: g, update: (c: ModelCtx) => { front.position.z = approach(front.position.z, c.obj.used ? 0.3 : 0, c.dt * 3); } };
}

/** 符號鍵：黃銅框的方鍵、鍵面刻著一個字 (書 / 屜 / 封 / 空；文字表)；兩個視角都畫 */
export function symbolKeyModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  g.add(p.mesh(mergeParts([placed(box(d.w, d.h, d.d * 0.5), 0, d.h / 2, 0)]), pal.brass, { metalness: 0.6, roughness: 0.35 }));
  let face: THREE.Mesh | null = null;
  return {
    root: g,
    update: (c: ModelCtx) => {
      if (face) return;
      face = p.mesh(new THREE.PlaneGeometry(d.w * 0.8, d.h * 0.8), 0xffffff, { map: inscription(pal, c.world.rt.text(c.obj.def.labelKey ?? ''), 'carved', 96), flatMap: true, outline: false, shadow: false, unique: true });
      face.position.set(0, d.h / 2, d.d * 0.26);
      g.add(face);
    }
  };
}

/** 爸爸畫到一半的展開圖：桌上一張紙 (淡墨格線與幾個字；畫到一半 = 右下角空白) */
export function chartBoardModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const sheet = p.mesh(box(d.w, 0.012, d.d), pal.paperNote, { outline: false });
  sheet.position.y = 0.006;
  g.add(sheet);
  const lines: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) lines.push(placed(box(d.w * 0.6, 0.004, 0.01), -d.w * 0.1, 0.014, -d.d * 0.25 + k * d.d * 0.22), placed(box(0.01, 0.004, d.d * 0.5), -d.w * 0.35 + k * d.w * 0.2, 0.014, -0.02));
  g.add(p.mesh(mergeParts(lines), pal.inkBlue, { outline: false, shadow: false }));
  return { root: g };
}

/** 封存櫃：檔案櫃上兩股乾掉的墨線纏住扣子；都化開 = 櫃門往外轉、墨線消失 */
export function sealCabinetModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  g.add(p.mesh(mergeParts([placed(box(d.w, d.h, d.d), 0, d.h / 2, 0)]), 0x55604f, { metalness: 0.35, roughness: 0.6 }));
  const door = new THREE.Group();
  door.position.set(-d.w / 2, 0, d.d / 2 + 0.02);
  door.add(p.mesh(mergeParts([placed(box(d.w - 0.06, d.h - 0.1, 0.03), (d.w - 0.06) / 2, d.h / 2, 0)]), 0x66705e, { metalness: 0.35, roughness: 0.55 }));
  g.add(door);
  const knots: THREE.BufferGeometry[] = [];
  for (const sx of [-0.18, 0.18]) {
    const pts = Array.from({ length: 10 }, (_, i) => new THREE.Vector3(sx + Math.sin(i * 1.9) * 0.1, d.h * 0.55 + Math.cos(i * 1.3) * 0.12, d.d / 2 + 0.06 + (i % 2) * 0.02));
    knots.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.015, 4, false));
  }
  const knot = p.mesh(mergeParts(knots), 0x1d2440, { outline: false });
  g.add(knot);
  return { root: g, update: (c: ModelCtx) => { door.rotation.y = approach(door.rotation.y, c.obj.used ? -1.6 : 0, c.dt * 3); knot.visible = !c.obj.used; } };
}

/**
 * 驚嚇 (只在實景)：used 由 false 變 true 的那一刻開始演——全場慢慢暗下去 (0.6 秒，最暗 0.85)、停 0.8 秒、1 秒淡回 (不閃爍)；
 * 暗的那段殘影 (灰藍、0.4) 站在玩家面前，燈回來時不見。減弱緊張效果 (calm) = 不暗、殘影 1 秒緩入 / 停 1 秒 / 1 秒緩出。
 * 進房時已經 used (旗標) = 不演
 */
export function archiveScareModel(): PropModel {
  const g = new THREE.Group();
  const dim = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false }));
  dim.renderOrder = 999;
  dim.visible = false;
  const ghostMat = new THREE.MeshBasicMaterial({ color: GHOST, transparent: true, opacity: 0, depthWrite: false });
  const ghost = new THREE.Mesh(mergeParts([placed(new THREE.CylinderGeometry(0.2, 0.28, 1.2, 10), 0, 0.6, 0), placed(new THREE.SphereGeometry(0.2, 10, 8), 0, 1.45, 0)]), ghostMat);
  ghost.renderOrder = 1000;
  ghost.visible = false;
  g.add(dim, ghost);
  let was: boolean | null = null;
  let t0 = -1;
  return {
    root: g,
    update: (c: ModelCtx) => {
      if (was === null) was = c.obj.used;
      if (c.obj.used && !was) { t0 = c.t; was = true; const pl = c.world.player; ghost.position.set(pl.x - c.obj.x + 0.9, 0, (pl.mode === '2d' ? pl.z3d : pl.z) - c.obj.z - 1.2); }
      const on = t0 >= 0 && c.mode === '3d';
      const k = c.t - t0;
      let dark = 0, seen = 0;
      if (on && !c.calm) {
        dark = k < 0.6 ? (k / 0.6) * 0.85 : k < 1.4 ? 0.85 : k < 2.4 ? 0.85 * (1 - (k - 1.4)) : 0;
        seen = k > 0.4 && k < 1.4 ? 0.4 : 0;
      } else if (on) {
        seen = k < 1 ? 0.4 * k : k < 2 ? 0.4 : k < 3 ? 0.4 * (3 - k) : 0;
      }
      dim.visible = dark > 0.001;
      (dim.material as THREE.MeshBasicMaterial).opacity = dark;
      ghost.visible = seen > 0.001;
      ghostMat.opacity = seen;
      if (on && k > 3.2) t0 = -1;
    }
  };
}

/** 4-4 爸爸的筆記：桌上一本攤開的筆記 (拿走 = 不畫) */
export function notesDeskModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const book = p.mesh(mergeParts([placed(box(d.w * 0.48, 0.03, d.d), -d.w * 0.25, 0.015, 0, 0, 0, 0.04), placed(box(d.w * 0.48, 0.03, d.d), d.w * 0.25, 0.015, 0, 0, 0, -0.04)]), pal.paperNote, { outline: false });
  g.add(book);
  return { root: g, update: (c: ModelCtx) => { book.visible = !c.obj.used; } };
}

/** 4-4 最後一個抽屜：檔案櫃的一格抽屜 (黃銅把手)；拉開 = 往外 0.35 */
export function lastDrawerModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const front = new THREE.Group();
  front.add(p.mesh(mergeParts([placed(box(d.w, d.h, 0.05), 0, d.h / 2, d.d / 2)]), 0x66705e, { metalness: 0.35, roughness: 0.55 }));
  front.add(p.mesh(mergeParts([placed(box(0.2, 0.04, 0.04), 0, d.h / 2, d.d / 2 + 0.04)]), pal.brass, { metalness: 0.7, roughness: 0.3, outline: false }));
  g.add(front);
  return { root: g, update: (c: ModelCtx) => { front.position.z = approach(front.position.z, c.obj.used ? 0.35 : 0, c.dt * 3); } };
}
