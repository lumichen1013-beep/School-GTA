// 事件 → 聲音 (audio-design 3、4)：世界事件、過場提示、關卡狀態差 → 音訊動作；限流、驚嚇閘門、環境音時鐘。純邏輯 (時間由呼叫方給)
import type { GameEvent, Mode } from '../core/types';
import { mulberry32, hashSeed } from './rng';
import { LIMITS } from './mix';
import type { ScoreId } from './score';

/** 音樂動作 (過場提示 / 鏡頭) */
export type MusicOp = 'padIn' | 'padWarm' | 'padLow' | 'semitoneDown' | 'viewLow' | 'viewOpen' | 'padOut' | 'title' | 'solved';
export type AudioAction =
  | { kind: 'sfx'; id: string; pitch?: number }
  /** 驚嚇：由 ScareGate 依 calmTension 決定一般 / 平靜版 */
  | { kind: 'scare'; flag: string }
  | { kind: 'music'; op: MusicOp }
  | { kind: 'view'; mode: Mode };

const sfx = (id: string, pitch?: number): AudioAction => (pitch === undefined ? { kind: 'sfx', id } : { kind: 'sfx', id, pitch });
const music = (op: MusicOp): AudioAction => ({ kind: 'music', op });

/** 所有 GameEvent 的 t (完整性測試用；新增事件種類時 worldEventActions 的 switch 會因 never 檢查編譯失敗) */
export const GAME_EVENT_TYPES: readonly GameEvent['t'][] = ['switch', 'switchDenied', 'door', 'turnRequest', 'objCross', 'labelOpen', 'card', 'flag', 'dialActivate', 'done'];

/**
 * 世界事件 → 音訊動作。switch (切換) 與 labelOpen (開字卡匣) 改由 LevelObserver 從狀態看 (迴圈不轉發 switch)，這裡回空陣列。
 * flag：scare:* = 驚嚇；其他旗標沒有聲音
 */
export function worldEventActions(e: GameEvent): AudioAction[] {
  switch (e.t) {
    case 'switch': return [];
    case 'switchDenied': return [sfx('sfx.dial.deny')];
    case 'door': return [sfx('sfx.door.open')];
    case 'turnRequest': return [sfx('sfx.lever.pull')];
    case 'objCross': return [sfx('sfx.crate.push')];
    case 'labelOpen': return [];
    case 'card': return [sfx(e.ok ? 'sfx.card.stick' : 'sfx.card.wrong')];
    case 'flag': return e.flag.startsWith('scare:') ? [{ kind: 'scare', flag: e.flag }] : [];
    case 'dialActivate': return [sfx('sfx.dial.activate')];
    case 'done': return [sfx('sfx.puzzle.solved'), music('solved')];
    default: { const never: never = e; return never; }
  }
}

/** 驚嚇旗標 → 一般版音效 (沒列的旗標用預設) */
export const SCARE_SFX: Readonly<Record<string, string>> = { 'scare:coats': 'sfx.scare.coats' };
export const SCARE_DEFAULT = 'sfx.scare.coats';
export const SCARE_GENTLE = 'sfx.scare.gentle';

/**
 * 過場提示 → 音訊動作 (分鏡 2.5、5；audio-design 2.5)。序章 23 個 + 分鏡第 5 節其他過場已寫到的音效名
 * (測試：CUTSCENES 裡每個提示都在表內、指到的音效都存在)
 */
