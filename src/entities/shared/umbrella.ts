import * as THREE from 'three';

export interface UmbrellaOptions {
  name: string;
  canopyColor: number;
  shaftMetalness: number;
  handleColor: number;
  tipMetalness: number;
  // 內部微調容器偏移 (使傘面中心精確位於頭頂上方)
  rigX: number;
  rigZ: number;
}

// 建造 3D Low-Poly 雨傘模型 (傘中棒、握把、10 角多邊形傘面、頂端金屬尖端)，預設隱藏
export function buildUmbrella(opts: UmbrellaOptions): THREE.Group {
  const umbrella = new THREE.Group();
  umbrella.name = opts.name;

  const shaftMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: opts.shaftMetalness, roughness: 0.3 });
  const handleMat = new THREE.MeshStandardMaterial({ color: opts.handleColor, roughness: 0.8 });
  const canopyMat = new THREE.MeshLambertMaterial({ color: opts.canopyColor, side: THREE.DoubleSide });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xdcdde1, metalness: opts.tipMetalness, roughness: 0.2 });

  const rig = new THREE.Group();
  rig.position.set(opts.rigX, 0, opts.rigZ);

  // 1. 傘中棒 (Shaft) - 向上延伸 1.15m
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.15, 8), shaftMat);
  shaft.position.y = 0.50;
  rig.add(shaft);

  // 2. 傘柄握把 (Grip)
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 8), handleMat);
  handle.position.y = -0.05;
  rig.add(handle);

  // 3. 傘帽圓錐 (Canopy) - 10 角傘骨造型
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.68, 0.34, 10, 1, true), canopyMat);
  canopy.position.y = 0.96;
  canopy.castShadow = true;
  rig.add(canopy);

  // 4. 傘頂金屬尖端 (Ferrule Tip)
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.02, 0.10, 8), tipMat);
  tip.position.y = 1.16;
  rig.add(tip);

  umbrella.add(rig);
  umbrella.visible = false;
  return umbrella;
}
