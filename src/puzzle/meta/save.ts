import type { AbilityId } from '../core/types';
import type { Cell, CubeState } from '../core/cube';
import type { ObjSnapshot, RoomSnapshot, TurnRec } from '../core/chapter';
import { isRecord, type KeyValueStorage } from './storage';

export const SAVE_KEY = 'puzzle:save';
export const SAVE_CORRUPT_KEY = 'puzzle:save:corrupt';
/** 舊版玄關通關旗標 (遷移後刪除) */
export const LEGACY_FOYER_KEY = 'puzzle:foyer:cleared';
export const ABILITY_IDS: readonly AbilityId[] = ['nib', 'pin', 'section', 'mark', 'scale'];
export const NAME_MAX = 12;

/** 存檔版本 (v0.3：v3 = 加章節快照) */
export const SAVE_VERSION = 3;

/**
 * 一章的存檔 (規格 8 ChapterSave：魔方排列 + 已離開房間的快照 + 下次從哪扇門進 + 章節道具 + 旗標；
 * v0.3 M1b 加：標籤上貼著的字卡 labels、跨房物件 moved)。labels / moved 缺欄 (M1b 之前的存檔) = 空。
 * v0.4 控制盤章節增補 (不升版號，決策 Q12)：dial 魔方儀已啟動、unlocked 已解開的鎖扣、turns 剩餘墨與回退堆疊；
 * 缺欄 = 預設 (未啟動、沒有解開、進房補滿)；與章節定義不合 (墨量越界、堆疊過長、組 id 不存在) 由 meta/chapters 開章時丟棄 turns
 */
export interface ChapterSave {
  cube: CubeState;
  rooms: Record<string, RoomSnapshot>;
  at: { room: string; door: string | null };
  items: Record<string, number>;
  flags: string[];
  labels?: Record<string, string[]>;
  moved?: Record<string, { room: string; x: number; y: number; z: number }>;
  dial?: boolean;
  unlocked?: string[];
  turns?: { left: number; undo: TurnRec[] };
}

/** 存檔 v3 (規格 8)；v2 欄位不變，另加 chapters */
export interface SaveV3 {
  v: 3;
  cleared: string[];
  current: string;
  abilities: AbilityId[];
  diary: number[];
  scraps: number[];
  endings: { A: boolean; B: boolean };
  /** 玩家暱稱；預設空字串 = 尚未輸入 (開場進暱稱畫面) */
  name: string;
  /**
   * 已看過 (看完或跳過) 的過場 id，例 'cs:prologue' (規格 8)；跳過的另記在 skippedCutscenes (回憶頁標示「未看完」)。
   * 選填：M1C 之前的 v2 存檔沒有這兩欄，缺欄 = 空清單 (以 seenCutscenes() / skippedCutscenes() 讀取)，
   * 不為了補空清單而改寫舊存檔；第一次記錄過場時才寫入。
   */
  seenCutscenes?: string[];
  skippedCutscenes?: string[];
  /**
   * 章節快照 (key = 章號字串)。選填：缺欄 / 缺章 = 從該章開始狀態進入 (規格 8 遷移 v2 → v3)；
   * 第一次換房 / 轉動時才寫入
   */
  chapters?: Record<string, ChapterSave>;
}

/** 目前版本的存檔 */
export type Save = SaveV3;

export const defaultSave = (): SaveV3 => ({ v: 3, cleared: [], current: '', abilities: [], diary: [], scraps: [], endings: { A: false, B: false }, name: '' });

type Migration = (raw: Record<string, unknown>, s: KeyValueStorage) => Record<string, unknown>;
/** MIGRATIONS[n]：v=n → v=n+1；v0 = 沒有 puzzle:save */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 舊玄關即新 1-2；1-1 門廊視為已通過以免老玩家重教 (規格 8)
  0: (_r, s) => s.get(LEGACY_FOYER_KEY) === '1' ? { v: 1, cleared: ['1-1', '1-2'], abilities: ['nib'] } : { v: 1, cleared: [], abilities: [] },
  1: r => ({ ...defaultSave(), ...r, v: 2 }),
  // v0.3：能力只留 nib (pin / section / mark 隨機制退役)；chapters 缺欄 = 各章從頭 (舊存檔已通關 1-2 的預設旗標在開章時套用，見 meta/chapters)
  2: r => ({ ...r, v: 3, abilities: Array.isArray(r.abilities) ? r.abilities.filter(a => a === 'nib') : r.abilities })
};

