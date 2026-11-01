import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SkillBubble, TALK_BUBBLE_STYLE } from '../entities/shared/SkillBubble';
import type { SunflowerFace, SunflowerReaction } from '../game/fencer/fencerRules';

// 操場中央的太陽花 (花劍客的召喚者)：莖 + 葉 (1 call)、花盤 / 花苞 (1 call，依成長切換預建幾何)、臉 (表情圖集 quad，1 call) = 最多 3 draw calls。
// 成長：一開始是不起眼的小綠苗 (約 20cm、兩片嫩葉、無花)，每被戳一次長大一階 (0~10)，
//   階段 4~6 花苞、7~9 半開、10 完整綻放；成長以彈簧平滑逼近 (略過衝)，葉片以 drawRange 增減，執行期零配置。
//   小苗階段另有 1 顆極小閃光點 (僅在玩家 5m 內偶爾閃現，花苞階段起隱藏)，同時最多 2 draw calls。
// 每次被戳依台詞播放小反應 (轉向 / 背對 / 縮小 / 發抖 / 鞠躬 / 變色)，狀態以目標值平滑逼近，執行期零配置。

const FACE_ORDER: readonly SunflowerFace[] = ['BLANK', 'SIDE', 'SWEAT', 'ANNOYED', 'ANGRY', 'SHOCK', 'CRY', 'EVIL', 'SMUG', 'SLEEPY'];
const ATLAS_COLS = 4;
const ATLAS_ROWS = 3;
const CELL = 128;
const HEAD_Y = 1.75;
const MAX_STAGE = 10;
// 各成長階段 (0~10) 的外觀表：莖高 / 粗細 (相對完整尺寸)、葉片數、花頭縮放
const STEM_H = [0.2, 0.3, 0.45, 0.62, 0.85, 1.05, 1.25, 1.45, 1.6, 1.7, HEAD_Y];
const STEM_T = [0.14, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.88, 0.95, 1.0];
const LEAVES = [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6];
const HEAD_S = [0, 0, 0, 0, 0.22, 0.3, 0.4, 0.46, 0.62, 0.8, 1.0];
/** 花頭型態切換點：< 6.5 花苞、< 9.5 半開、其餘綻放 */
const BUD_UNTIL = 6.5;
const HALF_UNTIL = 9.5;
const SPRING_K = 256;
const SPRING_C = 12.8;

function table(arr: readonly number[], g: number): number {
  const c = Math.max(0, Math.min(MAX_STAGE, g));
  const i = Math.min(MAX_STAGE - 1, Math.floor(c));
  return arr[i] + (arr[i + 1] - arr[i]) * (c - i);
}

