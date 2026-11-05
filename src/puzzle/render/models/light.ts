import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import { glowSprite } from '../materials';
import type { Theme } from '../themes';
import { crateWood, glow } from '../textures';
import { mergeParts, placed } from '../geometry';
import type { ModelCtx, PropModel } from './types';

// 光路 (N26；規格 6「3-2 玻璃長廊（細化）」、7.2、9.1) 的物件外觀：感光花 (sensor)
// - 本體：赤陶盆 + 花莖與葉 + 花苞 (歪向它要的那扇窗) ↔ 開花 (六片花瓣平滑張開)；mount 'stand' = 立在窗下與窗台同高的木花架上 (花架是模型的一部分，2D 不浮空)；
//   mount 'planter' = 種在圓形石砌花台裡的月下美人 (3-3b：花苞朝天窗 = 向上、開花 = 大白花、光柱為偏藍的月光；alone 而拱門還接著房 = 2D 畫虛線圓：光到了、花還不開)
// - 3D：光照進來時，從那扇窗 (def.beam) 斜射到花上的一道淡光柱 (加色混合、不寫深度；亮度約 1 秒緩入緩出，不閃爍——規格 9.1 光敏)；
//   白光淡白、穿過玻璃的光淡金綠；花在光裡有一圈淡光
// - 2D：只在花上畫光點，形狀區分 (規格 7.2)：穿過玻璃的光 = 實心八角星、白光 = 虛線空心圓、光不夠 = 細實線空心圓
// 主題材質 (pal.crate / crateDark / shelf)；同材質零件合成一個網格 (mergeParts)

const LEAF = 0x5f8a3a;
const SOIL = 0x3b2a1e;
const BUD = 0x3f6a3a;
const BUD_TIP = 0x8a5a9a;
const PETAL = 0xf2d98a;
const HEART = 0xd9a441;
/** 光柱的色：白光 / 穿過彩繪玻璃的光 */
const WHITE_LIGHT = 0xfff8e6;
const STAINED_LIGHT = 0xd8f0a0;
/** 月光 (夜溫室的天光偏藍白；mount 'planter' 的月下美人) 與月下美人的白花 */
const MOON_LIGHT = 0xcfe0ff;
const MOON_PETAL = 0xf7f5ee;
const MOON_HEART = 0xe8e0a8;
/** 圓形花台 (mount 'planter')：半徑、高 */
const PLANTER_R = 0.56;
const PLANTER_H = 0.45;
/** 2D 光點的色 */
const SPOT_LIT = 0xd9a441;
const SPOT_DIM = 0x8a7a5a;
/** 光柱的不透明度 (最亮時) 與緩入緩出的速度 (每秒) */
const SHAFT_ALPHA = 0.2;
const FADE = 1.2;

type Light = 'dark' | 'white' | 'weak' | 'lit';
const SIDE_DIR: Readonly<Record<string, readonly [number, number]>> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

/**
 * 這朵花此刻的光 (同 core/chapter lightState——render 只能 import 核心的查詢函式，這裡照同一規則讀 World.ext.light)
 */
function lightOf(c: ModelCtx, d: ObjDef): Light {
  if (d.type !== 'sensor') return 'dark';
  const mine = (c.world.ext.light?.hits ?? []).filter(h => h.from === d.from);
  if (!mine.length) return 'dark';
  if (mine.some(h => h.via >= d.via)) return 'lit';
  return mine.some(h => h.via > 0) ? 'weak' : 'white';
}

/** 八角星 (2D 光點：穿過玻璃的光) */
function star(r: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 2;
    const k = i % 2 ? r * 0.45 : r;
    if (i) s.lineTo(Math.cos(a) * k, Math.sin(a) * k); else s.moveTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  return new THREE.ShapeGeometry(s);
}

/** 虛線空心圓 (2D 光點：白光)：八段短弧 */
function dashedRing(r: number): THREE.BufferGeometry {
  return mergeParts(Array.from({ length: 8 }, (_, i) => new THREE.RingGeometry(r * 0.82, r, 4, 1, (i / 8) * Math.PI * 2, Math.PI / 8)));
}

