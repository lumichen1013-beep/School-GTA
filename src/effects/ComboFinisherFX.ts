import * as THREE from 'three';
import { FX_POOL_MAX, getFxQuality } from './fxQuality';
import { updateVisibleMatricesOnly } from '../core/matrixUpdate';
import type { WeaponFxStyle } from './weaponFxStyle';

// 連段終結技特效：發光裂痕 / 衝擊波環 / 塵土 / 黃金棒雷電，各類以單一 InstancedMesh 繪製 (每類 1 draw call)。
// 全為預建物件池 (容量取各畫質檔位最大值)，閒置時 visible=false (不產生 draw call)，執行期零配置；碎石由 ImpactDust 負責。
// 實際使用量 / 尺寸 / 層數於每次施放時讀取目前檔位 (getFxQuality)，執行期改檔立即生效。
const CRACK_FADE_START = 0.4; // 裂痕維持滿亮度的壽命比例，之後線性淡出
const CRACK_POP = 0.1;        // 裂痕彈出放大秒數
const RING_LIFE = 0.45;
const RING_REACH = 1.45;       // 環最大半徑 = 群攻半徑 × 此倍率 (視覺誇大，不影響判定)
const RING2_DELAY = 0.08;     // 第二圈錯開時間
const RING2_SCALE = 0.72;     // 第二圈相對大小
const CRACK_SCALE = 3.4;      // 裂痕邊長 = 群攻半徑 × 此倍率 (受品質上限約束)
const CRACK_LAYERS_MAX = 3;   // 每道裂痕最多疊 3 層實例：焦黑底 / 色光 / 白熱芯 (低檔只疊前 2 層)
const DUST_LIFE = 0.7;
const BOLT_LIFE = 0.4;
const BOLT_REVEAL = 0.1;      // 雷電由地面向上竄起所需秒數
const BOLT_JITTER_INTERVAL = 0.04; // 雷電折線重新抖動間隔
const BOLT_HEIGHT = 9;
const BOLT_THICKNESS = 0.07;
const GOLD_BOLT_A = 0xfff27a;
const GOLD_BOLT_B = 0x8fd3ff;
const BOLT_CORE = 0xffffff;
const SCORCH_COLOR = 0x2a1608; // 裂痕焦黑底色 (亮色地面上提供對比)
const FEATHER_LIFE = 0.9;
const FEATHER_GRAVITY = 7;
const FEATHER_COLORS = [0xffffff, 0x2ef2c8, 0xff6fcf] as const; // 白 / 青 / 粉 (雙燕羽刃)

const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _color = new THREE.Color();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _euler = new THREE.Euler();
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

// 程序產生放射狀裂紋貼圖 (透明底、白色裂紋，實際顏色由 instanceColor 染色)
function createCrackTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  const rays = 12;
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    let x = c, y = c, a = a0;
    const len = c * (0.75 + Math.random() * 0.22);
    const steps = 7;
    for (let s = 0; s < steps; s++) {
      const stepLen = len / steps;
      const nx = x + Math.cos(a) * stepLen;
      const ny = y + Math.sin(a) * stepLen;
      ctx.lineWidth = 8 * (1 - s / steps) + 1.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      // 分岔細紋
      if (s > 0 && s < steps - 1 && Math.random() < 0.6) {
        const ba = a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(nx, ny);
        ctx.lineTo(nx + Math.cos(ba) * stepLen * 1.3, ny + Math.sin(ba) * stepLen * 1.3);
        ctx.stroke();
      }
      x = nx; y = ny;
      a += (Math.random() - 0.5) * 0.7;
    }
  }
  // 中心熔光
  const glow = ctx.createRadialGradient(c, c, 0, c, c, c * 0.6);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  // 邊緣淡出
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(c, c, c * 0.62, c, c, c);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 柔邊圓點貼圖 (塵土 billboard)
function createPuffTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 衝擊波環柔邊貼圖：白色徑向光帶 (內緣透明 → 亮緣 → 外緣淡出)，配合 RingGeometry 內半徑 0.55
function createRingTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, c * 0.55, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.3)');
  g.addColorStop(0.8, 'rgba(255,255,255,1)');
  g.addColorStop(0.93, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 顏色往白色混合 (t = 0 原色、1 純白)，不配置物件
function mixWhite(hex: number, t: number): number {
  const r = ((hex >> 16) & 255) + (255 - ((hex >> 16) & 255)) * t;
  const g = ((hex >> 8) & 255) + (255 - ((hex >> 8) & 255)) * t;
  const b = (hex & 255) + (255 - (hex & 255)) * t;
  return ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
}

// 建立附 instanceColor 的實例化網格 (全部歸零並隱藏)
function createInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, order: number, withColor: boolean): THREE.InstancedMesh {
  if (withColor) geo.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  for (let i = 0; i < count; i++) {
    mesh.setMatrixAt(i, _zeroMatrix);
    if (withColor) mesh.setColorAt(i, _color.setRGB(1, 1, 1));
  }
  mesh.frustumCulled = false; // 實例每幀移動，略過整體包圍球剔除
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = order;
  mesh.visible = false;
  return mesh;
}

