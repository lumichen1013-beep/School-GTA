import * as THREE from 'three';
import { slashFX } from './SlashFX';
import { hitSparkFX, type SparkBurstOpts } from './HitSparkFX';
import { comboFinisherFX } from './ComboFinisherFX';
import { getFxQuality } from './fxQuality';
import type { FxElement, WeaponFxStyle } from './weaponFxStyle';
import { IMPACT_PROFILES, type ImpactClass } from '../weapons/impactClass';

// 近戰命中特效編排 (全武器共用)：星芒 (hitFlash) + 徑向衝擊環 + 塊狀碎片 + 元素附加層 (雷 / 電弧 / 羽毛 / 書頁)。
// 全部走既有池：SlashFX (星芒 / 環)、HitSparkFX (碎片)、ComboFinisherFX (小雷電 / 羽毛)，不新增 draw call 類別以外的物件；
// 數量受 fxQuality (flashPerStrike / sparkScale / miniBolts / featherPool) 約束，停格與震動不在此 (見 impactClass)。

const BOOK_PAGES = [0xf3efe2, 0xfaf7ee, 0x4f6fdc] as const;
const WOOD_CHIPS = [0xc8873f, 0x8a5a2b, 0xffb35c, 0x6b4423] as const;
const STONE_CHIPS = [0xb8b2a6, 0x8d877c, 0xffd98a] as const;
// 星芒尺寸依重量 (終結技再 ×1.4)
const FLASH_SCALE: Record<ImpactClass, number> = { LIGHT: 0.95, MEDIUM: 1.1, HEAVY: 1.3, GOLD: 1.45 };
const RING_SIZE: Record<ImpactClass, number> = { LIGHT: 0.7, MEDIUM: 0.85, HEAVY: 1.05, GOLD: 1.2 };

const _opts: SparkBurstOpts = { count: 0, colors: [], speed: 0, up: 0, size: 0, gravity: 0, life: 0, spread: 0 };
const _palette: number[] = [0, 0, 0];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// 元素對應的碎片參數 (寫入共用 _opts)
function sparkOpts(el: FxElement, style: WeaponFxStyle, count: number, big: boolean): SparkBurstOpts {
  const o = _opts;
  _palette[0] = style.tipColor; _palette[1] = style.color; _palette[2] = style.tail ?? style.color;
  o.count = count;
  o.colors = _palette;
  o.spread = big ? 1 : 0.55;
  switch (el) {
    case 'WOOD': o.colors = WOOD_CHIPS; o.speed = 5.5; o.up = 4.5; o.size = 0.16; o.gravity = 18; o.life = 0.55; break;
    case 'THUNDER': case 'ELECTRIC': o.speed = 8.5; o.up = 3; o.size = 0.1; o.gravity = 4; o.life = 0.3; break;
    case 'WIND': o.speed = 5; o.up = 2.5; o.size = 0.09; o.gravity = 3; o.life = 0.35; break;
    case 'PAGE': o.colors = BOOK_PAGES; o.speed = 4.5; o.up = 3.5; o.size = 0.13; o.gravity = 6; o.life = 0.5; break;
    case 'STONE': o.colors = STONE_CHIPS; o.speed = 4; o.up = 3; o.size = 0.1; o.gravity = 14; o.life = 0.4; break;
    default: o.speed = 6.5; o.up = 3; o.size = 0.12; o.gravity = 9; o.life = 0.35; break;
  }
  if (big) { o.speed *= 1.5; o.up *= 1.4; o.size *= 1.25; o.life *= 1.3; }
  return o;
}

