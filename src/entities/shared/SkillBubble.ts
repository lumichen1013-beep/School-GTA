import * as THREE from 'three';

// 氣泡外觀差異 (玩家與 NPC 的底色透明度、邊框亮度、字級規則略有不同)
export interface SkillBubbleStyle {
  fillAlpha: number;
  strokeAlpha: number;
  fontSize: (text: string) => number;
  // 以下為選用的大字版面 (NPC 使用)：未設定時沿用 380×110 畫布、2.2×0.64m 單行置中 (玩家氣泡)
  canvasW?: number;
  canvasH?: number;
  worldW?: number;
  worldH?: number;
  // 長句換行 (最多 2 行) 取代縮小字級；字級僅在兩行仍放不下時才縮小，最小 minFontSize
  wrap?: boolean;
  minFontSize?: number;
  // 以氣泡底部 (箭頭尖端) 對齊 baseY，氣泡依行數向上長高
  anchorBottom?: boolean;
}

// NPC / 太陽花 / 花劍客共用的大字對話框 (512 畫布、46px 字、最多 2 行，放不下縮到 38px；建議 ≤ 18 字、上限 22 字)
export const TALK_BUBBLE_STYLE: SkillBubbleStyle = {
  fillAlpha: 0.85, strokeAlpha: 0.85, fontSize: () => 46,
  canvasW: 512, canvasH: 160, worldW: 3.9, worldH: 1.21875,
  wrap: true, minFontSize: 38, anchorBottom: true
};

// 不可出現在行首的標點 (換行避頭)
const NO_LINE_START = '，。、！？；：」』）〉》…—～~,.!?)';
// 適合斷行的位置 (句讀之後)
const BREAK_AFTER = '，。、！？；：…—～ ';

const BUBBLE_FONT_FAMILY = '"Segoe UI", -apple-system, BlinkMacSystemFont, "Microsoft JhengHei", sans-serif';

