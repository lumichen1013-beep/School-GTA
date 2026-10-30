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

    const bindCard = (card: HTMLElement | null, world: StartWorld) => {
      if (!card) return;
      card.addEventListener('click', (e) => handleStartWithWorld(world, e));
      card.addEventListener('touchend', (e) => handleStartWithWorld(world, e), { passive: false });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') handleStartWithWorld(world, e);
      });
    };
    bindCard(cardCampus, 'CAMPUS');
    bindCard(cardDetention, 'DETENTION');

  }

  public updateProgress(percent: number, statusText: string) {
    const barFill = document.getElementById('loading-bar-fill');
    const percentText = document.getElementById('loading-percent-text');
    const statusEl = document.getElementById('loading-status-text');

    if (barFill) barFill.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${percent}%`;
    if (statusEl) statusEl.textContent = statusText;
  }

  // 資源載入完成：顯示世界選擇並啟用開始按鈕
  public markLoaded() {
    this.isLoaded = true;
    this.updateProgress(100, '✅ 遊戲資源載入完成！');

    const startScreen = document.getElementById('start-screen');
    const loadingContainer = document.getElementById('loading-container');
    const worldSelectContainer = document.getElementById('world-select-container');

    if (startScreen) {
      startScreen.classList.add('loaded');
    }
    if (loadingContainer) {
      loadingContainer.style.display = 'none';
    }
    if (worldSelectContainer) {
      worldSelectContainer.style.display = 'flex';
    }
  }
}
