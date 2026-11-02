// 關卡驗證器 (devtools，純函式；不 import three / DOM)
// 只實作現有資料能支撐的檢查；字條預算 / lint、謎題 area、物品表、各機制 validate 等待資料欄位存在後再加 (架構 4.12)
import type { AbilityId, LevelDef, Mode, ObjDef, ObjId, Visibility } from '../core/types';
import type { Mechanic } from '../core/registry';
import { compileMechanics } from '../core/registry';
import { createWorld } from '../core/world';
import { boxAt, objBox } from '../core/geometry';
import { hits, inBounds } from '../core/place';
import { solidsFor } from '../core/presence';
import { step } from '../core/step';
import type { LevelEntry } from '../content/levels';
import type { ChapterDef } from '../content/chapters';
import { ABILITY_IDS } from '../meta/save';

/** 問題代碼 (測試以代碼斷言，訊息僅供人讀) */
export type IssueCode =
  | 'level.field'         // 關卡層欄位缺漏 / 型別錯
  | 'level.bounds'        // bounds 不合法 (min ≥ max 或非有限數)
  | 'level.start'         // 起點出界或兩模式站不住
  | 'level.checkpoint'    // 檢查點出界、站不住或 minX 未遞增
  | 'level.noExit'        // 沒有出口門 (door)
  | 'object.field'           // 物件欄位缺漏 / 型別錯
  | 'object.size'            // w/h/d 非正數
  | 'object.visible'         // visible / interactIn 不是 both|2d|3d，或 interactIn 不在 visible 涵蓋的模式內
  | 'object.dupId'           // id 重複
  | 'object.unknownType'     // 類型未註冊於機制表
  | 'object.outOfBounds'     // 物件中心在房間外
  | 'ref.opens'           // opens 指向不存在的物件或自己
  | 'ref.requires'        // requires 的物品在本關取不到、也不在開場能力白名單
  | 'ref.exitLocked'      // 出口門沒有任何物件 opens 它、也不是 unsealed (永遠解不開)
  | 'text.missing'        // 文字 key 不存在於文字表
  | 'entry.mismatch'      // 登錄表 id / titleKey 與 LevelDef 不一致
  | 'entry.ability'       // 能力白名單含未知能力
  | 'entry.unlock'        // 解鎖前置引用不存在的關卡
  | 'entry.chapter';      // 章節不存在或章節 levels 未列入本關

export interface LevelIssue { level: string; obj?: ObjId; code: IssueCode; message: string }

export interface ValidateContext {
  mechanics: readonly Mechanic[];
  /** 文字表 (key → 字串)；key 齊全以 `key in bundle` 判定 */
  bundle: Readonly<Record<string, string>>;
  /** 本關開場能力白名單 (登錄表 LevelEntry.abilities)；requires 可由此滿足 */
  abilities?: readonly AbilityId[];
}

const VIS: readonly Visibility[] = ['both', '2d', '3d'];
const MODES: readonly Mode[] = ['3d', '2d'];
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const covers = (v: Visibility, m: Mode): boolean => v === 'both' || v === m;

interface KeyRef { key: string; obj?: ObjId }

/** 關卡引用的文字 key (順序：title、narration、next，然後每個物件的 label / lockedText / useText / note.textKey) */
function levelKeyRefs(level: LevelDef): KeyRef[] {
  const refs: KeyRef[] = [level.titleKey, level.narrationKey, level.nextKey].map(key => ({ key }));
  for (const o of level.objects) {
    const keys = [o.labelKey, o.lockedText, o.useText, o.type === 'note' ? o.textKey : undefined].filter((k): k is string => k !== undefined);
    refs.push(...keys.map(key => ({ key, obj: o.id })));
  }
  return refs;
}

/** 關卡引用但文字表沒有的 key (S5 起的 key 齊全檢查，S9 由 tests 移入) */
export function missingLevelKeys(level: LevelDef, bundle: Readonly<Record<string, string>>): string[] {
  return levelKeyRefs(level).map(r => r.key).filter(k => !(k in bundle));
}

const reqItem = (o: ObjDef): string | undefined =>
  o.requires === undefined ? undefined : typeof o.requires === 'string' ? o.requires : o.requires.item;

