import { isRecord, readJson, type KeyValueStorage } from './storage';

export const STATS_KEY = 'puzzle:stats';

/** 每題統計 (規格 8，只存本機)；謎題 id 如 '1-2a' */
export interface PuzzleStat {
  time: number;
  notesRevealed: [boolean, boolean];
  notesRead: number;
  guideOpened: boolean;
  skipped: boolean;
  resets: number;
}
export type Stats = Record<string, PuzzleStat>;

const emptyStat = (): PuzzleStat => ({ time: 0, notesRevealed: [false, false], notesRead: 0, guideOpened: false, skipped: false, resets: 0 });
const num = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;

function sanitizeStat(v: unknown): PuzzleStat {
  if (!isRecord(v)) return emptyStat();
  const nr = Array.isArray(v.notesRevealed) ? v.notesRevealed : [];
  return {
    time: num(v.time), notesRevealed: [nr[0] === true, nr[1] === true], notesRead: num(v.notesRead),
    guideOpened: v.guideOpened === true, skipped: v.skipped === true, resets: num(v.resets)
  };
}

export function loadStats(s: KeyValueStorage): Stats {
  const r = readJson(s, STATS_KEY);
  if (!r || r === 'corrupt') return {};
  return Object.fromEntries(Object.entries(r).map(([id, v]) => [id, sanitizeStat(v)]));
}

/** 累加一題的統計：數值相加、布林取 OR */
export function recordPuzzle(s: KeyValueStorage, id: string, delta: Partial<PuzzleStat>): PuzzleStat {
  const all = loadStats(s);
  const cur = all[id] ?? emptyStat();
  const next: PuzzleStat = {
    time: cur.time + num(delta.time),
    notesRevealed: [cur.notesRevealed[0] || !!delta.notesRevealed?.[0], cur.notesRevealed[1] || !!delta.notesRevealed?.[1]],
    notesRead: cur.notesRead + num(delta.notesRead),
    guideOpened: cur.guideOpened || !!delta.guideOpened,
    skipped: cur.skipped || !!delta.skipped,
    resets: cur.resets + num(delta.resets)
  };
  all[id] = next;
  s.set(STATS_KEY, JSON.stringify(all));
  return next;
}