export const CUE_MAP: Readonly<Record<string, readonly AudioAction[]>> = {
  'pad.in': [music('padIn')],
  wind: [sfx('sfx.cs.wind')],
  'car.climb': [sfx('sfx.cs.gravel')],
  'signal.drop': [sfx('sfx.cs.signal')],
  'door.creak': [sfx('sfx.cs.floor.creak')],
  'paper.rub': [sfx('sfx.cs.paper.rub')],
  'pad.warm': [music('padWarm')],
  'notebook.close': [sfx('sfx.cs.book.close')],
  'rug.roll': [sfx('sfx.cs.rug')],
  'pad.low': [music('padLow')],
  'circle.hum': [sfx('sfx.cs.circle.hum')],
  'pen.rise': [sfx('sfx.cs.pen.rise')],
  'pen.grip': [sfx('sfx.cs.pen.grip')],
  'house.rumble': [sfx('sfx.cs.wood.groan')],
  'wall.slide': [sfx('sfx.cs.mechanism')],
  'stairs.flip': [sfx('sfx.cs.click')],
  'door.rattle': [sfx('sfx.cs.door.rattle')],
  'pen.engrave': [sfx('sfx.cs.pen.glow')],
  'pen.click': [sfx('sfx.switch.to2d'), sfx('sfx.cs.flatten')],
  'switch.lowpass': [music('viewLow')],
  'pad.semitoneDown': [music('semitoneDown')],
  'paper.flutter': [sfx('sfx.cs.paper.flutter')],
  'pad.out': [music('padOut')],
  // 其他過場 (分鏡第 5 節；cs:ch1 起尚未實作)
  'paper.tear': [sfx('sfx.cs.paper.tear')],
  'pages.turn': [sfx('sfx.cs.paper.rub')],
  birds: [sfx('sfx.cs.birds')],
  kettle: [sfx('sfx.cs.kettle')],
  leaves: [sfx('sfx.cs.leaves')],
  chord: [sfx('sfx.cs.chime')],
  'pen.glow': [sfx('sfx.cs.pen.glow')],
  'switch.view': [music('viewLow')],
  'view.open': [music('viewOpen')],
  'signal.up': [sfx('sfx.cs.signal')]
};

/** 過場鏡頭開始時的音樂動作 (分鏡的「音效 / 音樂」欄有、但資料沒有提示的地方)；鏡頭 1 起算 */
export const SHOT_MUSIC: Readonly<Record<string, Readonly<Record<number, readonly MusicOp[]>>>> = {
  'cs:prologue': { 11: ['viewOpen', 'padWarm'], 12: ['title'] }
};

/** 過場 → 配樂 (沒列的過場 = 目前章節的配樂、安靜情境) */
export const CUTSCENE_SCORE: Readonly<Record<string, ScoreId>> = { 'cs:prologue': 'prologue', 'cs:endA': 'endA', 'cs:endB': 'endB' };

/** 過場 (calmTension) 降一半音量的音效 (分鏡 2.5：cs:night 的低頻長音與撕紙聲) */
export const CALM_HALF: readonly string[] = ['sfx.cs.paper.tear', 'sfx.cs.wood.groan', 'sfx.cs.circle.hum'];

// ── 限流 ──

/** 同一 id 最短間隔 (秒)；時間由呼叫方給 */
export class Throttle {
  private last = new Map<string, number>();
  allow(id: string, now: number, gap: number): boolean {
    const t = this.last.get(id);
    if (t !== undefined && now - t < gap) return false;
    this.last.set(id, now);
    return true;
  }
  reset(): void { this.last.clear(); }
}

/** 驚嚇閘門 (規格 9.1)：calm → 平靜版；驚嚇後 15 秒內環境音與裝飾音一律擋下 */
export class ScareGate {
  private at = -Infinity;
  /** 驚嚇 → 要播的音效 id */
  scare(flag: string, now: number, calm: boolean): string {
    this.at = now;
    return calm ? SCARE_GENTLE : (SCARE_SFX[flag] ?? SCARE_DEFAULT);
  }
  /** 驚嚇後安靜期內 */
  quiet(now: number): boolean { return now - this.at < LIMITS.scareQuietAfterSec; }
  get lastScare(): number { return this.at; }
}

// ── 環境音時鐘 (各章；同類 ≥ 20 秒、驚嚇後安靜期不播) ──

export const AMBIENCE: Readonly<Partial<Record<ScoreId, readonly string[]>>> = {
  ch1: ['sfx.amb.page'],
  ch2: ['sfx.amb.page', 'sfx.amb.hinge'],
  ch3: ['sfx.amb.drip', 'sfx.amb.page'],
  ch4: ['sfx.amb.page', 'sfx.amb.hinge', 'sfx.amb.footstep'],
  ch5: ['sfx.amb.page']
};