// 頭頂技能名稱 / 對話氣泡 (3D Billboard Sprite，CanvasTexture 0-GC，可延遲建立)
export class SkillBubble {
  public sprite?: THREE.Sprite;
  private canvas?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private texture?: THREE.CanvasTexture;
  private timer: number = 0;
  private duration: number = 1.35;

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly baseY: number,
    private readonly style: SkillBubbleStyle
  ) {}

  public get isActive(): boolean {
    return this.timer > 0;
  }

  // 建立畫布、紋理與 Sprite 並掛上角色 (重複呼叫無副作用)
  public ensure() {
    if (this.sprite) return;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.style.canvasW ?? 380;
    this.canvas.height = this.style.canvasH ?? 110;
    this.context = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;

    const bubbleMat = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false
    });
    this.sprite = new THREE.Sprite(bubbleMat);
    this.sprite.scale.set(this.style.worldW ?? 2.2, this.style.worldH ?? 0.64, 1.0);
    if (this.style.anchorBottom) this.sprite.center.set(0.5, 0);
    this.sprite.position.set(0, this.baseY, 0);
    this.sprite.visible = false;
    this.parent.add(this.sprite);
  }

  // 依字級把文字斷成最多 2 行 (逐字量測寬度)；放不下時回傳 null
  private static wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] | null {
    if (ctx.measureText(text).width <= maxW) return [text];
    const chars = Array.from(text);
    // 從中間附近找最平均的斷點，兩行皆需放得下；優先斷在句讀之後、第二行不以標點開頭 (避頭點)，找不到才放寬
    for (let pass = 0; pass < 2; pass++) {
      let best: string[] | null = null;
      let bestScore = Infinity;
      for (let i = 1; i < chars.length; i++) {
        if (pass === 0 && NO_LINE_START.includes(chars[i])) continue;
        const a = chars.slice(0, i).join('');
        const b = chars.slice(i).join('');
        const wa = ctx.measureText(a).width;
        const wb = ctx.measureText(b).width;
        const score = Math.abs(wa - wb) + (BREAK_AFTER.includes(chars[i - 1]) ? 0 : maxW * 0.3);
        if (wa <= maxW && wb <= maxW && score < bestScore) {
          bestScore = score;
          best = [a, b.trimStart()];
        }
      }
      if (best) return best;
    }
    return null;
  }

  private draw(text: string, isAdvanced: boolean) {
    this.ensure();
    if (!this.context || !this.canvas) return;
    const ctx = this.context;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    let fontSize = this.style.fontSize(text);
    let lines = [text];
    let bubbleW = w - 24;
    let bubbleH = h - 28;
    let x = 12;
    let y = 8;
    const r = 22;

    if (this.style.wrap) {
      // 大字版面：維持大字級，長句換成 2 行；依文字寬度收窄氣泡，依行數決定氣泡高度並貼齊畫布底部
      const padX = 22;
      const maxTextW = w - 24 - padX * 2;
      const minFont = this.style.minFontSize ?? fontSize;
      let wrapped: string[] | null = null;
      for (; fontSize >= minFont; fontSize -= 2) {
        ctx.font = `bold ${fontSize}px ${BUBBLE_FONT_FAMILY}`;
        wrapped = SkillBubble.wrapLines(ctx, text, maxTextW);
        if (wrapped) break;
      }
      if (!wrapped) {
        fontSize = minFont;
        ctx.font = `bold ${fontSize}px ${BUBBLE_FONT_FAMILY}`;
        wrapped = SkillBubble.wrapLines(ctx, text, maxTextW) ?? [text];
      }
      lines = wrapped;
      let textW = 0;
      for (const line of lines) textW = Math.max(textW, ctx.measureText(line).width);
      bubbleW = Math.min(w - 24, Math.max(textW + padX * 2, w * 0.4));
      x = (w - bubbleW) / 2;
      const lineH = fontSize * 1.18;
      bubbleH = Math.min(h - 28, lines.length * lineH + 26);
      y = h - 20 - bubbleH;
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + bubbleW - r, y);
    ctx.quadraticCurveTo(x + bubbleW, y, x + bubbleW, y + r);
    ctx.lineTo(x + bubbleW, y + bubbleH - r);
    ctx.quadraticCurveTo(x + bubbleW, y + bubbleH, x + bubbleW - r, y + bubbleH);
    // 底部小三角箭頭指向角色頭頂
    ctx.lineTo(w / 2 + 12, y + bubbleH);
    ctx.lineTo(w / 2, y + bubbleH + 16);
    ctx.lineTo(w / 2 - 12, y + bubbleH);
    ctx.lineTo(x + r, y + bubbleH);
    ctx.quadraticCurveTo(x, y + bubbleH, x, y + bubbleH - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    // 半透明暗色磨砂底色
    ctx.fillStyle = `rgba(15, 23, 42, ${this.style.fillAlpha})`;
    ctx.fill();

    // 微光邊框 (一般技能淡青 / 進階技能淡紫)
    ctx.strokeStyle = isAdvanced
      ? `rgba(168, 85, 247, ${this.style.strokeAlpha})`
      : `rgba(56, 189, 248, ${this.style.strokeAlpha})`;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.font = `bold ${fontSize}px ${BUBBLE_FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8fafc';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    const lineH = fontSize * 1.18;
    const firstY = y + bubbleH / 2 - 1 - ((lines.length - 1) * lineH) / 2;
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], w / 2, firstY + i * lineH);

    ctx.restore();
    if (this.texture) this.texture.needsUpdate = true;
  }

  public show(text: string, isAdvanced: boolean, duration: number = 1.35) {
    this.ensure();
    this.duration = duration;
    this.draw(text, isAdvanced);
    this.timer = this.duration;
    if (this.sprite) {
      this.sprite.position.y = this.baseY;
      (this.sprite.material as THREE.SpriteMaterial).opacity = 0.95;
      this.sprite.visible = true;
    }
  }

  public update(delta: number) {
    if (this.timer <= 0 || !this.sprite) return;
    this.timer -= delta;
    const progress = 1.0 - (this.timer / this.duration);
    // 輕微平緩上浮 (+0.25m)
    this.sprite.position.y = this.baseY + progress * 0.25;

    // 前 60% 維持清晰，後 40% 平滑淡出
    const mat = this.sprite.material as THREE.SpriteMaterial;
    if (progress < 0.60) {
      mat.opacity = 0.95;
    } else {
      mat.opacity = 0.95 * (1.0 - (progress - 0.60) / 0.40);
    }

    if (this.timer <= 0) {
      this.sprite.visible = false;
      mat.opacity = 0;
    }
  }

  public hide() {
    if (this.sprite) this.sprite.visible = false;
    this.timer = 0;
  }

  public dispose() {
    if (this.texture) this.texture.dispose();
    if (this.sprite?.material) (this.sprite.material as THREE.Material).dispose();
  }
}
