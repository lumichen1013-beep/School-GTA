import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { mergeParts, placed } from '../geometry';
import type { ModelCtx, PropModel } from './types';

// 第四章 墨流的機關外觀 (規格 6「4-2 墨爐間（細化）」)：墨爐閥、墨線鎖、墨痕、爐邊小櫃、根管線 (墨流過時 1 秒緩亮，不閃爍)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const IRON = 0x34322f;
const ROOT = 0x5a4636;
const INK = 0x3d63c8;
const approach = (cur: number, target: number, k: number) => cur + (target - cur) * Math.min(1, k);
/** 根管線此刻有沒有墨 (同 mechanics/ink pipeLit；render 只讀 World.ext.ink) */
const pipeLit = (c: ModelCtx, when: string): boolean => { const ink = c.world.ext.ink; return !!ink && (when === 'through' ? ink.through : ink.sinks.includes(when as never)); };

/** 墨爐閥：立管 + 閥輪 (轉開 = 閥輪轉一圈半、管上的墨窗亮) */
export function inkValveModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  g.add(p.mesh(mergeParts([placed(new THREE.CylinderGeometry(0.09, 0.09, d.h, 10), 0, d.h / 2, -0.1), placed(box(0.3, 0.08, 0.3), 0, 0.04, -0.1)]), 0x9a5c38, { metalness: 0.6, roughness: 0.45 }));
  const wheel = new THREE.Group();
  wheel.position.set(0, d.h * 0.75, 0.05);
  wheel.add(p.mesh(mergeParts([placed(new THREE.TorusGeometry(0.22, 0.03, 6, 18), 0, 0, 0), placed(box(0.44, 0.03, 0.03), 0, 0, 0), placed(box(0.03, 0.44, 0.03), 0, 0, 0)]), pal.iron, { metalness: 0.6, roughness: 0.4 }));
  g.add(wheel);
  const glass = p.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), 0x1c2a52, { emissive: INK, emissiveIntensity: 0, outline: false });
  glass.position.set(0, d.h * 0.4, -0.02);
  g.add(glass);
  let spin = 0;
  return {
    root: g,
    update: (c: ModelCtx) => {
      spin = approach(spin, c.obj.used ? Math.PI * 3 : 0, c.dt * 2);
      wheel.rotation.z = spin;
      (glass.material as THREE.MeshStandardMaterial).emissiveIntensity = approach((glass.material as THREE.MeshStandardMaterial).emissiveIntensity ?? 0, c.obj.used ? 0.9 : 0, c.dt);
    }
  };
}

/** 墨線鎖：門邊一團乾掉的墨線 (深色纏結)；化開 = 纏結縮小淡去、留下一道濕亮的墨痕 */
export function inkLockModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const pts = Array.from({ length: 14 }, (_, i) => new THREE.Vector3(Math.sin(i * 1.7) * d.w * 0.45, d.h * (0.15 + 0.7 * ((i * 0.37) % 1)), Math.cos(i * 2.3) * d.d * 0.45));
  const knot = p.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.02, 4, false), 0x1d2440, { outline: false });
  const streak = p.mesh(box(0.05, d.h, 0.05), INK, { emissive: INK, emissiveIntensity: 0.6, outline: false, shadow: false });
  streak.position.y = d.h / 2;
  streak.visible = false;
  g.add(knot, streak);
  return {
    root: g,
    update: (c: ModelCtx) => {
      knot.scale.setScalar(approach(knot.scale.x, c.obj.used ? 0.25 : 1, c.dt * 2));
      streak.visible = c.obj.used;
    }
  };
}

/** 墨痕：後牆上墨順著石縫流下來的紋路 (顯出 = 1 秒緩入；只在 used 之後) */
export function inkMarkModel(p: Painter, d: ObjDef): PropModel {
  const veins: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const x = -d.w / 2 + 0.25 + i * (d.w - 0.5) / 5;
    const pts = [new THREE.Vector3(x, d.h, 0), new THREE.Vector3(x + Math.sin(i) * 0.25, d.h * 0.6, 0.01), new THREE.Vector3(x - Math.cos(i) * 0.2, d.h * 0.25, 0.01), new THREE.Vector3(x + 0.1, 0, 0.01)];
    veins.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.025, 4, false));
  }
  const m = p.mesh(mergeParts(veins), INK, { emissive: INK, emissiveIntensity: 0.5, opacity: 0.0001, outline: false, shadow: false, unique: true });
  const mat = m.material as THREE.MeshStandardMaterial;
  m.visible = false;
  return {
    root: m,
    update: (c: ModelCtx) => {
      m.visible = c.obj.used;
      if (c.obj.used) mat.opacity = approach(mat.opacity, 0.9, c.dt);
    }
  };
}

/** 爐邊小櫃：鐵皮小櫃 (兩層) + 櫃門 (彈開 = 往外轉 100°) */
export function markCaseModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  g.add(p.mesh(mergeParts([placed(box(d.w, d.h, d.d), 0, d.h / 2, 0)]), IRON, { metalness: 0.4, roughness: 0.6 }));
  const doorG = new THREE.Group();
  doorG.position.set(-d.w / 2, 0, d.d / 2 + 0.02);
  doorG.add(p.mesh(mergeParts([placed(box(d.w - 0.06, d.h - 0.08, 0.03), (d.w - 0.06) / 2, d.h / 2, 0), placed(box(0.04, 0.16, 0.04), d.w - 0.16, d.h / 2, 0.03)]), 0x4a4440, { metalness: 0.4, roughness: 0.5 }));
  g.add(doorG);
  const note = p.mesh(box(0.3, 0.02, 0.22), pal.paperNote, { outline: false });
  note.position.set(0, d.h * 0.45, 0);
  g.add(note);
  return { root: g, update: (c: ModelCtx) => { doorG.rotation.y = approach(doorG.rotation.y, c.obj.used ? -1.75 : 0, c.dt * 3); } };
}

/** 根管線：沿 path 的一條樹根管 (褐)；墨流過 (pipeLit) = 墨藍緩亮 (1 秒)，不閃爍 */
export function inkPipeModel(p: Painter, d: ObjDef): PropModel {
  const pts = d.type === 'inkPipe' ? d.path.split(/\s+/).map(s => { const [x, y, z] = s.split(',').map(Number); return new THREE.Vector3(x - d.x, y - d.y, z - d.z); }) : [];
  const g = new THREE.Group();
  if (pts.length < 2) return { root: g };
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = p.mesh(new THREE.TubeGeometry(curve, Math.max(12, pts.length * 8), 0.07, 6, false), ROOT, { emissive: INK, emissiveIntensity: 0, roughness: 0.9, outline: false, unique: true });
  g.add(tube);
  const mat = tube.material as THREE.MeshStandardMaterial;
  const when = d.type === 'inkPipe' ? d.when : 'through';
  return {
    root: g,
    update: (c: ModelCtx) => {
      const lit = pipeLit(c, when);
      mat.emissiveIntensity = approach(mat.emissiveIntensity, lit ? 0.8 : 0, c.dt);
      mat.color.setHex(lit && mat.emissiveIntensity > 0.4 ? 0x2a3a6a : ROOT);
    }
  };
}
