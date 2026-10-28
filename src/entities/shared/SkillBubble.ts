import * as THREE from 'three';

// 氣泡外觀差異 (玩家與 NPC 的底色透明度、邊框亮度、字級規則略有不同)
export interface SkillBubbleStyle {
  fillAlpha: number;
  strokeAlpha: number;
  fontSize: (text: string) => number;
}

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
    this.canvas.width = 380;
    this.canvas.height = 110;
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
    this.sprite.scale.set(2.2, 0.64, 1.0);
    this.sprite.position.set(0, this.baseY, 0);
    this.sprite.visible = false;
    this.parent.add(this.sprite);
  }

  private draw(text: string, isAdvanced: boolean) {
    this.ensure();
    if (!this.context || !this.canvas) return;
    const ctx = this.context;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bubbleW = w - 24;
    const bubbleH = h - 28;
    const x = 12;
    const y = 8;
    const r = 22;

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

    ctx.font = `bold ${this.style.fontSize(text)}px "Segoe UI", -apple-system, BlinkMacSystemFont, "Microsoft JhengHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8fafc';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillText(text, w / 2, y + bubbleH / 2 - 1);

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
