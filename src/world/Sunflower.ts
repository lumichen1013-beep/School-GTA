import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SkillBubble, type SkillBubbleStyle } from '../entities/shared/SkillBubble';
import type { SunflowerFace, SunflowerReaction } from '../game/fencer/fencerRules';

// 操場中央的巨型太陽花 (花劍客的召喚者)：莖 + 葉 (1 call)、花盤 + 20 瓣 (1 call)、臉 (表情圖集 quad，1 call) = 3 draw calls。
// 每次被戳依台詞播放小反應 (轉向 / 背對 / 縮小 / 發抖 / 鞠躬 / 變色)，狀態以目標值平滑逼近，執行期零配置。

const FACE_ORDER: readonly SunflowerFace[] = ['BLANK', 'SIDE', 'SWEAT', 'ANNOYED', 'ANGRY', 'SHOCK', 'CRY', 'EVIL', 'SMUG', 'SLEEPY'];
const ATLAS_COLS = 4;
const ATLAS_ROWS = 3;
const CELL = 128;
const HEAD_Y = 1.75;
const BUBBLE_STYLE: SkillBubbleStyle = {
  fillAlpha: 0.85, strokeAlpha: 0.85, fontSize: () => 46,
  canvasW: 512, canvasH: 160, worldW: 3.9, worldH: 1.21875,
  wrap: true, minFontSize: 38, anchorBottom: true
};

function colorize(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.index) return g;
  return g;
}

// 表情圖集 (Canvas 2D 程序繪製，免外部素材)
function drawFaceAtlas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = CELL * ATLAS_COLS;
  cv.height = CELL * ATLAS_ROWS;
  const g = cv.getContext('2d');
  if (!g) return cv;
  g.clearRect(0, 0, cv.width, cv.height);
  FACE_ORDER.forEach((face, idx) => {
    const ox = (idx % ATLAS_COLS) * CELL;
    const oy = Math.floor(idx / ATLAS_COLS) * CELL;
    g.save();
    g.translate(ox + CELL / 2, oy + CELL / 2);
    g.lineCap = 'round';
    g.lineWidth = 7;
    g.strokeStyle = '#2b1a0c';
    g.fillStyle = '#2b1a0c';
    const eye = (x: number, y: number, r = 9) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    const line = (x1: number, y1: number, x2: number, y2: number) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    const arc = (x: number, y: number, r: number, a0: number, a1: number) => { g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); };
    switch (face) {
      case 'BLANK': eye(-22, -10); eye(22, -10); line(-14, 26, 14, 26); break;
      case 'SIDE': eye(-12, -10); eye(30, -10); line(-6, 26, 18, 22); break;
      case 'SWEAT':
        eye(-22, -10); eye(22, -10); arc(0, 36, 14, Math.PI * 1.15, Math.PI * 1.85);
        g.fillStyle = '#7fd8ff'; g.beginPath(); g.ellipse(40, -30, 7, 11, 0, 0, Math.PI * 2); g.fill(); break;
      case 'ANNOYED': line(-34, -12, -10, -12); line(10, -12, 34, -12); line(-14, 28, 14, 24); break;
      case 'ANGRY':
        line(-36, -26, -10, -14); line(36, -26, 10, -14); eye(-22, -4, 8); eye(22, -4, 8);
        arc(0, 40, 16, Math.PI * 1.15, Math.PI * 1.85); break;
      case 'SHOCK': eye(-22, -10, 12); eye(22, -10, 12); g.beginPath(); g.ellipse(0, 28, 10, 14, 0, 0, Math.PI * 2); g.stroke(); break;
      case 'CRY':
        arc(-22, -6, 10, Math.PI * 1.1, Math.PI * 1.9); arc(22, -6, 10, Math.PI * 1.1, Math.PI * 1.9);
        arc(0, 40, 14, Math.PI * 1.15, Math.PI * 1.85);
        g.strokeStyle = '#7fd8ff'; line(-22, 2, -24, 30); line(22, 2, 24, 30); break;
      case 'EVIL':
        g.fillStyle = '#ff2a2a'; eye(-22, -8, 10); eye(22, -8, 10);
        line(-38, -28, -8, -16); line(38, -28, 8, -16); arc(0, 12, 22, Math.PI * 0.15, Math.PI * 0.85); break;
      case 'SMUG': line(-34, -8, -12, -12); line(12, -12, 34, -8); arc(6, 14, 18, Math.PI * 0.15, Math.PI * 0.75); break;
      case 'SLEEPY':
        arc(-22, -12, 10, Math.PI * 0.1, Math.PI * 0.9); arc(22, -12, 10, Math.PI * 0.1, Math.PI * 0.9); eye(0, 26, 5);
        g.font = 'bold 26px sans-serif'; g.fillText('z', 32, -30); break;
    }
    g.restore();
  });
  return cv;
}