// 單一目標命中特效：(x, y, z) 為受擊胸口、(dirX, dirZ) 為攻擊方向 (碎片往後噴)；flashBudget = 本擊剩餘星芒額度
// 回傳實際使用的星芒數 (呼叫端據此扣除每擊上限)
export function spawnMeleeHitFx(x: number, y: number, z: number, dirX: number, dirZ: number,
  style: WeaponFxStyle, cls: ImpactClass, finisher: boolean, flashBudget: number): number {
  const p = IMPACT_PROFILES[cls];
  const q = getFxQuality();
  const el = style.element ?? 'IMPACT';
  let used = 0;
  if (flashBudget > 0) {
    slashFX.hitFlash(x, y, z, style.color, FLASH_SCALE[cls] * (finisher ? 1.4 : 1));
    used++;
    // 第二顆星芒 (重武器 / 終結技)：亮核心色、略偏上
    if ((p.flashes > 1 || finisher) && used < flashBudget) { slashFX.hitFlash(x, y + 0.18, z, style.tipColor, FLASH_SCALE[cls] * 0.7); used++; }
  }
  if (p.ring || finisher) slashFX.hitRing(x, y, z, style.color, RING_SIZE[cls] * (finisher ? 1.35 : 1));
  const n = (finisher ? p.finisherSparks : p.sparks) * q.sparkScale;
  hitSparkFX.burst(x, y, z, dirX, dirZ, sparkOpts(el, style, n, finisher));

  // 元素附加層
  if (el === 'THUNDER') {
    // 每擊一道小落雷：自頭頂斜上方劈到命中點 (第二道細白電弧依檔位上限自然略過)
    _a.set(x + (Math.random() - 0.5) * 1.2, y + 2.8, z + (Math.random() - 0.5) * 1.2);
    comboFinisherFX.arcBolt(_a, _b.set(x, y, z), style.tail ?? style.color, 0.16, finisher ? 1.8 : 1.0, 0.32);
    _a.set(x + (Math.random() - 0.5) * 0.9, y + 0.5, z + (Math.random() - 0.5) * 0.9);
    comboFinisherFX.arcBolt(_a, _b.set(x - dirX * 0.3, y - 0.4, z - dirZ * 0.3), style.tipColor, 0.12, 0.7, 0.15);
  } else if (el === 'ELECTRIC') {
    for (let k = 0; k < 2; k++) {
      const a = Math.random() * Math.PI * 2;
      _a.set(x + Math.cos(a) * 0.45, y + 0.35, z + Math.sin(a) * 0.45);
      _b.set(x - Math.cos(a) * 0.45, y - 0.3, z - Math.sin(a) * 0.45);
      comboFinisherFX.arcBolt(_a, _b, k === 0 ? style.color : style.tail ?? style.color, 0.12, 0.7, 0.14);
    }
  } else if (el === 'WIND') {
    _palette[0] = style.tipColor; _palette[1] = style.color; _palette[2] = style.tail ?? style.color;
    comboFinisherFX.featherBurst(_a.set(x, y, z), _palette, finisher ? 8 : 3, 0.6);
  } else if (el === 'PAGE') {
    comboFinisherFX.featherBurst(_a.set(x, y, z), BOOK_PAGES, finisher ? 10 : 6, 0.8);
  }
  return used;
}

// 揮動中棒身電弧 (黃金棒雷霆 / 警棍電弧)：沿握把 → 尖端外延段抖動的短電弧
export function spawnWeaponArc(base: THREE.Vector3, tip: THREE.Vector3, style: WeaponFxStyle, finisher: boolean) {
  const el = style.element;
  if (el !== 'THUNDER' && el !== 'ELECTRIC') return;
  // 自棒身中段到尖端外 (拖尾外緣) 之間取一段，交替主色 / 尾端色
  const u0 = 0.25 + Math.random() * 0.35;
  const ext = (style.tipExt ?? 0.3) * (finisher ? 1.3 : 1) * (0.5 + Math.random() * 0.5);
  _a.lerpVectors(base, tip, u0);
  _b.subVectors(tip, base);
  const len = _b.length() || 1;
  _b.multiplyScalar(1 + ext / len).add(base);
  const color = Math.random() < 0.5 ? style.color : style.tail ?? style.color;
  comboFinisherFX.arcBolt(_a, _b, color, 0.07, el === 'THUNDER' ? (finisher ? 1.3 : 0.9) : 0.6, el === 'THUNDER' ? 0.16 : 0.1);
}

// 終結技附加層 (在既有地裂 / 雙環 / 羽毛之上)：p 為衝擊點 (呼叫端已取地面高度)、radius 為群攻半徑
export function spawnFinisherExtras(p: THREE.Vector3, radius: number, style: WeaponFxStyle, cls: ImpactClass, kind: 'SLAM' | 'SPIN' | 'DASH', waistY: number) {
  const prof = IMPACT_PROFILES[cls];
  const q = getFxQuality();
  const el = style.element ?? 'IMPACT';
  const y = kind === 'SLAM' ? p.y + 0.25 : waistY;
  // 大型碎片爆散 (全方位) + 大衝擊環 + 白熱星芒
  hitSparkFX.burst(p.x, y, p.z, 0, 0, sparkOpts(el, style, prof.finisherSparks * 1.3 * q.sparkScale, true));
  slashFX.hitRing(p.x, y + 0.4, p.z, style.color, Math.max(1.4, radius * 0.9));
  slashFX.hitFlash(p.x, y + 0.5, p.z, style.tipColor, FLASH_SCALE[cls] * 1.8);
  if (el === 'THUNDER') {
    // 落雷加大：地面放射電弧 (沿地裂往外竄) + 斜上方補劈
    const n = Math.max(1, q.miniBolts - 1);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.5;
      const r = radius * (1.1 + Math.random() * 0.5);
      _a.set(p.x, p.y + 0.1, p.z);
      _b.set(p.x + Math.cos(a) * r, p.y + 0.05, p.z + Math.sin(a) * r);
      comboFinisherFX.arcBolt(_a, _b, k % 2 === 0 ? style.color : style.tail ?? style.color, 0.32, 1.6, 0.35);
    }
  } else if (el === 'ELECTRIC') {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.random();
      _a.set(p.x + Math.cos(a) * radius * 0.4, waistY, p.z + Math.sin(a) * radius * 0.4);
      _b.set(p.x + Math.cos(a + 1.2) * radius * 1.1, waistY + (Math.random() - 0.5) * 0.4, p.z + Math.sin(a + 1.2) * radius * 1.1);
      comboFinisherFX.arcBolt(_a, _b, k === 1 ? style.tail ?? style.color : style.color, 0.24, 1.0, 0.25);
    }
  }
}
