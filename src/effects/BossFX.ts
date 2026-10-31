import * as THREE from 'three';
import { getFxTier, type FxTier } from './fxQuality';

// 花劍客 Boss 特效：每類 1 個 InstancedMesh (1 draw call)、依最高檔預建池、閒置 visible=false、執行期零配置。
// 1. 地面預警 decal (長條 / 圓 / 虛線點 / 大圈 / 脫戰回血綠光圈)：程序化 shader，加法混色、貼地細長
// 2. 花瓣粒子：剪裁 quad (discard，不透明、寫深度、無混合) → 數量大也幾乎不增加 overdraw
// 3. 花瓣柱 (S3 綻放)：開口圓柱加法混色
// 數量依 getFxTier() 降級；碰撞與命中判定一律在呼叫端以解析式計算，本模組只負責畫面。

interface BossFxTierSpec { decals: number; petals: number; pillarLayers: number; hatDots: number }
export const BOSS_FX_TIERS: Readonly<Record<FxTier, BossFxTierSpec>> = {
  high: { decals: 24, petals: 240, pillarLayers: 2, hatDots: 16 },
  medium: { decals: 24, petals: 160, pillarLayers: 2, hatDots: 16 },
  low: { decals: 16, petals: 80, pillarLayers: 1, hatDots: 8 }
};
const MAX_DECALS = 24;
const MAX_PETALS = 240;
const MAX_PILLARS = 18;
const REGEN_SLOT = 0; // 脫戰回血光圈固定佔用第 0 槽

export const DECAL_LINE = 0;
export const DECAL_CIRCLE = 1;
export const DECAL_DOT = 2;
export const DECAL_REGEN = 3;
export const DECAL_BIG = 4;

const DECAL_VERT = /* glsl */`
attribute vec4 aFx;
attribute vec3 aCol;
varying vec2 vUv;
varying vec4 vFx;
varying vec3 vCol;
void main() {
  vUv = uv; vFx = aFx; vCol = aCol;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
// aFx = (種類, 填充進度 0..1, 淡出, 時間)
const DECAL_FRAG = /* glsl */`
uniform float uOutline;
varying vec2 vUv;
varying vec4 vFx;
varying vec3 vCol;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float kind = vFx.x;
  float prog = vFx.y;
  float a = 0.0;
  float edge = 0.0;
  if (kind < 0.5) {
    // 長條：x 為長度方向 (-1 起點 → 1 終點)，邊框 + 由起點往終點填滿
    float u = p.x * 0.5 + 0.5;
    float bx = max(abs(p.x), abs(p.y));
    edge = smoothstep(0.82, 0.97, abs(p.y)) + smoothstep(0.96, 1.0, abs(p.x));
    float fill = step(u, prog) * 0.38;
    a = edge * 0.9 + fill + 0.1;
    a *= step(bx, 1.0);
  } else if (kind < 1.5 || kind > 3.5) {
    // 圓 / 大圈：外框 + 自中心向外擴的填充
    float r = length(p);
    edge = max(1.0 - abs(r - 0.94) / (kind > 3.5 ? 0.05 : 0.07), 0.0);
    float fill = (1.0 - step(prog, r)) * 0.35 * step(r, 1.0);
    float rim = max(1.0 - abs(r - prog) / 0.05, 0.0) * step(r, 1.0);
    float thorn = 0.0;
    if (kind > 3.5) {
      float ang = atan(p.y, p.x);
      thorn = pow(max(sin(ang * 18.0), 0.0), 8.0) * smoothstep(0.75, 0.93, r) * step(r, 0.95) * 0.8;
    }
    a = edge * 0.95 + fill + rim * 0.6 + thorn + 0.08 * step(r, 1.0);
  } else if (kind < 2.5) {
    float r = length(p);
    a = smoothstep(1.0, 0.55, r) * 0.9;
    edge = max(1.0 - abs(r - 0.8) / 0.15, 0.0);
  } else {
    // 脫戰回血：淡綠柔光圈 (呼吸)
    float r = length(p);
    float breathe = 0.75 + 0.25 * sin(vFx.w * 6.2831853);
    a = (max(1.0 - abs(r - 0.85) / 0.12, 0.0) * 0.8 + smoothstep(0.9, 0.2, r) * 0.18) * breathe;
  }
  vec3 col = mix(vCol, vec3(1.0), clamp(edge * uOutline, 0.0, 1.0) * step(kind, 4.5) * (1.0 - step(2.5, kind) * step(kind, 3.5)));
  float A = clamp(a, 0.0, 1.0) * vFx.z;
  gl_FragColor = vec4(col * A, A);
}`;

const PETAL_VERT = /* glsl */`
attribute vec3 aCol;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vUv = uv; vCol = aCol;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const PETAL_FRAG = /* glsl */`
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  // 花瓣形：一端尖的橢圓 (剪裁，不混合)
  float w = 1.0 - 0.55 * (p.y * 0.5 + 0.5);
  if ((p.x * p.x) / (w * w) + p.y * p.y > 1.0) discard;
  gl_FragColor = vec4(vCol * (0.85 + 0.15 * (1.0 - p.y)), 1.0);
}`;