// 實例透明度材質：一般混合 (亮色地面上 Additive 會被洗白而看不見)，每實例淡出由 instanceAlpha 屬性控制
function fadeMat(map: THREE.Texture | null, doubleSided: boolean): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide, fog: false, toneMapped: false,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float instanceAlpha;\nvarying float vInstA;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', 'vInstA = instanceAlpha;\n#include <begin_vertex>');
    shader.fragmentShader = 'varying float vInstA;\n' +
      shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vInstA;');
  };
  mat.customProgramCacheKey = () => 'comboFxFade';
  if (doubleSided) mat.forceSinglePass = true; // 雙面透明預設分兩趟繪製，強制單趟以維持 1 draw call
  return mat;
}

// 設定實例顏色與透明度
function setFx(mesh: THREE.InstancedMesh, i: number, hex: number, alpha: number) {
  mesh.setColorAt(i, _color.setHex(hex));
  (mesh.geometry.getAttribute('instanceAlpha') as THREE.BufferAttribute).setX(i, alpha);
}

function flushFx(mesh: THREE.InstancedMesh) {
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor!.needsUpdate = true;
  (mesh.geometry.getAttribute('instanceAlpha') as THREE.BufferAttribute).needsUpdate = true;
}

interface Crack { life: number; max: number; x: number; y: number; z: number; rot: number; size: number; color: number; core: number; layers: number }
interface Ring { life: number; delay: number; x: number; y: number; z: number; radius: number; color: number }
interface Puff { life: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number }
interface Feather { life: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number; phase: number; color: number }

class ComboFinisherFXSystem {
  private crackMesh: THREE.InstancedMesh | null = null;
  private ringMesh: THREE.InstancedMesh | null = null;
  private dustMesh: THREE.InstancedMesh | null = null;
  private boltMesh: THREE.InstancedMesh | null = null;
  private featherMesh: THREE.InstancedMesh | null = null;
  private feathers: Feather[] = [];
  private featherActive = 0;
  private cracks: Crack[] = [];
  private rings: Ring[] = [];
  private puffs: Puff[] = [];
  private nextCrack = 0;
  private nextRing = 0;
  private nextPuff = 0;
  private crackActive = 0;
  private ringActive = 0;
  private puffActive = 0;
  // 雷電 (同時僅一組)：折線頂點緩衝 [strand][segment+1][xyz]
  private boltPts!: Float32Array;
  private boltLife = 0;
  private boltJitter = 0;
  private boltX = 0; private boltY = 0; private boltZ = 0;
  private strands = 0;
  private segments = 0;

