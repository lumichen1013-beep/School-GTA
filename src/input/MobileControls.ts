import { InputManager } from '../core/InputManager';
import { JOYSTICK_SNEAK_RADIUS } from '../entities/Player';

export interface MobileControlHandlers {
  onAttackRelease: () => void;
  onCycleWeapon: () => void;
  onDodge: () => void;
}

// 手機虛擬搖桿與觸控按鍵綁定 (觸控/滑鼠雙支援)
export function setupMobileControls(input: InputManager, handlers: MobileControlHandlers): void {
  const container = document.getElementById('mobile-controls-container');
  const toggleBtn = document.getElementById('toggle-mobile-mode-btn');
  const joystickZone = document.getElementById('touch-joystick-zone');
  const joystickThumb = document.getElementById('touch-joystick-thumb');

  const btnAttack = document.getElementById('m-btn-attack');
  const btnJump = document.getElementById('m-btn-jump');
  const btnSprint = document.getElementById('m-btn-sprint');
  const btnInteract = document.getElementById('m-btn-interact');
  const btnWeapon = document.getElementById('m-btn-weapon');
  const btnDodge = document.getElementById('m-btn-dodge');
  const skillHudCard = document.getElementById('skill-hud-card');

  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (isTouchDevice && container) {
    container.style.display = 'block';
    document.body.classList.add('touch-mode-active');
    if (toggleBtn) toggleBtn.textContent = '📱 隱藏手機鍵盤';
  }

  if (toggleBtn && container) {
    // 以狀態旗標切換 (手機 CSS 會強制顯示容器，故改用 body class 隱藏，不依賴 inline display 判斷)
    let isControlsOpen = window.getComputedStyle(container).display !== 'none';
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isControlsOpen = !isControlsOpen;
      container.style.display = isControlsOpen ? 'block' : 'none';
      document.body.classList.toggle('touch-mode-active', isControlsOpen);
      document.body.classList.toggle('touch-controls-hidden', !isControlsOpen);
      toggleBtn.textContent = isControlsOpen ? '📱 隱藏手機鍵盤' : '📱 手機虛擬按鍵';
    });
  }

  if (joystickZone && joystickThumb) {
    let activeTouchId: number | null = null;
    let zoneRect: DOMRect | null = null;
    // 搖桿行程半徑依當下實際尺寸計算 (直/橫屏 CSS 尺寸不同，翻轉後不可沿用舊值)，比例同原本 45px / 115px
    const RADIUS_RATIO = 45 / 115;
    let maxRadius = 45;

    // 潛行範圍提示環 (半徑 80%)：特訓院中按住搖桿時顯示，推桿在環內為潛行 (綠)，超出改為步行 (淡白)
    const sneakRing = document.createElement('div');
    const ringPct = (RADIUS_RATIO * 2 * JOYSTICK_SNEAK_RADIUS * 100).toFixed(1);
    sneakRing.style.cssText = `position:absolute;left:50%;top:50%;width:${ringPct}%;height:${ringPct}%;` +
      'transform:translate(-50%,-50%);border-radius:50%;border:2px dashed rgba(52,211,153,0.75);' +
      'pointer-events:none;display:none;transition:border-color 0.12s;';
    joystickZone.appendChild(sneakRing);
    const updateSneakRing = (active: boolean) => {
      const show = active && input.joystickSneakEnabled;
      sneakRing.style.display = show ? 'block' : 'none';
      if (show) {
        const inSneak = input.virtualAxisMagnitude <= JOYSTICK_SNEAK_RADIUS;
        sneakRing.style.borderColor = inSneak ? 'rgba(52,211,153,0.9)' : 'rgba(255,255,255,0.35)';
      }
    };

    // 每次按下時重新量測搖桿位置與尺寸 (翻轉/縮放後版面已改變)
    const captureZone = () => {
      zoneRect = joystickZone.getBoundingClientRect();
      maxRadius = Math.max(20, zoneRect.width * RADIUS_RATIO);
    };

    const handleMove = (clientX: number, clientY: number) => {
      if (!zoneRect) return;
      const centerX = zoneRect.left + zoneRect.width / 2;
      const centerY = zoneRect.top + zoneRect.height / 2;

      let dx = clientX - centerX;
      let dy = clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }

      joystickThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      input.setVirtualAxis(dx / maxRadius, dy / maxRadius);
      updateSneakRing(true);
    };

    const handleEnd = () => {
      activeTouchId = null;
      zoneRect = null;
      joystickThumb.style.transform = 'translate(-50%, -50%)';
      input.setVirtualAxis(0, 0);
      updateSneakRing(false);
    };

    joystickZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (activeTouchId !== null) return;
      const touch = e.changedTouches[0];
      activeTouchId = touch.identifier;
      captureZone();
      handleMove(touch.clientX, touch.clientY);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (activeTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          e.preventDefault();
          handleMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          break;
        }
      }
    }, { passive: false });

    const handleTouchEnd = (e: TouchEvent) => {
      if (activeTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          handleEnd();
          break;
        }
      }
    };

    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    // 翻轉螢幕時手指可能未送出 touchend：放開搖桿，避免角色持續朝舊方向移動
    window.addEventListener('orientationchange', () => {
      if (activeTouchId !== null || isMouseDown) {
        isMouseDown = false;
        handleEnd();
      }
    });

    let isMouseDown = false;
    joystickZone.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      captureZone();
      handleMove(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (isMouseDown) handleMove(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => {
      if (isMouseDown) {
        isMouseDown = false;
        handleEnd();
      }
    });
  }

  const bindButton = (
    btn: HTMLElement | null,
    onPress: () => void,
    onRelease?: () => void
  ) => {
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPress();
    }, { passive: false });

    if (onRelease) {
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onRelease();
      }, { passive: false });
      btn.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        onRelease();
      }, { passive: false });
    }

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPress();

      if (onRelease) {
        const handleMouseUp = () => {
          window.removeEventListener('mouseup', handleMouseUp);
          onRelease();
        };
        window.addEventListener('mouseup', handleMouseUp);
      }
    });
  };

  bindButton(btnAttack, () => {
    input.setVirtualAttack(true);
  }, () => {
    input.setVirtualAttack(false);
    handlers.onAttackRelease();
  });

  bindButton(btnJump, () => {
    input.setVirtualJump(true);
  }, () => {
    input.setVirtualJump(false);
  });

  bindButton(btnSprint, () => {
    input.setVirtualSprint(true);
  }, () => {
    input.setVirtualSprint(false);
  });

  bindButton(btnInteract, () => {
    input.triggerVirtualInteract();
  });

  bindButton(btnWeapon, handlers.onCycleWeapon);
  bindButton(btnDodge, handlers.onDodge);
  bindButton(skillHudCard, handlers.onDodge);
}