export function sensorModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const { pal } = theme;
  const g = new THREE.Group();
  if (d.type !== 'sensor') return { root: g };
  if (d.mount === 'wall') return mossWindowModel(p, d, theme);
  const stand = d.mount === 'stand';
  const planter = d.mount === 'planter';
  const [lx, lz] = SIDE_DIR[d.from] ?? [0, -1];
  // 窗台花架 (mount 'stand')：台面與窗台同高的木花架 (1.9 × 1.6，四腳 + 一圈橫撐)，以花為中心 (殘片 2 放在架上另一端)
  if (stand) {
    const top = 1.9, deep = 1.6, legH = d.y;
    const parts = [placed(new THREE.BoxGeometry(top, 0.06, deep), 0, -0.03, 0)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(placed(new THREE.BoxGeometry(0.07, legH - 0.06, 0.07), sx * (top / 2 - 0.08), -legH / 2 - 0.03, sz * (deep / 2 - 0.08)));
    for (const sz of [-1, 1]) parts.push(placed(new THREE.BoxGeometry(top - 0.2, 0.05, 0.04), 0, -legH * 0.7, sz * (deep / 2 - 0.08)));
    g.add(p.mesh(mergeParts(parts), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark }));
  }
  // 陶盆 (落地大盆 / 花架上的小盆) 或圓形花台 (石砌台身 + 陶磚壓頂) + 土
  const R = planter ? PLANTER_R : stand ? 0.2 : 0.32;
  const PH = planter ? PLANTER_H : stand ? 0.3 : 0.5;
  const pot = planter
    ? p.mesh(new THREE.CylinderGeometry(R, R + 0.04, PH - 0.06, 24), 0x8c8470, { roughness: 0.95 })
    : p.mesh(mergeParts([placed(new THREE.CylinderGeometry(R, R * 0.75, PH, 16), 0, PH / 2, 0), placed(new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.06, 16), 0, PH - 0.02, 0)]), pal.crate, { roughness: 0.9 });
  if (planter) {
    pot.position.y = (PH - 0.06) / 2;
    const cap = p.mesh(new THREE.TorusGeometry(R - 0.02, 0.05, 6, 24), pal.crateDark, { roughness: 0.9, outline: false });
    cap.rotation.x = Math.PI / 2;
    cap.position.y = PH - 0.05;
    g.add(cap);
  }
  const soil = p.mesh(new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.03, planter ? 20 : 14), SOIL, { outline: false, shadow: false });
  soil.position.y = PH - 0.03;
  g.add(pot, soil);
  // 花莖 (從土裡長出、歪向窗；花台 = 朝天窗直直往上) + 兩片葉
  const top = d.h - 0.12;
  const lean = planter ? 0 : stand ? 0.16 : 0.22;
  const tip = new THREE.Vector3(lx * lean, top, lz * lean);
  const stemCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, PH - 0.03, 0), new THREE.Vector3(lx * lean * 0.2, PH + (top - PH) * 0.5, lz * lean * 0.2), tip]);
  const leafA = new THREE.SphereGeometry(0.12, 7, 5); leafA.scale(1.4, 0.35, 0.7);
  const leafB = new THREE.SphereGeometry(0.1, 7, 5); leafB.scale(1.4, 0.35, 0.7);
  const stem = p.mesh(mergeParts([
    new THREE.TubeGeometry(stemCurve, 12, 0.025, 5, false),
    placed(leafA, 0.12, PH + (top - PH) * 0.3, 0.02, 0, 0, 0.4),
    placed(leafB, -0.1, PH + (top - PH) * 0.55, -0.02, 0, Math.PI, 0.35)
  ]), LEAF, { roughness: 0.9 });
  g.add(stem);
  // 花苞 (閉著)：水滴形，尖端帶紫；開花：六片花瓣 + 花心 (兩種剪影都畫，依開合程度切換 / 縮放)
  const head = new THREE.Group();
  head.position.copy(tip);
  if (!planter) head.rotation.set(lz * 0.5, 0, -lx * 0.5);
  head.scale.setScalar(planter ? 1.9 : 1.5);
  g.add(head);
  const budGeo = new THREE.SphereGeometry(0.11, 10, 8); budGeo.scale(1, 1.7, 1);
  const bud = p.mesh(placed(budGeo, 0, 0.12, 0), BUD, { roughness: 0.8 });
  const budTip = p.mesh(placed(new THREE.ConeGeometry(0.07, 0.12, 8), 0, 0.3, 0), BUD_TIP, { roughness: 0.8, outline: false });
  head.add(bud, budTip);
  const petals = new THREE.Group();
  head.add(petals);
  const petalGeo = new THREE.SphereGeometry(0.12, 8, 6); petalGeo.scale(0.55, 0.12, 1.3); petalGeo.translate(0, 0, 0.15);
  const petalMesh = p.mesh(mergeParts(Array.from({ length: 6 }, (_, i) => placed(petalGeo.clone(), 0, 0.06, 0, 0, (i / 6) * Math.PI * 2, 0))), planter ? MOON_PETAL : PETAL, { roughness: 0.7, emissive: planter ? MOON_PETAL : PETAL, emissiveIntensity: planter ? 0.3 : 0.15 });
  const heart = p.mesh(placed(new THREE.SphereGeometry(0.07, 10, 8), 0, 0.08, 0), planter ? MOON_HEART : HEART, { roughness: 0.7, outline: false });
  petals.add(petalMesh, heart);
  // 3D：花在光裡的一圈淡光；從窗斜射到花上的光柱 (兩模式材質不同：只在實景顯示)
  const halo = glowSprite(glow(), planter ? MOON_LIGHT : STAINED_LIGHT, 0.9, 0, true);
  halo.position.copy(tip).add(new THREE.Vector3(0, 0.18, 0));
  g.add(halo);
  let shaft: THREE.Mesh | null = null;
  let shaftMat: THREE.MeshBasicMaterial | null = null;
  if (d.beam) {
    const from = new THREE.Vector3(d.beam[0] - d.x, d.beam[1] - d.y, d.beam[2] - d.z);
    const to = tip.clone().add(new THREE.Vector3(0, 0.18, 0));
    const len = from.distanceTo(to);
    const geo = new THREE.CylinderGeometry(0.55, 0.28, len, 16, 1, true);
    shaftMat = new THREE.MeshBasicMaterial({ color: STAINED_LIGHT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    shaft = new THREE.Mesh(geo, shaftMat);
    shaft.position.copy(from).add(to).multiplyScalar(0.5);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
    shaft.renderOrder = 2;
    g.add(shaft);
  }
  // 2D 光點 (畫在花頭前方、朝向鏡頭)：三種形狀各一個網格，只切可見性
  const spot = new THREE.Group();
  spot.position.copy(tip).add(new THREE.Vector3(0, 0.22, d.d / 2 + 0.08));
  const spotLit = p.mesh(star(0.2), SPOT_LIT, { outline: false, shadow: false });
  const spotWhite = p.mesh(dashedRing(0.2), SPOT_DIM, { outline: false, shadow: false });
  const spotWeak = p.mesh(new THREE.RingGeometry(0.17, 0.2, 24), SPOT_DIM, { outline: false, shadow: false });
  spot.add(spotLit, spotWhite, spotWeak);
  g.add(spot);
  let open = -1;
  let alpha = 0;
  const update = (c: ModelCtx) => {
    const s = lightOf(c, d);
    // alone 的感光物 (月下美人)：光到了但拱門還接著房 = 2D 畫虛線圓 (光到了、花還不開；同 mechanics/light sensorLight 的 crowd)
    const crowd = s === 'lit' && d.type === 'sensor' && !!d.alone && Object.values(c.world.ext.cube?.links ?? {}).some(l => l.to === 'room');
    // 開合 (平滑；第一次 = 直接到位，讀檔 / 換房不重播)
    const goal = c.obj.used ? 1 : 0;
    open = open < 0 ? goal : open + (goal - open) * Math.min(1, c.dt * (c.calm ? 1.5 : 3));
    bud.visible = budTip.visible = open < 0.5;
    petals.visible = open >= 0.15;
    petals.scale.setScalar(Math.max(0.15, open));
    bud.scale.setScalar(1 - open * 0.6);
    // 光：亮度緩入緩出 (每秒最多變 FADE；不閃爍)
    const want = s === 'dark' ? 0 : 1;
    alpha += Math.max(-FADE * c.dt, Math.min(FADE * c.dt, want - alpha));
    const is3d = c.mode === '3d';
    if (shaft && shaftMat) {
      shaft.visible = is3d && alpha > 0.01;
      shaftMat.color.setHex(s === 'white' ? WHITE_LIGHT : STAINED_LIGHT);
      shaftMat.opacity = SHAFT_ALPHA * alpha * (s === 'white' ? 0.7 : 1);
    }
    if (planter) shaftMat?.color.setHex(MOON_LIGHT);
    halo.visible = is3d && alpha > 0.01 && (s !== 'white' || planter);
    halo.material.opacity = 0.35 * alpha;
    spot.visible = !is3d && s !== 'dark';
    spotLit.visible = s === 'lit' && !crowd;
    spotWhite.visible = s === 'white' || crowd;
    spotWeak.visible = s === 'weak';
  };
  return { root: g, update };
}

/** 苔窗的玻璃 (苔綠)、窗框上的苔、窗上浮出的字 (淡金) */
const MOSS_GLASS = 0x6f9a52;
const MOSS = 0x5f7d3a;
const WRITING = 0xf2d98a;

/**
 * 苔窗 (mount 'wall'；3-4b)：西牆上的彩繪玻璃窗 (鐵框 2 × 2、苔綠玻璃、框上一圈苔)，沒有花。原點 = 窗的底邊中心，窗面朝 +x (房內)。
 * 光：從窗 (def.beam) 斜射進房的一道淡光柱 (同感光花：1 秒緩入緩出、不閃爍)；閂住後玻璃上浮出爸爸的字 (幾道淡金的筆畫)；
 * 2D 只畫光點 (形狀區分同感光花：實心八角星 / 虛線空心圓 / 細實線空心圓)
 */
function mossWindowModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  if (d.type !== 'sensor') return { root: g };
  const H = d.h, D = d.d, bar = 0.07, fx = -0.04;
  const frame = [
    placed(new THREE.BoxGeometry(0.06, bar, D + bar), fx, H, 0), placed(new THREE.BoxGeometry(0.06, bar, D + bar), fx, 0, 0),
    placed(new THREE.BoxGeometry(0.06, H, bar), fx, H / 2, -D / 2), placed(new THREE.BoxGeometry(0.06, H, bar), fx, H / 2, D / 2),
    placed(new THREE.BoxGeometry(0.05, H - bar, bar * 0.7), fx + 0.005, H / 2, 0), placed(new THREE.BoxGeometry(0.05, bar * 0.7, D - bar), fx + 0.005, H / 2, 0)
  ];
  g.add(p.mesh(mergeParts(frame), pal.iron, { metalness: 0.5, roughness: 0.55, outline: false }));
  const glass = p.mesh(placed(new THREE.PlaneGeometry(D - bar, H - bar), fx - 0.02, H / 2, 0, 0, Math.PI / 2, 0), MOSS_GLASS, { opacity: 0.7, emissive: MOSS_GLASS, emissiveIntensity: 0.35, outline: false, shadow: false });
  g.add(glass);
  const tufts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const s = new THREE.SphereGeometry(0.09 + (i % 3) * 0.03, 7, 5);
    s.scale(0.6, 0.8, 1.3);
    tufts.push(placed(s, 0.02, i % 2 ? H - 0.02 : 0.02, -D / 2 + t * D));
  }
  g.add(p.mesh(mergeParts(tufts), MOSS, { roughness: 1, outline: false }));
  // 爸爸的字：玻璃上幾道淡金的筆畫 (閂住後才看得到)
  const strokes: THREE.BufferGeometry[] = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) strokes.push(placed(new THREE.PlaneGeometry(0.22 - (i % 2) * 0.06, 0.035), fx + 0.01, H * 0.72 - row * 0.32, -0.6 + i * 0.36, (i % 3 - 1) * 0.5, Math.PI / 2, 0));
  const writing = p.mesh(mergeParts(strokes), WRITING, { emissive: WRITING, emissiveIntensity: 0.6, outline: false, shadow: false });
  g.add(writing);
  // 光柱：從窗中心斜射到房內地上
  let shaft: THREE.Mesh | null = null;
  let shaftMat: THREE.MeshBasicMaterial | null = null;
  if (d.beam) {
    const from = new THREE.Vector3(d.beam[0] - d.x, d.beam[1] - d.y, d.beam[2] - d.z);
    const to = new THREE.Vector3(2.6, -d.y + 0.1, 0);
    const geo = new THREE.CylinderGeometry(0.7, 0.4, from.distanceTo(to), 16, 1, true);
    shaftMat = new THREE.MeshBasicMaterial({ color: STAINED_LIGHT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    shaft = new THREE.Mesh(geo, shaftMat);
    shaft.position.copy(from).add(to).multiplyScalar(0.5);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
    shaft.renderOrder = 2;
    g.add(shaft);
  }
  const spot = new THREE.Group();
  spot.position.set(0.45, H / 2, D / 2 + 0.08);
  const spotLit = p.mesh(star(0.22), SPOT_LIT, { outline: false, shadow: false });
  const spotWhite = p.mesh(dashedRing(0.22), SPOT_DIM, { outline: false, shadow: false });
  const spotWeak = p.mesh(new THREE.RingGeometry(0.19, 0.22, 24), SPOT_DIM, { outline: false, shadow: false });
  spot.add(spotLit, spotWhite, spotWeak);
  g.add(spot);
  let alpha = 0;
  let ink = -1;
  const update = (c: ModelCtx) => {
    const s = lightOf(c, d);
    const want = s === 'dark' ? 0 : 1;
    alpha += Math.max(-FADE * c.dt, Math.min(FADE * c.dt, want - alpha));
    const is3d = c.mode === '3d';
    if (shaft && shaftMat) { shaft.visible = is3d && alpha > 0.01; shaftMat.opacity = SHAFT_ALPHA * alpha * (s === 'lit' ? 1 : 0.6); }
    const goal = c.obj.used ? 1 : 0;
    ink = ink < 0 ? goal : ink + (goal - ink) * Math.min(1, c.dt * (c.calm ? 1 : 2));
    writing.visible = is3d && ink > 0.5;
    spot.visible = !is3d && s !== 'dark';
    spotLit.visible = s === 'lit';
    spotWhite.visible = s === 'white';
    spotWeak.visible = s === 'weak';
  };
  return { root: g, update };
}
