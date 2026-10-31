// 觸控裝置判斷 (僅供 UI / 操作方式使用，不決定畫質；畫質由 QualityManager 實測幀率決定)。
// 以硬體能力判斷，不看視窗寬度：窄視窗的桌機仍視為滑鼠鍵盤裝置。
export interface TouchSignals {
  maxTouchPoints: number;
  hasOnTouchStart: boolean;
  coarsePointer: boolean;
}

export function readTouchSignals(): TouchSignals {
  return {
    maxTouchPoints: navigator.maxTouchPoints || 0,
    hasOnTouchStart: 'ontouchstart' in window,
    coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
  };
}

export function isTouchSignals(s: TouchSignals): boolean {
  return s.maxTouchPoints > 0 || s.hasOnTouchStart || s.coarsePointer;
}

export function isTouchDevice(): boolean {
  return isTouchSignals(readTouchSignals());
}
