import * as THREE from 'three';
import type { ObjDef, ObjState, World } from '../../core/types';
import type { Painter } from '../materials';
import { glowSprite } from '../materials';
import type { Theme } from '../themes';
import { crateWood, glow, notePaper } from '../textures';
import { mergeParts, placed } from '../geometry';
import { labelBadge, scaleCorner, scaleRatio } from './label';
import { halfPanDrop, rng, sprouts, weightIn } from './nursery';
import type { ModelCtx, PropModel } from './types';

// 3-3 夜溫室 (規格 6「3-3 夜溫室（細化）」) 的物件外觀：
// - 半座天平 (balanceHalf)：黃銅秤桿從房內的秤盤往門那一側穿出牆外；沒接上 = 往門那一側垂下、接上 = 依兩盤重量傾斜、閂住 = 水平。
//   2D 另畫一個側視的秤記號 (支點三角 + 秤桿 + 牆；接上才畫出牆外的另一盤)，因為藏寶圖從 +z 看，穿進牆的秤桿只剩一個點
// - 巨盆 (bigPot)：大陶盆 + 樹蕨 (粗莖 + 放射狀羽葉)；依有效尺寸縮放；被推過 (used) 後地上一道拖痕、北牆彩繪玻璃上淡淡的手印 (只在實景、淡入不閃爍：規格 9.1)
// - 伸過來的那一截陶槽 (protrudeStep)、溫室深處的高台 (ledge)、爸爸的園藝筆記一頁 (page)
// 同材質零件合成一個網格 (mergeParts)；共面規則 (tests/puzzle/render/coplanar)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const BRASS = { metalness: 0.6, roughness: 0.4 } as const;
const SOIL = 0x3b2a1e;
const LEAF = 0x5f8a3a;
const FERN = 0x4f7d3a;
const BARK = 0x5a4636;
const STONE = 0x8c8470;
const STONE_DARK = 0x6a6454;
/** 秤桿傾角：接上時的最大傾角 / 沒接上時垂下的角度 (弧度) */
const TILT = 0.14;
const DROOP = 0.24;
/** 秤桿的高度、盤頂高度 (盤上的物件 y 0.72) */
const BEAM_Y = 0.5;
const PAN_TOP = 0.72;
/** 手印：北牆彩繪玻璃上的位置 (世界座標；玻璃面 z −4.939，手印貼在玻璃前 4 mm)、最亮時的不透明度、淡入秒數 */
const HAND = { x: 3.95, y: 2.6, z: -4.935 } as const;
const HAND_ALPHA = 0.38;
const HAND_SEC = 1.8;
const HAND_CALM_SEC = 4;

/** 2D 記號的左右範圍 (本地 x)；花秤 (models/nursery balanceModel) 的秤臂長與秤盤半徑 */
const SIGN_X0 = -0.67;
const SIGN_X1 = 1.0;
const BAL_ARM = 1.2;
const BAL_PAN = 0.34;

/** 門的方向 → 秤桿穿出去的方向 (rig 的本地 −z 指向門) */
const ROT_Y: Readonly<Record<string, number>> = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };

/** 半座天平此刻的目標傾角 (正 = 本盤往下)：閂住 = 0；沒接上 = 往門那一側垂下；接上 = 本盤重量 − 對面 */
function halfGoal(world: World, o: ObjState): { goal: number; joined: boolean } {
  if (o.def.type !== 'balanceHalf') return { goal: 0, joined: false };
  if (o.used) return { goal: 0, joined: true };
  const other = world.ext.balance?.[o.def.id]?.other;
  if (other === undefined) return { goal: -DROOP, joined: false };
  const mine = o.def.pans.reduce((n, id) => n + weightIn(world, id), 0);
  return { goal: mine > other ? TILT : mine < other ? -TILT : 0, joined: true };
}

/**
 * 半座天平：蜂蜜木底座 + 黃銅支點柱 + 秤桿 (支點在盤與門之間；從盤下一路穿過門洞、伸進牆外 0.4) + 盤下的短柱與淺盤 (盤的大小與位置依盤上的物件)。
 * 秤盤的高低寫進 halfPanDrop，盤上的陶盆 / 澆水壺 (potModel) 讀它跟著上下。幾何依世界 (門的方向、盤上物件、牆的位置) 在第一次 update 時建
 */
