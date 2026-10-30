import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WeaponModelHandle } from '../types';
import { mountOnHand } from './batModels';

// 羽球拍配色：frame = 拍框、grip = 握把膠帶 (中桿恆為深碳素色)
export interface RacketColors {
  readonly frame: number;
  readonly grip: number;
}
const RACKET_COLORS: RacketColors = { frame: 0x2ecc71, grip: 0x3498db }; // 亮青綠流線拍框 + 藍色防滑膠帶
const SHAFT_COLOR = 0x2c3e50; // 輕量化碳素中桿
const DUAL_GRIP_COLOR = 0xffffff; // 雙燕羽刃白握把

// 羽球拍造型 (Badminton Racket Model - 4F 羽球挑戰賽專用造型，比賽結束或搭電梯時自動還原)；不發光
export function buildRacket(colors: RacketColors = RACKET_COLORS): WeaponModelHandle {
  const root = new THREE.Group();
  const racketGripMat = new THREE.MeshLambertMaterial({ color: colors.grip });
  const racketShaftMat = new THREE.MeshLambertMaterial({ color: SHAFT_COLOR });
  const racketFrameMat = new THREE.MeshLambertMaterial({ color: colors.frame });
  const racketStringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }); // 網線

  const rGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.24, 8), racketGripMat);
  rGrip.position.y = 0.12;
  root.add(rGrip);

  const rShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), racketShaftMat);
  rShaft.position.y = 0.45;
  root.add(rShaft);

  const rFrame = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.016, 8, 16), racketFrameMat);
  rFrame.position.y = 0.82;
  root.add(rFrame);

  const rStrings = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), racketStringMat);
  rStrings.position.y = 0.82;
  root.add(rStrings);

  mountOnHand(root);
  return { parts: { R: root }, glow: null, resetGlow: () => {} };
}

// 雙燕羽刃單支球拍：握把 + 中桿 + 拍框 + 網線烘焙頂點色為 1 個 mesh (每支 1 draw call，持雙拍共 2)。
// 原半透明拍面圓片無法與不透明框身合批 (透明需獨立 draw call)，改為細長不透明網線格 (5 橫 5 直、淡拍框色)，
// 保留可透視的網面質感。
const STRING_STEP = 0.045;
const STRING_RADIUS = 0.15;
const STRING_WIDTH = 0.006;
function buildBakedRacket(colors: RacketColors): { root: THREE.Group; bodyMat: THREE.MeshLambertMaterial } {
  const stringColor = new THREE.Color(colors.frame).lerp(new THREE.Color(0xffffff), 0.7).getHex();
  const parts: [THREE.BufferGeometry, number][] = [
    [new THREE.CylinderGeometry(0.024, 0.024, 0.24, 8).translate(0, 0.12, 0), colors.grip],
    [new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8).translate(0, 0.45, 0), SHAFT_COLOR],
    [new THREE.TorusGeometry(0.16, 0.016, 8, 16).translate(0, 0.82, 0), colors.frame]
  ];
  for (let k = -2; k <= 2; k++) {
    const d = k * STRING_STEP;
    const chord = 2 * Math.sqrt(STRING_RADIUS * STRING_RADIUS - d * d);
    parts.push([new THREE.BoxGeometry(chord, STRING_WIDTH, STRING_WIDTH).translate(0, 0.82 + d, 0), stringColor]);
    parts.push([new THREE.BoxGeometry(STRING_WIDTH, chord, STRING_WIDTH).translate(d, 0.82, 0), stringColor]);
  }
  const c = new THREE.Color();
  for (const [geo, hex] of parts) {
    c.setHex(hex);
    const n = geo.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: colors.frame, emissiveIntensity: 0 });
  const root = new THREE.Group();
  root.add(new THREE.Mesh(mergeGeometries(parts.map((p) => p[0]), false), bodyMat));
  for (const [geo] of parts) geo.dispose();
  mountOnHand(root);
  return { root, bodyMat };
}

// 雙燕羽刃：右手青綠框、左手櫻粉框，皆白握把；揮擊時兩支拍框各以自己的顏色 emissive 脈衝 (由主拖尾進度驅動)
export function buildDualRackets(): WeaponModelHandle {
  const right = buildBakedRacket({ frame: 0x2ef2c8, grip: DUAL_GRIP_COLOR });
  const left = buildBakedRacket({ frame: 0xff6fcf, grip: DUAL_GRIP_COLOR });
  return {
    parts: { R: right.root, L: left.root },
    glow: (k, peak) => {
      right.bodyMat.emissiveIntensity = peak * k * 0.5;
      left.bodyMat.emissiveIntensity = peak * k * 0.5;
    },
    resetGlow: () => {
      right.bodyMat.emissiveIntensity = 0;
      left.bodyMat.emissiveIntensity = 0;
    }
  };
}
