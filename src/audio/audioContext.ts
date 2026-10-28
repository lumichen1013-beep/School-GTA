// 全遊戲共用單一 Web Audio Context (音效與 BGM)：首次使用時建立，暫停中自動喚醒
let sharedCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new AudioCtx();
  }
  resumeAudioContext();
  return sharedCtx;
}

export function resumeAudioContext() {
  if (sharedCtx && sharedCtx.state === 'suspended') {
    sharedCtx.resume();
  }
}

// 鎖屏或切換分頁切回、或使用者點擊觸控時自動喚醒 Web Audio
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resumeAudioContext();
});
window.addEventListener('click', resumeAudioContext, { passive: true });
window.addEventListener('touchstart', resumeAudioContext, { passive: true });
