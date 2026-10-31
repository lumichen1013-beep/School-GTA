import { FIST } from './defs/fist';
import { NORMAL_BAT } from './defs/normalBat';
import { SPECIAL_BAT } from './defs/goldBat';
import { DUAL_RACKET } from './defs/dualRacket';
import { OVERRIDE_RACKET } from './defs/racket';
import { createBookWhip } from './defs/bookWhip';
import { createBasketball } from './defs/basketball';
import { createSlingshot } from './defs/slingshot';
import { createRapier } from './defs/rapier';
import type {
  ResolvedWeapon, WeaponDefinition, WeaponFxSpec, WeaponId, WeaponOverrideDefinition, WeaponOverrideId, WeaponVariant, WeaponWorld
} from './types';

// 武器槽順序 (循環切換依此順序)；玫瑰細劍與世界 Boss 花劍客同步上線
export const WEAPONS: readonly WeaponDefinition[] = [
  FIST, NORMAL_BAT, SPECIAL_BAT, DUAL_RACKET, createRapier(), createBookWhip(), createBasketball(), createSlingshot()
];
export const WEAPON_OVERRIDES: Readonly<Record<WeaponOverrideId, WeaponOverrideDefinition>> = { RACKET: OVERRIDE_RACKET };

const BY_ID: Partial<Record<WeaponId, WeaponDefinition>> = {};
for (const def of WEAPONS) BY_ID[def.id] = def;

export function isWeaponEnabled(id: WeaponId): boolean {
  return BY_ID[id] !== undefined;
}

// 未啟用 / 未定義的 id (如存檔殘留) 退回徒手，避免取到 undefined；需判斷是否啟用請用 isWeaponEnabled
export function getWeapon(id: WeaponId): WeaponDefinition {
  return BY_ID[id] ?? FIST;
}

export function getWeaponBySlot(slot: number): WeaponDefinition | undefined {
  return WEAPONS.find((w) => w.slot === slot);
}

export function isWeaponAvailable(def: WeaponDefinition, world: WeaponWorld): boolean {
  return def.worlds[world] !== false;
}

function normalizeFx(spec: WeaponFxSpec): ResolvedWeapon['fx'] {
  return typeof spec === 'string' ? { R: spec, L: spec } : { R: spec.R, L: spec.L ?? spec.R };
}

function buildResolved(def: WeaponDefinition | WeaponOverrideDefinition, variant: WeaponVariant | null): ResolvedWeapon {
  return {
    id: def.id,
    name: variant ? variant.name : def.name,
    combo: variant ? variant.combo : def.combo,
    tempo: variant?.tempo ?? def.tempo,
    fx: normalizeFx(variant ? variant.fxStyle : def.fxStyle),
    impactClass: def.impactClass,
    finisherFx: variant?.finisherFx ?? def.finisherFx ?? {},
    launchCap: variant?.launchCap ?? def.launchCap ?? null,
    chainWindow: def.chainWindow ?? 0.6,
    anchors: def.anchors,
    sounds: variant?.sounds ?? def.sounds,
    readyPose: def.readyPose
  };
}

// 預建查表 (模組載入時建立一次，執行期只回傳參照)；世界不可用 (false) 時沿用定義本身，可用性由 isWeaponAvailable 把關
const RESOLVED: Partial<Record<WeaponId, Record<WeaponWorld, ResolvedWeapon>>> = {};
for (const def of WEAPONS) {
  const variantOf = (w: WeaponWorld) => (typeof def.worlds[w] === 'object' ? def.worlds[w] as WeaponVariant : null);
  const base = buildResolved(def, null);
  const campus = variantOf('CAMPUS');
  const detention = variantOf('DETENTION');
  RESOLVED[def.id] = {
    CAMPUS: campus ? buildResolved(def, campus) : base,
    DETENTION: detention ? buildResolved(def, detention) : base
  };
}
const RESOLVED_OVERRIDES: Record<WeaponOverrideId, ResolvedWeapon> = { RACKET: buildResolved(OVERRIDE_RACKET, null) };

// 武器於指定世界生效的套組 (如第二世界普通棒 → 警棍)
export function resolveVariant(id: WeaponId, world: WeaponWorld): ResolvedWeapon {
  return (RESOLVED[id] ?? RESOLVED.FIST!)[world];
}

// 實際揮擊時生效的套組：場景覆寫優先於目前武器 (數值仍由呼叫端取目前武器的 stats)
export function resolveLoadout(current: WeaponId, override: WeaponOverrideId | null, world: WeaponWorld): ResolvedWeapon {
  return override ? RESOLVED_OVERRIDES[override] : (RESOLVED[current] ?? RESOLVED.FIST!)[world];
}
