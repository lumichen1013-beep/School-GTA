export class InputManager {
  public keys: { [key: string]: boolean } = {};
  public mouseDeltaX: number = 0;
  public mouseDeltaY: number = 0;
  public isPointerLocked: boolean = false;
  public mouseButtons: { left: boolean; right: boolean } = { left: false, right: false };

  // 手機觸控支援
  public isTouchDevice: boolean = false;
  private touchLookId: number | null = null;
  private lastTouchLookX: number = 0;
  private lastTouchLookY: number = 0;
  public virtualAxisX: number = 0;
  public virtualAxisY: number = 0;
  public virtualAxisMagnitude: number = 0;
  // 手機搖桿潛行區是否啟用 (僅特訓院潛入關卡，由切換世界時設定)
  public joystickSneakEnabled: boolean = false;
  private virtualSprint: boolean = false;
  private virtualJump: boolean = false;

  private canvas: HTMLCanvasElement;
  private onInteractCallback: (() => void) | null = null;
  private onSkillCallback: (() => void) | null = null;
  private onAttackCallback: (() => void) | null = null;
  private onAttackReleaseCallback: (() => void) | null = null;
  private onToggleBGMCallback: (() => void) | null = null;
  private onToggleWorldCallback: (() => void) | null = null;
  private lastMouseX: number | null = null;
  private lastMouseY: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.initListeners();
    this.initTouchControls();
  }

  private initListeners() {
    window.addEventListener('keydown', (e) => {
      // 避免瀏覽器 Ctrl+S (存檔)、Ctrl+D (書籤)、Ctrl+A (全選) 等原生快捷鍵在遊戲時干擾
      if (e.ctrlKey && (e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'KeyA')) {
        e.preventDefault();
      }
      this.keys[e.code] = true;
      if (e.code === 'KeyE') {
        if (this.onInteractCallback) this.onInteractCallback();
      }
      if (e.code === 'KeyQ') {
        if (this.onSkillCallback) this.onSkillCallback();
      }
      if (e.code === 'KeyF') {
        // F 鍵與攻擊鍵完全合併：觸發攻擊/暗殺
        if (this.onAttackCallback) this.onAttackCallback();
      }
      if (e.code === 'KeyM') {
        if (this.onToggleWorldCallback) {
          this.onToggleWorldCallback();
        } else if (this.onToggleBGMCallback) {
          this.onToggleBGMCallback();
        }
      }
      if (e.code === 'KeyB') {
        if (this.onToggleBGMCallback) this.onToggleBGMCallback();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyF') {
        if (this.onAttackReleaseCallback) this.onAttackReleaseCallback();
      }
    });

    // Click canvas to re-acquire pointer lock if lost (e.g. after ESC)
    this.canvas.addEventListener('click', () => {
      if (!this.isPointerLocked && !this.isTouchDevice) {
        this.requestPointerLock();
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseButtons.left = true;
        if (!this.isPointerLocked && !this.isTouchDevice) {
          this.requestPointerLock();
        }
        if (this.onAttackCallback) this.onAttackCallback();
      } else if (e.button === 2) {
        this.mouseButtons.right = true;
        if (!this.isPointerLocked && !this.isTouchDevice) {
          this.requestPointerLock();
        }
      }
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseButtons.left = false;
        if (this.onAttackReleaseCallback) this.onAttackReleaseCallback();
      }
      if (e.button === 2) this.mouseButtons.right = false;
      this.lastMouseX = null;
      this.lastMouseY = null;
    });

    // 攔截滑鼠右鍵選單 (ContextMenu)，電腦版專用於按住右鍵靜音慢步潛行
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // 視窗失焦防按鍵與滑鼠卡死
    window.addEventListener('blur', () => {
      this.mouseButtons.left = false;
      this.mouseButtons.right = false;
    });

    // Mouse movement
    window.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked) {
        this.mouseDeltaX += e.movementX || 0;
        this.mouseDeltaY += e.movementY || 0;
      } else if (this.mouseButtons.left || this.mouseButtons.right) {
        if (this.lastMouseX !== null && this.lastMouseY !== null) {
          this.mouseDeltaX += e.clientX - this.lastMouseX;
          this.mouseDeltaY += e.clientY - this.lastMouseY;
        }
      }
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    // Pointer Lock change listener
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
      const hint = document.getElementById('pointer-unlock-hint');
      const startScreen = document.getElementById('start-screen');
      if (hint) {
        if (!this.isPointerLocked && startScreen && startScreen.style.display === 'none' && !this.isTouchDevice) {
          hint.style.display = 'block';
        } else {
          hint.style.display = 'none';
        }
      }
    });
  }

  // 手機全螢幕觸控滑動旋轉視角 (右半螢幕滑動)
  private initTouchControls() {
    window.addEventListener('touchstart', (e) => {
      // 視角手指已不在螢幕上 (其 touchend 被 UI 的 stopPropagation 攔截而未清除)：釋放，避免視角永久鎖死
      if (this.touchLookId !== null) {
        let stillDown = false;
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === this.touchLookId) { stillDown = true; break; }
        }
        if (!stillDown) this.resetTouchLook();
      }
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const target = touch.target as HTMLElement;
        // 如果點在操作按鈕、搖桿、UI 面板、開始畫面或開場動畫 (跳過鈕) 上，不觸發視角旋轉
        if (
          target.closest('#start-screen') ||
          target.closest('#cutscene-overlay') ||
          target.closest('#touch-joystick-zone') ||
          target.closest('#mobile-action-buttons') ||
          target.closest('.mobile-btn') ||
          target.closest('#commissary-modal') ||
          target.closest('#bgm-badge') ||
          target.closest('#toggle-mobile-mode-btn') ||
          target.closest('#btn-fullscreen') ||
          target.closest('#hud-action-pills') ||
          target.closest('#quest-tracker-panel') ||
          target.closest('#fullmap-modal') ||
          target.closest('.demerit-container') ||
          target.closest('.hud-top-right') ||
          target.closest('.minimap-wrapper') ||
          target.closest('button')
        ) {
          continue;
        }
        // 右側螢幕區域 (避開左側搖桿區) 作為攝影機滑動旋轉視角控制
        if (touch.clientX > window.innerWidth * 0.35 && this.touchLookId === null) {
          this.touchLookId = touch.identifier;
          this.lastTouchLookX = touch.clientX;
          this.lastTouchLookY = touch.clientY;
          e.preventDefault();
        }
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.touchLookId) {
          e.preventDefault();
          const dx = touch.clientX - this.lastTouchLookX;
          const dy = touch.clientY - this.lastTouchLookY;
          this.mouseDeltaX += dx * 1.5;
          this.mouseDeltaY += dy * 1.5;
          this.lastTouchLookX = touch.clientX;
          this.lastTouchLookY = touch.clientY;
        }
      }
    }, { passive: false });

    const clearLookTouch = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.touchLookId) {
          this.resetTouchLook();
          break;
        }
      }
    };

    window.addEventListener('touchend', clearLookTouch, { passive: false });
    window.addEventListener('touchcancel', clearLookTouch, { passive: false });
    window.addEventListener('orientationchange', () => this.resetTouchLook());
    window.addEventListener('resize', () => this.resetTouchLook());
  }

  // 消耗跳躍輸入 (空白鍵跳過開場時避免同一按鍵讓主角跳起)：需放開再按才會再次觸發
  public consumeJump() {
    this.keys['Space'] = false;
    this.virtualJump = false;
  }

  public resetTouchLook() {
    this.touchLookId = null;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  // 需在使用者手勢 (點擊/按鍵) 中呼叫；瀏覽器拒絕時 (無手勢或冷卻中) 靜默忽略，玩家點擊畫面即可再鎖定
  public requestPointerLock() {
    if (this.isTouchDevice || document.pointerLockElement === this.canvas) return;
    try {
      const result = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (result && typeof result.catch === 'function') result.catch(() => { });
    } catch {
      // 舊版瀏覽器同步拋錯時忽略
    }
  }

  // 接收虛擬搖桿輸入 (X: -1 ~ 1, Y: -1 ~ 1)
  public setVirtualAxis(x: number, y: number) {
    this.virtualAxisX = x;
    this.virtualAxisY = y;
    this.virtualAxisMagnitude = Math.min(1.0, Math.sqrt(x * x + y * y));
  }

  public setVirtualSprint(active: boolean) {
    this.virtualSprint = active;
  }

  public setVirtualJump(active: boolean) {
    this.virtualJump = active;
  }

  public setVirtualAttack(isDown: boolean) {
    this.mouseButtons.left = isDown;
    if (isDown && this.onAttackCallback) {
      this.onAttackCallback();
    } else if (!isDown && this.onAttackReleaseCallback) {
      this.onAttackReleaseCallback();
    }
  }

  public triggerVirtualInteract() {
    if (this.onInteractCallback) this.onInteractCallback();
  }

  public onSkill(callback: () => void) {
    this.onSkillCallback = callback;
  }

  public onInteract(callback: () => void) {
    this.onInteractCallback = callback;
  }

  public onAttack(callback: () => void) {
    this.onAttackCallback = callback;
  }

  public onAttackRelease(callback: () => void) {
    this.onAttackReleaseCallback = callback;
  }

  public onToggleBGM(callback: () => void) {
    this.onToggleBGMCallback = callback;
  }

  public onToggleWorld(callback: () => void) {
    this.onToggleWorldCallback = callback;
  }

  // 每幀消耗累積的旋轉位移
  // 回傳內部重複使用的物件 (每幀呼叫一次，不配置新物件)
  private readonly mouseDeltaOut = { x: 0, y: 0 };
  public consumeMouseDelta(): { x: number; y: number } {
    this.mouseDeltaOut.x = this.mouseDeltaX;
    this.mouseDeltaOut.y = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return this.mouseDeltaOut;
  }

  // 方向鍵與移動狀態判定 (整合鍵盤與手機虛擬搖桿)
  public get forward(): boolean {
    return !!(this.keys['KeyW'] || this.keys['ArrowUp'] || this.virtualAxisY < -0.25);
  }

  public get backward(): boolean {
    return !!(this.keys['KeyS'] || this.keys['ArrowDown'] || this.virtualAxisY > 0.25);
  }

  public get left(): boolean {
    return !!(this.keys['KeyA'] || this.keys['ArrowLeft'] || this.virtualAxisX < -0.25);
  }

  public get right(): boolean {
    return !!(this.keys['KeyD'] || this.keys['ArrowRight'] || this.virtualAxisX > 0.25);
  }

  public get sprint(): boolean {
    return !!(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.virtualSprint);
  }

  public get jump(): boolean {
    return !!(this.keys['Space'] || this.virtualJump);
  }

  public get interact(): boolean {
    return !!this.keys['KeyE'];
  }

  public get horn(): boolean {
    return !!this.keys['KeyH'];
  }
}
