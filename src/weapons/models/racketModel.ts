import * as THREE from 'three';
import type { WeaponModelHandle } from '../types';
import { mountOnHand } from './batModels';

// 羽球拍造型 (Badminton Racket Model - 4F 羽球挑戰賽專用造型，比賽結束或搭電梯時自動還原)；不發光
export function buildRacket(): WeaponModelHandle {
  const root = new THREE.Group();
  const racketGripMat = new THREE.MeshLambertMaterial({ color: 0x3498db }); // 藍色防滑膠帶纏握把
  const racketShaftMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 }); // 輕量化碳素中桿
  const racketFrameMat = new THREE.MeshLambertMaterial({ color: 0x2ecc71 }); // 亮青綠流線拍框
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