/** 下一個環境音的間隔 25～45 秒 (種子亂數)；所以同類必定 ≥ 20 秒 */
export class AmbientClock {
  private next: number;
  private n = 0;
  private rng: () => number;
  constructor(private list: readonly string[], seed: number, start: number) {
    this.rng = mulberry32(seed);
    this.next = start + this.gap();
  }
  private gap(): number { return 25 + this.rng() * 20; }
  /** 到時間了就回一個環境音 id；quiet = 驚嚇後安靜期 (順延) */
  tick(now: number, quiet: boolean): string | null {
    if (!this.list.length || now < this.next) return null;
    this.next = now + this.gap();
    if (quiet) return null;
    return this.list[this.n++ % this.list.length];
  }
}
export const ambientSeed = (score: ScoreId, room: string): number => hashSeed('amb', score, room);

// ── 關卡狀態差 → 聲音 (沒有事件、只改狀態的互動) ──

export interface ObjSnap { id: string; type: string; used: boolean; gone: boolean; x: number; z: number }
export interface LevelSnap {
  /** 世界的身分 (換房 / R 會換一個 World) */
  world: object;
  room: string;
  mode: Mode;
  player: { x: number; y: number; z: number; vy: number; onGround: boolean };
  inv: Readonly<Record<string, number>>;
  objs: readonly ObjSnap[];
  /** 魔方排列的鍵 (沒有魔方 = '') */
  cube: string;
  /** 控制盤章節的墨量 (沒有 = null) */
  ink: number | null;
  mapOpen: boolean;
  turnMode: boolean;
  trayOpen: boolean;
  /** 章節過場 / 切換過場進行中 */
  busy: boolean;
  msgSeq: number;
  msgKey: string;
}

/** 走多遠一步 (世界單位) */
export const STEP_LEN = 1.1;
/** 落地前的下落速度超過這個才有落地聲 */
export const LAND_VY = -4;

/** 物件 used 變成 true / false 時的音效 (依類型) */
const USED_ON: Readonly<Record<string, string>> = {
  bookend: 'sfx.bookend.fall', lampBook: 'sfx.lamp.on', cord: 'sfx.cord.pull', plate: 'sfx.plate.press', spine: 'sfx.book.pull',
  bookLock: 'sfx.drawer.open', drawer: 'sfx.drawer.open', latch: 'sfx.latch.open', door: 'sfx.door.unseal', valve: 'sfx.lever.pull',
  // 2-3 印房：活字架 / 排字架打開、印刷機壓版、字輪換字 (used 來回切換：兩向都出聲)
  typeCase: 'sfx.drawer.open', typeLock: 'sfx.drawer.open', press: 'sfx.lever.pull', typeWheel: 'sfx.cord.pull'
};
const USED_OFF: Readonly<Record<string, string>> = { lampBook: 'sfx.lamp.off', cord: 'sfx.cord.reset', typeWheel: 'sfx.cord.pull' };
const GONE_ON: Readonly<Record<string, string>> = { gate: 'sfx.gate.open', inkwall: 'sfx.gate.open' };
/** 燈書依序點亮的音高 (半音)：一 → 三本往上 */
const LAMP_STEPS = [0, 4, 7, 12];

const pickupSfx = (item: string): string => (item.startsWith('key') ? 'sfx.pickup.key' : /^(scrap|diary|card|note)/.test(item) ? 'sfx.pickup.paper' : 'sfx.pickup');

/**
 * 每幀比較前後狀態 → 音訊動作 (純邏輯，只讀)。換了 World (換房 / R) → 重新取基準，不比較物件 (R 同房 = 重來的紙聲)。
 * denyKeys = 「轉不動 / 不能進轉動模式」的訊息 key (由 app 從 mechanics 傳入：audio 不 import mechanics 的值)
 */
export class LevelObserver {
  private prev: LevelSnap | null = null;
  private walked = 0;
  private stepN = 0;
  private airMinVy = 0;
  private pushAcc = 0;

  constructor(private denyKeys: ReadonlySet<string> = new Set()) {}

  reset(): void { this.prev = null; this.walked = 0; this.airMinVy = 0; }

