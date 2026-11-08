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

const PAPER = 0xefe4c8;
const BEAM = 0xf2dda6;
/** 光帶偏一格時落在紙邊外的距離 */
const OFF = 0.55;

/**
 * 焦點 starFocus：底盤正中央的黃銅八角星座 + 放紙的淺槽；紙放上 (obj.touched) = 一頁米色紙；三道光 = 三條細光帶從天花板斜落到紙上
 * (東 / 西 / 北各從自己那一側斜下來)：看得見星星且窗縫對 = 落在紙中央、窗縫不對 = 落在紙邊外 OFF、看不見星星 = 不畫。5-5b 完成之前光還沒落下 (都不畫)
 */
export function starFocusModel(p: Painter, d: ObjDef, _t: Theme): PropModel {
  const g = new THREE.Group();
  if (d.type !== 'starFocus') return { root: g };
  const star: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    star.push(placed(box(0.08, 0.03, 0.42), Math.cos(a) * 0.2, 0.015, Math.sin(a) * 0.2, 0, -a + Math.PI / 2, 0));
  }
  star.push(placed(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 16), 0, 0.0175, 0));
  g.add(p.mesh(mergeParts(star), BRASS, { metalness: 0.65, roughness: 0.35, outline: false, shadow: false }));
  const paper = p.mesh(box(0.42, 0.006, 0.56), PAPER, { roughness: 0.95, outline: false, shadow: false });
  paper.position.set(0, 0.04, 0);
  paper.visible = false;
  g.add(paper);
  // 三條光帶 (細長方塊，從上方斜落)：東 = 從 +x 斜下、西 = 從 −x、北 = 從 −z (後牆) 斜下
  const dirs: Record<string, [number, number]> = { east: [1, 0], west: [-1, 0], north: [0, -1] };
  const beams = d.order.map(room => {
    const m = p.mesh(box(0.05, 3.0, 0.05), BEAM, { emissive: BEAM, emissiveIntensity: 0.8, outline: false, shadow: false, unique: true, opacity: 0.7 });
    m.visible = false;
    g.add(m);
    return { room, m, dir: dirs[room] ?? [0, -1] };
  });
  const update = (c: ModelCtx) => {
    if (c.obj.def.type !== 'starFocus') return;
    paper.visible = c.obj.touched && !c.obj.used;
    const st = c.world.ext.starlight;
    const on = !!c.world.byId.get(c.obj.def.after)?.used;
    for (const b of beams) {
      const lit = on && !!st?.lit.includes(b.room);
      b.m.visible = lit;
      if (!lit) continue;
      const off = st!.good.includes(b.room) ? 0 : OFF;
      // 光帶的下端落在 (off 偏移後) 紙面上；整條往來的方向傾 0.35 弧度
      const fx = b.dir[0] * off, fz = b.dir[1] * off;
      const tilt = 0.35;
      b.m.rotation.set(b.dir[1] * tilt, 0, -b.dir[0] * tilt);
      b.m.position.set(fx + b.dir[0] * Math.sin(tilt) * 1.5, 0.05 + Math.cos(tilt) * 1.5, fz + b.dir[1] * Math.sin(tilt) * 1.5);
    }
  };
  return { root: g, update };
}

/**
 * 驚嚇 engineScare (5-5c 開始時；本章唯一一次)：三道殘影同時出現在三道光槽前 (許問津、爸爸、你)，1.2 秒淡入、停 2 秒、4 秒慢慢淡去；
 * calm = 只有中間一道，2 秒淡入、4 秒淡出。不閃爍 (亮度單調變化)；完全淡出後不畫。剪影同 chaserModel (半透明灰藍)
 */