/** 起點 / 檢查點：兩模式都在界內、放上去推進一幀後站穩於原高度、不與實體重疊 (同 puzzleLogic.test 的起點測試) */
function standsInBothModes(def: LevelDef, mechanics: readonly Mechanic[], s: { x: number; y: number; z: number }): Mode[] {
  const bad: Mode[] = [];
  for (const mode of MODES) {
    const w = createWorld(def, { mechanics });
    if (!inBounds(w, s.x, s.z, mode)) { bad.push(mode); continue; }
    const p = w.player;
    p.mode = mode; p.x = s.x; p.y = s.y; p.z = mode === '2d' ? 0 : s.z; p.z3d = s.z; p.vy = 0;
    const overlap = hits(solidsFor(w, mode).map(objBox), boxAt(p.x, p.y, p.z), mode);
    step(w, { moveX: 0, moveZ: 0, jump: false, pressed: [] }, 1 / 60);
    if (overlap || !p.onGround || Math.abs(p.y - s.y) > 1e-3) bad.push(mode);
  }
  return bad;
}

/** 驗證一份關卡資料；回傳問題清單 (空 = 通過) */
export function validateLevel(def: LevelDef, ctx: ValidateContext): LevelIssue[] {
  const issues: LevelIssue[] = [];
  const level = typeof def.id === 'string' ? def.id : '?';
  const add = (code: IssueCode, message: string, obj?: ObjId): void => { issues.push(obj === undefined ? { level, code, message } : { level, obj, code, message }); };

  // 關卡層 schema
  for (const k of ['id', 'titleKey', 'narrationKey', 'nextKey'] as const) {
    if (typeof def[k] !== 'string' || def[k] === '') add('level.field', `${k} must be a non-empty string`);
  }
  if (!finite(def.voidY)) add('level.field', 'voidY must be a finite number');
  if (!Array.isArray(def.objects)) { add('level.field', 'objects must be an array'); return issues; }
  const b = def.bounds;
  const boundsOk = !!b && finite(b.minX) && finite(b.maxX) && finite(b.minZ) && finite(b.maxZ) && b.minX < b.maxX && b.minZ < b.maxZ;
  if (!boundsOk) add('level.bounds', 'bounds must have finite minX < maxX and minZ < maxZ');

  // 物件 schema / id / 類型
  const types = compileMechanics(ctx.mechanics).types;
  const seen = new Set<ObjId>();
  for (const o of def.objects) {
    const id = typeof o.id === 'string' ? o.id : undefined;
    if (!id) { add('object.field', 'object id must be a non-empty string'); continue; }
    if (seen.has(id)) add('object.dupId', `duplicate object id "${id}"`, id);
    seen.add(id);
    if (typeof o.type !== 'string' || !types.has(o.type)) add('object.unknownType', `type "${String(o.type)}" is not registered by any mechanic`, id);
    for (const k of ['x', 'y', 'z', 'w', 'h', 'd'] as const) if (!finite(o[k])) add('object.field', `${k} must be a finite number`, id);
    for (const k of ['w', 'h', 'd'] as const) if (finite(o[k]) && o[k] <= 0) add('object.size', `${k} must be > 0`, id);
    if (typeof o.solid !== 'boolean') add('object.field', 'solid must be boolean', id);
    if (!VIS.includes(o.visible)) add('object.visible', `visible "${String(o.visible)}" is not both|2d|3d`, id);
    else if (o.interactIn !== undefined) {
      if (!VIS.includes(o.interactIn)) add('object.visible', `interactIn "${String(o.interactIn)}" is not both|2d|3d`, id);
      else if (!MODES.some(m => covers(o.visible, m) && covers(o.interactIn!, m))) add('object.visible', `interactIn "${o.interactIn}" never overlaps visible "${o.visible}"`, id);
    }
    if (boundsOk && finite(o.x) && finite(o.z) && (o.x < b.minX || o.x > b.maxX || o.z < b.minZ || o.z > b.maxZ)) {
      add('object.outOfBounds', `center (${o.x}, ${o.z}) is outside bounds`, id);
    }
    if (o.grants !== undefined && (typeof o.grants !== 'string' || o.grants === '')) add('object.field', 'grants must be a non-empty item id', id);
  }

  // 引用
  const byId = new Map(def.objects.map(o => [o.id, o]));
  const granted = new Set(def.objects.map(o => o.grants).filter((g): g is string => typeof g === 'string'));
  const start = new Set<string>(ctx.abilities ?? []);
  for (const o of def.objects) {
    if (o.opens !== undefined && (o.opens === o.id || !byId.has(o.opens))) add('ref.opens', `opens "${o.opens}" does not name another object`, o.id);
    const item = reqItem(o);
    if (item !== undefined && !granted.has(item) && !start.has(item)) add('ref.requires', `requires "${item}" but nothing in the level grants it and it is not a starting ability`, o.id);
  }

  // 出口
  const doors = def.objects.filter(o => o.type === 'door');
  if (doors.length === 0) add('level.noExit', 'level has no exit door');
  for (const d of doors) {
    // 沒有封印的門 (unsealed) 開場即可開，不需要打開它的物件
    if (d.type === 'door' && d.unsealed) continue;
    if (!def.objects.some(o => o.opens === d.id)) add('ref.exitLocked', `exit door "${d.id}" is never opened by any object`, d.id);
  }

  // 文字 key
  for (const r of levelKeyRefs(def)) if (!(r.key in ctx.bundle)) add('text.missing', `text key "${r.key}" is missing`, r.obj);
  for (const t of new Set(def.objects.map(o => o.type))) {
    const verbKey = types.get(t)?.spec.verbKey;
    if (verbKey !== undefined && !(verbKey in ctx.bundle)) add('text.missing', `verb key "${verbKey}" of type "${t}" is missing`);
  }

  // 起點 / 檢查點 (只在結構合法時模擬，避免在壞資料上誤報)
  if (boundsOk && issues.every(i => i.code !== 'object.field' && i.code !== 'object.unknownType')) {
    if (!def.start || ![def.start.x, def.start.y, def.start.z].every(finite)) add('level.start', 'start must have finite x/y/z');
    else {
      const bad = standsInBothModes(def, ctx.mechanics, def.start);
      if (bad.length) add('level.start', `start does not stand in mode ${bad.join(', ')}`);
    }
    let prevMinX = -Infinity;
    (def.checkpoints ?? []).forEach((cp, i) => {
      if (![cp.minX, cp.x, cp.y, cp.z].every(finite)) { add('level.checkpoint', `checkpoint #${i} must have finite minX/x/y/z`); return; }
      if (cp.minX <= prevMinX) add('level.checkpoint', `checkpoint #${i} minX must increase`);
      prevMinX = cp.minX;
      const bad = standsInBothModes(def, ctx.mechanics, cp);
      if (bad.length) add('level.checkpoint', `checkpoint #${i} does not stand in mode ${bad.join(', ')}`);
    });
  }
  return issues;
}