export function balanceHalfModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const { pal } = theme;
  const g = new THREE.Group();
  if (d.type !== 'balanceHalf') return { root: g };
  const rig = new THREE.Group();
  const beam = new THREE.Group();
  const pan = new THREE.Group();
  g.add(rig);
  let arm = 0.7;
  // 2D 側視記號 (畫在底座前方，盤的下方)：支點三角 + 秤桿 (沒接上：短桿止於牆；接上：長桿穿過牆、另一端一個空盤)
  const sign = new THREE.Group();
  sign.position.set(0, 0.3, d.d / 2 + 0.06);
  g.add(sign);
  const tri = new THREE.Shape([new THREE.Vector2(-0.12, -0.14), new THREE.Vector2(0.12, -0.14), new THREE.Vector2(0, 0.08)]);
  sign.add(p.mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.02, bevelEnabled: false }), pal.brass, BRASS));
  const wall = p.mesh(box(0.07, 0.42, 0.02), pal.trim);
  wall.position.set(0.5, 0.06, 0.012);
  sign.add(wall);
  const lever = new THREE.Group();
  lever.position.set(0, 0.08, 0.03);
  sign.add(lever);
  const mineSign = p.mesh(mergeParts([placed(box(0.98, 0.045, 0.02), -0.11, 0, 0), placed(box(0.3, 0.04, 0.02), -0.52, 0.08, 0), placed(box(0.03, 0.08, 0.02), -0.52, 0.04, 0)]), pal.brass, BRASS);
  const farSign = p.mesh(mergeParts([placed(box(0.62, 0.045, 0.02), 0.69, 0, 0), placed(box(0.3, 0.04, 0.02), 0.85, 0.08, 0), placed(box(0.03, 0.08, 0.02), 0.85, 0.04, 0)]), pal.inkBlue);
  lever.add(mineSign, farSign);
  let built = false;
  let angle = Number.NaN;
  const build = (c: ModelCtx) => {
    built = true;
    const o = c.obj;
    if (o.def.type !== 'balanceHalf') return;
    const door = c.world.byId.get(o.def.door);
    const side = door?.def.type === 'cubeDoor' ? door.def.side : 'N';
    rig.rotation.y = ROT_Y[side] ?? 0;
    // 盤上物件在 rig 座標的範圍 (rig 的 −z 指向門)
    const inv = new THREE.Matrix4().makeRotationY(-rig.rotation.y);
    const pts = o.def.pans.map(id => c.world.byId.get(id)).filter((x): x is ObjState => !!x).map(q => new THREE.Vector3(q.x - o.x, 0, q.z - o.z).applyMatrix4(inv));
    const xs = pts.map(v => v.x), zs = pts.map(v => v.z);
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const cz = zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : 0;
    const spanX = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
    // 牆在 rig 座標的位置 (門那一側的房間邊界)
    const b = c.world.level.bounds;
    const wallZ = -(side === 'N' ? o.z - b.minZ : side === 'S' ? b.maxZ - o.z : side === 'E' ? b.maxX - o.x : o.x - b.minX);
    const pivotZ = Math.max(wallZ + 0.6, cz - 0.75);
    arm = cz - pivotZ;
    const outZ = wallZ - 0.4;
    // 底座 (木) + 黃銅包角與支點柱
    const base = p.mesh(box(0.5, 0.12, 0.5), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark });
    base.position.set(cx, 0.06, pivotZ);
    const post = p.mesh(mergeParts([
      ...[-1, 1].flatMap(sx => [-1, 1].map(sz => placed(box(0.06, 0.14, 0.06), cx + sx * 0.23, 0.07, pivotZ + sz * 0.23))),
      placed(new THREE.CylinderGeometry(0.04, 0.06, BEAM_Y - 0.12, 10), cx, 0.12 + (BEAM_Y - 0.12) / 2, pivotZ),
      placed(new THREE.ConeGeometry(0.08, 0.12, 4), cx, BEAM_Y - 0.03, pivotZ, 0, Math.PI / 4, 0)
    ]), pal.brass, BRASS);
    rig.add(base, post);
    // 秤桿 (支點在原點)：盤這一端 → 穿過門洞 → 牆外；桿端在牆外是一截參差的斷口 (沒接上時看得到垂進牆裡)
    beam.position.set(cx, BEAM_Y + 0.03, pivotZ);
    const len = arm - (outZ - pivotZ);
    beam.add(p.mesh(mergeParts([
      placed(box(0.06, 0.06, len), 0, 0, arm - len / 2),
      placed(new THREE.SphereGeometry(0.045, 8, 6), 0, 0, 0),
      placed(box(0.09, 0.04, 0.04), 0, 0, 0)
    ]), pal.brass, BRASS));
    rig.add(beam);
    // 秤盤：盤下短柱 + 淺橢圓盤 (涵蓋盤上的每個物件)
    const panW = Math.max(0.62, spanX + 0.6);
    const tray = new THREE.CylinderGeometry(0.31, 0.27, 0.05, 20);
    tray.scale(panW / 0.62, 1, 1);
    pan.add(p.mesh(mergeParts([placed(tray, 0, PAN_TOP - 0.025, 0), placed(new THREE.CylinderGeometry(0.025, 0.025, PAN_TOP - 0.05 - BEAM_Y, 6), 0, BEAM_Y + (PAN_TOP - 0.05 - BEAM_Y) / 2, 0)]), pal.brass, BRASS));
    pan.position.set(cx, 0, cz);
    rig.add(pan);
    // 2D 記號避開同房花秤 (balance) 的秤盤：秤盤落在記號範圍內 → 記號整個挪到秤盤的外側
    for (const q of c.world.objs) {
      if (q.def.type !== 'balance') continue;
      for (const side of [-1, 1]) {
        const px = q.x + side * BAL_ARM - o.x;
        if (px + BAL_PAN < SIGN_X0 || px - BAL_PAN > SIGN_X1) continue;
        sign.position.x = px < 0 ? Math.max(sign.position.x, px + BAL_PAN + 0.1 - SIGN_X0) : Math.min(sign.position.x, px - BAL_PAN - 0.1 - SIGN_X1);
      }
    }
  };
  const update = (c: ModelCtx) => {
    if (!built) build(c);
    const { goal, joined } = halfGoal(c.world, c.obj);
    angle = Number.isNaN(angle) ? goal : angle + (goal - angle) * Math.min(1, c.dt * 5);
    beam.rotation.x = angle;
    const dy = -arm * Math.sin(angle);
    pan.position.y = dy;
    halfPanDrop.set(c.obj, dy);
    const is2d = c.mode === '2d';
    sign.visible = is2d;
    if (!is2d) return;
    // 記號：本盤在左、門在右；本盤重 = 左端往下 (rotation.z > 0)；沒接上 = 右端垂進牆裡
    lever.rotation.z = angle;
    farSign.visible = joined;
  };
  return { root: g, update };
}

