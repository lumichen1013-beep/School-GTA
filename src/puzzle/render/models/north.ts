import * as THREE from 'three';
import type { ObjDef, ObjState, World } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { crateWood } from '../textures';
import { mergeParts, placed } from '../geometry';
import { labelBadge, scaleCorner, scaleRatio } from './label';
import { weightIn } from './nursery';
import type { ModelCtx, PropModel } from './types';

// 第五章 5-4 北窗的機關外觀 (規格 6「5-4 北窗（細化）」)：
// - 吊秤 hangScale：梁下垂下的黃銅吊桿 + 支點 + 沿 x 的秤桿 (依兩盤重量傾斜、平滑轉過去；閂住 = 水平；減弱動態 = 直接到位)；
//   西端三根吊繩的淺盤 (盤上的背包讀 hangDrop 跟著上下)、東端垂進地板小洞的秤繩 (地板上一圈黃銅包邊)。秤桿沿 x：兩個視角都看得到傾斜
// - 背包 backpack：帆布包身 + 翻蓋 + 兩條背帶 (尺度卡照縮放；藏寶圖有標籤徽章與方槽)
// - 重物箱 ballastBox：皮箱 (皮面 + 銅角 + 兩條皮帶) / 書箱 (木箱 + 箱口一排書脊)；蓋上一個黃銅環
// 同材質零件合成一個網格 (mergeParts)；共面規則 (tests/puzzle/render/coplanar)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const METAL = { metalness: 0.6, roughness: 0.4 } as const;
const BRASS = 0xb08a4a;
const ROPE = 0x8a6a48;
const BEAM_WOOD = 0x4a3828;
const CANVAS = 0x6f7a5a;
const CANVAS_DARK = 0x4f5840;
const LEATHER = 0x6e4a30;
const STRAP = 0x3e2a1c;
const SPINES = [0x7a3a2a, 0x2f4a5a, 0x5a5a2a, 0x6a4a6a, 0x3a5a3a];
const HOLE = 0x1a1410;
/** 秤桿的高度 (支點)、梁的高度、秤桿的最大傾角 (弧度) */
const PIVOT_Y = 1.9;
const HANG_Y = 3.6;
const TILT = 0.16;

/** 吊秤此刻的秤盤高低 (相對水平；正 = 往上)：盤上的背包讀它 */
export const hangDrop = new WeakMap<ObjState, number>();

/** 吊秤此刻的目標傾角 (正 = 盤那一端往下)：閂住 = 0；那一頭沒有房 = 盤往下；其餘 = 本盤 − 那一頭 */
function hangGoal(world: World, o: ObjState): number {
  if (o.def.type !== 'hangScale' || o.used) return 0;
  const other = world.ext.balance?.[o.def.id]?.other;
  const mine = o.def.pans.reduce((n, id) => n + weightIn(world, id), 0);
  if (other === undefined) return TILT;
  return mine > other ? TILT : mine < other ? -TILT : 0;
}