/** 目前成長值對應的外觀數值 (純函式，供測試)：莖高、粗細、葉片數、花頭縮放、花頭型態 */
export function sunflowerLook(g: number): { height: number; thickness: number; leaves: number; headScale: number; kind: 'NONE' | 'BUD' | 'HALF' | 'FULL' } {
  const hs = table(HEAD_S, g);
  const kind = hs < 0.02 ? 'NONE' : g < BUD_UNTIL ? 'BUD' : g < HALF_UNTIL ? 'HALF' : 'FULL';
  return { height: table(STEM_H, g), thickness: table(STEM_T, g), leaves: LEAVES[Math.min(MAX_STAGE, Math.max(0, Math.floor(g + 0.6)))], headScale: hs, kind };
}

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
  private stemMesh!: THREE.Mesh;
  private headMesh!: THREE.Mesh;
  private faceMesh!: THREE.Mesh;
  private glint!: THREE.Mesh;
  private geoFull!: THREE.BufferGeometry;
  private geoBud!: THREE.BufferGeometry;
  private geoHalf!: THREE.BufferGeometry;
  private stemIndexCount = 0;
  private leafIndexCounts: number[] = [];
  private collider: { min: THREE.Vector3; max: THREE.Vector3 } | null = null;
  private growth = 0;          // 目前成長值 (彈簧)
  private growthVel = 0;
  private targetGrowth = 0;
  private headScaleBase = 0;
  private sproutMode = true;
  private aware = 0;           // 小苗對玩家靠近的反應程度 0~1
  private awareTarget = 0;
  private glintCd = 2;
  private glintT = 0;
  private rnd = 12345;
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

    // 莖 + 6 片葉 (頂點色合併 1 call；葉片依序在 index 尾端，成長時以 drawRange 增減)
    const stem = colorize(new THREE.CylinderGeometry(0.07, 0.11, HEAD_Y, 8).translate(0, HEAD_Y / 2, 0), 0x3d8f35);
    const leafDefs: Array<[number, number, number, number, number, number]> = [
      // 半徑, 傾角, x, y, 繞莖旋轉, 顏色
      [0.32, 0.5, 0.36, 0.75, 0, 0x56b047],
      [0.28, -0.5, -0.32, 1.1, 0, 0x4fa642],
      [0.3, 0.45, 0.34, 0.45, 2.1, 0x56b047],
      [0.26, -0.5, -0.3, 0.95, 1.1, 0x4fa642],
      [0.26, 0.5, 0.3, 1.3, 3.6, 0x56b047],
      [0.24, -0.45, -0.28, 0.3, 4.6, 0x4fa642]
    ];
    const leafGeos = leafDefs.map(([r, tilt, x, y, ry, col]) =>
      colorize(new THREE.SphereGeometry(r, 8, 6).scale(1.4, 0.18, 0.6).rotateZ(tilt).translate(x, y, 0).rotateY(ry), col));
    this.stemIndexCount = stem.index!.count;
    this.leafIndexCounts = leafGeos.map((g) => g.index!.count);
    const stemMesh = new THREE.Mesh(mergeGeometries([stem, ...leafGeos]), new THREE.MeshLambertMaterial({ vertexColors: true }));
    stemMesh.castShadow = true;
    this.stemMesh = stemMesh;

    // 花盤 + 20 瓣 (花瓣材質色作為整朵色調，變色只改 uniform 不重編譯)
    const parts: THREE.BufferGeometry[] = [colorize(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 20).rotateX(Math.PI / 2), 0x6b3f1d)];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = i % 2 === 0 ? 0.78 : 0.72;
      parts.push(colorize(new THREE.SphereGeometry(0.2, 6, 4).scale(1.0, 0.42, 0.12).rotateZ(a).translate(Math.cos(a) * r, Math.sin(a) * r, -0.02), i % 2 === 0 ? 0xf6c21c : 0xffd54a));
    }
    this.geoFull = mergeGeometries(parts);
    // 花苞：綠色球 + 8 片收攏的黃色花瓣尖 (含苞)
    const budParts: THREE.BufferGeometry[] = [colorize(new THREE.SphereGeometry(0.45, 10, 8).scale(1, 1, 1.05), 0x4d9f3f)];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      budParts.push(colorize(new THREE.SphereGeometry(0.14, 5, 4).scale(0.7, 1.5, 0.5).rotateZ(a - Math.PI / 2).translate(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.36), 0xe9bd2a));
    }
    this.geoBud = mergeGeometries(budParts);
    // 半開：花盤 + 16 片向前攏起的花瓣 (杯狀)
    const halfParts: THREE.BufferGeometry[] = [colorize(new THREE.CylinderGeometry(0.46, 0.46, 0.16, 16).rotateX(Math.PI / 2), 0x6b3f1d)];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      halfParts.push(colorize(new THREE.SphereGeometry(0.2, 6, 4).scale(1.3, 0.5, 0.12).translate(0.5, 0, 0).rotateY(-1.0).rotateZ(a), i % 2 === 0 ? 0xf0b81a : 0xf7cb3c));
    }
    this.geoHalf = mergeGeometries(halfParts);
    this.petalMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const headMesh = new THREE.Mesh(this.geoFull, this.petalMat);
    headMesh.castShadow = true;
    this.headMesh = headMesh;

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

    this.faceMesh = faceMesh;

    // 小苗閃光點 (極小、僅偶爾閃現；平時 visible=false 不佔 draw call)
    this.glint = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    this.glint.visible = false;
    this.root.add(this.glint);

    this.headPivot.position.set(0, HEAD_Y, 0.05);
    this.headPivot.add(headMesh, faceMesh);
    this.bendPivot.add(stemMesh, this.headPivot);
    this.root.add(this.bendPivot);
    parent.add(this.root);

    this.bubble = new SkillBubble(this.root, 2.85, TALK_BUBBLE_STYLE);
    this.setFace('SMUG');
    this.applyGrowth();
  }

  /** 成長階段 (0~10)：instant = 讀檔 / 重置不播動畫；否則以彈簧平滑長大 (略過衝) */
  public setGrowth(stage: number, instant: boolean = false) {
    const t = Math.max(0, Math.min(MAX_STAGE, stage));
    if (!instant && t >= MAX_STAGE && this.targetGrowth < MAX_STAGE) this.pulse = 1.2; // 綻放瞬間花瓣炸開
    this.targetGrowth = t;
    if (instant) { this.growth = t; this.growthVel = 0; this.applyGrowth(); }
  }

  public get growthStage(): number {
    return this.targetGrowth;
  }

  /** 玩家距離 (dist < 0 = 不在附近)：小苗階段在 awareRange 內才有細微反應；
   *  watchRange > 0 (首勝後) 時完整太陽花在範圍內緩慢轉頭看玩家 */
  public setPlayerNear(dist: number, playerPos: THREE.Vector3, awareRange: number, watchRange: number = 0) {
    const near = dist >= 0 && dist < awareRange && this.targetGrowth < 4;
    this.awareTarget = near ? 1 : 0;
    const watch = watchRange > 0 && dist >= 0 && dist < watchRange && this.targetGrowth >= MAX_STAGE && this.spin === 0;
    if (near || watch) this.targetYaw = Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z);
  }

  /** 碰撞盒隨大小調整 (只縮不超出初始範圍，ColliderGrid 已依初始大小分格) */
  public bindCollider(box: { min: THREE.Vector3; max: THREE.Vector3 }) {
    this.collider = box;
    this.applyGrowth();
  }

  private applyGrowth() {
    const look = sunflowerLook(this.growth);
    const over = Math.max(0, this.growth - MAX_STAGE);
    this.stemMesh.scale.set(look.thickness, look.height / HEAD_Y, look.thickness);
    let n = this.stemIndexCount;
    for (let i = 0; i < look.leaves; i++) n += this.leafIndexCounts[i];
    this.stemMesh.geometry.setDrawRange(0, n);
    this.headPivot.position.y = look.height;
    const showHead = look.kind !== 'NONE';
    this.headMesh.visible = showHead;
    this.faceMesh.visible = showHead;
    if (showHead) {
      this.headMesh.geometry = look.kind === 'BUD' ? this.geoBud : look.kind === 'HALF' ? this.geoHalf : this.geoFull;
      this.faceMesh.position.z = look.kind === 'BUD' ? 0.47 : 0.09;
    }
    this.headScaleBase = look.headScale * (1 + over * 0.5);
    this.bubble.baseY = Math.max(0.6, look.height + look.headScale * 0.8 + 0.3);
    if (this.collider) {
      const half = Math.max(0.06, 0.25 * look.thickness);
      this.collider.min.set(this.position.x - half, 0, this.position.z - half);
      this.collider.max.set(this.position.x + half, Math.max(0.3, look.height + look.headScale * 0.8), this.position.z + half);
    }
    this.sproutMode = look.kind === 'NONE';
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
    this.aware = 0;
    this.awareTarget = 0;
    this.glintT = 0;
    this.glint.visible = false;
    this.targetTint.setHex(0xffffff);
    this.tint.setHex(0xffffff);
    this.petalMat.color.setHex(0xffffff);
    this.setFace(face);
    this.root.visible = true;
  }

  public setVisible(v: boolean) {
    this.root.visible = v;
  }

  // 小苗閃光：玩家在範圍內每隔數秒閃現一顆極小光點 (0.4s)
  private updateGlint(dt: number) {
    if (!this.sproutMode) { if (this.glint.visible) this.glint.visible = false; return; }
    if (this.glintT > 0) {
      this.glintT -= dt;
      const k = Math.max(0, this.glintT / 0.4);
      this.glint.scale.setScalar(Math.sin(k * Math.PI));
      if (this.glintT <= 0) this.glint.visible = false;
      return;
    }
    if (this.awareTarget <= 0) { this.glintCd = Math.max(this.glintCd, 1.5); return; }
    this.glintCd -= dt;
    if (this.glintCd > 0) return;
    this.rnd = (this.rnd * 1664525 + 1013904223) >>> 0;
    const r1 = (this.rnd & 0xffff) / 0xffff;
    this.rnd = (this.rnd * 1664525 + 1013904223) >>> 0;
    const r2 = (this.rnd & 0xffff) / 0xffff;
    const h = sunflowerLook(this.growth).height;
    this.glint.position.set((r1 - 0.5) * 0.14, h * (0.55 + r2 * 0.5), (r2 - 0.5) * 0.1);
    this.glint.visible = true;
    this.glintT = 0.4;
    this.glintCd = 3 + r1 * 3;
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
    if (this.growth !== this.targetGrowth || this.growthVel !== 0) {
      // 彈簧 (略欠阻尼，約 0.5s 內長大並微微過衝)；子步避免大 dt 發散
      let left = Math.min(dt, 0.1);
      while (left > 0) {
        const h = Math.min(left, 1 / 120);
        this.growthVel += ((this.targetGrowth - this.growth) * SPRING_K - this.growthVel * SPRING_C) * h;
        this.growth += this.growthVel * h;
        left -= h;
      }
      if (Math.abs(this.targetGrowth - this.growth) < 0.002 && Math.abs(this.growthVel) < 0.02) { this.growth = this.targetGrowth; this.growthVel = 0; }
      this.applyGrowth();
    }
    this.aware += (this.awareTarget - this.aware) * Math.min(1, dt * 3);
    this.updateGlint(dt);
    if (this.twitch > 0) this.twitch -= dt;
    const jitter = this.shake * Math.sin(this.time * 55) + (this.twitch > 0 ? 0.1 * Math.sin(this.time * 70) * this.twitch : 0);
    // 待機輕晃
    const idle = Math.sin(this.time * 1.3) * 0.035;
    this.root.rotation.y = this.yaw;
    this.root.scale.setScalar(this.scale);
    // 小苗察覺玩家靠近：輕抖 + 微微朝玩家傾身 (只有在 5m 內才有，平時與草地融為一體)
    const sprout = this.sproutMode ? this.aware : 0;
    this.bendPivot.rotation.x = this.bend + idle * 0.5 + sprout * 0.14;
    this.bendPivot.rotation.z = jitter + sprout * 0.05 * Math.sin(this.time * 17);
    this.headPivot.rotation.x = this.headPitch;
    this.headPivot.scale.setScalar(this.headScaleBase * (1 + this.pulse * 0.25));
    this.bubble.update(dt);
  }
}
