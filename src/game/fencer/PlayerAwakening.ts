import * as THREE from 'three';
import { FENCER } from './fencerRules';
import { getFxTier } from '../../effects/fxQuality';
import { slashFX } from '../../effects/SlashFX';
import { comboFinisherFX } from '../../effects/ComboFinisherFX';
import type { WeaponFxStyle } from '../../effects/weaponFxStyle';

// 玩家「向陽覺醒」(花劍客戰專用)：數值與視覺分開。
// - AwakeningStats：體力上限 200 並補滿 / 戰後還原 (純邏輯可測)
// - PlayerAwakening：視覺模組 (本階段為基本版：腳下朝陽光環 + 低矮光柱 + 覺醒爆發)，
//   入口命名對齊玩家變身設計 (player-awakening-design.md §4.1)：playIntro / applyInstant / playOutro / revertInstant / update，
//   之後完整版 (紋路點亮、日輪花冠、髮梢燃金) 直接替換本類別即可，FencerBossFight 呼叫端不需改。
// 配色：朝陽金 #FFC83A、晨白 #FFF6D8、天空藍 #7FD8FF (與脫戰回血的淡綠、Boss 預警的粉紅區分)

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
const AWAKEN_STYLE: WeaponFxStyle = { color: AWAKEN_GOLD, tipColor: AWAKEN_WHITE, intensity: 1.3, life: 0.2, glow: 1, impact: AWAKEN_GOLD };

/** 變身演出長度 (秒)：與 Boss 劍禮台詞重疊，開戰過場 4.5～6.8s */
export const AWAKEN_INTRO_SEC = 2.3;
const AWAKEN_BURST_AT = 1.1;
const AWAKEN_OUTRO_SEC = 0.6;

export type AwakeningState = 'OFF' | 'INTRO' | 'ON' | 'OUTRO';

const VERT = /* glsl */`
attribute float aPart;
varying vec2 vUv;
varying float vPart;
void main() {
  vUv = uv;
  vPart = aPart;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */`
uniform float uTime;
uniform float uAlpha;
uniform float uColumn;
uniform float uPulse;
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
    float r = length(p);
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

const _burstPos = new THREE.Vector3();

/**
 * 覺醒視覺 (基本版)：腳下朝陽光環 + 低矮光柱合併單一幾何、單一加法混色 shader (1 draw call，建構時預建、閒置隱藏)。
 * 低檔 (fxQuality low) 不畫光柱、不噴羽毛。
 */
export class PlayerAwakening {
  public state: AwakeningState = 'OFF';
  private readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private time = 0;
  private timer = 0;
  private fade = 0;
  private pulse = 0;
  private burstDone = false;
  private onIntroDone: (() => void) | null = null;
  private readonly pos = new THREE.Vector3();

  constructor(parent: THREE.Object3D) {
    const ring = new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2).translate(0, 0.09, 0); // 高於結界地板 (0.045)
    const column = new THREE.CylinderGeometry(0.6, 0.72, 1.8, 16, 1, true).translate(0, 0.9, 0);
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
    }
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uColumn: { value: 1 }, uPulse: { value: 0 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
      blending: THREE.AdditiveBlending
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'player_awakening_aura';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  public get isOn(): boolean {
    return this.state !== 'OFF';
  }

  /** 播放變身 (開戰過場 4.5～6.8s)：光環由淡入到滿、1.1s 時爆發 (星閃 + 羽毛 + 衝擊環)，結束呼叫 onDone */
  public playIntro(onDone?: () => void) {
    this.state = 'INTRO';
    this.timer = 0;
    this.fade = 0;
    this.burstDone = false;
    this.onIntroDone = onDone ?? null;
    this.mesh.visible = true;
  }

  /** 直接套用 (跳過過場)：常駐狀態 + 一次星閃，讓跳過的人也看得出已覺醒 */
  public applyInstant() {
    const cb = this.onIntroDone;
    this.onIntroDone = null;
    this.state = 'ON';
    this.fade = 1;
    this.pulse = 1;
    this.burstDone = true;
    this.mesh.visible = true;
    if (cb) cb();
  }

  /** 播放還原 (勝利)：0.6s 淡出 */
  public playOutro() {
    if (this.state === 'OFF') return;
    this.state = 'OUTRO';
    this.timer = 0;
  }

  /** 立即還原 (死亡 / 切世界 / 中止)：同一幀全部關閉 */
  public revertInstant() {
    this.state = 'OFF';
    this.onIntroDone = null;
    this.fade = 0;
    this.pulse = 0;
    this.mat.uniforms.uAlpha.value = 0;
    this.mesh.visible = false;
  }

  /** 每幀：pos = 玩家腳底；hidden = 玩家隱藏 (騎車 / 死亡) 時淡出 */
  public update(dt: number, pos: THREE.Vector3, hidden: boolean, _hpRatio: number = 1, _isRegenFast: boolean = false) {
    if (this.state === 'OFF') return;
    this.time += dt;
    this.timer += dt;
    this.pos.copy(pos);
    if (this.state === 'INTRO') {
      this.fade = Math.min(1, this.timer / AWAKEN_BURST_AT);
      if (!this.burstDone && this.timer >= AWAKEN_BURST_AT) {
        this.burstDone = true;
        this.burst();
      }
      if (this.timer >= AWAKEN_INTRO_SEC) {
        this.state = 'ON';
        const cb = this.onIntroDone;
        this.onIntroDone = null;
        if (cb) cb();
      }
    } else if (this.state === 'OUTRO') {
      this.fade = Math.max(0, 1 - this.timer / AWAKEN_OUTRO_SEC);
      if (this.fade <= 0) {
        this.revertInstant();
        return;
      }
    } else {
      this.fade += ((hidden ? 0 : 1) - this.fade) * Math.min(1, dt * 4);
    }
    this.pulse = Math.max(0, this.pulse - dt * 1.6);
    this.mesh.visible = this.fade > 0.02;
    this.mesh.position.copy(pos);
    const low = getFxTier() === 'low';
    const u = this.mat.uniforms;
    u.uTime.value = this.time;
    u.uAlpha.value = this.fade * (low ? 0.7 : 0.85);
    u.uColumn.value = low ? 0 : 1;
    u.uPulse.value = this.pulse;
  }

  // 覺醒爆發：胸口金白星閃 + (中高檔) 金白藍羽毛 + 腰高衝擊環
  private burst() {
    this.pulse = 1;
    const p = this.pos;
    slashFX.hitFlash(p.x, p.y + 1.2, p.z, AWAKEN_WHITE);
    slashFX.chargeRing(p.x, p.y + 0.9, p.z, AWAKEN_GOLD, AWAKEN_SKY);
    comboFinisherFX.spinWave(_burstPos.set(p.x, p.y, p.z), 2.6, p.y + 1.0, AWAKEN_STYLE, 1.6, p.y, 0.05);
    if (getFxTier() !== 'low') comboFinisherFX.featherBurst(_burstPos.set(p.x, p.y + 1.3, p.z), AWAKEN_PALETTE);
  }

  /** shader 預熱：暫時顯示交給 compile 後還原 */
  public prewarm(compile: () => void) {
    const v = this.mesh.visible;
    this.mesh.visible = true;
    compile();
    this.mesh.visible = v;
  }
}
