import * as THREE from 'three';
import { getFxQuality } from './fxQuality';

// 斬痕特效 (雙燕羽刃)：命中閃光 / 交叉 X 光痕 / 蓄力收束光環 / 突進光帶與風痕，全部共用 1 個 InstancedMesh (1 draw call)。
// 形狀由 fragment shader 依實例種類程序繪製 (免貼圖)，輸出預乘 alpha (ONE / ONE_MINUS_SRC_ALPHA)，
// 亮色地面上兼具發光與遮蓋。預建物件池，閒置時 visible=false，執行期零配置。
const KIND_FLASH = 0;
const KIND_STREAK = 1;
const KIND_RING = 2;
const KIND_CHARGE = 3;
const FLASH_LIFE = 0.12;
const FLASH_SIZE = 0.45;   // 命中閃光半邊長 (整體 0.9m)
const STREAK_LIFE = 0.28;
const STREAK_HALF_LEN = 0.9; // X 字單臂長 1.8m
const STREAK_HALF_WIDTH = 0.4;
const STREAK_FORWARD = 1.2;  // X 字中心在面前距離
const STREAK_TILT = Math.PI / 4;
const RING_LIFE = 0.4;
const CHARGE_LIFE = 0.2;
const CHARGE_RADIUS = 1.9;   // 蓄力光環起始半徑，向內收到約 0.35m
const DASH_BAND_LIFE = 0.34;

const VERT = /* glsl */`
attribute vec4 aFx;
attribute vec3 aCol;
varying vec2 vUv;
varying vec4 vFx;
varying vec3 vCol;
void main() {
  vUv = uv;
  vFx = aFx;
  vCol = aCol;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

// aFx = (種類, 進度 0..1, 整體淡出, 旋向 ±1)
const FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vFx;
varying vec3 vCol;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float kind = vFx.x;
  float t = vFx.y;
  float a = 0.0;
  float core = 0.0;
  if (kind < 0.5) {
    // 命中閃光：亮核 + 十字 / 斜十字星芒
    float r = length(p);
    float g = pow(max(1.0 - r, 0.0), 2.5);
    vec2 q = vec2(p.x + p.y, p.x - p.y) * 0.7071;
    float sx = exp(-abs(p.y) * 24.0) * max(1.0 - abs(p.x), 0.0);
    float sy = exp(-abs(p.x) * 24.0) * max(1.0 - abs(p.y), 0.0);
    float dx = exp(-abs(q.y) * 30.0) * max(1.0 - abs(q.x), 0.0) * 0.5;
    float dy = exp(-abs(q.x) * 30.0) * max(1.0 - abs(q.y), 0.0) * 0.5;
    a = g + sx + sy + dx + dy;
    core = g;
  } else if (kind < 1.5) {
    // 斬痕刀光：由 x = -1 劃向 x = +1，頭亮尾細，兩端尖
    float u = p.x * 0.5 + 0.5;
    float head = t * 1.3;
    float along = smoothstep(head - 0.6, head, u) * (1.0 - smoothstep(head, head + 0.03, u));
    float w = mix(0.05, 0.3, along) * (1.0 - pow(abs(p.x), 4.0));
    float prof = max(1.0 - abs(p.y) / max(w, 0.001), 0.0);
    a = prof * prof * along * 1.4;
    core = prof * prof * prof * along;
  } else if (kind > 2.5) {
    // 蓄力光環：細亮環，隨進度由暗轉亮 (半徑縮小由實例矩陣負責)
    float r = length(p);
    float band = max(1.0 - abs(r - 0.92) / 0.07, 0.0);
    a = band * band * (0.35 + 0.65 * t);
    core = band * band * band;
  } else {
    // 水平斬痕環：弧形刀光繞圈橫掃，頭粗亮、尾細，帶淡淡的內圈氣流
    float r = length(p);
    float theta = mod(atan(p.y, p.x) * vFx.w + 6.2831853, 6.2831853) / 6.2831853;
    float head = t * 1.35;
    float d1 = head - theta;
    float d2 = head - 1.0 - theta;
    float len = 0.62;
    float f1 = (d1 >= 0.0 && d1 <= len) ? (1.0 - d1 / len) * smoothstep(0.0, 0.05, d1) : 0.0;
    float f2 = (d2 >= 0.0 && d2 <= len) ? (1.0 - d2 / len) * smoothstep(0.0, 0.05, d2) : 0.0;
    float along = max(f1, f2);
    float hw = mix(0.015, 0.075, along);
    float band = max(1.0 - abs(r - 0.92) / hw, 0.0);
    float disc = smoothstep(0.3, 0.92, r) * (1.0 - step(0.92, r)) * along * 0.22;
    a = band * band * along * 1.5 + disc;
    core = band * band * band * along;
  }
  float A = clamp(a, 0.0, 1.0) * vFx.z;
  vec3 col = mix(vCol, vec3(1.0), clamp(core * 0.85, 0.0, 1.0));
  gl_FragColor = vec4(col * A * 1.15, A * 0.7);
}`;