const strs = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];
const ints = (v: unknown, lo: number, hi: number): number[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is number => Number.isInteger(x) && x >= lo && x <= hi))].sort((a, b) => a - b) : [];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCell = (v: unknown): v is Cell => Array.isArray(v) && v.length === 3 && v.every(n => Number.isInteger(n));
const SIDE_IDS: readonly unknown[] = ['N', 'S', 'E', 'W', 'U', 'D'];

/** 控制盤的墨量與回退堆疊 (結構校正；不合 → null = 丟棄 turns，開章時補滿) */
function sanitizeTurns(v: unknown): { left: number; undo: TurnRec[] } | null {
  if (!isRecord(v) || !Number.isInteger(v.left) || (v.left as number) < 0 || !Array.isArray(v.undo)) return null;
  const undo: TurnRec[] = [];
  for (const r of v.undo) {
    if (!isRecord(r) || typeof r.group !== 'string' || !(r.dir === 1 || r.dir === -1 || SIDE_IDS.includes(r.dir))) return null;
    undo.push({ group: r.group, dir: r.dir as TurnRec['dir'] });
  }
  return { left: v.left as number, undo };
}

function sanitizeObj(v: unknown): ObjSnapshot | null {
  if (!isRecord(v) || typeof v.id !== 'string' || ![v.x, v.y, v.z].every(finite)) return null;
  if (![v.gone, v.used, v.touched].every(b => typeof b === 'boolean')) return null;
  return { id: v.id, x: v.x as number, y: v.y as number, z: v.z as number, gone: v.gone as boolean, used: v.used as boolean, touched: v.touched as boolean };
}

/** 一章的存檔；結構不合 → null (該章從頭) */
export function sanitizeChapter(v: unknown): ChapterSave | null {
  if (!isRecord(v) || !isRecord(v.cube) || !isRecord(v.cube.pos) || !isRecord(v.cube.rot) || !isRecord(v.rooms) || !isRecord(v.at)) return null;
  const pos: Record<string, Cell> = {};
  const rot: Record<string, 0 | 1 | 2 | 3> = {};
  for (const [room, c] of Object.entries(v.cube.pos)) {
    if (!isCell(c)) return null;
    pos[room] = [c[0], c[1], c[2]];
    const r = v.cube.rot[room];
    rot[room] = r === 1 || r === 2 || r === 3 ? r : 0;
  }
  const rooms: Record<string, RoomSnapshot> = {};
  for (const [room, snap] of Object.entries(v.rooms)) {
    if (!isRecord(snap) || !Array.isArray(snap.objs)) continue;
    rooms[room] = { objs: snap.objs.map(sanitizeObj).filter((o): o is ObjSnapshot => o !== null), flags: strs(snap.flags) };
  }
  if (typeof v.at.room !== 'string' || (v.at.door !== null && typeof v.at.door !== 'string')) return null;
  const items: Record<string, number> = {};
  if (isRecord(v.items)) for (const [k, n] of Object.entries(v.items)) if (Number.isInteger(n) && (n as number) > 0) items[k] = n as number;
  const labels: Record<string, string[]> = {};
  if (isRecord(v.labels)) for (const [k, cards] of Object.entries(v.labels)) { const c = strs(cards); if (c.length) labels[k] = c; }
  const moved: NonNullable<ChapterSave['moved']> = {};
  if (isRecord(v.moved)) {
    for (const [k, m] of Object.entries(v.moved)) if (isRecord(m) && typeof m.room === 'string' && [m.x, m.y, m.z].every(finite)) moved[k] = { room: m.room, x: m.x as number, y: m.y as number, z: m.z as number };
  }
  const turns = 'turns' in v ? sanitizeTurns(v.turns) : null;
  return {
    cube: { pos, rot }, rooms, at: { room: v.at.room, door: v.at.door as string | null }, items, flags: strs(v.flags),
    ...('labels' in v ? { labels } : {}), ...('moved' in v ? { moved } : {}),
    ...(typeof v.dial === 'boolean' ? { dial: v.dial } : {}), ...('unlocked' in v ? { unlocked: strs(v.unlocked) } : {}), ...(turns ? { turns } : {})
  };
}