export function engineScareModel(_p: Painter, d: ObjDef, _t: Theme): PropModel {
  const g = new THREE.Group();
  const H = d.h;
  const figureGeo = () => mergeParts([
    placed(new THREE.CircleGeometry(0.16, 18), 0, H - 0.17, 0),
    placed(new THREE.PlaneGeometry(0.44, 0.78), 0, H * 0.56, 0),
    placed(new THREE.PlaneGeometry(0.16, 0.5), -0.11, 0.27, 0),
    placed(new THREE.PlaneGeometry(0.16, 0.5), 0.11, 0.27, 0)
  ]);
  const mat = new THREE.MeshBasicMaterial({ color: CHASER_TINT, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const xs = [-d.w / 3, 0, d.w / 3];
  const figs = xs.map(x => { const m = new THREE.Mesh(figureGeo(), mat); m.position.set(x, 0, 0); m.renderOrder = 2; m.visible = false; g.add(m); return m; });
  let t = -1;
  const update = (c: ModelCtx) => {
    if (!c.obj.used) { t = -1; for (const f of figs) f.visible = false; return; }
    t = t < 0 ? 0 : t + Math.max(0, c.dt);
    const calm = !!c.calm;
    const [fin, hold, fout] = calm ? [2, 0, 4] : [1.2, 2, 4];
    const a = t < fin ? t / fin : t < fin + hold ? 1 : Math.max(0, 1 - (t - fin - hold) / fout);
    mat.opacity = a * CHASER_PEAK;
    figs.forEach((f, i) => { f.visible = a > 0.005 && (!calm || i === 1); });
  };
  return { root: g, update };
}
/** 殘影的色與最濃的不透明度 (同 chaserModel) */
const CHASER_TINT = 0x8a96b0;
const CHASER_PEAK = 0.4;

/**
 * 窗縫儀 slitPane：窗邊一片黃銅框的小窗格 (面向觀眾，兩個視角都看得到)：中央一道直縫 (本地上下，永遠是直的)、窗外一條地平線
 * 依此刻朝向畫成橫 (窗縫直) 或直 (窗縫橫：和地平線疊在一起)；窗朝著天上 = 只有星點、看不見星星 = 窗格全暗
 */
export function slitPaneModel(p: Painter, d: ObjDef, _t: Theme): PropModel {
  const g = new THREE.Group();
  if (d.type !== 'slitPane') return { root: g };
  const W = d.w, H = d.h;
  const frame = mergeParts([
    placed(box(W, 0.04, 0.04), 0, 0.02, 0), placed(box(W, 0.04, 0.04), 0, H - 0.02, 0),
    placed(box(0.04, H, 0.04), -W / 2 + 0.02, H / 2, 0), placed(box(0.04, H, 0.04), W / 2 - 0.02, H / 2, 0)
  ]);
  g.add(p.mesh(frame, BRASS, { metalness: 0.6, roughness: 0.4, outline: false, shadow: false }));
  const sky = p.mesh(box(W - 0.08, H - 0.08, 0.01), 0x1f2547, { roughness: 0.9, outline: false, shadow: false, unique: true });
  sky.position.set(0, H / 2, -0.01);
  g.add(sky);
  const horizon = p.mesh(box(W - 0.1, 0.025, 0.012), 0xc9b27f, { emissive: 0xc9b27f, emissiveIntensity: 0.4, outline: false, shadow: false });
  horizon.position.set(0, H / 2, 0.0);
  g.add(horizon);
  const stars = p.mesh(mergeParts([[-0.12, 0.15], [0.1, 0.2], [0.05, -0.12], [-0.08, -0.18]].map(([x, y]) => placed(box(0.025, 0.025, 0.01), x, H / 2 + y, 0.002))), 0xe6e9f2, { emissive: 0xe6e9f2, emissiveIntensity: 0.6, outline: false, shadow: false });
  g.add(stars);
  const slit = p.mesh(box(0.03, H - 0.12, 0.014), 0x2a2018, { roughness: 0.9, outline: false, shadow: false });
  slit.position.set(0, H / 2, 0.006);
  g.add(slit);
  const update = (c: ModelCtx) => {
    if (c.obj.def.type !== 'slitPane') return;
    const st = c.world.ext.starlight;
    const room = c.obj.def.room;
    const lit = !!st?.lit.includes(room);
    const up = st?.faces[room] === 'U';
    stars.visible = lit;
    horizon.visible = lit && !up;
    // 窗縫直 = 地平線橫著穿過它；窗縫橫 = 地平線轉成和窗縫疊在一起 (在這片窗格上是直的)
    horizon.rotation.z = st?.slits[room] === 'h' ? Math.PI / 2 : 0;
  };
  return { root: g, update };
}