const PILLAR_VERT = /* glsl */`
attribute vec4 aFx;
attribute vec3 aCol;
varying vec2 vUv;
varying vec4 vFx;
varying vec3 vCol;
void main() {
  vUv = uv; vFx = aFx; vCol = aCol;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const PILLAR_FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vFx;
varying vec3 vCol;
void main() {
  float h = vUv.y;
  float t = vFx.y;
  float streak = 0.6 + 0.4 * sin(vUv.x * 40.0 + h * 9.0 - t * 18.0);
  float a = (1.0 - h) * streak * vFx.z * 0.85;
  vec3 col = mix(vCol, vec3(1.0), (1.0 - h) * 0.35);
  gl_FragColor = vec4(col * a, a);
}`;

interface DecalSlot {
  life: number; max: number; kind: number;
  fillDur: number; // 填充時間 (秒；0 = 固定滿)
  x: number; y: number; z: number; yaw: number; sx: number; sz: number; color: number;
}
interface PetalSlot {
  life: number; max: number;
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  rx: number; ry: number; spin: number; size: number; color: number;
  swirl: number; cx: number; cz: number; // 龍捲：繞 (cx, cz) 旋轉的角速度 (0 = 一般拋射)
}
interface PillarSlot { life: number; max: number; x: number; z: number; r: number; h: number; color: number }

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

function writeColor(arr: Float32Array, i: number, hex: number) {
  arr[i * 3] = ((hex >> 16) & 255) / 255;
  arr[i * 3 + 1] = ((hex >> 8) & 255) / 255;
  arr[i * 3 + 2] = (hex & 255) / 255;
}

export const PETAL_PALETTE_ROSE: readonly number[] = [0xd61f4b, 0xf25c84, 0xb3123a, 0xffb3c6];
export const PETAL_PALETTE_SUN: readonly number[] = [0xf6c21c, 0xffd95a, 0xe89a0c, 0xfff1a8];
export const PETAL_PALETTE_LEAF: readonly number[] = [0x5fd47a, 0x8ef0a2, 0x3cb35a];
export const PETAL_PALETTE_DUSK: readonly number[] = [0x7a1035, 0xc2185b, 0xff8a65, 0xffd54f];

