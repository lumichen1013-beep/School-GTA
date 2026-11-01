import * as THREE from 'three';
import type { Mode } from '../../logic/types';
import type { Painter } from '../materials';
import { PAL } from '../palette';

export interface PlayerAnimState { speed: number; grounded: boolean; vy: number; facing: number; mode: Mode; t: number; dt: number }

const cyl = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r: number, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);

/** 小製圖員：外套 + 圍巾、貝雷帽、背後的圖紙筒、右手握鋼筆。原點在腳底中心，面向 +z */
export class DraftsmanModel {
  readonly root = new THREE.Group();
  private yaw = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private scarfTail!: THREE.Mesh;
  private phase = 0;
  private curYaw = 0;
  private walkK = 0;

  constructor(private paint: Painter) {
    this.root.add(this.yaw);
    this.buildLegs();
    this.buildTorso();
    this.buildHead();
    this.buildArms();
  }

  private m(geo: THREE.BufferGeometry, color: number, outline = true): THREE.Mesh {
    return this.paint.mesh(geo, color, { outline, roughness: 0.7 });
  }

  private buildLegs(): void {
    for (const [g, x] of [[this.legL, -0.075], [this.legR, 0.075]] as const) {
      g.position.set(x, 0.3, 0);
      const leg = this.m(cyl(0.05, 0.055, 0.24), PAL.trousers);
      leg.position.y = -0.12;
      const shoe = this.m(new THREE.BoxGeometry(0.1, 0.065, 0.16), PAL.shoes);
      shoe.position.set(0, -0.268, 0.025);
      const toe = this.m(sph(0.05, 10, 8), PAL.shoes, false);
      toe.scale.set(1, 0.6, 0.8);
      toe.position.set(0, -0.265, 0.1);
      g.add(leg, shoe, toe);
      this.yaw.add(g);
    }
  }

  private buildTorso(): void {
    const t = this.torso;
    t.position.y = 0.28;
    const coat = this.m(cyl(0.12, 0.175, 0.32, 18), PAL.coat);
    coat.position.y = 0.16;
    const hem = this.m(cyl(0.178, 0.185, 0.04, 18), PAL.coatDark, false);
    hem.position.y = 0.02;
    const placket = this.m(new THREE.BoxGeometry(0.035, 0.28, 0.02), PAL.coatDark, false);
    placket.position.set(0, 0.16, 0.152);
    placket.rotation.x = -0.17;
    t.add(coat, hem, placket);
    for (const y of [0.08, 0.15, 0.22]) {
      const b = this.m(sph(0.016, 8, 6), PAL.brass, false);
      b.position.set(0.035, y, 0.165 - (y - 0.08) * 0.17);
      t.add(b);
    }
    const pocket = this.m(new THREE.BoxGeometry(0.07, 0.05, 0.02), PAL.coatDark, false);
    pocket.position.set(-0.08, 0.1, 0.15);
    pocket.rotation.set(-0.17, -0.45, 0);
    t.add(pocket);
    // 圍巾：領口一圈 + 垂下的尾巴
    const scarf = this.m(new THREE.TorusGeometry(0.105, 0.042, 10, 20), PAL.scarf);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 0.33;
    this.scarfTail = this.m(new THREE.BoxGeometry(0.07, 0.17, 0.03).translate(0, -0.085, 0), PAL.scarf);
    this.scarfTail.position.set(-0.06, 0.33, 0.12);
    const fringe = this.m(new THREE.BoxGeometry(0.072, 0.025, 0.032), PAL.rugBorder, false);
    fringe.position.y = -0.17;
    this.scarfTail.add(fringe);
    t.add(scarf, this.scarfTail);
    // 背後的圖紙筒 (斜背)
    const tube = this.m(cyl(0.045, 0.045, 0.44), PAL.tube);
    tube.position.set(0.02, 0.2, -0.2);
    tube.rotation.z = 0.75;
    for (const s of [-1, 1]) {
      const cap = this.m(cyl(0.05, 0.05, 0.05), PAL.tubeCap, false);
      cap.position.y = s * 0.22;
      tube.add(cap);
    }
    const strap = this.m(new THREE.BoxGeometry(0.022, 0.4, 0.012), PAL.tubeCap, false);
    strap.position.set(-0.01, 0.18, 0.163);
    strap.rotation.set(-0.17, 0, -0.75);
    t.add(tube, strap);
    this.yaw.add(t);
  }

