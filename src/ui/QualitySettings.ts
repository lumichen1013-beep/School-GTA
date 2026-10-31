import { qualityManager } from '../core/QualityManager';
import { isQualityMode } from '../core/quality';

// 大地圖【地圖】分頁工具列的畫質設定：自動 / 高 / 中 / 低 (存檔並立即套用) + 重新偵測，顯示實際檔位與量測 FPS；
// 另有「鎖定 30 FPS」開關 (預設跟隨檔位，手動切換後存檔優先)，及抗鋸齒需重新整理才生效的提示
export function setupQualitySettings(): void {
  const root = document.getElementById('fm-quality');
  const statusEl = document.getElementById('fm-quality-status');
  const redetectBtn = document.getElementById('fm-quality-redetect') as HTMLButtonElement | null;
  const lockBtn = document.getElementById('fm-fpslock') as HTMLButtonElement | null;
  const aaBox = document.getElementById('fm-quality-aa');
  const reloadBtn = document.getElementById('fm-quality-reload') as HTMLButtonElement | null;
  if (!root || !statusEl) return;
  const opts = Array.from(root.querySelectorAll<HTMLButtonElement>('.fm-quality-opt[data-quality]'));

  const render = () => {
    const mode = qualityManager.mode;
    for (const b of opts) {
      const on = b.dataset.quality === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    const text = `目前：${qualityManager.statusText()}`;
    if (statusEl.textContent !== text) statusEl.textContent = text;
    if (redetectBtn) redetectBtn.disabled = qualityManager.isProbing;
    if (lockBtn) {
      const locked = qualityManager.fpsLocked;
      lockBtn.classList.toggle('active', locked);
      lockBtn.setAttribute('aria-checked', locked ? 'true' : 'false');
    }
    if (aaBox) aaBox.hidden = !qualityManager.aaRestartNeeded;
  };

  for (const b of opts) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = b.dataset.quality;
      if (isQualityMode(mode)) qualityManager.setMode(mode);
    });
  }
  redetectBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    qualityManager.redetect();
  });

  lockBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    qualityManager.setFpsLock(!qualityManager.fpsLocked);
  });
  reloadBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.reload();
  });

  qualityManager.onChange(render);
  render();
}
