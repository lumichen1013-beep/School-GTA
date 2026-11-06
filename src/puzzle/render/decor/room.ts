import * as THREE from 'three';
import type { Painter } from '../materials';
import { glowSprite } from '../materials';
import type { Theme } from '../themes';
import { glow, painting, rug, stoneBlocks, wallpaper } from '../textures';
import { num } from './fields';
import { mergeParts, placed } from '../geometry';
import type { DecorFactory } from './types';

// 房間裝飾 (S7 前寫死在 render/models/room.ts 的 buildDecor；座標改由關卡資料 LevelDef.decor 提供)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** 房間牆高 (吊燈吊線也從這裡垂下) */
export const WALL_H = 6;
/** 牆面飾條兩端凸出量 (避免與護牆板端面共面而深度打架) */
const TRIM_OVERHANG = 0.01;
/** 圖紙裡把背景牆 (與掛畫) 往後推的距離：貼牆物件 (高台、門、紙條) 的描邊才不會被牆面蓋住 */
const PUSH_2D = 0.8;

/**
 * 一面牆：壁紙 + 護牆板 (分格) + 腰線 + 踢腳線 + 頂線；原點在牆底中央、正面朝 +z。
 * v0.4 第四章 stone = 石砌牆 (方石紋理、沒有護牆板分格；石基與鐵飾條照主題色)
 */
function wallSide(p: Painter, { pal, room2d: BG2D }: Theme, len: number, stone = false): THREE.Group {
  const g = new THREE.Group();
  const tex = stone ? stoneBlocks(pal, len / 2.4, WALL_H / 1.0) : wallpaper(pal, len / 1.2, WALL_H / 1.2);
  // 藏寶圖照舊是素紙 (石紋只在實景)
  const paper = p.mesh(new THREE.PlaneGeometry(len, WALL_H), 0xffffff, { map: tex, flat: BG2D.paper, flatMap: !stone, outline: false });
  paper.position.y = WALL_H / 2;
  const wains = p.mesh(box(len, 1.1, 0.06), pal.wainscot, { flat: BG2D.wainscot, outline: false });
  wains.position.set(0, 0.55, 0.03);
  // 腰線 / 踢腳線 / 頂線兩端各多出 TRIM_OVERHANG，端面不與護牆板端面共面 (側牆前端看得到)
  const trimLen = len + TRIM_OVERHANG * 2;
  const rail = p.mesh(box(trimLen, 0.07, 0.1), pal.trim, { flat: BG2D.trim, outline: false });
  rail.position.set(0, 1.12, 0.05);
  const base = p.mesh(box(trimLen, 0.16, 0.1), pal.baseboard, { flat: BG2D.trim, outline: false });
  base.position.set(0, 0.08, 0.05);
  const crown = p.mesh(box(trimLen, 0.12, 0.12), pal.trim, { flat: BG2D.trim, outline: false });
  // 頂面比牆頂低 5mm：不與貼牆的隔牆壁紙頂面 (y = 牆高) 共面
  crown.position.set(0, WALL_H - 0.065, 0.06);
  g.add(paper, wains, rail, base, crown);
  // 護牆板分格 (同材質合成一個網格：外框一個、內嵌一個；v0.4 H1 起，省繪製次數，外觀不變)
  const panels: THREE.BufferGeometry[] = [];
  const insets: THREE.BufferGeometry[] = [];
  for (let a = -len / 2 + 0.9; !stone && a < len / 2 - 0.4; a += 1.6) {
    panels.push(placed(box(1.2, 0.7, 0.02), a + 0.4, 0.58, 0.065));
    insets.push(placed(box(1.08, 0.58, 0.022), a + 0.4, 0.58, 0.068));
  }
  if (panels.length) {
    g.add(p.mesh(mergeParts(panels), pal.trim, { flat: BG2D.trim, outline: false, shadow: false }));
    g.add(p.mesh(mergeParts(insets), pal.wainscot, { flat: BG2D.wainscot, outline: false, shadow: false }));
  }
  return g;
}

/** walls：後牆 + 左右側牆 (沿關卡 bounds；側牆只在現實)；欄位 stone (選填，1 = 石砌牆：第四章地下室) */
export const wallsDecor: DecorFactory = (p, item, { level, theme }) => {
  const b = level.bounds;
  const W = b.maxX - b.minX;
  const D = b.maxZ - b.minZ;
  const stone = item.stone === 1;
  const root = new THREE.Group();
  const back = wallSide(p, theme, W, stone);
  back.position.set((b.minX + b.maxX) / 2, 0, b.minZ);
  const left = wallSide(p, theme, D, stone);
  left.position.set(b.minX, 0, (b.minZ + b.maxZ) / 2);
  left.rotation.y = Math.PI / 2;
  const right = wallSide(p, theme, D, stone);
  right.position.set(b.maxX, 0, (b.minZ + b.maxZ) / 2);
  right.rotation.y = -Math.PI / 2;
  root.add(back, left, right);
  return { root, only3d: [left, right], update: (_t, is2d) => { back.position.z = b.minZ - (is2d ? PUSH_2D : 0); } };
};