interface Slot {
  life: number;
  max: number;
  kind: number;
  x: number; y: number; z: number;
  yaw: number;   // 繞 Y 軸 (X 字朝向 / 環起始角)
  roll: number;  // 繞面法線 (X 字斜角 / 閃光旋轉)
  size: number;  // 主尺寸 (半邊長或半徑)
  dir: number;   // 環旋向 ±1
  hw: number;    // 刀光半寬 (公尺，只用於 KIND_STREAK)
  flat: boolean; // 刀光水平躺平 (突進光帶 / 風痕)
  color: number;
}

const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

class SlashFXSystem {
  private mesh: THREE.InstancedMesh | null = null;
  private fxAttr!: THREE.InstancedBufferAttribute;
  private colAttr!: THREE.InstancedBufferAttribute;
  private slots: Slot[] = [];
  private active = 0;

  // 初始化並加入場景 (閒置時 visible=false，不產生 draw call)
  public init(scene: THREE.Object3D) {
    if (this.mesh) return;
    const n = getFxQuality().slashPool;
    const geo = new THREE.PlaneGeometry(2, 2);
    this.fxAttr = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFx', this.fxAttr);
    geo.setAttribute('aCol', this.colAttr);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation
    });
    mat.forceSinglePass = true; // 雙面透明預設分兩趟繪製，強制單趟以維持 1 draw call
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, _zeroMatrix);
      this.slots.push({ life: 0, max: 1, kind: 0, x: 0, y: 0, z: 0, yaw: 0, roll: 0, size: 1, dir: 1, hw: STREAK_HALF_WIDTH, flat: false, color: 0xffffff });
    }
    this.mesh.frustumCulled = false; // 實例每幀移動，略過整體包圍球剔除
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  // 暫時顯示以便 renderer.compile 預熱 shader
  public prewarm(compile: () => void) {
    if (!this.mesh) return;
    this.mesh.visible = true;
    compile();
    this.mesh.visible = false;
  }

  // 清空所有進行中的特效 (切換世界 / 死亡復活時呼叫)，不配置新物件
  public reset() {
    if (!this.mesh) return;
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].life = 0;
      this.mesh.setMatrixAt(i, _zeroMatrix);
    }
    this.fxAttr.array.fill(0);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.fxAttr.needsUpdate = true;
    this.active = 0;
    this.mesh.visible = false;
  }

  // 取空槽；池滿時 force 者覆蓋剩餘壽命比例最小者，否則放棄 (回傳 null)
  private alloc(force: boolean): Slot | null {
    let oldest = -1;
    let oldestRatio = Infinity;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.life <= 0) { this.active++; return s; }
      const ratio = s.life / s.max;
      if (ratio < oldestRatio) { oldestRatio = ratio; oldest = i; }
    }
    return force && oldest >= 0 ? this.slots[oldest] : null;
  }

  private spawn(kind: number, life: number, x: number, y: number, z: number, yaw: number, roll: number, size: number, dir: number, color: number, force: boolean, hw: number = STREAK_HALF_WIDTH, flat: boolean = false) {
    const s = this.alloc(force);
    if (!s) return;
    s.kind = kind; s.life = s.max = life;
    s.x = x; s.y = y; s.z = z; s.yaw = yaw; s.roll = roll; s.size = size; s.dir = dir; s.color = color; s.hw = hw; s.flat = flat;
    this.mesh!.visible = true;
  }

  // 命中閃光 (0.12s、約 0.9m 星芒)；池滿時略過
  public hitFlash(x: number, y: number, z: number, color: number) {
    this.spawn(KIND_FLASH, FLASH_LIFE, x, y, z, 0, Math.random() * 0.8, FLASH_SIZE, 1, color, false);
  }

  // 交叉 X 光痕：以 (x, y, z) 為玩家位置，面向 yaw 前方 1.2m、離地 y；兩道 ±45° 刀光，各取左右拍主色
  public crossSlash(x: number, y: number, z: number, yaw: number, colorA: number, colorB: number) {
    this.crossAt(x + Math.sin(yaw) * STREAK_FORWARD, y, z + Math.cos(yaw) * STREAK_FORWARD, yaw, STREAK_HALF_LEN, colorA, colorB);
  }

  // 任意位置、任意大小的交叉 X 光痕 (halfLen 為單臂半長；面朝 yaw 方向，鏡頭在身後時正對鏡頭)
  public crossAt(x: number, y: number, z: number, yaw: number, halfLen: number, colorA: number, colorB: number) {
    this.spawn(KIND_STREAK, STREAK_LIFE, x, y, z, yaw, -STREAK_TILT, halfLen, 1, colorA, true);
    this.spawn(KIND_STREAK, STREAK_LIFE, x, y, z, yaw, Math.PI + STREAK_TILT, halfLen, 1, colorB, true);
  }

  // 蓄力收束光環：自玩家身邊向內收的兩圈 (主色 / 副色)
  public chargeRing(x: number, y: number, z: number, colorA: number, colorB: number) {
    this.spawn(KIND_CHARGE, CHARGE_LIFE, x, y, z, 0, 0, CHARGE_RADIUS, 1, colorA, true);
    if (!getFxQuality().mobile) this.spawn(KIND_CHARGE, CHARGE_LIFE, x, y + 0.35, z, 0, 0, CHARGE_RADIUS * 0.8, 1, colorB, true);
  }

  // 突進光帶 / 風痕：自 (ox, oz) 沿水平方向橫掃到 (ex, ez)，躺平於離地 y、半寬 hw
  public dashBand(ox: number, oz: number, ex: number, ez: number, y: number, hw: number, color: number) {
    const dx = ex - ox;
    const dz = ez - oz;
    const len = Math.hypot(dx, dz);
    if (len < 0.3) return;
    this.spawn(KIND_STREAK, DASH_BAND_LIFE, (ox + ex) / 2, y, (oz + ez) / 2, Math.atan2(-dz, dx), 0, len / 2, 1, color, true, hw, true);
  }

  // 水平斬痕環：圓心 (x, y, z)、半徑 radius，弧形刀光繞圈橫掃一周 (dir ±1 為旋向)
  public ringSlash(x: number, y: number, z: number, radius: number, color: number, yaw: number, dir: number) {
    this.spawn(KIND_RING, RING_LIFE, x, y, z, yaw, 0, radius, dir, color, true);
  }

  public update(delta: number, camera: THREE.Camera) {
    const mesh = this.mesh;
    if (!mesh || this.active === 0) return;
    const fx = this.fxAttr.array as Float32Array;
    const col = this.colAttr.array as Float32Array;
    let alive = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.life <= 0) continue;
      s.life -= delta;
      if (s.life <= 0) {
        mesh.setMatrixAt(i, _zeroMatrix);
        fx[i * 4 + 2] = 0;
        continue;
      }
      alive++;
      const t = 1 - s.life / s.max;
      _pos.set(s.x, s.y, s.z);
      if (s.kind === KIND_FLASH) {
        _q2.setFromAxisAngle(_zAxis, s.roll);
        _quat.copy(camera.quaternion).multiply(_q2);
        _matrix.compose(_pos, _quat, _scl.setScalar(s.size * (0.7 + 0.5 * t)));
      } else if (s.kind === KIND_STREAK) {
        _quat.setFromAxisAngle(_yAxis, s.yaw);
        _q2.setFromAxisAngle(s.flat ? _xAxis : _zAxis, s.flat ? -Math.PI / 2 : s.roll);
        _quat.multiply(_q2);
        _matrix.compose(_pos, _quat, _scl.set(s.size, s.hw, 1));
      } else if (s.kind === KIND_CHARGE) {
        _matrix.compose(_pos, _quat.setFromAxisAngle(_xAxis, -Math.PI / 2), _scl.set(s.size * (1 - 0.8 * t), s.size * (1 - 0.8 * t), 1));
      } else {
        _quat.setFromAxisAngle(_yAxis, s.yaw);
        _q2.setFromAxisAngle(_xAxis, -Math.PI / 2);
        _quat.multiply(_q2);
        _matrix.compose(_pos, _quat, _scl.set(s.size, s.size, 1));
      }
      mesh.setMatrixAt(i, _matrix);
      // 閃光越晚越淡；刀光與環在後 30% 壽命淡出
      const fade = s.kind === KIND_FLASH ? 1 - t * t : Math.min(1, (1 - t) / 0.3);
      fx[i * 4] = s.kind; fx[i * 4 + 1] = t; fx[i * 4 + 2] = fade; fx[i * 4 + 3] = s.dir;
      // 自訂 shader 不做色彩空間轉換：直接寫入 sRGB 色值，畫面顏色即設定色
      col[i * 3] = ((s.color >> 16) & 255) / 255; col[i * 3 + 1] = ((s.color >> 8) & 255) / 255; col[i * 3 + 2] = (s.color & 255) / 255;
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.fxAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.active = alive;
    if (alive === 0) mesh.visible = false;
  }
}

export const slashFX = new SlashFXSystem();