  update(s: LevelSnap): AudioAction[] {
    const p = this.prev;
    this.prev = s;
    if (!p) return [{ kind: 'view', mode: s.mode }];
    const out: AudioAction[] = [];
    if (p.world !== s.world) {
      this.walked = 0;
      this.airMinVy = 0;
      if (p.room === s.room) out.push(sfx('sfx.reset.room'));
      if (p.mode !== s.mode) out.push({ kind: 'view', mode: s.mode });
      return out;
    }
    // 切換
    if (p.mode !== s.mode) out.push(sfx(s.mode === '2d' ? 'sfx.switch.to2d' : 'sfx.switch.to3d'), { kind: 'view', mode: s.mode });
    // 跳 / 落地 / 腳步
    const a = p.player, b = s.player;
    if (!b.onGround) this.airMinVy = Math.min(this.airMinVy, b.vy);
    if (a.onGround && !b.onGround && b.vy > 0.5) out.push(sfx('sfx.jump'));
    if (!a.onGround && b.onGround) { if (this.airMinVy < LAND_VY) out.push(sfx('sfx.land')); this.airMinVy = 0; this.walked = 0; }
    const d = Math.hypot(b.x - a.x, s.mode === '3d' ? b.z - a.z : 0);
    if (b.onGround && a.onGround && !s.busy && d < 1 && p.mode === s.mode) {
      this.walked += d;
      if (this.walked >= STEP_LEN) { this.walked -= STEP_LEN; out.push(sfx(s.mode === '2d' ? 'sfx.step.paper' : 'sfx.step.wood', (this.stepN++ % 2) * 0.5)); }
    } else if (!b.onGround || d >= 1) this.walked = 0;
    // 撿到
    for (const [k, n] of Object.entries(s.inv)) if (n > (p.inv[k] ?? 0)) out.push(sfx(pickupSfx(k)));
    // 物件狀態
    const before = new Map(p.objs.map(o => [o.id, o]));
    let pushed = false;
    for (const o of s.objs) {
      const q = before.get(o.id);
      if (!q) continue;
      if (!q.used && o.used && USED_ON[o.type]) {
        if (o.type === 'lampBook') out.push(sfx(USED_ON[o.type], LAMP_STEPS[Math.min(LAMP_STEPS.length - 1, s.objs.filter(x => x.type === 'lampBook' && x.used).length - 1)]));
        else out.push(sfx(USED_ON[o.type]));
      }
      if (q.used && !o.used && USED_OFF[o.type]) out.push(sfx(USED_OFF[o.type]));
      if (!q.gone && o.gone && GONE_ON[o.type]) out.push(sfx(GONE_ON[o.type]));
      if ((o.type === 'crate' || o.type === 'typeTray') && !o.gone && (Math.abs(o.x - q.x) > 1e-3 || Math.abs(o.z - q.z) > 1e-3)) pushed = true;
    }
    // 推箱：持續推的時候每 0.35 單位一聲 (引擎另有 gap 限流)
    if (pushed) { this.pushAcc += 1; if (this.pushAcc >= 8) { this.pushAcc = 0; out.push(sfx('sfx.crate.push')); } } else this.pushAcc = 7;
    // 魔方轉動 (拉桿 / 控制盤)、墨
    if (p.cube !== s.cube && p.cube !== '' && s.cube !== '') out.push(sfx(s.ink !== null ? 'sfx.dial.turn' : 'sfx.cube.turn'));
    if (p.ink !== null && s.ink !== null && s.ink < p.ink) out.push(sfx('sfx.ink.drop'));
    // 疊層
    if (!p.turnMode && s.turnMode) out.push(sfx('sfx.dial.mode'));
    else if (!p.mapOpen && s.mapOpen) out.push(sfx('sfx.map.open'));
    else if (p.mapOpen && !s.mapOpen) out.push(sfx('sfx.map.close'));
    if (!p.trayOpen && s.trayOpen) out.push(sfx('sfx.tray.open'));
    // 訊息：轉不動 → 低沉的「咚」；讀到字條 → 紙聲
    if (s.msgSeq !== p.msgSeq) {
      if (this.denyKeys.has(s.msgKey)) out.push(sfx('sfx.dial.deny'));
      else if (/\.note\./.test(s.msgKey)) out.push(sfx('sfx.note.read'));
    }
    return out;
  }
}
