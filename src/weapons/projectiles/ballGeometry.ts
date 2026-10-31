import * as THREE from 'three';

// 球體幾何 (單位半徑)：12×8 段 (168 三角形)，縫線 (赤道 + 兩條經線) 以頂點色烘焙；投射物池與手持模型共用
export function buildBallGeometry(): THREE.BufferGeometry {
  // 12×8 段球，縫線 (赤道 + 兩條經線) 以頂點色烘焙
  const geo = new THREE.SphereGeometry(1, 12, 8);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(0xd5621c);
  const seam = new THREE.Color(0x2a160c);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const c = Math.abs(x) < 0.14 || Math.abs(y) < 0.14 ? seam : base;
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