export class BossFX {
  public readonly group = new THREE.Group();
  private readonly decalMesh: THREE.InstancedMesh;
  private readonly decalFx: THREE.InstancedBufferAttribute;
  private readonly decalCol: THREE.InstancedBufferAttribute;
  private readonly decalMat: THREE.ShaderMaterial;
  private readonly decals: DecalSlot[] = [];
  private readonly petalMesh: THREE.InstancedMesh;
  private readonly petalCol: THREE.InstancedBufferAttribute;
  private readonly petals: PetalSlot[] = [];
  private readonly pillarMesh: THREE.InstancedMesh;
  private readonly pillarFx: THREE.InstancedBufferAttribute;
  private readonly pillarCol: THREE.InstancedBufferAttribute;
  private readonly pillars: PillarSlot[] = [];
  private time = 0;
  private regenOn = false;
  private readonly regenPos = new THREE.Vector3();
  private petalCursor = 0;

  constructor() {
    this.group.name = 'boss_fx';
    // 1. 地面 decal
    const dGeo = new THREE.PlaneGeometry(2, 2);
    this.decalFx = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.decalCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    dGeo.setAttribute('aFx', this.decalFx);
    dGeo.setAttribute('aCol', this.decalCol);
    this.decalMat = new THREE.ShaderMaterial({
      vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG,
      uniforms: { uOutline: { value: 0.25 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    this.decalMesh = new THREE.InstancedMesh(dGeo, this.decalMat, MAX_DECALS);
    this.decalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.decalMesh.frustumCulled = false;
    this.decalMesh.renderOrder = 1;
    for (let i = 0; i < MAX_DECALS; i++) {
      this.decals.push({ life: 0, max: 1, kind: 0, fillDur: 0, x: 0, y: 0, z: 0, yaw: 0, sx: 1, sz: 1, color: 0 });
      this.decalMesh.setMatrixAt(i, _zero);
    }
    this.decalMesh.visible = false;

    // 2. 花瓣
    const pGeo = new THREE.PlaneGeometry(1, 1.4);
    this.petalCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PETALS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    pGeo.setAttribute('aCol', this.petalCol);
    const pMat = new THREE.ShaderMaterial({ vertexShader: PETAL_VERT, fragmentShader: PETAL_FRAG, side: THREE.DoubleSide, fog: false });
    this.petalMesh = new THREE.InstancedMesh(pGeo, pMat, MAX_PETALS);
    this.petalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.petalMesh.frustumCulled = false;
    for (let i = 0; i < MAX_PETALS; i++) {
      this.petals.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, spin: 0, size: 0.2, color: 0, swirl: 0, cx: 0, cz: 0 });
      this.petalMesh.setMatrixAt(i, _zero);
    }
    this.petalMesh.visible = false;

    // 3. 花瓣柱
    const cGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0);
    this.pillarFx = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PILLARS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.pillarCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PILLARS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    cGeo.setAttribute('aFx', this.pillarFx);
    cGeo.setAttribute('aCol', this.pillarCol);
    const cMat = new THREE.ShaderMaterial({
      vertexShader: PILLAR_VERT, fragmentShader: PILLAR_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false, blending: THREE.AdditiveBlending
    });
    this.pillarMesh = new THREE.InstancedMesh(cGeo, cMat, MAX_PILLARS);
    this.pillarMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pillarMesh.frustumCulled = false;
    for (let i = 0; i < MAX_PILLARS; i++) {
      this.pillars.push({ life: 0, max: 1, x: 0, z: 0, r: 1, h: 1, color: 0 });
      this.pillarMesh.setMatrixAt(i, _zero);
    }
    this.pillarMesh.visible = false;

    this.group.add(this.decalMesh, this.petalMesh, this.pillarMesh);
  }

  private get tier(): BossFxTierSpec {
    return BOSS_FX_TIERS[getFxTier()];
  }

  public get hatDotCount(): number {
    return this.tier.hatDots;
  }

  /** 手機版預警加白描邊 (對比更高) */
  public setHighContrast(on: boolean) {
    this.decalMat.uniforms.uOutline.value = on ? 0.85 : 0.25;
  }

  // ===== 地面預警 =====

  private allocDecal(): number {
    const cap = this.tier.decals;
    let best = -1;
    let bestLife = Infinity;
    for (let i = 1; i < cap; i++) {
      const d = this.decals[i];
      if (d.life <= 0) return i;
      if (d.life < bestLife) { bestLife = d.life; best = i; }
    }
    return best;
  }

  private spawnDecal(kind: number, x: number, z: number, yaw: number, sx: number, sz: number, life: number, fillDur: number, color: number): number {
    const i = this.allocDecal();
    if (i < 0) return -1;
    const d = this.decals[i];
    d.kind = kind; d.life = d.max = life; d.fillDur = fillDur;
    d.x = x; d.y = 0.06 + i * 0.002; d.z = z; d.yaw = yaw; d.sx = sx; d.sz = sz; d.color = color;
    this.decalMesh.visible = true;
    return i;
  }

  /** 長條預警：(ax, az) → (bx, bz)、半寬 halfW；fill 秒內由起點填滿，life 秒後消失 */
  public warnLine(ax: number, az: number, bx: number, bz: number, halfW: number, fill: number, life: number, color: number): number {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) return -1;
    return this.spawnDecal(DECAL_LINE, (ax + bx) / 2, (az + bz) / 2, Math.atan2(-dz, dx), len / 2, halfW, life, fill, color);
  }

