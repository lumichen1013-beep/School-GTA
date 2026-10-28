export type StartWorld = 'CAMPUS' | 'DETENTION';

export interface StartScreenHandlers {
  // 點擊世界卡片後立即呼叫 (需於使用者手勢內執行：指標鎖定、啟動音訊)
  onStartGesture: () => void;
  // 開始畫面淡出完成後呼叫
  onStart: (world: StartWorld) => void;
  onSkipCutscene: () => void;
}

// 開始畫面：載入進度條、世界選擇與開場動畫跳過按鈕
export class StartScreen {
  public isLoaded: boolean = false;

  constructor(handlers: StartScreenHandlers) {
    const startScreen = document.getElementById('start-screen');
    const btnStart = document.getElementById('btn-start');
    const btnStartCampus = document.getElementById('btn-start-campus');
    const btnStartDetention = document.getElementById('btn-start-detention');
    const cardCampus = document.getElementById('card-world-campus');
    const cardDetention = document.getElementById('card-world-detention');
    const cutsceneSkipBtn = document.getElementById('cutscene-skip-btn');

    if (cutsceneSkipBtn) {
      const handleSkip = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        handlers.onSkipCutscene();
      };
      cutsceneSkipBtn.addEventListener('click', handleSkip);
      cutsceneSkipBtn.addEventListener('touchend', handleSkip, { passive: false });
    }

    if (!startScreen) return;

    let hasStarted = false;
    const handleStartWithWorld = (targetWorld: StartWorld, e?: Event) => {
      if (!this.isLoaded) return;
      if (hasStarted) return;
      hasStarted = true;

      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      handlers.onStartGesture();
      startScreen.style.opacity = '0';
      startScreen.style.pointerEvents = 'none';
      setTimeout(() => {
        startScreen.style.display = 'none';
        handlers.onStart(targetWorld);
      }, 400);
    };

    if (btnStartCampus) {
      btnStartCampus.addEventListener('click', (e) => handleStartWithWorld('CAMPUS', e));
      btnStartCampus.addEventListener('touchend', (e) => handleStartWithWorld('CAMPUS', e), { passive: false });
    }
    if (cardCampus) {
      cardCampus.addEventListener('click', (e) => handleStartWithWorld('CAMPUS', e));
    }

    if (btnStartDetention) {
      btnStartDetention.addEventListener('click', (e) => handleStartWithWorld('DETENTION', e));
      btnStartDetention.addEventListener('touchend', (e) => handleStartWithWorld('DETENTION', e), { passive: false });
    }
    if (cardDetention) {
      cardDetention.addEventListener('click', (e) => handleStartWithWorld('DETENTION', e));
    }

    if (btnStart) {
      btnStart.addEventListener('click', (e) => handleStartWithWorld('CAMPUS', e));
      btnStart.addEventListener('touchend', (e) => handleStartWithWorld('CAMPUS', e), { passive: false });
    }
  }

  public updateProgress(percent: number, statusText: string) {
    const barFill = document.getElementById('loading-bar-fill');
    const percentText = document.getElementById('loading-percent-text');
    const statusEl = document.getElementById('loading-status-text');
    const btnStart = document.getElementById('btn-start');

    if (barFill) barFill.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${percent}%`;
    if (statusEl) statusEl.textContent = statusText;
    if (btnStart && !this.isLoaded) {
      btnStart.textContent = `載入資源中 (${percent}%)...`;
    }
  }

  // 資源載入完成：顯示世界選擇並啟用開始按鈕
  public markLoaded() {
    this.isLoaded = true;
    this.updateProgress(100, '✅ 遊戲資源載入完成！');

    const startScreen = document.getElementById('start-screen');
    const loadingContainer = document.getElementById('loading-container');
    const worldSelectContainer = document.getElementById('world-select-container');
    const btnStart = document.getElementById('btn-start') as HTMLButtonElement | null;

    if (startScreen) {
      startScreen.classList.add('loaded');
    }
    if (loadingContainer) {
      loadingContainer.style.display = 'none';
    }
    if (worldSelectContainer) {
      worldSelectContainer.style.display = 'flex';
    }
    if (btnStart) {
      btnStart.removeAttribute('disabled');
      btnStart.disabled = false;
      btnStart.classList.add('is-ready');
    }
  }
}
