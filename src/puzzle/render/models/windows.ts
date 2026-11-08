import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import { faceOfCell } from '../../core/cube';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { mergeParts, placed } from '../geometry';
import { crateWood, verticalText, windowSketch } from '../textures';
import { labelBadge, labelText } from './label';
import type { ModelCtx, PropModel } from './types';

// 第五章三扇窗的機關外觀 (規格 6「5-2 東窗（細化）」)：
// - 窗框上的詩 poemWindow (東牆；root = 邏輯盒底面中心 (9.6, 1.0, 0))：實景 = 窗框兩側直刻的兩塊木條；玻璃層依此刻的面——
//   朝上 = 暖白星光緩亮 + 地板上橫躺的字影、倒過來 (face) = 深色鏡面 + 上下顛倒的兩行倒影、水平 = 不畫；
//   藏寶圖 = 窗的速寫 (順刻 / 側影 / 倒讀) + 可寫的標籤徽章。不閃爍；減弱動態 (calm) = 直接切換
// - 星表匣 starCase：木匣 + 掀開的蓋、一疊紙 (拿過 = 紙少了)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const approach = (cur: number, target: number, k: number) => cur + (target - cur) * Math.min(1, k);
/** 窗洞中心高 (decor atticWindow 的 y 2.8) 相對物件底 (y 1.0) */
const WIN_Y = 1.8;
const WALL_X = 0.25;

type View = 'level' | 'up' | 'flip';
/** 此刻的樣子 (同 mechanics/windows windowView；render 不得匯入 mechanics 的值) */
function viewOf(c: ModelCtx, d: ObjDef): View {
  if (d.type !== 'poemWindow') return 'level';
  const f = faceOfCell(c.world.ext.cube?.at);
  return f === d.face ? 'flip' : f === 'U' ? 'up' : 'level';
}

/** 一塊朝房內 (−x) 的平面 */
const wallPlane = (w: number, h: number) => new THREE.PlaneGeometry(w, h).rotateY(-Math.PI / 2);