/** painting：後牆上的框畫 (圖紙裡隨後牆往後推)；欄位 x、y (畫中心)、w、h (畫布)、variant (0～2 風景) */
export const paintingDecor: DecorFactory = (p, item, { level, theme: { pal, room2d: BG2D } }) => {
  const w = num(item, 'w');
  const h = num(item, 'h');
  const wz = level.bounds.minZ + 0.05;
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), num(item, 'y'), wz);
  const frame = p.mesh(box(w + 0.16, h + 0.16, 0.06), pal.trim, { flat: BG2D.trim, outline: false });
  const inner = p.mesh(box(w + 0.05, h + 0.05, 0.065), pal.gold, { flat: BG2D.frameGold, outline: false, metalness: 0.4, roughness: 0.4 });
  const canvasMesh = p.mesh(new THREE.PlaneGeometry(w, h), 0xffffff, { map: painting(num(item, 'variant', 0)), flat: BG2D.canvas, flatMap: true, outline: false, shadow: false });
  canvasMesh.position.z = 0.036;
  g.add(frame, inner, canvasMesh);
  return { root: g, update: (_t, is2d) => { g.position.z = wz - (is2d ? PUSH_2D : 0); } };
};

/**
 * wallShelf：後牆上的書架 (高於跳躍可及高度，純裝飾；圖紙裡容易被誤認成平台，只在現實顯示)；
 * 欄位 x、y (層板中心)、w、seed (書本寬高 / 顏色變化)
 */
export const wallShelfDecor: DecorFactory = (p, item, { level, theme: { pal } }) => {
  const w = num(item, 'w');
  const seed = num(item, 'seed', 0);
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), num(item, 'y'), level.bounds.minZ + 0.15);
  const board = p.mesh(box(w, 0.06, 0.3), pal.shelf);
  const brackets = [-w / 2 + 0.2, w / 2 - 0.2].map(bx => {
    const b = p.mesh(box(0.05, 0.2, 0.25), pal.shelfDark, { outline: false });
    b.position.set(bx, -0.12, -0.02);
    return b;
  });
  g.add(board, ...brackets);
  let bx = -w / 2 + 0.08;
  let i = 0;
  while (bx < w / 2 - 0.15) {
    const bw = 0.07 + ((seed * 7 + i * 13) % 5) * 0.012;
    const bh = 0.26 + ((seed + i * 5) % 4) * 0.035;
    const b = p.mesh(box(bw, bh, 0.22), pal.books[(seed + i) % pal.books.length], { outline: false });
    b.position.set(bx + bw / 2, 0.03 + bh / 2, 0);
    g.add(b);
    bx += bw + 0.01;
    i++;
  }
  return { root: g, only3d: [g] };
};

/** rug：地毯 (只在現實)；欄位 x、z (中心)、w、d */
export const rugDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const r = p.mesh(new THREE.PlaneGeometry(num(item, 'w'), num(item, 'd')), 0xffffff, { map: rug(pal), outline: false });
  r.rotation.x = -Math.PI / 2;
  r.position.set(num(item, 'x'), 0.006, num(item, 'z'));
  return { root: r, only3d: [r] };
};

/** pendant：從天花板垂下的吊燈 (燈罩在圖紙裡當淡色背景；光暈與點光只在現實；擋視線時淡出)；欄位 x、z */
export const pendantDecor: DecorFactory = (p, item, { theme: { pal, room2d: BG2D }, nth }) => {
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  const cord = p.mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 6), pal.cord, { flat: BG2D.trim, outline: false, shadow: false, unique: true });
  cord.position.y = WALL_H - 0.7;
  const shade = p.mesh(new THREE.ConeGeometry(0.42, 0.38, 20, 1, true), pal.lampShade, { flat: BG2D.shade, outline: false, side: THREE.DoubleSide, emissive: pal.lampShade, emissiveIntensity: 0.25, shadow: false, unique: true });
  shade.position.y = WALL_H - 1.55;
  const cap = p.mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.1, 10), pal.trim, { flat: BG2D.trim, outline: false, shadow: false, unique: true });
  cap.position.y = WALL_H - 1.36;
  const bulb = p.mesh(new THREE.SphereGeometry(0.11, 12, 10), pal.lampBulb, { flat: BG2D.bulb, emissive: pal.lampBulb, emissiveIntensity: 1.2, outline: false, shadow: false, unique: true });
  bulb.position.y = WALL_H - 1.72;
  const halo = glowSprite(glow(), pal.lampLight, 1.3, 0.5, true);
  halo.position.y = WALL_H - 1.75;
  const light = new THREE.PointLight(pal.lampLight, 9, 11, 1.4);
  light.position.y = WALL_H - 1.9;
  g.add(cord, shade, cap, bulb, halo, light);
  return {
    root: g,
    only3d: [light, halo],
    // 吊燈在鏡頭與玩家之間時淡出
    occluders: [cord, shade, cap, bulb],
    // 光暈微微閃爍，各盞依序錯開相位
    update: t => { halo.material.opacity = 0.42 + 0.06 * Math.sin(t * 2 + nth); }
  };
};

/** pits：相鄰地板 (type floor) 之間的缺口底下放一塊暗色，看起來深不見底 (只在現實)；欄位：無 */
export const pitsDecor: DecorFactory = (p, _item, { level, theme: { pal } }) => {
  const b = level.bounds;
  const D = b.maxZ - b.minZ;
  const root = new THREE.Group();
  const floors = level.objects.filter(o => o.type === 'floor').sort((a, c) => a.x - c.x);
  for (let i = 0; i + 1 < floors.length; i++) {
    const x0 = floors[i].x + floors[i].w / 2;
    const x1 = floors[i + 1].x - floors[i + 1].w / 2;
    if (x1 - x0 < 0.1) continue;
    const pit = p.mesh(new THREE.PlaneGeometry(x1 - x0, D), pal.pit, { outline: false, shadow: false });
    pit.rotation.x = -Math.PI / 2;
    pit.position.set((x0 + x1) / 2, -3.2, (b.minZ + b.maxZ) / 2);
    root.add(pit);
  }
  return { root, only3d: [root] };
};