  /** 圓形預警 (big = 終幕大圈，帶荊棘紋) */
  public warnCircle(x: number, z: number, r: number, fill: number, life: number, color: number, big: boolean = false): number {
    return this.spawnDecal(big ? DECAL_BIG : DECAL_CIRCLE, x, z, 0, r, r, life, fill, color);
  }

  public warnDot(x: number, z: number, r: number, life: number, color: number): number {
    return this.spawnDecal(DECAL_DOT, x, z, 0, r, r, life, 0, color);
  }

  public clearDecal(i: number) {
    if (i <= 0 || i >= MAX_DECALS) return;
    this.decals[i].life = 0;
  }

  /** 脫戰回血：玩家腳下淡綠光圈 (固定槽，不新增 draw call) */
  public setRegenRing(on: boolean, pos?: THREE.Vector3) {
    this.regenOn = on;
    if (pos) this.regenPos.copy(pos);
    if (on) this.decalMesh.visible = true;
  }

  // ===== 花瓣 =====

  /** 花瓣爆散：自 (x, y, z) 向外拋射 count 片 */
  public petalBurst(x: number, y: number, z: number, count: number, speed: number, palette: readonly number[], upward: number = 2.5) {
    const n = Math.min(count, this.tier.petals);
    for (let k = 0; k < n; k++) {
      const p = this.allocPetal();
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = upward * (0.5 + Math.random());
      p.life = p.max = 1.1 + Math.random() * 0.8;
      p.rx = Math.random() * 6; p.ry = Math.random() * 6; p.spin = (Math.random() - 0.5) * 14;
      p.size = 0.14 + Math.random() * 0.1;
      p.color = palette[k % palette.length];
      p.swirl = 0;
    }
  }