/** 吊秤：吊桿 + 支點 + 秤桿 (轉) + 盤與吊繩 (跟著盤端上下) + 秤繩 (從秤桿東端拉到地板的洞) + 洞的黃銅包邊 */
export function hangScaleModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  if (d.type !== 'hangScale') return { root: g };
  const beam = new THREE.Group();
  const pan = new THREE.Group();
  const rope = new THREE.Group();
  g.add(beam, pan, rope);
  let built = false;
  let angle = Number.NaN;
  let pivotX = 0, arm = 1, ropeX = 0;
  const build = (c: ModelCtx) => {
    built = true;
    const o = c.obj;
    if (o.def.type !== 'hangScale') return;
    const bag = c.world.byId.get(o.def.pans[0]);
    const panX = bag ? bag.x - o.x : -d.w / 2;
    ropeX = d.w / 2 - 0.2;
    pivotX = (panX + ropeX) / 2;
    arm = (ropeX - panX) / 2;
    // 梁 (一小段木梁) + 吊桿 + 支點
    g.add(p.mesh(placed(box(0.24, 0.22, 1.4), pivotX, HANG_Y + 0.11, 0), BEAM_WOOD, { outline: true }));
    g.add(p.mesh(mergeParts([
      placed(new THREE.CylinderGeometry(0.025, 0.025, HANG_Y - PIVOT_Y - 0.1, 8), pivotX, PIVOT_Y + 0.1 + (HANG_Y - PIVOT_Y - 0.1) / 2, 0),
      placed(new THREE.TorusGeometry(0.07, 0.018, 6, 12), pivotX, PIVOT_Y + 0.12, 0),
      placed(new THREE.ConeGeometry(0.07, 0.12, 4), pivotX, PIVOT_Y + 0.02, 0, Math.PI, Math.PI / 4, 0)
    ]), BRASS, METAL));
    // 秤桿 (支點在原點)：兩端各一個小環
    beam.position.set(pivotX, PIVOT_Y, 0);
    beam.add(p.mesh(mergeParts([
      placed(box(arm * 2 + 0.1, 0.06, 0.06), 0, 0, 0),
      placed(new THREE.SphereGeometry(0.06, 10, 8), 0, 0, 0),
      placed(new THREE.TorusGeometry(0.05, 0.014, 6, 10), -arm, -0.05, 0),
      placed(new THREE.TorusGeometry(0.05, 0.014, 6, 10), arm, -0.05, 0)
    ]), BRASS, METAL));
    // 盤：三根吊繩 (從盤端往下 PIVOT_Y − 盤頂) + 淺盤；盤頂 = 背包的底
    const panTop = bag ? bag.y : 0.8;
    const drop = PIVOT_Y - 0.06 - panTop;
    const cords: THREE.BufferGeometry[] = [];
    for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
      const cx = Math.cos(a) * 0.3, cz = Math.sin(a) * 0.3;
      const len = Math.hypot(drop, 0.3);
      cords.push(placed(new THREE.CylinderGeometry(0.008, 0.008, len, 4).rotateX(Math.PI / 2).lookAt(new THREE.Vector3(cx, -drop, cz)), cx / 2, -0.06 - drop / 2, cz / 2));
    }
    pan.add(p.mesh(mergeParts(cords), ROPE, { outline: false, shadow: false }));
    pan.add(p.mesh(placed(new THREE.CylinderGeometry(0.36, 0.3, 0.05, 20), 0, -0.06 - drop - 0.025, 0), BRASS, METAL));
    pan.position.set(pivotX - arm, PIVOT_Y, 0);
    // 秤繩：一根單位長的細繩，每幀依秤桿東端的高度拉長 (從端點到地板下 0.3)
    rope.add(p.mesh(placed(new THREE.CylinderGeometry(0.014, 0.014, 1, 6), 0, -0.5, 0), ROPE, { outline: true, shadow: false }));
    rope.position.set(ropeX, PIVOT_Y, 0);
    // 地板的小洞：深色圓 + 黃銅包邊 (高出地板 0.006 / 0.02：不與地板共面)
    g.add(p.mesh(placed(new THREE.CylinderGeometry(0.12, 0.12, 0.006, 16), ropeX, 0.004, 0), HOLE, { outline: false, shadow: false }));
    g.add(p.mesh(placed(new THREE.TorusGeometry(0.14, 0.03, 6, 16), ropeX, 0.02, 0, Math.PI / 2, 0, 0), BRASS, { ...METAL, outline: false }));
  };
  const update = (c: ModelCtx) => {
    if (!built) build(c);
    const goal = hangGoal(c.world, c.obj);
    angle = Number.isNaN(angle) || c.calm ? goal : angle + (goal - angle) * Math.min(1, c.dt * 4);
    // 盤在西端 (−x)：正 = 盤往下 = 秤桿繞 z 正轉 (西端往下)
    beam.rotation.z = angle;
    const dy = -arm * Math.sin(angle);
    pan.position.y = PIVOT_Y + dy;
    hangDrop.set(c.obj, dy);
    const ey = PIVOT_Y + arm * Math.sin(angle);
    rope.position.y = ey;
    rope.scale.y = ey + 0.3;
  };
  return { root: g, update };
}

/** 這個背包所在的吊秤 (第一次找到後記住) */
const scaleOf = new WeakMap<ObjState, ObjState | null>();
function findScale(world: World, o: ObjState): ObjState | null {
  if (scaleOf.has(o)) return scaleOf.get(o)!;
  const s = world.objs.find(q => q.def.type === 'hangScale' && q.def.pans.includes(o.def.id)) ?? null;
  scaleOf.set(o, s);
  return s;
}

