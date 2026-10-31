import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WeaponModelHandle } from '../types';
import { mountOnHand } from './batModels';

// 玫瑰細劍 (花劍客首勝獎勵)：模型本地 +Y = 劍尖方向、原點在手掌 (mountOnHand 慣例；持劍腕角由 Player 架勢動態改寫)。
// 2 個 mesh = 2 draw calls：劍身 (金屬 Standard，揮擊 / 蓄力時 emissive 脈衝) + 其餘零件烘焙頂點色合成 1 個 Lambert。
// 劍身比 Boss 細劍略粗 (誇大輪廓，第三人稱鏡頭距離仍看得清楚)；不投影。
export const RAPIER_BLADE_BASE = 0.16;
export const RAPIER_BLADE_TIP = 1.16;

const BLADE_COLOR = 0xdfe8f2;   // 銀 (與 Boss 細劍同色系)
const GOLD = 0xe2b33c;          // 杯形護手 / 護桿
const GRIP = 0x5a1024;          // 深酒紅握把
const ROSE = 0xd0103a;          // 玫瑰花苞 / 花飾
const ROSE_LIGHT = 0xff7aa2;    // 花飾外瓣
const LEAF = 0x2f6b3a;          // 萼片 / 葉

function colorize(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

// 護手 / 握把 / 柄頭花苞 / 護手玫瑰花飾 (烘焙頂點色，1 mesh)
function buildTrimGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // 杯形護手：半球殼頂朝劍尖、開口朝手 (8×4 段)
  parts.push(colorize(new THREE.SphereGeometry(0.075, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.11, 0), GOLD));
  // 十字護桿 (橫放) 與兩端小金球
  parts.push(colorize(new THREE.CylinderGeometry(0.013, 0.013, 0.26, 6).rotateZ(Math.PI / 2).translate(0, 0.12, 0), GOLD));
  parts.push(colorize(new THREE.IcosahedronGeometry(0.022, 0).translate(0.13, 0.12, 0), GOLD));
  parts.push(colorize(new THREE.IcosahedronGeometry(0.022, 0).translate(-0.13, 0.12, 0), GOLD));
  // 握把
  parts.push(colorize(new THREE.CylinderGeometry(0.02, 0.022, 0.16, 6).translate(0, 0.03, 0), GRIP));
  // 柄頭玫瑰花苞 + 5 片萼片
  parts.push(colorize(new THREE.IcosahedronGeometry(0.036, 0).translate(0, -0.075, 0), ROSE));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push(colorize(new THREE.ConeGeometry(0.012, 0.045, 3).rotateX(Math.PI).rotateZ(Math.cos(a) * 0.5).rotateX(Math.sin(a) * 0.5)
      .translate(Math.cos(a) * 0.022, -0.045, Math.sin(a) * 0.022), LEAF));
  }
  // 護手外側玫瑰花飾：5 瓣 (外瓣粉) + 花心 + 2 片葉
  const rx = 0, ry = 0.15, rz = 0.06;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push(colorize(new THREE.ConeGeometry(0.02, 0.04, 4).rotateX(Math.PI / 2).rotateY(a)
      .translate(rx + Math.cos(a) * 0.02, ry + Math.sin(a) * 0.02, rz), k % 2 === 0 ? ROSE : ROSE_LIGHT));
  }
  parts.push(colorize(new THREE.IcosahedronGeometry(0.022, 0).translate(rx, ry, rz + 0.012), ROSE));
  parts.push(colorize(new THREE.ConeGeometry(0.014, 0.06, 3).rotateZ(-1.0).translate(rx + 0.05, ry - 0.03, rz - 0.01), LEAF));
  parts.push(colorize(new THREE.ConeGeometry(0.014, 0.06, 3).rotateZ(1.0).translate(rx - 0.05, ry - 0.03, rz - 0.01), LEAF));
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

export function buildRapier(): WeaponModelHandle {
  const root = new THREE.Group();
  // 劍身：4 段菱形截面、尖端收細 (y 0.16 → 1.16)
  const bladeMat = new THREE.MeshStandardMaterial({ color: BLADE_COLOR, metalness: 0.85, roughness: 0.25, emissive: 0x000000, emissiveIntensity: 0 });
  const bladeLen = RAPIER_BLADE_TIP - RAPIER_BLADE_BASE;
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.038, bladeLen, 4).translate(0, RAPIER_BLADE_BASE + bladeLen / 2, 0), bladeMat);
  root.add(blade);
  const trimMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  root.add(new THREE.Mesh(buildTrimGeometry(), trimMat));
  mountOnHand(root);
  return {
    parts: { R: root },
    // 劍身 emissive 脈衝 (揮擊銀紅寒光、終結技蓄力轉玫瑰紅；顏色由樣式主色決定)
    glow: (k, peak, color) => {
      bladeMat.emissive.setHex(color);
      bladeMat.emissiveIntensity = peak * k;
    },
    resetGlow: () => { bladeMat.emissiveIntensity = 0; }
  };
}
