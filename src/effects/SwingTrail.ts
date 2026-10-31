import * as THREE from 'three';
import { FX_POOL_MAX, getFxQuality } from './fxQuality';
import { updateVisibleMatricesOnly } from '../core/matrixUpdate';
import { FINISHER_FX_BOOST, type WeaponFxStyle } from './weaponFxStyle';

// 揮擊拖尾：4 條軌跡 (右手 0/1、左手 2/3 輪替) 共用 1 個 BufferGeometry / Mesh (1 draw call)，預配置緩衝、執行期零配置。
// 歷史點以 Catmull-Rom 平滑。三色漸層 (shader 程序上色)：外緣亮核心 (tipColor) + 主色外層 (color) + 越舊越偏尾端色 (tail)，
// 輸出預乘 alpha (ONE / ONE_MINUS_SRC_ALPHA)：條帶主體近乎不透明地蓋住背景 (白地磚上不被洗白、暮紅結界上不被吃色)，
// 只有握把端淡入與外緣柔邊是半透明窄帶 (平板 Mali 透明 overdraw 只發生在條帶面積內，條帶寬度以 tipExt 控制)。
// 條帶自武器尖端再往外延伸 tipExt 公尺 (誇大揮擊範圍感，外緣對齊判定距離)。
const SLOTS = 4;
const DEFAULT_TIP_EXT = 0.3;

interface Slot {
  open: boolean;      // 仍在接收 push
  count: number;
  pts: Float32Array;  // 每點 6 值：base xyz + tip xyz (舊 → 新)
  ages: Float32Array;
  r: number; g: number; b: number;    // 主色
  cr: number; cg: number; cb: number; // 亮核心
  tr: number; tg: number; tb: number; // 尾端色
  intensity: number;
  life: number;
  ext: number;        // 尖端外延 (公尺)
}

const VERT = /* glsl */`
attribute vec4 aMain;
attribute vec3 aCore;
attribute vec4 aTail;
varying vec2 vUv;
varying vec4 vMain;
varying vec3 vCore;
varying vec4 vTail;
void main() {
  vUv = uv;
  vMain = aMain;
  vCore = aCore;
  vTail = aTail;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// uv.x：0 = 握把端、1 = 外緣；aMain.w = 新鮮度 (1 新 → 0 舊)、aTail.w = 覆蓋率
const FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vMain;
varying vec3 vCore;
varying vec4 vTail;
void main() {
  float f = vMain.w;
  if (f <= 0.001) discard;
  float u = vUv.x;
  float inner = smoothstep(0.0, 0.42, u);
  float edge = 1.0 - smoothstep(0.92, 1.0, u);
  float cw = 0.05 + 0.09 * f;
  float cu = (u - 0.83) / cw;
  float core = exp(-cu * cu);
  vec3 body = mix(vTail.rgb, vMain.rgb, smoothstep(0.12, 0.7, f));
  vec3 col = mix(body, vCore, clamp(core * (0.35 + 0.65 * f) * 1.15, 0.0, 1.0));
  float a = inner * smoothstep(0.0, 0.3, f) * (0.5 + 0.5 * f) * vTail.w + core * f * 0.35;
  a = clamp(a, 0.0, 1.0) * edge;
  gl_FragColor = vec4(col * a, a);
}`;

function hexR(h: number) { return ((h >> 16) & 255) / 255; }
function hexG(h: number) { return ((h >> 8) & 255) / 255; }
function hexB(h: number) { return (h & 255) / 255; }

// 單軸 Catmull-Rom (p1→p2 之間，t∈[0,1])
function cr(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}

function createSoftEdgeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.25, 'rgba(255,255,255,1)');
  g.addColorStop(0.8, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.clearRect(0, 0, 64, 8);
  ctx.fillRect(0, 0, 64, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let _softEdgeTex: THREE.CanvasTexture | null = null;

// 拖尾條帶材質 (預乘 alpha、柔邊、雙面單趟)：program 快取鍵固定，其他條帶 (如綁帶捆書鞭梢拖尾) 共用時沿用本系統 prewarm 編好的 shader。
// 幾何需帶 position / uv / 4 分量 color 才會對上同一 program
export function createTrailMaterial(): THREE.MeshBasicMaterial {
  if (!_softEdgeTex) _softEdgeTex = createSoftEdgeTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: _softEdgeTex, vertexColors: true, transparent: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
  // 貼圖只取 alpha 作柔邊並預乘進 rgb
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
      'float edgeA = texture2D(map, vMapUv).a;\ndiffuseColor.rgb *= edgeA;\ndiffuseColor.a *= edgeA;');
  };
  mat.customProgramCacheKey = () => 'swingTrailPremul';
  mat.forceSinglePass = true; // 雙面透明預設分兩趟繪製，強制單趟以維持 1 draw call
  return mat;
}