/** 手指尖的圓弧 (手印輪廓用)：從 (x0, y) 往上到 top、半圓到 x1 再往下 */
function finger(s: THREE.Shape, x0: number, x1: number, y: number, top: number): void {
  const r = (x1 - x0) / 2;
  s.lineTo(x0, y);
  s.lineTo(x0, top - r);
  s.absarc(x0 + r, top - r, r, Math.PI, 0, true);
  s.lineTo(x1, y);
}

/** 手印的形狀 (掌 + 拇指 + 四指；一個不自交的輪廓：填色時沒有重疊處，半透明不會一塊深一塊淺) */
function handShape(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.085, 0);
  s.lineTo(-0.1, 0.11);
  // 拇指 (往左斜上)
  s.lineTo(-0.15, 0.13);
  s.absarc(-0.165, 0.16, 0.022, -Math.PI / 2 - 0.4, Math.PI / 2, true);
  s.lineTo(-0.1, 0.19);
  finger(s, -0.088, -0.05, 0.2, 0.3);
  finger(s, -0.042, -0.002, 0.21, 0.33);
  finger(s, 0.006, 0.044, 0.21, 0.31);
  finger(s, 0.052, 0.084, 0.19, 0.265);
  s.lineTo(0.09, 0.12);
  s.lineTo(0.08, 0);
  s.lineTo(-0.085, 0);
  return new THREE.ShapeGeometry(s, 6);
}

