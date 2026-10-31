import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FENCER } from './fencerRules';
import { getFxQuality, getFxTier, FX_POOL_MAX } from '../../effects/fxQuality';
import { slashFX } from '../../effects/SlashFX';
import { comboFinisherFX } from '../../effects/ComboFinisherFX';
import { requestCameraShake } from '../../effects/cameraShake';
import { setWeaponFxOverride, type WeaponFxId, type WeaponFxStyle } from '../../effects/weaponFxStyle';
import { soundManager } from '../../audio/SoundEffects';

// 玩家「向陽覺醒・朝陽花冠」(花劍客戰專用)：數值與視覺分開。
// - AwakeningStats：體力上限 200 並補滿 / 戰後還原 (純邏輯可測)
// - PlayerAwakening：視覺模組 (完整版，player-awakening-design.md 方案 A)，四入口 playIntro / applyInstant / playOutro / revertInstant + update
//   · 本體：Player 換 awake 幾何 (加長燃金髮梢、太陽紋章、胸徽、紋路 aGlow) + outfitMaterial 發光 uniform，0 額外 draw call
//   · 日輪花冠：12 片花瓣刃 + 日心 + 日冕環，掛軀幹節點、共用 outfitMaterial (+1 call，不投影)；亮瓣數 = 剩餘血量比例，<25% 日蝕
//   · 環身花瓣光點：InstancedMesh 不透明菱形 (+1 call，不混合)；過場兼作「向陽之心」與還光給太陽花的飛行花瓣
//   · 過場光柱 + 地面環：加法混色，只在變身過場顯示，低檔不畫
//   · 拖尾 / 蓄力 / 衝擊環取色：weaponFxStyle 覆寫為朝陽配色；殘影改金色
// 配色：朝陽金 #FFC83A、晨白 #FFF6D8、天空藍 #7FD8FF (避開脫戰回血的淡綠、Boss 預警的粉紅)

export interface AwakeningTarget {
  hp: number;
  maxHp: number;
}

/** 覺醒數值：套用時記住原上限並改為戰鬥上限、補滿；移除時還原 (勝利補滿，其餘截到原上限)。重複呼叫安全 */
export class AwakeningStats {
  public applied = false;
  private savedMaxHp: number = FENCER.NORMAL_MAX_HP;

  public apply(p: AwakeningTarget) {
    if (!this.applied) this.savedMaxHp = p.maxHp;
    this.applied = true;
    p.maxHp = FENCER.BATTLE_MAX_HP;
    p.hp = FENCER.BATTLE_MAX_HP;
  }

  /** refill = 勝利補滿；否則血量截到原上限 (死亡時 hp 0 維持 0，復活時 respawn 補滿到原上限) */
  public remove(p: AwakeningTarget, refill: boolean) {
    if (!this.applied) return;
    this.applied = false;
    p.maxHp = this.savedMaxHp;
    p.hp = refill ? p.maxHp : Math.min(p.hp, p.maxHp);
  }
}

export const AWAKEN_GOLD = 0xffc83a;
export const AWAKEN_WHITE = 0xfff6d8;
export const AWAKEN_SKY = 0x7fd8ff;
export const AWAKEN_PALETTE: readonly number[] = [AWAKEN_GOLD, AWAKEN_WHITE, AWAKEN_SKY, AWAKEN_GOLD];

// 覺醒中的武器特效配色 = 「疊色」而非覆蓋：保留每把武器自身主色 / 元素 / 外延 / 衝擊環色 (結界中仍一眼認得是哪把武器)，
// 只疊上朝陽金：亮核心 (tipColor) 往晨白金混合 AWAKEN_CORE_MIX、尾端改朝陽金 (主色本身已是金色系者保留原尾端，避免整條變單色)、
// 覆蓋率 +0.15 (上限 1.5)、壽命 ×1.15、會發光的武器發光 +0.3 (不發光者維持不發光)
export const AWAKEN_CORE_MIX = 0.6;
const GOLD_HUE_NEAR = 10 / 360; // 主色色相距朝陽金 < 10° 視為金色系
const _hslA = { h: 0, s: 0, l: 0 };
const _hslB = { h: 0, s: 0, l: 0 };
const _mixA = new THREE.Color();
const _mixB = new THREE.Color();
export function isGoldHue(hex: number): boolean {
  _mixA.setHex(hex).getHSL(_hslA);
  _mixB.setHex(AWAKEN_GOLD).getHSL(_hslB);
  const d = Math.abs(_hslA.h - _hslB.h);
  return Math.min(d, 1 - d) < GOLD_HUE_NEAR && _hslA.s > 0.5;
}
function mixHex(a: number, b: number, t: number): number {
  return _mixA.setHex(a).lerp(_mixB.setHex(b), t).getHex();
}
const awakenStyleCache = new Map<WeaponFxId, WeaponFxStyle>();
export function awakenFxStyle(id: WeaponFxId, base: WeaponFxStyle): WeaponFxStyle {
  let s = awakenStyleCache.get(id);
  if (!s) {
    s = {
      ...base,
      tipColor: mixHex(base.tipColor, AWAKEN_WHITE, AWAKEN_CORE_MIX),
      tail: isGoldHue(base.color) ? base.tail : AWAKEN_GOLD,
      intensity: Math.min(1.5, base.intensity + 0.15),
      life: base.life * 1.15,
      glow: base.glow > 0 ? base.glow + 0.3 : 0
    };
    awakenStyleCache.set(id, s);
  }
  return s;
}