/** 背包：帆布包身 + 翻蓋 + 前袋 + 兩條背帶 (背面)；跟著秤盤上下、尺度卡照縮放；藏寶圖有標籤徽章與方槽 */
export function backpackModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const g = new THREE.Group();
  const mover = new THREE.Group();
  const body = new THREE.Group();
  g.add(mover);
  mover.add(body);
  const w = d.w, h = d.h, dd = d.d;
  body.add(p.mesh(mergeParts([
    placed(box(w * 0.9, h * 0.82, dd * 0.8), 0, h * 0.41, 0),
    placed(new THREE.CylinderGeometry(dd * 0.4, dd * 0.4, w * 0.9, 12), 0, h * 0.82, 0, 0, 0, Math.PI / 2)
  ]), CANVAS, { roughness: 0.9 }));
  body.add(p.mesh(mergeParts([
    placed(box(w * 0.94, h * 0.34, 0.03), 0, h * 0.7, dd * 0.42, -0.12, 0, 0),
    placed(box(w * 0.6, h * 0.3, dd * 0.22), 0, h * 0.24, dd * 0.48),
    placed(box(0.05, h * 0.8, 0.03), -w * 0.25, h * 0.45, -dd * 0.43),
    placed(box(0.05, h * 0.8, 0.03), w * 0.25, h * 0.45, -dd * 0.43)
  ]), CANVAS_DARK, { roughness: 0.9 }));
  body.add(p.mesh(mergeParts([placed(box(0.06, 0.04, 0.02), -w * 0.18, h * 0.55, dd * 0.47), placed(box(0.06, 0.04, 0.02), w * 0.18, h * 0.55, dd * 0.47)]), BRASS, { ...METAL, outline: false }));
  const badge = labelBadge(p, d, theme, mover, new THREE.Vector3(0, h + 0.2, 0.1), 0.45);
  const corner = scaleCorner(p, d, theme, mover, 0.26);
  const at = new THREE.Vector3();
  const update = (c: ModelCtx) => {
    const k = scaleRatio(c);
    body.scale.setScalar(k);
    const s = findScale(c.world, c.obj);
    mover.position.y = s ? hangDrop.get(s) ?? 0 : 0;
    badge(c);
    corner(c, at.set(w * 0.5 * k + 0.18, h * k * 0.9, 0.1));
  };
  return { root: g, update };
}

/** 重物箱：皮箱 (皮面 + 銅角 + 兩條皮帶) 或書箱 (木箱 + 箱口一排書脊)；蓋上一個黃銅環 (秤鉤的環) */
export function ballastBoxModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  if (d.type !== 'ballastBox') return { root: g };
  const { w, h } = d;
  const dd = d.d;
  if (d.look === 'trunk') {
    g.add(p.mesh(placed(box(w, h, dd), 0, h / 2, 0), LEATHER, { roughness: 0.75 }));
    g.add(p.mesh(mergeParts([placed(box(0.07, h + 0.01, dd + 0.02), -w * 0.28, h / 2, 0), placed(box(0.07, h + 0.01, dd + 0.02), w * 0.28, h / 2, 0)]), STRAP, { outline: false }));
    const corners: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) corners.push(placed(box(0.09, 0.09, 0.09), sx * (w / 2 - 0.03), h - 0.03, sz * (dd / 2 - 0.03)));
    corners.push(placed(new THREE.TorusGeometry(0.08, 0.018, 6, 14), 0, h + 0.012, 0, Math.PI / 2, 0, 0));
    g.add(p.mesh(mergeParts(corners), BRASS, METAL));
  } else {
    g.add(p.mesh(placed(box(w, h * 0.8, dd), 0, h * 0.4, 0), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark }));
    const spines: THREE.BufferGeometry[][] = SPINES.map(() => []);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const sw = (w * 0.9) / n;
      const sh = h * (0.16 + ((i * 37) % 5) * 0.025);
      // 每本的厚薄不同 (前後面不與別的書共面)
      spines[i % SPINES.length].push(placed(box(sw * 0.86, sh, dd * (0.6 + i * 0.013)), -w * 0.45 + sw * (i + 0.5), h * 0.8 + sh / 2 - 0.01, 0));
    }
    spines.forEach((gs, i) => { if (gs.length) g.add(p.mesh(mergeParts(gs), SPINES[i], { roughness: 0.8 })); });
    g.add(p.mesh(placed(new THREE.TorusGeometry(0.08, 0.018, 6, 14), w * 0.36, h * 0.8 + 0.012, dd * 0.42, 0, 0, 0), BRASS, METAL));
  }
  return { root: g };
}