export class Sunflower {
  public readonly root = new THREE.Group();
  public readonly position: THREE.Vector3;
  private readonly bendPivot = new THREE.Group(); // 莖底：整朵前傾 (鞠躬)
  private readonly headPivot = new THREE.Group(); // 花盤
  private readonly petalMat: THREE.MeshLambertMaterial;
  private readonly faceTex: THREE.CanvasTexture | null;
  private readonly bubble: SkillBubble;
  private yaw = 0;
  private targetYaw = 0;
  private scale = 1;
  private targetScale = 1;
  private bend = 0;
  private targetBend = 0;
  private headPitch = 0;
  private targetHeadPitch = 0;
  private shake = 0;      // 持續發抖幅度
  private twitch = 0;     // 一次性抖動剩餘秒數
  private spin = 0;       // 過場高速旋轉角速度
  private pulse = 0;      // 花瓣炸開脈衝
  private time = 0;
  private readonly tint = new THREE.Color(0xffffff);
  private readonly targetTint = new THREE.Color(0xffffff);

  constructor(parent: THREE.Object3D, x: number, z: number) {
    this.position = new THREE.Vector3(x, 0, z);
    this.root.name = 'sunflower';
    this.root.position.copy(this.position);

    // 莖 + 兩片葉 (頂點色合併 1 call)
    const stem = colorize(new THREE.CylinderGeometry(0.07, 0.11, HEAD_Y, 8).translate(0, HEAD_Y / 2, 0), 0x3f8f3a);
    const leafA = colorize(new THREE.SphereGeometry(0.32, 8, 6).scale(1.4, 0.18, 0.6).rotateZ(0.5).translate(0.36, 0.75, 0), 0x4caf50);
    const leafB = colorize(new THREE.SphereGeometry(0.28, 8, 6).scale(1.4, 0.18, 0.6).rotateZ(-0.5).translate(-0.32, 1.1, 0), 0x43a047);
    const stemMesh = new THREE.Mesh(mergeGeometries([stem, leafA, leafB]), new THREE.MeshLambertMaterial({ vertexColors: true }));
    stemMesh.castShadow = true;

    // 花盤 + 20 瓣 (花瓣材質色作為整朵色調，變色只改 uniform 不重編譯)
    const parts: THREE.BufferGeometry[] = [colorize(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 20).rotateX(Math.PI / 2), 0x6b3f1d)];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = i % 2 === 0 ? 0.78 : 0.72;
      parts.push(colorize(new THREE.SphereGeometry(0.2, 6, 4).scale(1.0, 0.42, 0.12).rotateZ(a).translate(Math.cos(a) * r, Math.sin(a) * r, -0.02), i % 2 === 0 ? 0xf6c21c : 0xffd54a));
    }
    this.petalMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const headMesh = new THREE.Mesh(mergeGeometries(parts), this.petalMat);
    headMesh.castShadow = true;

    // 臉 (表情圖集，切 UV offset)
    const atlas = drawFaceAtlas();
    this.faceTex = atlas ? new THREE.CanvasTexture(atlas) : null;
    if (this.faceTex) {
      this.faceTex.repeat.set(1 / ATLAS_COLS, 1 / ATLAS_ROWS);
      this.faceTex.colorSpace = THREE.SRGBColorSpace;
    }
    const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.82),
      new THREE.MeshBasicMaterial({ map: this.faceTex, transparent: true, depthWrite: false, alphaTest: 0.1 }));
    faceMesh.position.z = 0.09;
    faceMesh.renderOrder = 1;

    this.headPivot.position.set(0, HEAD_Y, 0.05);
    this.headPivot.add(headMesh, faceMesh);
    this.bendPivot.add(stemMesh, this.headPivot);
    this.root.add(this.bendPivot);
    parent.add(this.root);

    this.bubble = new SkillBubble(this.root, 2.85, BUBBLE_STYLE);
    this.setFace('SMUG');
  }

  public setFace(face: SunflowerFace) {
    if (!this.faceTex) return;
    const idx = FACE_ORDER.indexOf(face);
    const col = idx % ATLAS_COLS;
    const row = Math.floor(idx / ATLAS_COLS);
    this.faceTex.offset.set(col / ATLAS_COLS, 1 - (row + 1) / ATLAS_ROWS);
  }

  public say(text: string, duration: number = 3.2) {
    this.bubble.show(text, text.length > 6, duration);
  }

  /** 被戳時的小反應；playerPos 用於轉向 */
  public react(reaction: SunflowerReaction, face: SunflowerFace, playerPos: THREE.Vector3) {
    this.setFace(face);
    const toPlayer = Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z);
    this.twitch = 0;
    switch (reaction) {
      case 'TWITCH': this.twitch = 0.45; break;
      case 'TURN_TO': this.targetYaw = toPlayer; break;
      case 'DROOP_SWEAT': this.targetYaw = toPlayer; this.targetHeadPitch = 0.35; break;
      case 'TURN_AWAY': this.targetYaw = toPlayer + Math.PI; this.targetHeadPitch = 0; break;
      case 'BURST_RED':
        this.targetYaw = toPlayer; this.yaw = toPlayer; this.pulse = 1; this.targetHeadPitch = -0.1;
        this.targetTint.setHex(0xff8a7a); break;
      case 'SHRINK': this.targetYaw = toPlayer; this.targetScale = 0.8; this.targetHeadPitch = 0.4; this.targetTint.setHex(0xffffff); break;
      case 'STIFFEN_HUM': this.targetScale = 1.05; this.targetHeadPitch = -0.15; this.targetTint.setHex(0xff9a55); this.shake = 0.02; break;
      case 'TREMBLE': this.targetScale = 0.95; this.targetHeadPitch = 0.45; this.shake = 0.06; this.targetTint.setHex(0xffd0a0); break;
      case 'BOW': this.shake = 0; this.targetBend = 0.95; this.targetHeadPitch = 0.6; break;
      case 'AWAKEN':
        this.targetYaw = toPlayer; this.targetBend = 0; this.targetHeadPitch = -0.12; this.targetScale = 1.1;
        this.shake = 0.03; this.targetTint.setHex(0xc0203a); break;
    }
  }

  /** 變身過場：高速旋轉 (0 = 停) */
  public setSpin(speed: number) {
    this.spin = speed;
  }

  /** 戰後 / 初始：恢復原狀 (勝利後打瞌睡、戰敗後得意) */
  public resetPose(face: SunflowerFace) {
    this.targetScale = this.scale = 1;
    this.targetBend = this.bend = 0;
    this.targetHeadPitch = this.headPitch = 0;
    this.shake = 0;
    this.twitch = 0;
    this.spin = 0;
    this.pulse = 0;
    this.targetTint.setHex(0xffffff);
    this.tint.setHex(0xffffff);
    this.petalMat.color.setHex(0xffffff);
    this.setFace(face);
    this.root.visible = true;
  }

  public setVisible(v: boolean) {
    this.root.visible = v;
  }

  public update(dt: number) {
    if (!this.root.visible) return;
    this.time += dt;
    const k = Math.min(1, dt * 6);
    const dy = Math.atan2(Math.sin(this.targetYaw - this.yaw), Math.cos(this.targetYaw - this.yaw));
    this.yaw += dy * Math.min(1, dt * 3);
    if (this.spin !== 0) this.yaw += this.spin * dt;
    this.scale += (this.targetScale - this.scale) * k;
    this.bend += (this.targetBend - this.bend) * Math.min(1, dt * 3);
    this.headPitch += (this.targetHeadPitch - this.headPitch) * k;
    this.tint.lerp(this.targetTint, k);
    this.petalMat.color.copy(this.tint);
    this.pulse = Math.max(0, this.pulse - dt * 2.5);
    if (this.twitch > 0) this.twitch -= dt;
    const jitter = this.shake * Math.sin(this.time * 55) + (this.twitch > 0 ? 0.1 * Math.sin(this.time * 70) * this.twitch : 0);
    // 待機輕晃
    const idle = Math.sin(this.time * 1.3) * 0.035;
    this.root.rotation.y = this.yaw;
    this.root.scale.setScalar(this.scale);
    this.bendPivot.rotation.x = this.bend + idle * 0.5;
    this.bendPivot.rotation.z = jitter;
    this.headPivot.rotation.x = this.headPitch;
    this.headPivot.scale.setScalar(1 + this.pulse * 0.25);
    this.bubble.update(dt);
  }
}