  private buildHead(): void {
    const h = this.head;
    h.position.y = 0.34;
    const face = this.m(sph(0.15, 20, 16), PAL.skin);
    face.position.y = 0.15;
    // 頭髮：後腦一頂髮殼 + 額前一撮瀏海
    const hair = this.m(new THREE.SphereGeometry(0.16, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), PAL.hair, false);
    hair.position.set(0, 0.155, -0.01);
    hair.rotation.x = -0.75;
    const bangs = this.m(new THREE.SphereGeometry(0.07, 10, 8), PAL.hair, false);
    bangs.scale.set(1.5, 0.55, 0.7);
    bangs.position.set(-0.03, 0.245, 0.1);
    bangs.rotation.z = 0.3;
    h.add(face, hair, bangs);
    for (const s of [-1, 1]) {
      const eye = this.m(sph(0.02, 10, 8), PAL.eye, false);
      eye.scale.set(0.8, 1.15, 0.6);
      eye.position.set(s * 0.055, 0.165, 0.138);
      const shine = this.m(sph(0.006, 6, 4), 0xffffff, false);
      shine.position.set(s * 0.055 + 0.007, 0.175, 0.15);
      const cheek = this.m(sph(0.028, 10, 8), PAL.cheek, false);
      cheek.scale.set(1, 0.6, 0.35);
      cheek.position.set(s * 0.09, 0.12, 0.122);
      const ear = this.m(sph(0.03, 8, 6), PAL.skin, false);
      ear.position.set(s * 0.148, 0.15, 0);
      h.add(eye, shine, cheek, ear);
    }
    const nose = this.m(sph(0.02, 8, 6), PAL.cheek, false);
    nose.position.set(0, 0.135, 0.15);
    const mouth = this.m(new THREE.TorusGeometry(0.022, 0.006, 6, 10, Math.PI), PAL.eye, false);
    mouth.position.set(0, 0.1, 0.142);
    mouth.rotation.z = Math.PI;
    h.add(nose, mouth);
    // 貝雷帽：扁圓帽身 + 帽沿 + 頂端小柄，微微歪戴
    const beret = new THREE.Group();
    beret.position.set(0.02, 0.27, -0.01);
    beret.rotation.set(-0.15, 0, -0.28);
    const cap = this.m(sph(0.175, 20, 12), PAL.beret);
    cap.scale.set(1, 0.36, 1);
    const band = this.m(new THREE.TorusGeometry(0.13, 0.018, 8, 22), PAL.outline, false);
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.025;
    const stem = this.m(cyl(0.012, 0.018, 0.05, 8), PAL.beret, false);
    stem.position.y = 0.075;
    beret.add(cap, band, stem);
    h.add(beret);
    this.torso.add(h);
  }

  private buildArms(): void {
    for (const [g, s] of [[this.armL, -1], [this.armR, 1]] as const) {
      g.position.set(s * 0.165, 0.29, 0);
      const sleeve = this.m(cyl(0.042, 0.048, 0.22), PAL.coat);
      sleeve.position.y = -0.11;
      const cuff = this.m(cyl(0.05, 0.05, 0.03), PAL.coatDark, false);
      cuff.position.y = -0.215;
      const hand = this.m(sph(0.043, 10, 8), PAL.skin);
      hand.position.y = -0.255;
      g.add(sleeve, cuff, hand);
      g.rotation.z = s * 0.12;
      this.torso.add(g);
    }
    // 右手的鋼筆：筆桿 + 金色筆夾環 + 筆尖
    const pen = new THREE.Group();
    pen.position.set(0, -0.26, 0.03);
    pen.rotation.x = 1.15;
    const body = this.m(cyl(0.017, 0.017, 0.17, 10), PAL.pen);
    const ring = this.m(cyl(0.019, 0.019, 0.02, 10), PAL.gold, false);
    ring.position.y = 0.03;
    const nib = this.m(new THREE.ConeGeometry(0.016, 0.05, 8), PAL.gold, false);
    nib.position.y = 0.11;
    const end = this.m(sph(0.017, 8, 6), PAL.pen, false);
    end.position.y = -0.085;
    pen.add(body, ring, nib, end);
    this.armR.add(pen);
  }

  /** 走路擺動 / 待機呼吸 / 跳躍姿勢 / 平滑轉身 */
  update(s: PlayerAnimState): void {
    // 2D 改用 3/4 側臉，讓扁平版仍看得到臉與圍巾
    let target = s.facing;
    if (s.mode === '2d') target = Math.sin(s.facing) >= 0 ? 0.95 : -0.95;
    let d = target - this.curYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.curYaw += d * Math.min(1, s.dt * 14);
    this.yaw.rotation.y = this.curYaw;

    const moving = Math.min(1, s.speed / 3.2);
    this.walkK += ((s.grounded ? moving : 0) - this.walkK) * Math.min(1, s.dt * 10);
    this.phase += s.dt * (4 + 8 * moving);
    const sw = Math.sin(this.phase) * this.walkK;
    const breath = Math.sin(s.t * 2.4) * (1 - this.walkK);

    if (s.grounded) {
      this.legL.rotation.x = sw * 0.75;
      this.legR.rotation.x = -sw * 0.75;
      this.armL.rotation.x = -sw * 0.65;
      this.armR.rotation.x = sw * 0.35 - 0.35;
      this.armL.rotation.z = -0.12 - breath * 0.02;
      this.armR.rotation.z = 0.12 + breath * 0.02;
      this.torso.position.y = 0.28 + Math.abs(Math.sin(this.phase)) * 0.025 * this.walkK;
      this.torso.scale.set(1 - breath * 0.008, 1 + breath * 0.018, 1);
      this.head.rotation.x = breath * 0.03;
      this.torso.rotation.x = 0.06 * this.walkK;
    } else {
      // 跳躍：一腳收起一腳後擺，雙臂上揚
      const up = s.vy > 0 ? 1 : 0.6;
      this.legL.rotation.x = -0.9 * up;
      this.legR.rotation.x = 0.45;
      this.armL.rotation.x = -2.2 * up;
      this.armR.rotation.x = -1.6 * up;
      this.armL.rotation.z = -0.35;
      this.armR.rotation.z = 0.35;
      this.torso.position.y = 0.3;
      this.torso.scale.set(1, 1, 1);
      this.torso.rotation.x = -0.05;
      this.head.rotation.x = -0.12;
    }
    this.scarfTail.rotation.x = -0.15 - this.walkK * 0.5 * (0.6 + 0.4 * Math.sin(this.phase * 2)) - (s.grounded ? 0 : 0.6);
  }
}