  // 初始化並加入場景 (閒置時皆 visible=false，不產生 draw call)
  public init(scene: THREE.Object3D) {
    if (this.crackMesh) return;
    const P = FX_POOL_MAX;

    const crackGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const crackMat = fadeMat(createCrackTexture(), false);
    crackMat.polygonOffset = true;
    crackMat.polygonOffsetFactor = -2;
    crackMat.polygonOffsetUnits = -2;
    // 每道裂痕固定佔 CRACK_LAYERS_MAX 個實例 (索引 i * CRACK_LAYERS_MAX + 層)，實際疊層數依施放當下檔位
    this.crackMesh = createInstanced(crackGeo, crackMat, P.crackPool * CRACK_LAYERS_MAX, 3, true);
    for (let i = 0; i < P.crackPool; i++) this.cracks.push({ life: 0, max: 1, x: 0, y: 0, z: 0, rot: 0, size: 1, color: 0xffffff, core: 0xffffff, layers: CRACK_LAYERS_MAX });

    const ringGeo = new THREE.RingGeometry(0.55, 1, 48).rotateX(-Math.PI / 2);
    this.ringMesh = createInstanced(ringGeo, fadeMat(createRingTexture(), true), P.ringPool, 4, true);
    for (let i = 0; i < P.ringPool; i++) this.rings.push({ life: 0, delay: 0, x: 0, y: 0, z: 0, radius: 1, color: 0xffffff });

    // 塵土一律預建 (低檔 dustPool = 0 時不施放)，執行期升檔即可使用
    if (P.dustPool > 0) {
      const dustMat = new THREE.MeshBasicMaterial({
        map: createPuffTexture(), color: 0xa09688, transparent: true, opacity: 0.7, depthWrite: false, fog: true,
      });
      this.dustMesh = createInstanced(new THREE.PlaneGeometry(1, 1), dustMat, P.dustPool, 2, false);
      for (let i = 0; i < P.dustPool; i++) this.puffs.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1 });
    }

    // 雷電實例依最多條數 × 最多段數預建；實際條數 / 段數於 spawnBolt 時取目前檔位
    const boltGeo = new THREE.BoxGeometry(BOLT_THICKNESS, 1, BOLT_THICKNESS);
    this.boltMesh = createInstanced(boltGeo, fadeMat(null, false), P.lightningStrands * P.lightningSegments, 5, true);
    this.boltPts = new Float32Array(P.lightningStrands * (P.lightningSegments + 1) * 3);

    // 羽毛 (雙燕羽刃終結技)：葉形薄片，白 / 青 / 粉 instanceColor
    const leaf = new THREE.Shape();
    leaf.moveTo(0, -0.5);
    leaf.quadraticCurveTo(0.34, -0.1, 0, 0.5);
    leaf.quadraticCurveTo(-0.34, -0.1, 0, -0.5);
    this.featherMesh = createInstanced(new THREE.ShapeGeometry(leaf), fadeMat(null, true), P.featherPool, 6, true);
    for (let i = 0; i < P.featherPool; i++) {
      this.feathers.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, phase: 0, color: FEATHER_COLORS[i % 3] });
    }

    scene.add(this.crackMesh, this.ringMesh, this.boltMesh, this.featherMesh);
    if (this.dustMesh) scene.add(this.dustMesh);
    // 閒置隱藏時略過矩陣更新
    updateVisibleMatricesOnly(this.crackMesh, this.ringMesh, this.boltMesh, this.featherMesh);
    if (this.dustMesh) updateVisibleMatricesOnly(this.dustMesh);
  }

  // 暫時顯示以便 renderer.compile 預熱 shader
  public prewarm(compile: () => void) {
    const meshes = [this.crackMesh, this.ringMesh, this.dustMesh, this.boltMesh, this.featherMesh];
    for (const m of meshes) if (m) m.visible = true;
    compile();
    for (const m of meshes) if (m) m.visible = false;
  }

  // 清空所有進行中的特效 (切換世界 / 死亡復活時呼叫)，不配置新物件
  public reset() {
    if (!this.crackMesh) return;
    for (const c of this.cracks) c.life = 0;
    for (const r of this.rings) { r.life = 0; r.delay = 0; }
    for (const p of this.puffs) p.life = 0;
    for (const f of this.feathers) f.life = 0;
    this.crackActive = this.ringActive = this.puffActive = this.featherActive = 0;
    this.boltLife = 0;
    const meshes = [this.crackMesh, this.ringMesh, this.boltMesh, this.featherMesh];
    for (const m of meshes) {
      if (!m) continue;
      for (let i = 0; i < m.count; i++) { m.setMatrixAt(i, _zeroMatrix); setFx(m, i, 0xffffff, 0); }
      flushFx(m);
      m.visible = false;
    }
    if (this.dustMesh) {
      for (let i = 0; i < this.dustMesh.count; i++) this.dustMesh.setMatrixAt(i, _zeroMatrix);
      this.dustMesh.instanceMatrix.needsUpdate = true;
      this.dustMesh.visible = false;
    }
  }

  // 下劈地裂：point 為地面衝擊點 (呼叫端已複製或本函式立即取用)，radius 為群攻半徑；crack=false 時只放環 (不在地面)
  public groundSlam(point: THREE.Vector3, radius: number, style: WeaponFxStyle, gold: boolean, crack: boolean) {
    if (!this.crackMesh) return;
    if (crack) {
      const q = getFxQuality();
      // 輪替僅限目前檔位的前 crackPool 道 (降檔後超出者自然播完)
      const pool = Math.max(1, Math.min(this.cracks.length, q.crackPool));
      if (this.nextCrack >= pool) this.nextCrack = 0;
      const c = this.cracks[this.nextCrack];
      this.nextCrack = (this.nextCrack + 1) % pool;
      c.life = c.max = q.crackLife;
      c.layers = Math.max(1, Math.min(CRACK_LAYERS_MAX, q.crackLayers));
      c.x = point.x; c.y = point.y + 0.03; c.z = point.z;
      c.rot = Math.random() * Math.PI * 2;
      c.size = Math.min(q.crackMaxSize, radius * CRACK_SCALE);
      c.color = style.impact;
      c.core = mixWhite(style.impact, 0.7);
      this.crackActive++;
      this.crackMesh.visible = true;
      this.spawnDust(point, radius);
    }
    this.spawnRing(point.x, point.y + 0.06, point.z, radius, style.impact, 0);
    this.spawnRing(point.x, point.y + 0.08, point.z, radius * RING2_SCALE, mixWhite(style.impact, 0.45), RING2_DELAY);
    if (gold && crack) this.spawnBolt(point);
  }

  // 旋身衝擊環：y 為環高度 (腰高)；groundRadius > 0 時另於腳下 delay 秒後補一圈小地面環
  public spinWave(center: THREE.Vector3, radius: number, y: number, style: WeaponFxStyle, groundRadius: number, groundY: number, delay: number) {
    if (!this.ringMesh) return;
    this.spawnRing(center.x, y, center.z, radius, style.impact, 0);
    this.spawnRing(center.x, y + 0.04, center.z, radius * RING2_SCALE, mixWhite(style.impact, 0.45), RING2_DELAY);
    if (groundRadius > 0) this.spawnRing(center.x, groundY + 0.06, center.z, groundRadius, style.impact, delay);
  }

  // 羽毛噴發：自 center (胸口高度) 放射向上、重力飄落旋轉；整池一次噴發
  public featherBurst(center: THREE.Vector3) {
    const mesh = this.featherMesh;
    if (!mesh) return;
    const n = Math.min(this.feathers.length, getFxQuality().featherPool);
    if (n <= 0) return;
    for (let i = 0; i < n; i++) {
      const f = this.feathers[i];
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const sp = 3.2 + Math.random() * 3.2;
      f.life = FEATHER_LIFE * (0.8 + Math.random() * 0.2);
      f.x = center.x + Math.cos(a) * 0.3; f.y = center.y; f.z = center.z + Math.sin(a) * 0.3;
      f.vx = Math.cos(a) * sp; f.vz = Math.sin(a) * sp; f.vy = 2.2 + Math.random() * 3.6;
      f.rx = Math.random() * 6.28; f.ry = Math.random() * 6.28; f.rz = Math.random() * 6.28;
      f.sx = (Math.random() - 0.5) * 14; f.sy = (Math.random() - 0.5) * 14; f.sz = (Math.random() - 0.5) * 14;
      f.phase = Math.random() * 6.28;
    }
    this.featherActive = Math.max(this.featherActive, n);
    mesh.visible = true;
  }

  private spawnRing(x: number, y: number, z: number, radius: number, color: number, delay: number) {
    const pool = Math.max(1, Math.min(this.rings.length, getFxQuality().ringPool));
    if (this.nextRing >= pool) this.nextRing = 0;
    const r = this.rings[this.nextRing];
    this.nextRing = (this.nextRing + 1) % pool;
    r.life = RING_LIFE; r.delay = delay;
    r.x = x; r.y = y; r.z = z; r.radius = radius; r.color = color;
    this.ringActive++;
    this.ringMesh!.visible = true;
  }

  private spawnDust(point: THREE.Vector3, radius: number) {
    const n = Math.min(this.puffs.length, getFxQuality().dustPool);
    if (!this.dustMesh || n <= 0) return;
    if (this.nextPuff >= n) this.nextPuff = 0;
    for (let i = 0; i < n; i++) {
      const p = this.puffs[this.nextPuff];
      this.nextPuff = (this.nextPuff + 1) % n;
      const a = Math.random() * Math.PI * 2;
      const d = radius * (0.1 + Math.random() * 0.5);
      const sp = 1.4 + Math.random() * 1.6;
      p.life = DUST_LIFE * (0.8 + Math.random() * 0.2);
      p.x = point.x + Math.cos(a) * d; p.y = point.y + 0.15; p.z = point.z + Math.sin(a) * d;
      p.vx = Math.cos(a) * sp; p.vy = 0.9 + Math.random() * 1.0; p.vz = Math.sin(a) * sp;
      p.size = 1.8 + Math.random() * 1.4;
    }
    this.puffActive = Math.max(this.puffActive, n);
    this.dustMesh.visible = true;
  }

  private spawnBolt(point: THREE.Vector3) {
    const q = getFxQuality();
    const mesh = this.boltMesh!;
    // 條數 / 段數取目前檔位 (不超過預建容量)；佈局可能改變，先清空全部實例
    this.strands = Math.max(1, Math.min(FX_POOL_MAX.lightningStrands, q.lightningStrands));
    this.segments = Math.max(1, Math.min(FX_POOL_MAX.lightningSegments, q.lightningSegments));
    for (let i = 0; i < mesh.count; i++) { mesh.setMatrixAt(i, _zeroMatrix); setFx(mesh, i, 0xffffff, 0); }
    this.boltX = point.x; this.boltY = point.y; this.boltZ = point.z;
    this.boltLife = BOLT_LIFE;
    this.boltJitter = 0;
    this.boltMesh!.visible = true;
  }

  public update(delta: number, camera: THREE.Camera) {
    if (!this.crackMesh) return;
    if (this.crackActive > 0) this.updateCracks(delta);
    if (this.ringActive > 0) this.updateRings(delta);
    if (this.puffActive > 0) this.updateDust(delta, camera);
    if (this.boltLife > 0) this.updateBolt(delta);
    if (this.featherActive > 0) this.updateFeathers(delta);
  }

  private updateFeathers(delta: number) {
    const mesh = this.featherMesh!;
    let alive = 0;
    for (let i = 0; i < this.feathers.length; i++) {
      const f = this.feathers[i];
      if (f.life <= 0) continue;
      f.life -= delta;
      if (f.life <= 0) { mesh.setMatrixAt(i, _zeroMatrix); setFx(mesh, i, f.color, 0); continue; }
      alive++;
      const damp = Math.max(0, 1 - 1.8 * delta);
      f.vx *= damp; f.vz *= damp;
      f.vy = f.vy * damp - FEATHER_GRAVITY * delta * 0.6;
      f.phase += delta * 9;
      f.x += (f.vx + Math.sin(f.phase) * 0.6) * delta; f.y += f.vy * delta; f.z += (f.vz + Math.cos(f.phase) * 0.6) * delta;
      f.rx += f.sx * delta; f.ry += f.sy * delta; f.rz += f.sz * delta;
      const t = 1 - f.life / FEATHER_LIFE;
      _quat.setFromEuler(_euler.set(f.rx, f.ry, f.rz));
      _matrix.compose(_pos.set(f.x, f.y, f.z), _quat, _scl.set(0.2, 0.44, 1).multiplyScalar(1 - t * t * 0.5));
      mesh.setMatrixAt(i, _matrix);
      setFx(mesh, i, f.color, t > 0.65 ? (1 - t) / 0.35 : 1);
    }
    flushFx(mesh);
    this.featherActive = alive;
    if (alive === 0) mesh.visible = false;
  }

  private updateCracks(delta: number) {
    const mesh = this.crackMesh!;
    let alive = 0;
    for (let i = 0; i < this.cracks.length; i++) {
      const c = this.cracks[i];
      if (c.life <= 0) continue;
      c.life -= delta;
      const i0 = i * CRACK_LAYERS_MAX;
      if (c.life <= 0) {
        for (let l = 0; l < CRACK_LAYERS_MAX; l++) { mesh.setMatrixAt(i0 + l, _zeroMatrix); setFx(mesh, i0 + l, 0xffffff, 0); }
        continue;
      }
      alive++;
      const age = c.max - c.life;
      const pop = Math.min(1, age / CRACK_POP);
      const s = c.size * (0.5 + 0.5 * pop);
      const t = c.life / c.max;
      const f = t > 1 - CRACK_FADE_START ? 1 : t / (1 - CRACK_FADE_START);
      // 0 焦黑底 (略大) / 1 色光 / 2 白熱芯 (較小、較快淡去)
      for (let l = 0; l < CRACK_LAYERS_MAX; l++) {
        if (l >= c.layers) { mesh.setMatrixAt(i0 + l, _zeroMatrix); setFx(mesh, i0 + l, 0xffffff, 0); continue; }
        const sl = s * (l === 0 ? 1.12 : l === 1 ? 1 : 0.6);
        _quat.setFromAxisAngle(_yAxis, c.rot + (l === 2 ? 0.5 : 0));
        _matrix.compose(_pos.set(c.x, c.y + l * 0.004, c.z), _quat, _scl.set(sl, 1, sl));
        mesh.setMatrixAt(i0 + l, _matrix);
        if (l === 0) setFx(mesh, i0, SCORCH_COLOR, f * 0.65);
        else if (l === 1) setFx(mesh, i0 + 1, c.color, f);
        else setFx(mesh, i0 + 2, c.core, f * f);
      }
    }
    flushFx(mesh);
    this.crackActive = alive;
    if (alive === 0) mesh.visible = false;
  }

  private updateRings(delta: number) {
    const mesh = this.ringMesh!;
    const reach = RING_REACH * getFxQuality().ringReach;
    let alive = 0;
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      if (r.life <= 0) continue;
      if (r.delay > 0) {
        r.delay -= delta;
        alive++;
        continue; // 延遲中保持歸零矩陣
      }
      r.life -= delta;
      if (r.life <= 0) { mesh.setMatrixAt(i, _zeroMatrix); setFx(mesh, i, 0xffffff, 0); continue; }
      alive++;
      const t = 1 - r.life / RING_LIFE;
      const e = 1 - (1 - t) * (1 - t) * (1 - t); // easeOutCubic
      const s = r.radius * reach * (0.2 + 0.8 * e);
      _matrix.compose(_pos.set(r.x, r.y, r.z), _quat.identity(), _scl.set(s, 1, s));
      mesh.setMatrixAt(i, _matrix);
      const f = Math.pow(1 - t, 0.9);
      setFx(mesh, i, r.color, f);
    }
    flushFx(mesh);
    this.ringActive = alive;
    if (alive === 0) mesh.visible = false;
  }

  private updateDust(delta: number, camera: THREE.Camera) {
    const mesh = this.dustMesh!;
    let alive = 0;
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (p.life <= 0) continue;
      p.life -= delta;
      if (p.life <= 0) { mesh.setMatrixAt(i, _zeroMatrix); continue; }
      alive++;
      const damp = Math.max(0, 1 - 2.5 * delta);
      p.vx *= damp; p.vz *= damp;
      p.x += p.vx * delta; p.y += p.vy * delta; p.z += p.vz * delta;
      const t = 1 - p.life / DUST_LIFE;
      const s = p.size * (0.6 + 0.8 * t) * (1 - t * t); // 膨脹後縮小淡去
      _matrix.compose(_pos.set(p.x, p.y, p.z), camera.quaternion, _scl.setScalar(s));
      mesh.setMatrixAt(i, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.puffActive = alive;
    if (alive === 0) mesh.visible = false;
  }

  // 雷電：自上空劈向衝擊點的數條折線，每 BOLT_JITTER_INTERVAL 重新抖動並隨壽命淡出
  private updateBolt(delta: number) {
    const mesh = this.boltMesh!;
    this.boltLife -= delta;
    if (this.boltLife <= 0) {
      this.boltLife = 0;
      for (let i = 0; i < mesh.count; i++) { mesh.setMatrixAt(i, _zeroMatrix); setFx(mesh, i, 0xffffff, 0); }
      flushFx(mesh);
      mesh.visible = false;
      return;
    }
    this.boltJitter -= delta;
    const S = this.strands, G = this.segments, pts = this.boltPts;
    if (this.boltJitter <= 0) {
      this.boltJitter = BOLT_JITTER_INTERVAL;
      for (let s = 0; s < S; s++) {
        // 起點高空散布、終點圍繞衝擊點
        const sa = (s / S) * Math.PI * 2 + Math.random();
        const tx = this.boltX + Math.cos(sa) * 0.9 * (s > 0 ? 1 : 0), tz = this.boltZ + Math.sin(sa) * 0.9 * (s > 0 ? 1 : 0);
        const hx = tx + (Math.random() - 0.5) * 3.4, hz = tz + (Math.random() - 0.5) * 3.4;
        for (let k = 0; k <= G; k++) {
          const u = k / G;
          const env = Math.sin(Math.PI * u) * 0.85; // 兩端收斂、中段偏移
          const o = (s * (G + 1) + k) * 3;
          pts[o] = hx + (tx - hx) * u + (Math.random() - 0.5) * env * 2;
          pts[o + 1] = this.boltY + BOLT_HEIGHT * (1 - u);
          pts[o + 2] = hz + (tz - hz) * u + (Math.random() - 0.5) * env * 2;
        }
      }
    }
    const fade = this.boltLife / BOLT_LIFE;
    const reveal = Math.min(1, (BOLT_LIFE - this.boltLife) / BOLT_REVEAL); // 由地面向上竄起
    for (let s = 0; s < S; s++) {
      for (let g = 0; g < G; g++) {
        const idx = s * G + g;
        if (1 - (g + 1) / G > reveal) { mesh.setMatrixAt(idx, _zeroMatrix); continue; }
        const a = (s * (G + 1) + g) * 3, b = a + 3;
        _dir.set(pts[b] - pts[a], pts[b + 1] - pts[a + 1], pts[b + 2] - pts[a + 2]);
        const len = _dir.length();
        _pos.set((pts[a] + pts[b]) / 2, (pts[a + 1] + pts[b + 1]) / 2, (pts[a + 2] + pts[b + 2]) / 2);
        _quat.setFromUnitVectors(_up, _dir.multiplyScalar(1 / (len || 1)));
        const w = (1 + fade * 0.8) * (s === 0 ? 1.5 : 1); // 主幹最粗
        _matrix.compose(_pos, _quat, _scl.set(w, len, w));
        mesh.setMatrixAt(idx, _matrix);
        setFx(mesh, idx, s === 0 ? BOLT_CORE : s % 2 === 0 ? GOLD_BOLT_A : GOLD_BOLT_B, Math.min(1, fade * 1.5));
      }
    }
    flushFx(mesh);
  }
}

export const comboFinisherFX = new ComboFinisherFXSystem();