export function poemWindowModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const { pal } = theme;
  const g = new THREE.Group();
  if (d.type !== 'poemWindow') return { root: g };
  // 實景：兩塊直刻的木條 (右 = +z 是上聯「上在星首仰」、左 = −z 是可寫的那一行)
  const strips: THREE.Mesh[] = [];
  const stripAt = [1.55, -1.55];
  // 玻璃層 (實景)：星光 / 鏡面
  const light = p.mesh(wallPlane(2.3, 1.9), 0xf2e2c8, { opacity: 0.4, outline: false, shadow: false, unique: true, emissive: 0xf2e2c8, emissiveIntensity: 0.6 });
  light.position.set(WALL_X - 0.12, WIN_Y, 0);
  const mirror = p.mesh(wallPlane(2.3, 1.9), 0x0c0e18, { opacity: 0.85, outline: false, shadow: false, unique: true });
  mirror.position.set(WALL_X - 0.12, WIN_Y, 0);
  g.add(light, mirror);
  let reflect: THREE.Group | null = null;
  let floorShadow: THREE.Group | null = null;
  // 藏寶圖：窗的速寫 (每種樣子 × 字建一次網格)
  const sketches = new Map<string, THREE.Mesh>();
  const sketchHolder = new THREE.Group();
  sketchHolder.position.set(-0.9, WIN_Y + 0.2, -4.7);
  g.add(sketchHolder);
  const badge = labelBadge(p, d, theme, g, new THREE.Vector3(-0.9, 0.35, 0.02), 0.5);
  let built = false;
  let kl = 0, kf = 0;
  const update = (c: ModelCtx) => {
    const text = (k: string) => c.world.rt.text(k);
    if (!built) {
      built = true;
      [d.upper, d.label?.textKey ?? ''].forEach((key, i) => {
        const s = p.mesh(wallPlane(0.26, 1.7), 0xffffff, { map: verticalText(pal, text(key).replace('{c}', ' '), 'carved'), outline: false, shadow: false });
        s.position.set(WALL_X - 0.02, WIN_Y, stripAt[i]);
        strips.push(s); g.add(s);
      });
      // 倒影：兩行字上下顛倒地映在鏡面上 (淡)
      reflect = new THREE.Group();
      [d.upper, d.label?.textKey ?? ''].forEach((key, i) => {
        const r = p.mesh(wallPlane(0.3, 1.7), 0xffffff, { map: verticalText(pal, text(key).replace('{c}', ' '), 'shadow'), opacity: 0.55, outline: false, shadow: false, unique: true });
        r.position.set(WALL_X - 0.14, WIN_Y, i === 0 ? 0.6 : -0.6);
        r.scale.y = -1;
        reflect!.add(r);
      });
      // 側影：兩行字的影子橫躺在窗前的地板上
      floorShadow = new THREE.Group();
      [d.upper, d.label?.textKey ?? ''].forEach((key, i) => {
        const f = p.mesh(new THREE.PlaneGeometry(0.34, 1.9).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), 0xffffff, { map: verticalText(pal, text(key).replace('{c}', ' '), 'shadow'), opacity: 0.4, outline: false, shadow: false, unique: true });
        f.position.set(-1.3, -0.985 + i * 0.002, i === 0 ? 0.45 : -0.45);
        floorShadow!.add(f);
      });
      g.add(reflect, floorShadow);
    }
    const v = viewOf(c, d);
    const is3d = c.mode === '3d';
    const k = c.calm ? 1 : c.dt * 2;
    kl = approach(kl, v === 'up' ? 1 : 0, k);
    kf = approach(kf, v === 'flip' ? 1 : 0, k);
    (light.material as THREE.MeshStandardMaterial).opacity = 0.4 * kl;
    (mirror.material as THREE.MeshStandardMaterial).opacity = 0.85 * kf;
    light.visible = is3d && kl > 0.02;
    mirror.visible = is3d && kf > 0.02;
    reflect!.visible = mirror.visible;
    floorShadow!.visible = light.visible;
    for (const s of strips) s.visible = is3d;
    // 藏寶圖的速寫：可寫的那一行照此刻的讀法 (labelText = 徽章同一個字串)
    sketchHolder.visible = !is3d;
    if (!is3d) {
      const left = labelText(c, d).text;
      const right = text(v === 'flip' ? d.upperFlip : d.upper);
      const key = `${v}|${right}|${left}`;
      let m = sketches.get(key);
      if (!m) {
        m = p.mesh(new THREE.PlaneGeometry(2.0, 2.25), 0xffffff, { map: windowSketch(pal, right, left, v), flatMap: true, outline: false, shadow: false, unique: true });
        sketches.set(key, m);
        sketchHolder.add(m);
      }
      for (const [kk, mm] of sketches) mm.visible = kk === key;
    }
    badge(c);
  };
  return { root: g, update };
}

/** 星表匣：木匣 + 掀開的蓋 + 一疊手抄星表 (拿過 = 紙少了一截) */
export function starCaseModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const body = mergeParts([
    placed(box(d.w, 0.04, d.d), 0, 0.02, 0),
    placed(box(d.w, d.h * 0.6, 0.03), 0, d.h * 0.3, d.d / 2 - 0.015), placed(box(d.w, d.h * 0.6, 0.03), 0, d.h * 0.3, -d.d / 2 + 0.015),
    placed(box(0.03, d.h * 0.6, d.d), d.w / 2 - 0.015, d.h * 0.3, 0), placed(box(0.03, d.h * 0.6, d.d), -d.w / 2 + 0.015, d.h * 0.3, 0),
    // 掀開的蓋 (往後靠)
    placed(box(d.w, 0.03, d.d), 0, d.h * 0.6 + d.d * 0.42, -d.d / 2 - 0.02, -1.25, 0, 0)
  ]);
  g.add(p.mesh(body, pal.shelf, { map: crateWood(pal), flat: pal.shelf }));
  const papers = p.mesh(box(d.w - 0.1, 0.12, d.d - 0.1), pal.paperNote, { outline: false });
  papers.position.set(0, 0.1, 0);
  g.add(papers);
  let k = 0;
  const update = (c: ModelCtx) => { k = approach(k, c.obj.used ? 1 : 0, c.dt * 4); papers.scale.y = 1 - 0.5 * k; papers.position.y = 0.1 - 0.03 * k; };
  return { root: g, update };
}