/** 校正 v3 欄位 (型別不符的欄位改回預設值；壞掉的章節快照丟掉)；不是物件 → null */
export function sanitizeSave(v: unknown): SaveV3 | null {
  if (!isRecord(v) || v.v !== SAVE_VERSION) return null;
  const e = isRecord(v.endings) ? v.endings : {};
  const chapters: Record<string, ChapterSave> = {};
  if (isRecord(v.chapters)) for (const [n, c] of Object.entries(v.chapters)) { const ok = sanitizeChapter(c); if (ok) chapters[n] = ok; }
  return {
    v: 3,
    cleared: strs(v.cleared),
    current: typeof v.current === 'string' ? v.current : '',
    abilities: strs(v.abilities).filter((a): a is AbilityId => (ABILITY_IDS as readonly string[]).includes(a)),
    diary: ints(v.diary, 1, 5),
    scraps: ints(v.scraps, 1, 6),
    endings: { A: e.A === true, B: e.B === true },
    name: typeof v.name === 'string' ? cleanName(v.name) : '',
    ...('seenCutscenes' in v ? { seenCutscenes: strs(v.seenCutscenes) } : {}),
    ...('skippedCutscenes' in v ? { skippedCutscenes: strs(v.skippedCutscenes) } : {}),
    ...('chapters' in v ? { chapters } : {})
  };
}

/** 已看過的過場 (缺欄 = 空) */
export const seenCutscenes = (s: Save): readonly string[] => s.seenCutscenes ?? [];
/** 跳過 (未看完) 的過場 (缺欄 = 空) */
export const skippedCutscenes = (s: Save): readonly string[] => s.skippedCutscenes ?? [];

/** 暱稱：去頭尾空白、最多 NAME_MAX 字 */
export const cleanName = (n: string): string => [...n.trim()].slice(0, NAME_MAX).join('');

export function writeSave(s: KeyValueStorage, save: Save): void {
  s.set(SAVE_KEY, JSON.stringify(save));
}

/**
 * 讀存檔：依序套遷移 → 校正 → 有變動才寫回；舊 key 在成功寫回後才刪。
 * 壞資料 (JSON 失敗、不是物件、版本不明)：原字串備份到 puzzle:save:corrupt，回傳並寫入預設存檔，不丟例外。
 */
export function loadSave(s: KeyValueStorage): Save {
  const raw = s.get(SAVE_KEY);
  let data: unknown = { v: 0 };
  if (raw !== null) {
    try { data = JSON.parse(raw); } catch { return corrupt(s, raw); }
  }
  if (!isRecord(data) || !Number.isInteger(data.v) || (data.v as number) < 0 || (data.v as number) > SAVE_VERSION) return corrupt(s, raw ?? '');
  const from = data.v as number;
  let cur: Record<string, unknown> = data;
  for (let v = from; v < SAVE_VERSION; v++) cur = MIGRATIONS[v](cur, s);
  const save = sanitizeSave(cur);
  if (!save) return corrupt(s, raw ?? '');
  const text = JSON.stringify(save);
  if (text !== raw) writeSave(s, save);
  if (from === 0) s.remove(LEGACY_FOYER_KEY);
  return save;
}

function corrupt(s: KeyValueStorage, raw: string): Save {
  s.set(SAVE_CORRUPT_KEY, raw);
  const save = defaultSave();
  writeSave(s, save);
  return save;
}