class SwingTrailSystem {
  private mesh: THREE.Mesh | null = null;
  private positions!: Float32Array;
  private colors!: Float32Array; // aMain：主色 rgb + 新鮮度
  private cores!: Float32Array;  // aCore：亮核心 rgb
  private tails!: Float32Array;  // aTail：尾端色 rgb + 覆蓋率
  private posAttr!: THREE.BufferAttribute;
  private colAttr!: THREE.BufferAttribute;
  private coreAttr!: THREE.BufferAttribute;
  private tailAttr!: THREE.BufferAttribute;
  // 綁帶捆書書軌跡弧光沿用 createTrailMaterial (另一個 program)：預熱用的隱藏小條帶
  private legacyPrewarm: THREE.Mesh | null = null;
  private slots: Slot[] = [];
  private maxSamples = 0;
  private hist = 0;

  // 初始化並加入場景 (閒置時 visible=false，不產生 draw call)
  public init(scene: THREE.Object3D) {
    if (this.mesh) return;
    // 緩衝依最高檔 (最多歷史點 × 最多插值) 預建；實際插值數每幀取目前檔位，不足的樣本退化為零面積
    this.hist = FX_POOL_MAX.trailPoints;
    this.maxSamples = (this.hist - 1) * (FX_POOL_MAX.trailSubdiv + 1) + 1;
    const S = this.maxSamples;
    const vertsPerSlot = S * 2;
    const total = vertsPerSlot * SLOTS;
    this.positions = new Float32Array(total * 3);
    this.colors = new Float32Array(total * 4);
    this.cores = new Float32Array(total * 3);
    this.tails = new Float32Array(total * 4);
    const uvs = new Float32Array(total * 2);
    const indices = new Uint16Array(SLOTS * (S - 1) * 6);
    let ii = 0;
    for (let s = 0; s < SLOTS; s++) {
      for (let i = 0; i < S; i++) {
        const v = (s * S + i) * 2;
        const vv = i / (S - 1);
        uvs[v * 2] = 0; uvs[v * 2 + 1] = vv;
        uvs[v * 2 + 2] = 1; uvs[v * 2 + 3] = vv;
        if (i < S - 1) {
          indices[ii++] = v; indices[ii++] = v + 1; indices[ii++] = v + 2;
          indices[ii++] = v + 1; indices[ii++] = v + 3; indices[ii++] = v + 2;
        }
      }
      this.slots.push({
        open: false, count: 0, pts: new Float32Array(this.hist * 6), ages: new Float32Array(this.hist),
        r: 1, g: 1, b: 1, cr: 1, cg: 1, cb: 1, tr: 1, tg: 1, tb: 1, intensity: 1, life: 0.14, ext: DEFAULT_TIP_EXT,
      });
    }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    this.coreAttr = new THREE.BufferAttribute(this.cores, 3).setUsage(THREE.DynamicDrawUsage);
    this.tailAttr = new THREE.BufferAttribute(this.tails, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aMain', this.colAttr);
    geo.setAttribute('aCore', this.coreAttr);
    geo.setAttribute('aTail', this.tailAttr);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    });
    mat.forceSinglePass = true; // 雙面透明預設分兩趟繪製，強制單趟以維持 1 draw call
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; // 頂點每幀改動，略過包圍球剔除
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    updateVisibleMatricesOnly(this.mesh); // 閒置隱藏時略過矩陣更新
    scene.add(this.mesh);
    // 書軌跡弧光 program 預熱用：單一四邊形 (position / uv / 4 分量 color)，平時隱藏
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    pg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(8), 2));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(16), 4));
    pg.setIndex([0, 1, 2, 1, 3, 2]);
    this.legacyPrewarm = new THREE.Mesh(pg, createTrailMaterial());
    this.legacyPrewarm.frustumCulled = false;
    this.legacyPrewarm.visible = false;
    updateVisibleMatricesOnly(this.legacyPrewarm);
    scene.add(this.legacyPrewarm);
  }

  // 暫時顯示以便 renderer.compile 預熱 shader
  public prewarm(compile: () => void) {
    if (!this.mesh) return;
    this.mesh.visible = true;
    if (this.legacyPrewarm) this.legacyPrewarm.visible = true;
    compile();
    this.mesh.visible = false;
    if (this.legacyPrewarm) this.legacyPrewarm.visible = false;
  }

  // 清空所有軌跡 (切換世界 / 死亡復活時呼叫)，不配置新物件
  public reset() {
    if (!this.mesh) return;
    for (const s of this.slots) { s.open = false; s.count = 0; }
    this.positions.fill(0);
    this.colors.fill(0);
    this.tails.fill(0);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.tailAttr.needsUpdate = true;
    this.mesh.visible = false;
  }

  // 開始一條軌跡 (重用同一槽會清空舊點)：style 由呼叫端經 weaponFxStyle() 取得 (覺醒等覆寫在該入口處理)
  public begin(slot: number, style: WeaponFxStyle, finisher: boolean) {
    const s = this.slots[slot];
    if (!s) return;
    const boost = finisher ? FINISHER_FX_BOOST : null;
    s.open = true;
    s.count = 0;
    const tail = style.tail ?? style.color;
    s.r = hexR(style.color); s.g = hexG(style.color); s.b = hexB(style.color);
    s.cr = hexR(style.tipColor); s.cg = hexG(style.tipColor); s.cb = hexB(style.tipColor);
    s.tr = hexR(tail); s.tg = hexG(tail); s.tb = hexB(tail);
    s.intensity = style.intensity * (boost ? boost.brightness : 1);
    s.life = style.life * (boost ? boost.life : 1);
    s.ext = (style.tipExt ?? DEFAULT_TIP_EXT) * (boost ? boost.ext : 1);
  }

  // 加入目前 base / tip 世界座標 (與上一點幾乎重合時略過)
  public push(slot: number, base: THREE.Vector3, tip: THREE.Vector3) {
    const s = this.slots[slot];
    if (!s || !s.open) return;
    // 條帶加寬：自尖端沿握把 → 尖端方向往外延伸 ext 公尺 (握把端不動，由 shader 淡入)
    const lx = tip.x - base.x, ly = tip.y - base.y, lz = tip.z - base.z;
    const len = Math.sqrt(lx * lx + ly * ly + lz * lz);
    const k = len > 1e-4 ? s.ext / len : 0;
    const tx = tip.x + lx * k;
    const ty = tip.y + ly * k;
    const tz = tip.z + lz * k;
    const bx = base.x, by = base.y, bz = base.z;
    if (s.count > 0) {
      const o = (s.count - 1) * 6;
      const dx = tx - s.pts[o + 3], dy = ty - s.pts[o + 4], dz = tz - s.pts[o + 5];
      if (dx * dx + dy * dy + dz * dz < 1e-6) return;
    }
    // 歷史點上限依目前檔位 (不超過預建容量)；降檔後殘留較多點時一次丟棄最舊的多餘點
    const lim = Math.min(this.hist, getFxQuality().trailPoints);
    if (s.count >= lim) {
      const drop = s.count - lim + 1;
      s.pts.copyWithin(0, drop * 6, s.count * 6);
      s.ages.copyWithin(0, drop, s.count);
      s.count -= drop;
    }
    const o = s.count * 6;
    s.pts[o] = bx; s.pts[o + 1] = by; s.pts[o + 2] = bz;
    s.pts[o + 3] = tx; s.pts[o + 4] = ty; s.pts[o + 5] = tz;
    s.ages[s.count] = 0;
    s.count++;
  }

  // 停止接收新點，殘影自然淡出
  public end(slot: number) {
    const s = this.slots[slot];
    if (s) s.open = false;
  }

  public update(delta: number) {
    if (!this.mesh) return;
    // 閒置 (隱藏且各槽皆無點)：隱藏時緩衝必已清空，略過逐槽清除與頂點上傳
    if (!this.mesh.visible && this.isIdle()) return;
    let any = false;
    for (let si = 0; si < SLOTS; si++) {
      const s = this.slots[si];
      if (s.count === 0) { if (this.writeSlot(si, s)) any = true; continue; }
      for (let i = 0; i < s.count; i++) s.ages[i] += delta;
      let drop = 0;
      while (drop < s.count && s.ages[drop] >= s.life) drop++;
      if (drop > 0) {
        s.pts.copyWithin(0, drop * 6, s.count * 6);
        s.ages.copyWithin(0, drop, s.count);
        s.count -= drop;
      }
      if (this.writeSlot(si, s) || s.count > 0) any = true;
    }
    if (any || this.mesh.visible) {
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
      this.coreAttr.needsUpdate = true;
      this.tailAttr.needsUpdate = true;
    }
    this.mesh.visible = any;
  }

  private isIdle(): boolean {
    for (let si = 0; si < SLOTS; si++) if (this.slots[si].count > 0) return false;
    return true;
  }

  // 將槽內歷史點展開成條帶頂點；回傳是否有可見內容
  private writeSlot(si: number, s: Slot): boolean {
    const S = this.maxSamples;
    const base = si * S * 2;
    const n = s.count;
    const pos = this.positions;
    const col = this.colors;
    const core = this.cores;
    const tail = this.tails;
    if (n < 2) {
      // 無可見內容：全部退化為零面積並設為透明 (新鮮度 0 → shader discard)
      pos.fill(0, base * 3, (base + S * 2) * 3);
      col.fill(0, base * 4, (base + S * 2) * 4);
      return false;
    }
    const sub = Math.min(FX_POOL_MAX.trailSubdiv, getFxQuality().trailSubdiv);
    const total = (n - 1) * (sub + 1) + 1;
    const pts = s.pts;
    const cov = Math.min(1.5, s.intensity);
    for (let k = 0; k < S; k++) {
      // 超出實際取樣數的樣本重複最後一點 (退化)
      const kk = k < total ? k : total - 1;
      const seg = Math.min(n - 2, Math.floor(kk / (sub + 1)));
      const t = sub === 0 ? 0 : (kk - seg * (sub + 1)) / (sub + 1);
      const i1 = seg, i2 = seg + 1;
      const i0 = seg > 0 ? seg - 1 : seg;
      const i3 = seg + 2 < n ? seg + 2 : i2;
      const tt = kk === total - 1 ? 1 : t;
      const v = (base + k * 2) * 3;
      for (let c = 0; c < 3; c++) {
        // base 端 (偏移 c)、tip 端 (偏移 3 + c)
        pos[v + c] = cr(pts[i0 * 6 + c], pts[i1 * 6 + c], pts[i2 * 6 + c], pts[i3 * 6 + c], tt);
        pos[v + 3 + c] = cr(pts[i0 * 6 + 3 + c], pts[i1 * 6 + 3 + c], pts[i2 * 6 + 3 + c], pts[i3 * 6 + 3 + c], tt);
      }
      // 年齡插值 → 新鮮度 (1 新 → 0 舊；淡出曲線與尾端變色由 shader 處理)；超出取樣數的樣本為 0
      let f = 0;
      if (k < total) {
        const age = s.ages[i1] + (s.ages[i2] - s.ages[i1]) * tt;
        f = Math.max(0, 1 - age / s.life);
      }
      const c4 = (base + k * 2) * 4;
      const c3 = (base + k * 2) * 3;
      col[c4] = col[c4 + 4] = s.r; col[c4 + 1] = col[c4 + 5] = s.g; col[c4 + 2] = col[c4 + 6] = s.b; col[c4 + 3] = col[c4 + 7] = f;
      core[c3] = core[c3 + 3] = s.cr; core[c3 + 1] = core[c3 + 4] = s.cg; core[c3 + 2] = core[c3 + 5] = s.cb;
      tail[c4] = tail[c4 + 4] = s.tr; tail[c4 + 1] = tail[c4 + 5] = s.tg; tail[c4 + 2] = tail[c4 + 6] = s.tb; tail[c4 + 3] = tail[c4 + 7] = cov;
    }
    return true;
  }
}

export const swingTrail = new SwingTrailSystem();