  /** 花瓣龍捲：繞 (cx, cz) 螺旋上升 */
  public petalTornado(cx: number, cz: number, radius: number, count: number, palette: readonly number[], life: number = 2.0) {
    const n = Math.min(count, this.tier.petals);
    for (let k = 0; k < n; k++) {
      const p = this.allocPetal();
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.35 + Math.random() * 0.65);
      p.cx = cx; p.cz = cz;
      p.x = cx + Math.cos(a) * r; p.z = cz + Math.sin(a) * r; p.y = Math.random() * 0.5;
      p.vx = r; p.vz = a; // 龍捲模式：vx = 半徑、vz = 角度
      p.vy = 1.5 + Math.random() * 2.5;
      p.swirl = 3.5 + Math.random() * 3;
      p.life = p.max = life * (0.7 + Math.random() * 0.3);
      p.rx = Math.random() * 6; p.ry = Math.random() * 6; p.spin = (Math.random() - 0.5) * 10;
      p.size = 0.16 + Math.random() * 0.12;
      p.color = palette[k % palette.length];
    }
  }

  private allocPetal(): PetalSlot {
    const cap = this.tier.petals;
    this.petalCursor = (this.petalCursor + 1) % cap;
    this.petalMesh.visible = true;
    return this.petals[this.petalCursor];
  }

  // ===== 花瓣柱 =====

  public pillar(x: number, z: number, r: number, color: number) {
    const layers = this.tier.pillarLayers;
    for (let l = 0; l < layers; l++) {
      let idx = -1;
      for (let i = 0; i < MAX_PILLARS; i++) if (this.pillars[i].life <= 0) { idx = i; break; }
      if (idx < 0) return;
      const s = this.pillars[idx];
      s.x = x; s.z = z; s.r = r * (l === 0 ? 1 : 0.6); s.h = l === 0 ? 3.2 : 4.6; s.color = color;
      s.life = s.max = 0.55;
    }
    this.pillarMesh.visible = true;
  }

  // ===== 每幀 =====

  public update(dt: number) {
    this.time += dt;
    this.updateDecals(dt);
    this.updatePetals(dt);
    this.updatePillars(dt);
  }

  private updateDecals(dt: number) {
    if (!this.decalMesh.visible) return;
    const fx = this.decalFx.array as Float32Array;
    const col = this.decalCol.array as Float32Array;
    let alive = 0;
    // 第 0 槽：回血光圈
    if (this.regenOn) {
      alive++;
      _p.set(this.regenPos.x, this.regenPos.y + 0.05, this.regenPos.z);
      _q.setFromAxisAngle(_xAxis, -Math.PI / 2);
      _m.compose(_p, _q, _s.set(1.1, 1.1, 1));
      this.decalMesh.setMatrixAt(REGEN_SLOT, _m);
      fx[0] = DECAL_REGEN; fx[1] = 1; fx[2] = 1; fx[3] = this.time;
      writeColor(col, REGEN_SLOT, 0x58e08a);
    } else {
      this.decalMesh.setMatrixAt(REGEN_SLOT, _zero);
      fx[2] = 0;
    }
    for (let i = 1; i < MAX_DECALS; i++) {
      const d = this.decals[i];
      if (d.life <= 0) {
        if (fx[i * 4 + 2] !== 0) { this.decalMesh.setMatrixAt(i, _zero); fx[i * 4 + 2] = 0; }
        continue;
      }
      d.life -= dt;
      if (d.life <= 0) { this.decalMesh.setMatrixAt(i, _zero); fx[i * 4 + 2] = 0; continue; }
      alive++;
      const elapsed = d.max - d.life;
      const prog = d.fillDur > 0 ? Math.min(1, elapsed / d.fillDur) : 1;
      const fade = Math.min(1, d.life / 0.15) * Math.min(1, elapsed / 0.08);
      _p.set(d.x, d.y, d.z);
      _q.setFromAxisAngle(_yAxis, d.yaw);
      _q2.setFromAxisAngle(_xAxis, -Math.PI / 2);
      _q.multiply(_q2);
      _m.compose(_p, _q, _s.set(d.sx, d.sz, 1));
      this.decalMesh.setMatrixAt(i, _m);
      fx[i * 4] = d.kind; fx[i * 4 + 1] = prog; fx[i * 4 + 2] = fade; fx[i * 4 + 3] = this.time;
      writeColor(col, i, d.color);
    }
    this.decalMesh.instanceMatrix.needsUpdate = true;
    this.decalFx.needsUpdate = true;
    this.decalCol.needsUpdate = true;
    if (alive === 0) this.decalMesh.visible = false;
  }

  private updatePetals(dt: number) {
    if (!this.petalMesh.visible) return;
    const col = this.petalCol.array as Float32Array;
    let alive = 0;
    for (let i = 0; i < MAX_PETALS; i++) {
      const p = this.petals[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { this.petalMesh.setMatrixAt(i, _zero); continue; }
      alive++;
      if (p.swirl > 0) {
        p.vz += p.swirl * dt; // 角度
        p.vx *= 1 - dt * 0.25; // 半徑收束
        p.x = p.cx + Math.cos(p.vz) * p.vx;
        p.z = p.cz + Math.sin(p.vz) * p.vx;
        p.y += p.vy * dt;
      } else {
        p.vy -= 3.2 * dt;
        const drag = 1 - Math.min(1, dt * 1.6);
        p.vx *= drag; p.vz *= drag;
        if (p.vy < -1.4) p.vy = -1.4; // 飄落終端速度
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.03) { p.y = 0.03; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
      }
      p.rx += p.spin * dt;
      p.ry += p.spin * 0.7 * dt;
      const k = Math.min(1, p.life / 0.3);
      _p.set(p.x, p.y, p.z);
      _q.setFromEuler(_e.set(p.rx, p.ry, 0));
      _m.compose(_p, _q, _s.setScalar(p.size * k));
      this.petalMesh.setMatrixAt(i, _m);
      writeColor(col, i, p.color);
    }
    this.petalMesh.instanceMatrix.needsUpdate = true;
    this.petalCol.needsUpdate = true;
    if (alive === 0) this.petalMesh.visible = false;
  }

  private updatePillars(dt: number) {
    if (!this.pillarMesh.visible) return;
    const fx = this.pillarFx.array as Float32Array;
    const col = this.pillarCol.array as Float32Array;
    let alive = 0;
    for (let i = 0; i < MAX_PILLARS; i++) {
      const s = this.pillars[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { this.pillarMesh.setMatrixAt(i, _zero); continue; }
      alive++;
      const t = 1 - s.life / s.max;
      const grow = Math.min(1, t / 0.25);
      _p.set(s.x, 0, s.z);
      _q.identity();
      _m.compose(_p, _q, _s.set(s.r * (0.8 + 0.3 * t), s.h * grow, s.r * (0.8 + 0.3 * t)));
      this.pillarMesh.setMatrixAt(i, _m);
      fx[i * 4] = 0; fx[i * 4 + 1] = t; fx[i * 4 + 2] = Math.min(1, s.life / 0.2); fx[i * 4 + 3] = 0;
      writeColor(col, i, s.color);
    }
    this.pillarMesh.instanceMatrix.needsUpdate = true;
    this.pillarFx.needsUpdate = true;
    this.pillarCol.needsUpdate = true;
    if (alive === 0) this.pillarMesh.visible = false;
  }

  public reset() {
    for (const d of this.decals) d.life = 0;
    for (const p of this.petals) p.life = 0;
    for (const s of this.pillars) s.life = 0;
    this.regenOn = false;
    for (let i = 0; i < MAX_DECALS; i++) this.decalMesh.setMatrixAt(i, _zero);
    for (let i = 0; i < MAX_PETALS; i++) this.petalMesh.setMatrixAt(i, _zero);
    for (let i = 0; i < MAX_PILLARS; i++) this.pillarMesh.setMatrixAt(i, _zero);
    (this.decalFx.array as Float32Array).fill(0);
    this.decalMesh.instanceMatrix.needsUpdate = true;
    this.petalMesh.instanceMatrix.needsUpdate = true;
    this.pillarMesh.instanceMatrix.needsUpdate = true;
    this.decalFx.needsUpdate = true;
    this.decalMesh.visible = false;
    this.petalMesh.visible = false;
    this.pillarMesh.visible = false;
  }

  /** shader 預熱：三類 mesh 暫時顯示交給 compile 後還原 */
  public prewarm(compile: () => void) {
    const v = [this.decalMesh.visible, this.petalMesh.visible, this.pillarMesh.visible];
    this.decalMesh.visible = this.petalMesh.visible = this.pillarMesh.visible = true;
    compile();
    [this.decalMesh.visible, this.petalMesh.visible, this.pillarMesh.visible] = v;
  }
}