/**
 * 巨盆：大陶盆 (盆身 + 口沿 + 土) + 樹蕨 (略彎的粗莖 + 頂上一圈放射狀、向外垂的羽葉 + 中心的捲芽)；本體依有效尺寸縮放 (底部中心；標籤不跟著縮)。
 * 位置跟著 ObjState (被推過 = 機制把 x / z 改成 pushTo)。被推過後：實景地上一道拖痕 (從原位到現在的位置)、北牆彩繪玻璃上的手印 (淡入；讀檔時已在 = 直接出現)。
 * 藏寶圖：標籤「巨盆」+ 方槽、縮放角標
 */
export function bigPotModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const { pal } = theme;
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const r = rng(Math.round(d.x * 13 + 41));
  const R = d.w / 2, PH = d.h * 0.4;
  body.add(p.mesh(mergeParts([placed(new THREE.CylinderGeometry(R * 0.92, R * 0.66, PH, 20), 0, PH / 2, 0), placed(box(R * 1.2, 0.05, 0.04), 0, PH * 0.35, R * 0.8 + 0.005, -0.12, 0, 0)]), pal.crate, { roughness: 0.9 }));
  const rim = p.mesh(new THREE.CylinderGeometry(R * 0.98, R * 0.98, 0.1, 20), pal.crateDark, { roughness: 0.9, outline: false });
  rim.position.y = PH - 0.03;
  const soil = p.mesh(new THREE.CylinderGeometry(R * 0.86, R * 0.86, 0.03, 18), SOIL, { outline: false, shadow: false });
  soil.position.y = PH - 0.05;
  body.add(rim, soil);
  // 樹蕨：粗莖 (略彎) + 莖上的葉痕 (鱗片)
  const top = d.h * 0.86;
  const trunkCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, PH - 0.06, 0), new THREE.Vector3(0.05, PH + (top - PH) * 0.45, 0.02), new THREE.Vector3(-0.02, top, 0)]);
  const bark: THREE.BufferGeometry[] = [new THREE.TubeGeometry(trunkCurve, 10, R * 0.13, 8, false)];
  for (let i = 0; i < 6; i++) {
    const t = 0.15 + i * 0.13;
    const at = trunkCurve.getPoint(t);
    const a = i * 2.1;
    bark.push(placed(new THREE.ConeGeometry(R * 0.05, R * 0.14, 4), at.x + Math.cos(a) * R * 0.12, at.y, at.z + Math.sin(a) * R * 0.12, Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2));
  }
  body.add(p.mesh(mergeParts(bark), BARK, { roughness: 0.95 }));
  // 羽葉：每片 = 從頂端往外上揚的內段 + 向下垂的外段 (壓扁的長橢球)；九片 + 中心捲芽，一個網格
  const fronds: THREE.BufferGeometry[] = [];
  const n = 9;
  const L = R * 0.85;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const ca = Math.cos(a), sa = Math.sin(a);
    const inner = new THREE.SphereGeometry(1, 10, 4); inner.scale(L * 0.55, 0.025, L * 0.16);
    const outer = new THREE.SphereGeometry(1, 10, 4); outer.scale(L * 0.55, 0.025, L * 0.13);
    const up = 0.35 + r() * 0.15;
    const x1 = Math.cos(up) * L * 0.5, y1 = Math.sin(up) * L * 0.5;
    fronds.push(placed(inner, ca * x1, top + y1, -sa * x1, 0, a, up));
    const down = -0.45 - r() * 0.2;
    const x2 = Math.cos(up) * L * 1.0 + Math.cos(down) * L * 0.5, y2 = Math.sin(up) * L * 1.0 + Math.sin(down) * L * 0.5;
    fronds.push(placed(outer, ca * x2, top + y2, -sa * x2, 0, a, down));
  }
  const curl = new THREE.TorusGeometry(R * 0.07, R * 0.03, 5, 10, Math.PI * 1.5);
  fronds.push(placed(curl, 0, top + R * 0.12, 0, 0, 0.6, 0));
  body.add(p.mesh(mergeParts(fronds), FERN, { roughness: 0.85 }));
  const badge = labelBadge(p, d, theme, g, new THREE.Vector3(0, d.h + 0.5, R), 0.46);
  const corner = scaleCorner(p, d, theme, g, 0.3);
  // 拖痕 (只在實景；地上兩道深色淺溝：從原位拖到現在的位置)
  const markMat = new THREE.MeshBasicMaterial({ color: 0x1f1a14, transparent: true, opacity: 0.35, depthWrite: false });
  const mark = new THREE.Mesh(mergeParts([placed(new THREE.PlaneGeometry(0.12, 1), -R * 0.45, 0, 0, -Math.PI / 2), placed(new THREE.PlaneGeometry(0.12, 1), R * 0.45, 0, 0, -Math.PI / 2)]), markMat);
  mark.renderOrder = 1;
  g.add(mark);
  // 手印 (只在實景；淡入)
  const handMat = new THREE.MeshBasicMaterial({ color: 0xdce8f4, transparent: true, opacity: 0, depthWrite: false });
  const hand = new THREE.Mesh(handShape(), handMat);
  hand.scale.setScalar(2.1);
  hand.rotation.z = -0.12;
  hand.renderOrder = 2;
  g.add(hand);
  const home = { x: d.x, z: d.z };
  let fade = -1;
  const at = new THREE.Vector3();
  const update = (c: ModelCtx) => {
    const o = c.obj;
    const k = scaleRatio(c);
    body.scale.setScalar(k);
    badge(c);
    corner(c, at.set(R * k + 0.15, d.h * k, R * k));
    const is3d = c.mode === '3d';
    // 拖痕：原位 → 現在的位置 (沿 z)
    const dz = home.z - o.z, dx = home.x - o.x;
    mark.visible = is3d && o.used && Math.hypot(dx, dz) > 0.3;
    if (mark.visible) {
      const len = Math.hypot(dx, dz);
      mark.scale.set(1, 1, len);
      mark.rotation.y = Math.atan2(dx, dz);
      mark.position.set(dx / 2, 0.012, dz / 2);
    }
    // 手印：被推過的那一刻開始淡入 (第一次 update 已推過 = 讀檔 / 換房：直接出現)
    const goal = o.used ? 1 : 0;
    fade = fade < 0 ? goal : Math.min(goal, fade + c.dt / (c.calm ? HAND_CALM_SEC : HAND_SEC));
    if (!o.used) fade = 0;
    hand.visible = is3d && fade > 0.001;
    if (hand.visible) {
      handMat.opacity = HAND_ALPHA * fade * fade * (3 - 2 * fade);
      hand.position.set(HAND.x - o.x, HAND.y - o.y, HAND.z - o.z);
    }
  };
  return { root: g, update };
}

