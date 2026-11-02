// 鍵盤輸入來源 (只用於《圖紙之間》，不依賴 GTA 的 InputManager)
import type { Bindings, InputFrame, InputSource } from './types';
import { INPUT_ACTIONS } from './bindings';

const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class KeyboardSource implements InputSource {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private anyKey = false;
  private readonly onDown = (e: KeyboardEvent): void => {
    if (BLOCK.has(e.code)) e.preventDefault();
    if (!e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
    this.anyKey = true;
  };
  private readonly onUp = (e: KeyboardEvent): void => { this.down.delete(e.code); };
  private readonly onBlur = (): void => { this.down.clear(); };

  constructor(private bindings: Bindings, private target: Window = window) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  private held(codes: readonly string[]): boolean { return codes.some(c => this.down.has(c)); }

  poll(): InputFrame {
    const b = this.bindings;
    const frame: InputFrame = {
      moveX: (this.held(b.right) ? 1 : 0) - (this.held(b.left) ? 1 : 0),
      moveZ: (this.held(b.down) ? 1 : 0) - (this.held(b.up) ? 1 : 0),
      jump: this.held(b.jump),
      pressed: INPUT_ACTIONS.filter(a => b[a].some(c => this.pressed.has(c))),
      anyKey: this.anyKey
    };
    this.pressed.clear();
    this.anyKey = false;
    return frame;
  }

  clear(): void { this.pressed.clear(); this.anyKey = false; }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.down.clear();
    this.clear();
  }
}
