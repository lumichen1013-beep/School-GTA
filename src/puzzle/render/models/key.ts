import * as THREE from 'three';
import type { Painter } from '../materials';
import { glowSprite } from '../materials';
import { PAL } from '../palette';
import { glow } from '../textures';

/** 筆尖鑰匙：金色鑰匙環 + 柄身 + 齒，前端是一枚鋼筆筆尖；旋轉漂浮 + 微光 + 小點光源。原點在底部中心 */
export class NibKeyModel {
  readonly root = new THREE.Group();
  private spin = new THREE.Group();
  private halo: THREE.Sprite;
  private sparks: THREE.Sprite[] = [];
  private light = new THREE.PointLight(0xffd27a, 2.2, 3.2, 1.5);

  constructor(paint: Painter) {
    const gold = { emissive: PAL.goldDeep, emissiveIntensity: 0.35, metalness: 0.65, roughness: 0.3 };
    const m = (geo: THREE.BufferGeometry, color: number = PAL.gold, outline = true) => paint.mesh(geo, color, { ...gold, outline, shadow: false });
    this.spin.position.y = 0.42;
    this.spin.scale.setScalar(1.25);
    // 鑰匙環 (中間鑲一圈墨藍寶石)
    const ring = m(new THREE.TorusGeometry(0.085, 0.024, 12, 28));
    ring.position.y = 0.15;
    const gem = paint.mesh(new THREE.SphereGeometry(0.03, 12, 10), PAL.inkBlue, { emissive: PAL.inkBlue, emissiveIntensity: 0.6, roughness: 0.2, shadow: false, outline: false });
    gem.position.y = 0.15;
    const collar = m(new THREE.CylinderGeometry(0.032, 0.032, 0.035, 12), PAL.goldDeep, false);
    collar.position.y = 0.055;
    // 柄身
    const shaft = m(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 10));
    shaft.position.y = -0.06;
    // 齒
    const teeth = [[-0.07, 0.07, 0.035], [-0.115, 0.05, 0.03], [-0.02, 0.055, 0.03]];
    for (const [y, w, h] of teeth) {
      const t = m(new THREE.BoxGeometry(w, h, 0.03), PAL.gold, false);
      t.position.set(0.02 + w / 2, y, 0);
      this.spin.add(t);
    }
    // 筆尖：扁平錐 + 中縫 + 透氣孔
    const nib = m(new THREE.ConeGeometry(0.045, 0.12, 4).scale(1, 1, 0.35));
    nib.rotation.x = Math.PI;
    nib.position.y = -0.22;
    const slit = m(new THREE.BoxGeometry(0.004, 0.08, 0.02), PAL.outline, false);
    slit.position.set(0, -0.24, 0);
    const hole = m(new THREE.CylinderGeometry(0.008, 0.008, 0.022, 8), PAL.outline, false);
    hole.rotation.x = Math.PI / 2;
    hole.position.y = -0.19;
    this.spin.add(ring, gem, collar, shaft, nib, slit, hole);
    this.halo = glowSprite(glow(), 0xffe08a, 0.9, 0.55);
    this.halo.position.y = 0.42;
    for (let i = 0; i < 4; i++) {
      const s = glowSprite(glow(), 0xfff3c0, 0.1, 0.9);
      this.sparks.push(s);
      this.root.add(s);
    }
    this.light.position.y = 0.45;
    this.root.add(this.spin, this.halo, this.light);
  }

  update(t: number, is2d: boolean): void {
    this.spin.rotation.y = is2d ? Math.sin(t * 1.6) * 0.5 : t * 1.8;
    this.spin.position.y = 0.42 + Math.sin(t * 2.2) * 0.06;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.1);
    this.halo.material.opacity = (is2d ? 0.35 : 0.45) + pulse * 0.25;
    this.halo.position.y = this.spin.position.y;
    this.light.visible = !is2d;
    this.sparks.forEach((s, i) => {
      const a = t * 1.3 + (i * Math.PI) / 2;
      s.position.set(Math.cos(a) * 0.26, 0.3 + ((t * 0.4 + i * 0.25) % 1) * 0.35, Math.sin(a) * 0.26);
      s.material.opacity = 0.9 * (1 - ((t * 0.4 + i * 0.25) % 1));
    });
  }
}
