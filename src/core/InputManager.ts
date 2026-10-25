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
  private virtualSprint: boolean = false;
  private virtualJump: boolean = false;

  private canvas: HTMLCanvasElement;
  private onInteractCallback: (() => void) | null = null;
  private onAttackCallback: (() => void) | null = null;
  private onToggleBGMCallback: (() => void) | null = null;
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
      this.keys[e.code] = true;
      if (e.code === 'KeyE') {
        if (this.onInteractCallback) this.onInteractCallback();
      }
      if (e.code === 'KeyM') {
        if (this.onToggleBGMCallback) this.onToggleBGMCallback();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
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
      }
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseButtons.left = false;
      if (e.button === 2) this.mouseButtons.right = false;
      this.lastMouseX = null;
      this.lastMouseY = null;
    });

    // Prevent context menu on right click
    window.addEventListener('contextmenu', (e) => e.preventDefault());

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
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const target = touch.target as HTMLElement;
        // 如果點在操作按鈕、搖桿或 UI 面板上，不觸發視角旋轉
        if (
          target.closest('#touch-joystick-zone') ||
          target.closest('#mobile-action-buttons') ||
          target.closest('.mobile-btn') ||
          target.closest('.weapon-slot') ||
          target.closest('#commissary-modal') ||
          target.closest('#bgm-badge') ||
          target.closest('#toggle-mobile-mode-btn') ||
          target.closest('#quest-tracker-panel') ||
          target.closest('.demerit-container') ||
          target.closest('.status-badge') ||
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

  public resetTouchLook() {
    this.touchLookId = null;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  public requestPointerLock() {
    if (!this.isTouchDevice) {
      this.canvas.requestPointerLock();
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
    }
  }

  public triggerVirtualAttack() {
    this.setVirtualAttack(true);
    setTimeout(() => {
      this.setVirtualAttack(false);
    }, 150);
  }

  public triggerVirtualInteract() {
    if (this.onInteractCallback) this.onInteractCallback();
  }

  public onInteract(callback: () => void) {
    this.onInteractCallback = callback;
  }

  public onAttack(callback: () => void) {
    this.onAttackCallback = callback;
  }

  public onToggleBGM(callback: () => void) {
    this.onToggleBGMCallback = callback;
  }

  // 每幀消耗累積的旋轉位移
  public consumeMouseDelta(): { x: number; y: number } {
    const delta = { x: this.mouseDeltaX, y: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return delta;
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