/** 日輪亮起的花瓣數：ceil(血量比例 × 12)，0..12 */
export const SUN_PETALS = 12;
export function litPetalCount(hpRatio: number): number {
  return Math.max(0, Math.min(SUN_PETALS, Math.ceil(Math.max(0, hpRatio) * SUN_PETALS - 1e-6)));
}
/** 日蝕門檻 (血量比例低於此值：日心轉黑、外圈晨白日冕、紋路心跳閃爍) */
export const ECLIPSE_RATIO = 0.25;
/** 脫戰回氣回到此比例時日輪亮滿並轉一圈 */
const FULL_SPIN_RATIO = 0.8;

/** 變身演出長度 (秒)：與 Boss 劍禮台詞重疊，開戰過場 4.5～6.8s */
export const AWAKEN_INTRO_SEC = 2.3;
/** 播放還原長度 (秒)：紋路由頭往腳熄滅、日輪花瓣逐片飛回太陽花 (須短於勝利結算的 1.4s) */
export const AWAKEN_OUTRO_SEC = 0.95;
// 過場時間點
const T_CATCH = 0.45;      // 接住向陽之心
const T_REVEAL = 0.5;      // 紋路由腳往頭點亮 (0.8s)
const REVEAL_SEC = 0.8;
const T_BURST = 1.3;       // 日輪「啪」地展開 + 爆發
const WHEEL_POP_SEC = 0.18;
const REVEAL_OFF = -0.1;   // uReveal 低於所有高度序 = 全暗
const OUTRO_DIM_SEC = 0.5;
const OUTRO_FLY_SEC = 0.42;
const WHEEL_SPIN = 0.6;    // 常駐轉速 (rad/s)

export type AwakeningState = 'OFF' | 'INTRO' | 'ON' | 'OUTRO';

/** Player 提供的換裝 / 發光接點 (見 Player.ts「向陽覺醒外觀」區塊) */
export interface AwakeningSkin {
  readonly awakenUniforms: {
    uReveal: { value: number };
    uGlowK: { value: number };
    uGlowColor: { value: THREE.Color };
    uPetalLit: { value: number };
    uEclipse: { value: number };
  };
  readonly awakenAnchor: THREE.Object3D;
  readonly awakenMaterial: THREE.Material;
  setAwakenOutfit(on: boolean): void;
  afterimageTint: number | null;
  readonly isDodging: boolean;
  readonly strikeMove: { readonly finisher: boolean } | null;
}

// ===== 過場光柱 + 地面環 (沿用基本版 shader：加法混色單一幾何，只在變身過場) =====
const AURA_VERT = /* glsl */`
attribute float aPart;
varying vec2 vUv;
varying float vPart;
void main() {
  vUv = uv;
  vPart = aPart;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const AURA_FRAG = /* glsl */`
