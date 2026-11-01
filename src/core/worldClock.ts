// 世界時鐘：實際時間扣除選單暫停累積時長 (選單開啟期間停住)。純邏輯，無 DOM 依賴，可單元測試。
// - worldNow()：取代遊戲邏輯中的 performance.now() (越獄計時、處決計量表、向日葵再戳時窗、提示橫幅…)
// - worldTimeout()：取代遊戲邏輯中的 setTimeout (復活、增益到期、Boss 死亡動畫…)；暫停時取消底層計時器並保留剩餘時間，恢復後重排
// main.tick 於進入 / 結束選單暫停時呼叫 setWorldClockPaused。

const realNow = (): number => performance.now();

let pausedAt = -1;     // 進入暫停的實際時間 (未暫停 = -1)
let pausedTotal = 0;   // 已結束的暫停累積毫秒

interface PendingTimer { fn: () => void; due: number; handle: ReturnType<typeof setTimeout> | null }
const pending = new Map<number, PendingTimer>();
let seq = 0;

export function worldNow(): number {
  const now = realNow();
  return now - pausedTotal - (pausedAt >= 0 ? now - pausedAt : 0);
}

export function isWorldClockPaused(): boolean {
  return pausedAt >= 0;
}

function arm(id: number, t: PendingTimer) {
  t.handle = setTimeout(() => {
    pending.delete(id);
    t.fn();
  }, Math.max(0, t.due - worldNow()));
}

/** 以世界時間計時的 setTimeout：選單暫停期間不前進。回傳 id (可傳給 clearWorldTimeout) */
export function worldTimeout(fn: () => void, ms: number): number {
  const id = ++seq;
  const t: PendingTimer = { fn, due: worldNow() + ms, handle: null };
  pending.set(id, t);
  if (pausedAt < 0) arm(id, t);
  return id;
}

export function clearWorldTimeout(id: number | null | undefined) {
  if (!id) return;
  const t = pending.get(id);
  if (!t) return;
  if (t.handle !== null) clearTimeout(t.handle);
  pending.delete(id);
}

export function setWorldClockPaused(paused: boolean) {
  if (paused) {
    if (pausedAt >= 0) return;
    pausedAt = realNow();
    for (const t of pending.values()) {
      if (t.handle !== null) clearTimeout(t.handle);
      t.handle = null;
    }
    return;
  }
  if (pausedAt < 0) return;
  pausedTotal += realNow() - pausedAt;
  pausedAt = -1;
  for (const [id, t] of pending) arm(id, t);
}