/** 驗證登錄表一筆：與 LevelDef 一致、能力白名單、解鎖前置、章節歸屬，再驗證關卡本身 */
export function validateEntry(entry: LevelEntry, ctx: Omit<ValidateContext, 'abilities'> & { levels: readonly LevelEntry[]; chapters: readonly ChapterDef[] }): LevelIssue[] {
  const def = entry.load();
  const issues: LevelIssue[] = [];
  const add = (code: IssueCode, message: string): void => { issues.push({ level: entry.id, code, message }); };
  if (def.id !== entry.id) add('entry.mismatch', `entry id "${entry.id}" != level id "${def.id}"`);
  if (def.titleKey !== entry.titleKey) add('entry.mismatch', `entry titleKey "${entry.titleKey}" != level titleKey "${def.titleKey}"`);
  for (const a of entry.abilities) if (!(ABILITY_IDS as readonly string[]).includes(a)) add('entry.ability', `unknown ability "${a}"`);
  for (const id of entry.unlock.after) if (id === entry.id || !ctx.levels.some(e => e.id === id)) add('entry.unlock', `unlock.after "${id}" is not another registered level`);
  const ch = ctx.chapters.find(c => c.id === entry.chapter);
  if (!ch) add('entry.chapter', `chapter ${entry.chapter} does not exist`);
  else if (!ch.levels.includes(entry.id)) add('entry.chapter', `chapter ${entry.chapter} does not list level "${entry.id}"`);
  return [...issues, ...validateLevel(def, { mechanics: ctx.mechanics, bundle: ctx.bundle, abilities: entry.abilities })];
}
