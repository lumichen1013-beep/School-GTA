import * as THREE from 'three';
import type { WeaponModelHandle } from '../types';

// 手持武器共用掛點：右手掌位置，正角度朝前方 +Z 上仰 (避免朝後方背刺)
export function mountOnHand(root: THREE.Group) {
  root.position.set(0, -0.28, 0.12);
  root.rotation.x = Math.PI / 3;
  root.visible = false;
}

// 普通木質棒球棍 (Normal Wooden Baseball Bat)：揮擊時木質棒身以樣式主色 emissive 脈衝
export function buildNormalBat(): WeaponModelHandle {
  const root = new THREE.Group();
  const batWoodMat = new THREE.MeshLambertMaterial({ color: 0xcd853f, emissive: 0x000000, emissiveIntensity: 0 });
  const batGripMat = new THREE.MeshLambertMaterial({ color: 0x2d3436 });
  const grip1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8), batGripMat);
  grip1.position.y = 0.14;
  root.add(grip1);
  const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.035, 0.62, 8), batWoodMat);
  barrel1.position.y = 0.58;
  root.add(barrel1);
  mountOnHand(root);
  return {
    parts: { R: root },
    glow: (k, peak, color) => {
      batWoodMat.emissive.setHex(color);
      batWoodMat.emissiveIntensity = peak * k;
    },
    resetGlow: () => { batWoodMat.emissiveIntensity = 0; }
  };
}

// 黃金棒金屬 emissive 基準值 (平時微光，揮擊脈衝自此往峰值插值)
const GOLD_BASE_EMISSIVE = 0.4;

// 特殊黃金雷霆棒球棍 (Special Golden Thunder Baseball Bat)
export function buildGoldBat(): WeaponModelHandle {
  const root = new THREE.Group();
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    metalness: 0.9,
    roughness: 0.2,
    emissive: 0xf39c12,
    emissiveIntensity: GOLD_BASE_EMISSIVE
  });
  const specialGripMat = new THREE.MeshLambertMaterial({ color: 0x8b0000 });
  const grip2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), specialGripMat);
  grip2.position.y = 0.15;
  root.add(grip2);
  const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 0.72, 8), goldMat);
  barrel2.position.y = 0.65;
  root.add(barrel2);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0xff4757, emissive: 0xff3838, emissiveIntensity: 0.5 });
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.02, 6, 12), crownMat);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 1.02;
  root.add(crown);
  mountOnHand(root);
  return {
    parts: { R: root },
    // 金屬發光維持原 emissive 色，只調整強度
    glow: (k, peak) => { goldMat.emissiveIntensity = GOLD_BASE_EMISSIVE + (peak - GOLD_BASE_EMISSIVE) * k; },
    resetGlow: () => { goldMat.emissiveIntensity = GOLD_BASE_EMISSIVE; }
  };
}
