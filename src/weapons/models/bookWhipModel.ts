import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WeaponModelHandle } from '../types';
import { mountOnHand } from './batModels';

// 綁帶捆書：握把 + 3 節綁帶合併為 1 個 mesh (頂點色烘焙)，鞭端一疊書 (3 個 box) 合併為 1 個 mesh，共 2 個 mesh、約 100 三角形，不投影。
// 出招時由拖尾進度驅動 (glow 的 k) 把綁帶沿 Y 軸拉長、書堆跟著外移，表現甩鞭拉長。模型本地 Y 軸：握把 0 ~ 0.3、綁帶 0.3 ~ 1.44、書堆中心 1.56。
const GRIP_LEN = 0.3;
const STRAP_SEGMENTS = 3;
const STRAP_LEN = 0.38;
const BOOK_Y = GRIP_LEN + STRAP_SEGMENTS * STRAP_LEN + 0.12;
const MAX_STRETCH = 0.28; // 甩到最長時綁帶沿 Y 軸多拉的比例

const GRIP_COLOR = 0x3b2a1e;
const STRAP_COLORS = [0xb98a55, 0x8d6a3d, 0xb98a55] as const;
const BOOK_COLORS = [0x2f4f9f, 0xf1ead8, 0xb8403a] as const; // 墨藍、紙白、磚紅

function bake(geo: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function mergeBaked(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

export function buildBookWhip(): WeaponModelHandle {
  const bodyParts: THREE.BufferGeometry[] = [bake(new THREE.CylinderGeometry(0.03, 0.03, GRIP_LEN, 8).translate(0, GRIP_LEN / 2, 0), GRIP_COLOR)];
  for (let i = 0; i < STRAP_SEGMENTS; i++) {
    const y = GRIP_LEN + STRAP_LEN * (i + 0.5);
    bodyParts.push(bake(new THREE.CylinderGeometry(0.014, 0.018, STRAP_LEN, 5, 1, true).translate(0, y, 0), STRAP_COLORS[i]));
  }
  const bookParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    bookParts.push(bake(new THREE.BoxGeometry(0.17, 0.23, 0.05).translate((i - 1) * 0.012, 0, (i - 1) * 0.055), BOOK_COLORS[i]));
  }

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const body = new THREE.Mesh(mergeBaked(bodyParts), mat);
  const books = new THREE.Mesh(mergeBaked(bookParts), mat);
  books.position.y = BOOK_Y;
  body.castShadow = false;
  books.castShadow = false;

  const root = new THREE.Group();
  root.add(body, books);
  mountOnHand(root);
  return {
    parts: { R: root },
    // 以出招拖尾進度 k (0..1) 驅動甩長：整支 mesh 沿 Y 拉伸 (握把同比例微拉長，肉眼不明顯)，書堆外移到鞭端
    glow: (k) => {
      const s = 1 + MAX_STRETCH * k;
      body.scale.y = s;
      books.position.y = BOOK_Y * s;
    },
    resetGlow: () => {
      body.scale.y = 1;
      books.position.y = BOOK_Y;
    }
  };
}