/**
 * 伸過來的那一截陶槽 (推導實體；3-3c 從夜溫室南拱門伸進溫室深處)：赤陶的兩道長壁 + 底 + 朝房內的那一端 (斷面：厚壁 + 土層的剖面) + 土與一排苗。
 * 頂面 = 可以踩的墊腳 (def.h)；兩個視角都畫
 */
export function protrudeStepModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const r = rng(Math.round(d.x * 7 + 5));
  const W = d.w, H = d.h, D = d.d, t = 0.1;
  // 朝房內的那一端：離北牆近 = +z (反之 -z)
  const inward = d.z < 0 ? 1 : -1;
  const shell = [
    placed(box(W, 0.1, D), 0, 0.05, 0),
    placed(box(t, H - 0.1, D), -W / 2 + t / 2, 0.1 + (H - 0.1) / 2, 0), placed(box(t, H - 0.1, D), W / 2 - t / 2, 0.1 + (H - 0.1) / 2, 0),
    placed(box(W - t * 2, H - 0.1, t), 0, 0.1 + (H - 0.1) / 2, inward * (D / 2 - t / 2))
  ];
  g.add(p.mesh(mergeParts(shell), pal.crate, { roughness: 0.9 }));
  // 上緣口沿 (比壁寬 1 cm、高出 1 cm)
  const lip = [placed(box(t + 0.02, 0.04, D + 0.02), -W / 2 + t / 2, H - 0.01, 0), placed(box(t + 0.02, 0.04, D + 0.02), W / 2 - t / 2, H - 0.01, 0), placed(box(W - t * 2 - 0.004, 0.04, t + 0.02), 0, H - 0.01, inward * (D / 2 - t / 2))];
  g.add(p.mesh(mergeParts(lip), pal.crateDark, { roughness: 0.9, outline: false }));
  // 土 (到牆那一端為止；比內緣小 1 cm) + 苗
  const soil = p.mesh(box(W - t * 2 - 0.01, 0.05, D - t - 0.01), SOIL, { outline: false, shadow: false });
  soil.position.set(0, H - 0.12, -inward * t / 2);
  g.add(soil);
  const row = sprouts(r, D - 0.3, H - 0.1).map(geo => geo.translate(0, 0, -inward * t / 2));
  g.add(p.mesh(mergeParts(row), LEAF, { roughness: 0.9, outline: false }));
  return { root: g };
}

