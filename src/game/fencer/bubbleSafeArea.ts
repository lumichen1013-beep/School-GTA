// Boss 頭頂對話框的螢幕安全區 (純函式，可測)：手機直屏遠景時框會被頂部資訊條 / Boss 血條蓋住，
// 把框的上緣夾回頂部 UI 下方 (只往下夾，桌機 / 橫屏不啟用)。

/** 頂部 UI 下緣 (px) → 安全區上緣的 NDC y (1 = 螢幕頂、-1 = 螢幕底) */
export function safeTopNdc(topUiBottomPx: number, viewportH: number, marginPx: number = 8): number {
  if (viewportH <= 0) return 1;
  return 1 - (2 * (topUiBottomPx + marginPx)) / viewportH;
}

/** 對話框上緣超出安全區的 NDC 量 (≥ 0) */
export function ndcOvershoot(bubbleTopNdc: number, safeTop: number): number {
  return Math.max(0, bubbleTopNdc - safeTop);
}

/** NDC 超出量換算成世界高度下移量 (ndcPerWorld = 世界 y 每 +1 對應的 NDC y 變化) */
export function worldDropForNdc(overshoot: number, ndcPerWorld: number, maxDrop: number): number {
  if (overshoot <= 0 || ndcPerWorld < 1e-4) return 0;
  return Math.min(maxDrop, overshoot / ndcPerWorld);
}

/**
 * 水平夾制：框中心 NDC x、半寬 (NDC) 與邊距，回傳需往內推的 NDC 量 (正 = 往右、負 = 往左；框比螢幕還寬時不動)。
 */
export function ndcInsetX(centerX: number, halfW: number, marginNdc: number): number {
  const lo = -1 + marginNdc;
  const hi = 1 - marginNdc;
  if (halfW * 2 >= hi - lo) return 0;
  if (centerX - halfW < lo) return lo - (centerX - halfW);
  if (centerX + halfW > hi) return hi - (centerX + halfW);
  return 0;
}

/** 只有直屏才夾 (桌機 / 橫屏不受影響) */
export function shouldFitBubble(viewportW: number, viewportH: number): boolean {
  return viewportH > viewportW;
}
