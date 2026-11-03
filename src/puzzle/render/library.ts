import * as THREE from 'three';
import type { Painter } from './materials';
import type { Palette } from './themes';
import { bookRow } from './textures';

// 森林圖書館 (第二章) 的共用外觀：一座書櫃 = 背板 + 立柱 + 層板 + 一排一排的書 (書是貼圖平面，不是一本一本的網格：書牆整面都是書，網格數要省)
// 屋框書牆 (models/shelf bayShelfModel) 與占位房的書櫃 (decor/library bookcaseDecor) 共用

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** 層板頂面高度 (第一層 = 0.8：2-1 的燈書與書擋就站在這一層) */
export const SHELF_LEVELS: readonly number[] = [0.8, 1.9, 3.0, 4.1, 5.2];
const BOARD_H = 0.06;

export interface BookcaseOpts {
  w: number; h: number; d: number;
  /** 書的配色種子 */
  seed: number;
  /** 不放書的直欄 (x，相對書櫃中心；寬 1.1)：讓出來放物件 */
  gaps?: readonly number[];
  /** 柱距 */
  bay?: number;
  /** 兩種書 (back = 書背朝牆，只看得到書口；spine = 書背朝外)；未給 = 只有 spine */
  backs?: boolean;
  /** 藏寶圖裡的淡色 (書櫃是背景、不是平台：層板 / 立柱 = board，書 = row 的扁平色、不貼書的圖)；未給 = 2D 也貼圖 */
  pale?: { board: number; row: number };
}

export interface Bookcase { root: THREE.Group; backs: THREE.Mesh[]; spines: THREE.Mesh[] }

/** 一排書的平面 (UV 依長度重複貼圖) */
function rowPlane(p: Painter, tex: THREE.Texture, len: number, h: number, flat: number | null): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(len, h);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 2.4));
  uv.needsUpdate = true;
  return p.mesh(geo, 0xffffff, { map: tex, flat: flat ?? 0xffffff, flatMap: flat === null, outline: false, shadow: false });
}

/** 一座書櫃 (原點 = 底面中心、正面朝 +z) */
export function buildBookcase(p: Painter, pal: Palette, o: BookcaseOpts): Bookcase {
  const g = new THREE.Group();
  const { w, h, d } = o;
  const pb = o.pale?.board;
  // 背板比立柱窄 / 矮 2 cm：頂面與兩端不和立柱共面
  const back = p.mesh(box(w - 0.02, h - 0.02, 0.06), pal.shelfDark, { outline: false, ...(pb !== undefined ? { flat: o.pale!.row } : {}) });
  back.position.set(0, (h - 0.02) / 2, -d / 2 + 0.03);
  g.add(back);
  const span = o.bay ?? 2.5;
  const posts: number[] = [];
  for (let x = -w / 2; x <= w / 2 + 1e-6; x += span) posts.push(Math.min(x, w / 2));
  if (posts[posts.length - 1] < w / 2 - 1e-6) posts.push(w / 2);
  for (const x of posts) {
    const post = p.mesh(box(0.12, h, d), pal.shelf, { outline: pb === undefined && (x === posts[0] || x === posts[posts.length - 1]), ...(pb !== undefined ? { flat: pb } : {}) });
    post.position.set(Math.max(-w / 2 + 0.06, Math.min(w / 2 - 0.06, x)), h / 2, 0);
    g.add(post);
  }
  const levels = SHELF_LEVELS.filter(y => y < h - 0.2);
  for (const y of levels) {
    const board = p.mesh(box(w - 0.02, BOARD_H, d - 0.02), pal.shelf, { outline: false, ...(pb !== undefined ? { flat: pb } : {}) });
    board.position.set(0, y - BOARD_H / 2, 0);
    g.add(board);
  }
  // 書：每層一排 (層板之間；高度到上一層板下 0.12)，避開 gaps 與立柱
  const backs: THREE.Mesh[] = [];
  const spines: THREE.Mesh[] = [];
  const gaps = (o.gaps ?? []).map(x => [x - 0.55, x + 0.55] as const);
  const cuts = [...posts.map(x => [x - 0.06, x + 0.06] as const), ...gaps].sort((a, b) => a[0] - b[0]);
  levels.forEach((y, i) => {
    const top = i + 1 < levels.length ? levels[i + 1] - BOARD_H - 0.12 : Math.min(h - 0.15, y + 0.75);
    const rh = top - y;
    if (rh < 0.25) return;
    let x0 = -w / 2;
    const segs: Array<[number, number]> = [];
    for (const [a, b] of cuts) { if (a > x0 + 0.05) segs.push([x0, a]); x0 = Math.max(x0, b); }
    if (w / 2 > x0 + 0.05) segs.push([x0, w / 2]);
    for (const [a, b] of segs) {
      const len = b - a;
      for (const look of o.backs ? ['back', 'spine'] as const : ['spine'] as const) {
        const m = rowPlane(p, bookRow(pal, o.seed + i * 7, look), len, rh, o.pale ? o.pale.row : null);
        m.position.set((a + b) / 2, y + rh / 2, d / 2 - 0.12);
        g.add(m);
        (look === 'back' ? backs : spines).push(m);
      }
    }
  });
  return { root: g, backs, spines };
}
