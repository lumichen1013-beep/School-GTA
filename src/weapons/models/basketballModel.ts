import * as THREE from 'three';
import type { WeaponModelHandle } from '../types';
import { buildBallGeometry } from '../projectiles/ballGeometry';

// 手持籃球：12×8 段球 (縫線頂點色烘焙) 1 個 mesh、168 三角形，不投影；與投射物池的球共用幾何與材質型別 (同一 shader program)。
// 持球時掛在右手掌前方；投出期間由玩家整體隱藏 (改顯示池內的球，任何時刻只有 1 個球在畫)，接回後顯示。
const BALL_RADIUS = 0.15;

export function buildBasketball(): WeaponModelHandle {
  const mesh = new THREE.Mesh(buildBallGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.scale.setScalar(BALL_RADIUS);
  mesh.castShadow = false;
  const root = new THREE.Group();
  root.add(mesh);
  // 右手掌前方 (手臂前舉時球位於胸前)：球心略離手心，避免嵌入手臂
  root.position.set(0, -0.3, 0.2);
  root.visible = false;
  return {
    parts: { R: root },
    glow: null,
    resetGlow: () => {}
  };
}