/**
 * 高台 (溫室深處北牆花窗下，3-3c)：石砌台身 (三層錯縫的石塊線) + 稍微出挑的厚石板台面；台面前緣一條青苔。實體、兩個視角
 */
export function ledgeModel(p: Painter, d: ObjDef, _theme: Theme): PropModel {
  const g = new THREE.Group();
  const W = d.w, H = d.h, D = d.d;
  const slab = 0.14;
  const bodyH = H - slab;
  // 台身 (後面離牆 1 cm：不與牆面相貼)
  const core = p.mesh(box(W - 0.06, bodyH, D - 0.06), STONE, { roughness: 0.95 });
  core.position.set(0, bodyH / 2, -0.02);
  g.add(core);
  // 石塊線：前面三道橫縫 + 錯開的直縫 (凸出前面 1 cm 的深色細條)
  const front = D / 2 - 0.05 + 0.01;
  const joints: THREE.BufferGeometry[] = [];
  const rows = 4;
  for (let k = 1; k < rows; k++) joints.push(placed(box(W - 0.08, 0.025, 0.02), 0, (k * bodyH) / rows, front));
  for (let k = 0; k < rows; k++) {
    const off = k % 2 ? 0.25 : 0;
    for (let x = -W / 2 + 0.5 + off; x < W / 2 - 0.2; x += 0.5) joints.push(placed(box(0.025, bodyH / rows - 0.03, 0.02), x, ((k + 0.5) * bodyH) / rows, front));
  }
  g.add(p.mesh(mergeParts(joints), STONE_DARK, { roughness: 0.95, outline: false, shadow: false }));
  // 台面石板 (前、左右各出挑 4 cm)
  const top = p.mesh(box(W + 0.08, slab, D + 0.02), STONE_DARK, { roughness: 0.9 });
  top.position.set(0, bodyH + slab / 2, 0.01);
  g.add(top);
  const moss = p.mesh(box(W * 0.6, 0.03, 0.06), 0x5f7d3a, { roughness: 1, outline: false, shadow: false });
  moss.position.set(-W * 0.12, H + 0.005, D / 2 - 0.02);
  g.add(moss);
  return { root: g };
}

/**
 * 爸爸的園藝筆記一頁 (高台上；同 scrapModel 的紙)：一張斜靠著窗、往後仰的紙 (2D 從正面看得到) + 一塊壓紙的小石子 + 實景的淡光暈。拿走 = 消失 (gone)
 */
export function pageModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const W = d.w, H = Math.max(d.d, 0.3);
  const lean = new THREE.Group();
  lean.rotation.set(-0.45, 0.1, 0);
  g.add(lean);
  const paper = p.mesh(new THREE.PlaneGeometry(W, H), 0xffffff, { map: notePaper(pal), flatMap: true, outline: true, shadow: false });
  paper.position.set(0, H / 2 + 0.005, 0);
  paper.rotation.z = 0.08;
  lean.add(paper);
  const stone = p.mesh(placed(new THREE.SphereGeometry(0.05, 8, 6).scale(1, 0.6, 0.8), W * 0.28, 0.03, 0.06), STONE_DARK, { roughness: 0.95, shadow: false });
  g.add(stone);
  const halo = glowSprite(glow(), pal.lampLight, 0.8, 0.3, true);
  halo.position.set(0, H / 2, 0.05);
  g.add(halo);
  return { root: g, update: c => { halo.visible = c.mode === '3d'; halo.material.opacity = 0.24 + 0.06 * Math.sin(c.t * 2); } };
}
