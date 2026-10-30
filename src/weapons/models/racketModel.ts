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

// 雙燕羽刃單支球拍：握把 + 中桿 + 拍框烘焙頂點色為 1 個 mesh，加半透明拍面 1 個 mesh (每支 2 draw call)
function buildBakedRacket(colors: RacketColors): { root: THREE.Group; bodyMat: THREE.MeshLambertMaterial } {
  const parts: [THREE.BufferGeometry, number, number][] = [
    [new THREE.CylinderGeometry(0.024, 0.024, 0.24, 8), 0.12, colors.grip],
    [new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), 0.45, SHAFT_COLOR],
    [new THREE.TorusGeometry(0.16, 0.016, 8, 16), 0.82, colors.frame]
  ];
  const c = new THREE.Color();
  for (const [geo, y, hex] of parts) {
    geo.translate(0, y, 0);
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

  // 拍面微染拍框色，與白握把區隔
  const faceMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.frame).lerp(new THREE.Color(0xffffff), 0.7), transparent: true, opacity: 0.4 });
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), faceMat);
  face.position.y = 0.82;
  root.add(face);
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