uniform float uTime;
uniform float uAlpha;
uniform float uColumn;
uniform float uPulse;
uniform float uSpread;
varying vec2 vUv;
varying float vPart;
void main() {
  vec3 gold = vec3(1.0, 0.784, 0.227);
  vec3 white = vec3(1.0, 0.965, 0.847);
  vec3 sky = vec3(0.5, 0.847, 1.0);
  float a;
  vec3 col;
  if (vPart < 0.5) {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p) / max(uSpread, 0.05);
    float ring1 = max(1.0 - abs(r - 0.92) / 0.05, 0.0);
    float ring2 = max(1.0 - abs(r - (0.6 + 0.06 * sin(uTime * 2.5))) / 0.035, 0.0);
    float ang = atan(p.y, p.x);
    float rays = pow(max(sin(ang * 6.0 + uTime * 1.2), 0.0), 8.0) * smoothstep(0.92, 0.65, r) * smoothstep(0.3, 0.6, r) * 0.4;
    a = ring1 * ring1 + ring2 * 0.6 + rays + uPulse * smoothstep(1.0, 0.0, r) * 0.6;
    col = mix(mix(gold, sky, ring2 * 0.6), white, ring1 * 0.5 + uPulse * 0.4);
  } else {
    float h = vUv.y;
    float flick = 0.75 + 0.25 * sin(uTime * 6.0 + vUv.x * 25.0);
    a = (1.0 - h) * (1.0 - h) * (0.45 + uPulse * 0.6) * flick * uColumn;
    col = mix(gold, white, 1.0 - h);
  }
  a = clamp(a, 0.0, 1.0) * uAlpha;
  gl_FragColor = vec4(col * a, a);
}`;

function buildAuraGeometry(): THREE.BufferGeometry {
  const ring = new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2).translate(0, 0.09, 0); // 高於結界地板 (0.045)
  const column = new THREE.CylinderGeometry(0.5, 0.62, 5, 16, 1, true).translate(0, 2.5, 0);
  const parts: [THREE.BufferGeometry, number][] = [[ring.toNonIndexed(), 0], [column.toNonIndexed(), 1]];
  const geo = new THREE.BufferGeometry();
  const total = parts.reduce((s, [g]) => s + g.attributes.position.count, 0);
  const position = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const part = new Float32Array(total);
  let o = 0;
  for (const [g, id] of parts) {
    const n = g.attributes.position.count;
    position.set(g.attributes.position.array as Float32Array, o * 3);
    uv.set(g.attributes.uv.array as Float32Array, o * 2);
    part.fill(id, o, o + n);
    o += n;
    g.dispose();
  }
  ring.dispose();
  column.dispose();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  return geo;
}

// ===== 日輪花冠幾何 (平面 XY，正面朝 +Z；頂點屬性與玩家造型相同：position / normal / color / aGlow) =====
const WHEEL_INNER = 0.2;
const WHEEL_OUTER_LONG = 0.55;
const WHEEL_OUTER_SHORT = 0.46;

function paint(geo: THREE.BufferGeometry, petalId: number, colorAt: (x: number, y: number, z: number) => THREE.Color): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  const glow = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = colorAt(pos.getX(i), pos.getY(i), pos.getZ(i));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    glow[i * 3] = 1; glow[i * 3 + 1] = 0; glow[i * 3 + 2] = petalId;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 3));
  return g;
}

export function buildSunWheelGeometry(): THREE.BufferGeometry {
  const gold = new THREE.Color(AWAKEN_GOLD);
  const white = new THREE.Color(AWAKEN_WHITE);
  const sky = new THREE.Color(AWAKEN_SKY);
  const tmp = new THREE.Color();
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < SUN_PETALS; i++) {
    const outer = i % 2 === 0 ? WHEEL_OUTER_LONG : WHEEL_OUTER_SHORT;
    const half = (outer - WHEEL_INNER) / 2;
    const a = (i / SUN_PETALS) * Math.PI * 2;
    // 細長菱形花瓣刃 (八面體壓扁：8 面)
    const g = new THREE.OctahedronGeometry(1, 0);
    g.applyMatrix4(m.makeScale(i % 2 === 0 ? 0.075 : 0.06, half, 0.03));
    g.applyMatrix4(m.makeTranslation(0, WHEEL_INNER + half, 0));
    g.applyMatrix4(m.makeRotationZ(-a));
    parts.push(paint(g, i + 1, (x, y) => {
      const t = (Math.hypot(x, y) - WHEEL_INNER) / (outer - WHEEL_INNER);
      return tmp.copy(gold).lerp(white, Math.max(0, t - 0.45) * 1.8);
    }));
  }
  const core = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 12, 1).rotateX(Math.PI / 2);
  parts.push(paint(core, 13, (x, y) => tmp.copy(white).lerp(gold, Math.min(1, Math.hypot(x, y) / 0.13) * 0.6)));
  const ring = new THREE.TorusGeometry(0.2, 0.022, 3, 16);
  parts.push(paint(ring, 14, (_x, _y, z) => tmp.copy(gold).lerp(sky, z > 0 ? 0.35 : 0)));
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

// 環身花瓣光點 (菱形平面，雙面不透明)
function buildMoteGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1, 0, -0.55, 0, 0, 0, -1, 0, 0.55, 0, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

const MOTE_POOL = FX_POOL_MAX.awakenMotes;
const HEART = MOTE_POOL;            // 向陽之心 (最後一格)
const MOTE_TOTAL = MOTE_POOL + 1;
const MOTE_COLORS = [AWAKEN_GOLD, AWAKEN_WHITE, AWAKEN_GOLD, AWAKEN_SKY];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _white = new THREE.Color(AWAKEN_WHITE);
const _gold = new THREE.Color(AWAKEN_GOLD);
const _burstPos = new THREE.Vector3();
const BURST_STYLE: WeaponFxStyle = { color: AWAKEN_GOLD, tipColor: AWAKEN_WHITE, intensity: 1.3, life: 0.2, glow: 1, impact: AWAKEN_GOLD };
const ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0);

const easeOutBack = (t: number) => {
  const c1 = 1.9;
  const c3 = c1 + 1;
  const x = Math.min(1, Math.max(0, t)) - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
};

/**
 * 覺醒視覺 (完整版)。建構時預建全部物件 (日輪掛玩家軀幹、光點池與過場光柱掛 parent)，閒置隱藏。
 * skin 省略時 (單元測試) 只跑狀態機與光點 / 光柱。
 */
export class PlayerAwakening {
  public state: AwakeningState = 'OFF';
  private readonly aura: THREE.Mesh;
  private readonly auraMat: THREE.ShaderMaterial;
  public readonly wheel: THREE.Mesh;
  private readonly wheelPivot = new THREE.Group();
  public readonly motes: THREE.InstancedMesh;
  private readonly moteMat: THREE.MeshBasicMaterial;
  private readonly skin: AwakeningSkin | null;
  private time = 0;
  private timer = 0;
  private fade = 0;
  private pulse = 0;
  private burstDone = false;
  private catchDone = false;
  private onIntroDone: (() => void) | null = null;
  private readonly pos = new THREE.Vector3();
  // 戰鬥中狀態
  private petalLit = SUN_PETALS;
  private eclipse = 0;
  private lastHpRatio = 1;
  private hitT = 0;
  private spinBoost = 0;        // 剩餘快轉角度 (rad)
  private wheelScale = 0;
  private wasDodging = false;
  private wasFinisher = false;
  private wasBelowFull = false;
  private hidden = false;
  // 過場飛行花瓣
  private readonly heartFrom = new THREE.Vector3();
  private readonly petalFrom: THREE.Vector3[] = [];
  private readonly sunTarget = new THREE.Vector3(FENCER.CENTER_X, 1.9, FENCER.CENTER_Z);
  private outroChimed = false;

  constructor(parent: THREE.Object3D, skin?: AwakeningSkin) {
    this.skin = skin ?? null;
    this.auraMat = new THREE.ShaderMaterial({
      vertexShader: AURA_VERT, fragmentShader: AURA_FRAG,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uColumn: { value: 1 }, uPulse: { value: 0 }, uSpread: { value: 1 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
      blending: THREE.AdditiveBlending
    });
    this.aura = new THREE.Mesh(buildAuraGeometry(), this.auraMat);
    this.aura.name = 'player_awakening_aura';
    this.aura.frustumCulled = false;
    this.aura.renderOrder = 2;
    this.aura.visible = false;
    parent.add(this.aura);

    // 日輪花冠：背包後方、肩胛高度，正面朝玩家身後 (鏡頭方向)
    this.wheel = new THREE.Mesh(buildSunWheelGeometry(), skin ? skin.awakenMaterial : new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.wheel.name = 'player_sun_wheel';
    this.wheel.castShadow = false;
    this.wheel.receiveShadow = false;
    this.wheelPivot.name = 'player_sun_wheel_pivot';
    this.wheelPivot.position.set(0, 0.27, -0.6);
    this.wheelPivot.rotation.y = Math.PI;
    this.wheelPivot.add(this.wheel);
    this.wheelPivot.visible = false;
    (skin ? skin.awakenAnchor : parent).add(this.wheelPivot);

    // 花瓣光點池 (最大檔數量 + 向陽之心)
    this.moteMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false, fog: false });
    this.motes = new THREE.InstancedMesh(buildMoteGeometry(), this.moteMat, MOTE_TOTAL);
    this.motes.name = 'player_awakening_motes';
    this.motes.frustumCulled = false;
    this.motes.castShadow = false;
    for (let i = 0; i < MOTE_TOTAL; i++) {
      this.motes.setMatrixAt(i, ZERO_SCALE);
      this.motes.setColorAt(i, _c.setHex(i === HEART ? AWAKEN_GOLD : MOTE_COLORS[i % MOTE_COLORS.length]));
    }
    this.motes.visible = false;
    parent.add(this.motes);
    for (let i = 0; i < SUN_PETALS; i++) this.petalFrom.push(new THREE.Vector3());
  }

  public get isOn(): boolean {
    return this.state !== 'OFF';
  }

  /** 播放變身 (開戰過場 4.5～6.8s)，結束呼叫 onDone */
  public playIntro(onDone?: () => void) {
    this.resetVisuals();
    this.state = 'INTRO';
    this.timer = 0;
    this.fade = 0;
    this.burstDone = false;
    this.catchDone = false;
    this.onIntroDone = onDone ?? null;
    this.heartFrom.set(NaN, 0, 0);
    this.setOverrides(true);
    if (this.skin) {
      this.skin.setAwakenOutfit(true);
      this.skin.awakenUniforms.uReveal.value = REVEAL_OFF;
      this.skin.awakenUniforms.uGlowK.value = 1.2;
    }
    this.aura.visible = false;
    this.motes.visible = true;
  }

  /** 直接套用 (跳過過場)：常駐狀態 + 一次星閃與爆發音，讓跳過的人也看得出已覺醒 */
  public applyInstant() {
    const cb = this.onIntroDone;
    this.onIntroDone = null;
    const wasIntro = this.state === 'INTRO';
    if (!wasIntro) this.resetVisuals();
    this.state = 'ON';
    this.fade = 1;
    this.pulse = 1;
    this.burstDone = true;
    this.catchDone = true;
    this.wheelScale = 1;
    this.setOverrides(true);
    if (this.skin) {
      this.skin.setAwakenOutfit(true);
      this.skin.awakenUniforms.uReveal.value = 1;
    }
    this.aura.visible = false;
    this.motes.visible = true;
    this.wheelPivot.visible = true;
    this.wheelPivot.scale.setScalar(1);
    this.motes.setMatrixAt(HEART, ZERO_SCALE);
    const p = this.pos;
    slashFX.hitFlash(p.x, p.y + 1.25, p.z, AWAKEN_WHITE);
    soundManager.playFinaleChime(p);
    if (cb) cb();
  }

  /** 播放還原 (勝利)：紋路由頭往腳熄滅，日輪花瓣逐片飛回太陽花 (約 0.95s) */
  public playOutro() {
    if (this.state === 'OFF') return;
    if (this.state === 'INTRO') this.applyInstant();
    this.state = 'OUTRO';
    this.timer = 0;
    this.outroChimed = false;
    this.aura.visible = false;
    this.setOverrides(false); // 戰鬥已結束：拖尾 / 殘影立即回原色
    this.wheelPivot.updateWorldMatrix(true, true);
    for (let i = 0; i < SUN_PETALS; i++) {
      const a = (i / SUN_PETALS) * Math.PI * 2;
      const r = (WHEEL_INNER + (i % 2 === 0 ? WHEEL_OUTER_LONG : WHEEL_OUTER_SHORT)) / 2;
      this.petalFrom[i].set(Math.sin(a) * r, Math.cos(a) * r, 0).applyMatrix4(this.wheel.matrixWorld);
      if (!this.wheelPivot.visible || !isFinite(this.petalFrom[i].x)) this.petalFrom[i].set(this.pos.x, this.pos.y + 1.3, this.pos.z);
    }
    for (let i = 0; i < MOTE_TOTAL; i++) {
      this.motes.setMatrixAt(i, ZERO_SCALE);
      if (i < SUN_PETALS) this.motes.setColorAt(i, _c.setHex(i % 2 === 0 ? AWAKEN_GOLD : AWAKEN_WHITE));
    }
    if (this.motes.instanceColor) this.motes.instanceColor.needsUpdate = true;
    this.motes.instanceMatrix.needsUpdate = true;
    this.motes.visible = true;
  }

  /** 立即還原 (死亡 / 切世界 / 中止)：同一幀還原模型參考、材質 uniform、附件、拖尾與殘影顏色 */
  public revertInstant() {
    this.state = 'OFF';
    this.onIntroDone = null;
    this.fade = 0;
    this.pulse = 0;
    this.resetVisuals();
    this.setOverrides(false);
    if (this.skin) this.skin.setAwakenOutfit(false);
  }

  // 附件 / uniform 回到未覺醒原值
  private resetVisuals() {
    this.auraMat.uniforms.uAlpha.value = 0;
    this.aura.visible = false;
    this.wheelPivot.visible = false;
    this.wheelPivot.scale.setScalar(1);
    this.wheelPivot.rotation.set(0, Math.PI, 0);
    this.wheel.rotation.set(0, 0, 0);
    this.motes.visible = false;
    for (let i = 0; i < MOTE_TOTAL; i++) {
      this.motes.setMatrixAt(i, ZERO_SCALE);
      this.motes.setColorAt(i, _c.setHex(i === HEART ? AWAKEN_GOLD : MOTE_COLORS[i % MOTE_COLORS.length]));
    }
    this.motes.instanceMatrix.needsUpdate = true;
    if (this.motes.instanceColor) this.motes.instanceColor.needsUpdate = true;
    this.petalLit = SUN_PETALS;
    this.eclipse = 0;
    this.lastHpRatio = 1;
    this.hitT = 0;
    this.spinBoost = 0;
    this.wheelScale = 0;
    this.wasDodging = false;
    this.wasFinisher = false;
    this.wasBelowFull = false;
    if (this.skin) {
      const u = this.skin.awakenUniforms;
      u.uReveal.value = 0;
      u.uGlowK.value = 0;
      u.uGlowColor.value.setHex(AWAKEN_GOLD);
      u.uPetalLit.value = SUN_PETALS;
      u.uEclipse.value = 0;
    }
  }

  private setOverrides(on: boolean) {
    setWeaponFxOverride(on ? awakenFxStyle : null);
    if (this.skin) this.skin.afterimageTint = on ? AWAKEN_GOLD : null;
  }

  /** 每幀：pos = 玩家腳底；hidden = 玩家隱藏 (騎車 / 死亡) 時光點淡出；hpRatio / isRegenFast 驅動日輪亮瓣 */
  public update(dt: number, pos: THREE.Vector3, hidden: boolean, hpRatio: number = 1, isRegenFast: boolean = false) {
    if (this.state === 'OFF') return;
    this.time += dt;
    this.timer += dt;
    this.pos.copy(pos);
    this.hidden = hidden;
    if (this.state === 'INTRO') this.updateIntro();
    else if (this.state === 'OUTRO') {
      if (this.updateOutro()) return;
    } else this.updateOn(dt, hpRatio, isRegenFast);
    this.pulse = Math.max(0, this.pulse - dt * 1.6);
    this.updateAura();
    if (this.state !== 'OUTRO') this.updateMotes();
    this.wheel.rotation.z -= (WHEEL_SPIN + this.spinRate()) * dt;
  }

  private spinRate(): number {
    if (this.state === 'INTRO') {
      const k = Math.max(0, this.timer - T_BURST);
      return this.burstDone ? 14 * Math.exp(-k * 3) : 0;
    }
    return 0;
  }

  // ----- 變身過場 -----
  private updateIntro() {
    const t = this.timer;
    const p = this.pos;
    const u = this.skin?.awakenUniforms;
    if (isNaN(this.heartFrom.x)) {
      // 向陽之心自結界中心 (太陽花原位) 上空出發
      _v.set(FENCER.CENTER_X - p.x, 0, FENCER.CENTER_Z - p.z);
      if (_v.lengthSq() < 1e-4) _v.set(0, 0, -1);
      _v.normalize();
      this.heartFrom.set(p.x + _v.x * 3.2, p.y + 3.6, p.z + _v.z * 3.2);
      soundManager.playHeadshotDing(this.heartFrom);
    }
    if (!this.catchDone && t >= T_CATCH) {
      this.catchDone = true;
      this.motes.setMatrixAt(HEART, ZERO_SCALE);
      slashFX.hitFlash(p.x, p.y + 1.25, p.z, AWAKEN_WHITE);
      soundManager.playPetalBloom(p);
      this.pulse = 0.6;
    }
    if (u) {
      const r = (t - T_REVEAL) / REVEAL_SEC;
      u.uReveal.value = REVEAL_OFF + (1 - REVEAL_OFF) * Math.min(1, Math.max(0, r));
      // 接住瞬間胸口一閃 (紋路尚未點亮前用閃白色顯現)
      u.uGlowK.value = 1.15 + this.pulse * 0.8;
      u.uGlowColor.value.copy(_gold).lerp(_white, Math.min(1, this.pulse));
    }
    if (t >= T_REVEAL && t - T_REVEAL < 0.05 && !this.burstDone) soundManager.playBarrierHum(p);
    this.fade = smoothRange(t, T_REVEAL, T_REVEAL + 0.3) * (1 - smoothRange(t, T_BURST + 0.3, AWAKEN_INTRO_SEC));
    if (!this.burstDone && t >= T_BURST) {
      this.burstDone = true;
      this.burst();
    }
    this.wheelScale = this.burstDone ? easeOutBack((t - T_BURST) / WHEEL_POP_SEC) : 0;
    this.wheelPivot.visible = this.wheelScale > 0.001;
    this.wheelPivot.scale.setScalar(Math.max(0.001, this.wheelScale));
    if (t >= AWAKEN_INTRO_SEC) {
      this.state = 'ON';
      this.fade = 0;
      if (u) u.uReveal.value = 1;
      this.wheelPivot.scale.setScalar(1);
      this.wheelScale = 1;
      const cb = this.onIntroDone;
      this.onIntroDone = null;
      if (cb) cb();
    }
  }

  // 覺醒爆發：日輪展開 + 胸口金白星閃 + 腰高衝擊環 + (中高檔) 金白藍羽毛 + 鏡頭震動
  private burst() {
    this.pulse = 1;
    this.spinBoost = 0;
    const p = this.pos;
    slashFX.hitFlash(p.x, p.y + 1.2, p.z, AWAKEN_WHITE);
    slashFX.chargeRing(p.x, p.y + 0.9, p.z, AWAKEN_GOLD, AWAKEN_SKY);
    comboFinisherFX.spinWave(_burstPos.set(p.x, p.y, p.z), 2.6, p.y + 1.0, BURST_STYLE, 1.6, p.y, 0.05);
    if (getFxTier() !== 'low') comboFinisherFX.featherBurst(_burstPos.set(p.x, p.y + 1.3, p.z), AWAKEN_PALETTE);
    requestCameraShake(0.3);
    soundManager.playFinaleChime(p);
  }

  // ----- 戰鬥中 -----
  private updateOn(dt: number, hpRatio: number, isRegenFast: boolean) {
    const skin = this.skin;
    // 受擊：紋路閃白、日輪被打歪
    if (hpRatio < this.lastHpRatio - 1e-4 && !isRegenFast) this.hitT = 0.25;
    this.lastHpRatio = hpRatio;
    this.hitT = Math.max(0, this.hitT - dt);
    // 亮瓣數：掉血時快熄、回血時一片片亮回
    const target = litPetalCount(hpRatio);
    const rate = target < this.petalLit ? 10 : 5;
    this.petalLit += Math.sign(target - this.petalLit) * Math.min(Math.abs(target - this.petalLit), rate * dt);
    // 日蝕 (<25%)
    this.eclipse += ((hpRatio < ECLIPSE_RATIO ? 1 : 0) - this.eclipse) * Math.min(1, dt * 6);
    // 回到 80% 時日輪亮滿並轉一圈
    if (hpRatio < FULL_SPIN_RATIO - 0.02) this.wasBelowFull = true;
    else if (this.wasBelowFull && hpRatio >= FULL_SPIN_RATIO) {
      this.wasBelowFull = false;
      this.spinBoost = Math.PI * 2;
      this.pulse = Math.max(this.pulse, 0.5);
    }
    if (skin) {
      // 第三段 (終結技) 命中：日輪快轉半圈
      const fin = !!skin.strikeMove && skin.strikeMove.finisher;
      if (fin && !this.wasFinisher) this.spinBoost = Math.max(this.spinBoost, Math.PI);
      this.wasFinisher = fin;
      // 閃身：原地留一圈小金環
      if (skin.isDodging && !this.wasDodging) slashFX.ringSlash(this.pos.x, this.pos.y + 0.15, this.pos.z, 0.9, AWAKEN_GOLD, 0, 1);
      this.wasDodging = skin.isDodging;
      const u = skin.awakenUniforms;
      const flash = this.hitT > 0.17 ? 1 : 0;
      let k: number;
      if (this.eclipse > 0.5) {
        const beat = Math.pow(Math.max(0, Math.sin(this.time * Math.PI * 2 * 1.2)), 6);
        k = 0.35 + 0.9 * beat;
      } else k = 0.925 + 0.075 * Math.sin(this.time * Math.PI); // 0.5Hz 呼吸
      u.uGlowK.value = k + flash * 1.2 + this.pulse * 0.6;
      u.uGlowColor.value.copy(_gold).lerp(_white, Math.max(flash, this.pulse * 0.5));
      u.uPetalLit.value = this.petalLit;
      u.uEclipse.value = this.eclipse;
      u.uReveal.value = 1;
    }
    // 日輪：快轉 (每秒最多 4π) + 受擊歪斜
    const spin = Math.min(this.spinBoost, dt * Math.PI * 4);
    this.spinBoost -= spin;
    this.wheel.rotation.z -= spin;
    this.wheelPivot.rotation.x = this.hitT > 0 ? 0.15 * Math.sin(this.hitT * 50) * (this.hitT / 0.25) : 0;
    this.wheelPivot.visible = true;
  }

  // ----- 播放還原 (勝利)：回傳 true 代表已結束並還原 -----
  private updateOutro(): boolean {
    const t = this.timer;
    const u = this.skin?.awakenUniforms;
    const dim = Math.min(1, t / OUTRO_DIM_SEC);
    if (u) {
      u.uReveal.value = 1 + (REVEAL_OFF - 1) * dim; // 由頭往腳熄滅
      u.uPetalLit.value = SUN_PETALS * (1 - dim);
      u.uEclipse.value = 0;
      u.uGlowK.value = 1.1;
    }
    const ws = 1 - smoothRange(t, OUTRO_DIM_SEC, OUTRO_DIM_SEC + 0.2);
    this.wheelPivot.scale.setScalar(Math.max(0.001, ws));
    this.wheelPivot.visible = ws > 0.01;
    // 花瓣逐片 (每 0.05s) 脫落，弧線飛回太陽花
    const step = OUTRO_DIM_SEC / SUN_PETALS;
    let arrived = 0;
    for (let i = 0; i < SUN_PETALS; i++) {
      const k = (t - i * step) / OUTRO_FLY_SEC;
      if (k <= 0 || k >= 1) {
        if (k >= 1) arrived++;
        this.motes.setMatrixAt(i, ZERO_SCALE);
        continue;
      }
      const e = k * k * (3 - 2 * k);
      _v.copy(this.petalFrom[i]).lerp(this.sunTarget, e);
      _v.y += Math.sin(k * Math.PI) * 1.6;
      _s.setScalar(0.11 * (1 - k * 0.5));
      _q.setFromEuler(_e.set(0, this.time * 6 + i, k * 8));
      this.motes.setMatrixAt(i, _m.compose(_v, _q, _s));
    }
    this.motes.instanceMatrix.needsUpdate = true;
    if (arrived > 0 && !this.outroChimed) {
      this.outroChimed = true;
      soundManager.playPetalBloom(this.sunTarget);
    }
    if (t >= AWAKEN_OUTRO_SEC || arrived >= SUN_PETALS) {
      slashFX.hitFlash(this.sunTarget.x, this.sunTarget.y, this.sunTarget.z, AWAKEN_GOLD);
      this.revertInstant();
      return true;
    }
    return false;
  }

  // ----- 過場光柱 + 地面環 (只在變身過場；低檔不畫) -----
  private updateAura() {
    const on = this.state === 'INTRO' && getFxQuality().awakenPillar && this.fade > 0.02;
    this.aura.visible = on;
    if (!on) return;
    this.aura.position.copy(this.pos);
    const uu = this.auraMat.uniforms;
    uu.uTime.value = this.time;
    uu.uAlpha.value = this.fade * 0.85;
    uu.uColumn.value = getFxTier() === 'high' ? 1 : 0.7;
    uu.uPulse.value = this.pulse;
    uu.uSpread.value = 0.4 + 0.6 * smoothRange(this.timer, T_REVEAL, T_REVEAL + 0.6);
  }

  // ----- 環身花瓣光點 (+ 過場向陽之心) -----
  private updateMotes() {
    const mesh = this.motes;
    const p = this.pos;
    const intro = this.state === 'INTRO';
    const t = this.timer;
    const count = this.hidden ? 0 : getFxQuality().awakenMotes;
    // 過場：光點自地面吸上來 (點亮開始後淡入)；向陽之心飛行前段，前 5 顆光點當作拖尾
    const appear = intro ? smoothRange(t, T_REVEAL, T_REVEAL + 0.6) : 1;
    const heartFlying = intro && t < T_CATCH;
    for (let i = 0; i < MOTE_POOL; i++) {
      if (heartFlying && i < 5) {
        this.heartPoint(Math.max(0, t - (i + 1) * 0.035), _v);
        _s.setScalar(0.07 * (1 - i * 0.15));
        _q.setFromEuler(_e.set(0, this.time * 5, i));
        mesh.setMatrixAt(i, _m.compose(_v, _q, _s));
        continue;
      }
      if (i >= count || appear <= 0) { mesh.setMatrixAt(i, ZERO_SCALE); continue; }
      const ph = i / count;
      const cyc = (this.time * 0.42 + ph * 1.618) % 1; // 螺旋上升循環
      const ang = this.time * 1.7 + ph * Math.PI * 2;
      const rad = 0.55 + 0.12 * Math.sin(this.time * 2 + i) - cyc * 0.15;
      _v.set(p.x + Math.cos(ang) * rad, p.y + 0.1 + cyc * 2.0, p.z + Math.sin(ang) * rad);
      const sc = 0.065 * Math.sin(cyc * Math.PI) * appear * (1 + this.pulse * 0.6);
      _s.set(sc, sc, sc);
      _q.setFromEuler(_e.set(0.4, ang + this.time * 3, this.time * 2 + i));
      mesh.setMatrixAt(i, _m.compose(_v, _q, _s));
    }
    if (heartFlying) {
      this.heartPoint(t, _v);
      _q.setFromEuler(_e.set(0, this.time * 9, Math.sin(this.time * 7) * 0.6));
      _s.setScalar(0.16);
      mesh.setMatrixAt(HEART, _m.compose(_v, _q, _s));
    } else mesh.setMatrixAt(HEART, ZERO_SCALE);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = true;
  }

  // 向陽之心飛行軌跡：自上空螺旋落向玩家胸口 (t 0 → T_CATCH)
  private heartPoint(t: number, out: THREE.Vector3): THREE.Vector3 {
    const k = Math.min(1, t / T_CATCH);
    const e = 1 - (1 - k) * (1 - k);
    _v2.set(this.pos.x, this.pos.y + 1.25, this.pos.z);
    out.copy(this.heartFrom).lerp(_v2, e);
    const swirl = (1 - e) * 0.9;
    out.x += Math.cos(k * Math.PI * 3) * swirl;
    out.z += Math.sin(k * Math.PI * 3) * swirl;
    return out;
  }

  /** shader 預熱：暫時顯示交給 compile 後還原 */
  public prewarm(compile: () => void) {
    const a = this.aura.visible;
    const w = this.wheelPivot.visible;
    const m = this.motes.visible;
    this.aura.visible = true;
    this.wheelPivot.visible = true;
    this.motes.visible = true;
    compile();
    this.aura.visible = a;
    this.wheelPivot.visible = w;
    this.motes.visible = m;
  }
}

function smoothRange(t: number, a: number, b: number): number {
  const c = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return c * c * (3 - 2 * c);
}
