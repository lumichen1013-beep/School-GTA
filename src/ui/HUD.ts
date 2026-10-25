import * as THREE from 'three';
import { NPC } from '../entities/NPC';
import { Bicycle } from '../vehicles/Bicycle';

export interface CommissaryItem {
  id: string;
  name: string;
  icon: string;
  price: number;
  healHp: number;
  restoreStamina: boolean;
  desc: string;
}

export const COMMISSARY_MENU: CommissaryItem[] = [
  { id: 'bento', name: '經典排骨便當', icon: '🍱', price: 50, healHp: 50, restoreStamina: false, desc: '古早味炸排骨，香氣四溢大補血！(+50 HP)' },
  { id: 'chicken', name: '香脆豪大大雞排', icon: '🍗', price: 40, healHp: 40, restoreStamina: false, desc: '外皮酥脆多汁，下課排隊必吃！(+40 HP)' },
  { id: 'boba', name: '波霸珍珠奶茶', icon: '🧋', price: 30, healHp: 30, restoreStamina: true, desc: '微糖微冰，體力與精力雙重滿足！(+30 HP & 精力滿)' },
  { id: 'sandwich', name: '火腿起司三明治', icon: '🥪', price: 20, healHp: 20, restoreStamina: false, desc: '新鮮土司夾蛋，清爽飽足！(+20 HP)' },
  { id: 'tea-egg', name: '香濃茶葉蛋', icon: '🥚', price: 12, healHp: 12, restoreStamina: false, desc: '合作社滷得最入味的經典！(+12 HP)' },
  { id: 'sport-drink', name: '活力運動飲料', icon: '⚡', price: 15, healHp: 10, restoreStamina: true, desc: '迅速補充水分電解質！(+10 HP & 精力全滿)' }
];

export class HUD {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private hpBar: HTMLElement | null;
  private hpNum: HTMLElement | null;
  private staminaBar: HTMLElement | null;
  private staminaNum: HTMLElement | null;
  private locationEl: HTMLElement | null;
  private actionPrompt: HTMLElement | null;
  private promptKey: HTMLElement | null;
  private promptText: HTMLElement | null;
  private pursuitVignetteEl: HTMLElement | null;
  private bgmBadgeEl: HTMLElement | null;
  private bgmIconEl: HTMLElement | null;
  private bgmTextEl: HTMLElement | null;
  private bgmToggleBtnEl: HTMLElement | null;
  private crosshairEl: HTMLElement | null;
  private cashTextEl: HTMLElement | null;
  private poisonVignetteEl: HTMLElement | null;

  // Boss HUD
  private bossHudEl: HTMLElement | null;
  private bossHpTextEl: HTMLElement | null;
  private bossBarFillEl: HTMLElement | null;

  // Weapon HUD
  private slotFistEl: HTMLElement | null;
  private slotNormalBatEl: HTMLElement | null;
  private slotSpecialBatEl: HTMLElement | null;
  private normalBatProgressEl: HTMLElement | null;
  private specialBatProgressEl: HTMLElement | null;

  // Commissary Modal
  private commissaryModalEl: HTMLElement | null;
  private commissaryCashValEl: HTMLElement | null;
  private commissaryGridEl: HTMLElement | null;
  private commissaryCloseBtnEl: HTMLElement | null;
  public isCommissaryOpen: boolean = false;

  constructor() {
    this.canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.hpBar = document.getElementById('hp-bar');
    this.hpNum = document.getElementById('hp-num');
    this.staminaBar = document.getElementById('stamina-bar');
    this.staminaNum = document.getElementById('stamina-num');
    this.locationEl = document.getElementById('current-zone');
    this.actionPrompt = document.getElementById('action-prompt');
    this.promptKey = document.getElementById('prompt-key');
    this.promptText = document.getElementById('prompt-text');
    this.pursuitVignetteEl = document.getElementById('pursuit-vignette');
    this.bgmBadgeEl = document.getElementById('bgm-badge');
    this.bgmIconEl = document.getElementById('bgm-icon');
    this.bgmTextEl = document.getElementById('bgm-text');
    this.bgmToggleBtnEl = document.getElementById('bgm-toggle-btn');
    this.crosshairEl = document.getElementById('crosshair');
    this.cashTextEl = document.getElementById('cash-text');
    this.poisonVignetteEl = document.getElementById('poison-vignette');

    this.bossHudEl = document.getElementById('boss-hud');
    this.bossHpTextEl = document.getElementById('boss-hp-text');
    this.bossBarFillEl = document.getElementById('boss-bar-fill');

    this.slotFistEl = document.getElementById('slot-fist');
    this.slotNormalBatEl = document.getElementById('slot-normal-bat');
    this.slotSpecialBatEl = document.getElementById('slot-special-bat');
    this.normalBatProgressEl = document.getElementById('normal-bat-progress');
    this.specialBatProgressEl = document.getElementById('special-bat-progress');

    this.commissaryModalEl = document.getElementById('commissary-modal');
    this.commissaryCashValEl = document.getElementById('commissary-cash-val');
    this.commissaryGridEl = document.getElementById('commissary-grid');
    this.commissaryCloseBtnEl = document.getElementById('commissary-close-btn');

    if (this.commissaryCloseBtnEl) {
      this.commissaryCloseBtnEl.addEventListener('click', () => {
        this.closeCommissary();
      });
    }

    this.shotMeterEl = document.getElementById('shot-meter');
    this.shotSweetspotEl = document.getElementById('shot-sweetspot');
    this.shotFillEl = document.getElementById('shot-fill');
    this.shotNeedleEl = document.getElementById('shot-needle');
    this.shotFeedbackEl = document.getElementById('shot-feedback');
  }

  private shotMeterEl: HTMLElement | null;
  private shotSweetspotEl: HTMLElement | null;
  private shotFillEl: HTMLElement | null;
  private shotNeedleEl: HTMLElement | null;
  private shotFeedbackEl: HTMLElement | null;

  public setBasketballAiming(isAiming: boolean) {
    if (this.crosshairEl) {
      if (isAiming) {
        this.crosshairEl.classList.add('aiming-basketball');
      } else {
        this.crosshairEl.classList.remove('aiming-basketball');
      }
    }
    if (!isAiming) {
      this.hideShotMeter();
    }
  }

  public showShotMeter(sweetMin: number = 0.68, sweetMax: number = 0.86) {
    if (this.shotMeterEl && this.shotSweetspotEl) {
      this.shotMeterEl.style.display = 'block';
      this.shotSweetspotEl.style.left = `${sweetMin * 100}%`;
      this.shotSweetspotEl.style.width = `${(sweetMax - sweetMin) * 100}%`;
      this.updateShotMeter(0);
      if (this.shotFeedbackEl) {
        this.shotFeedbackEl.style.display = 'none';
        this.shotFeedbackEl.className = 'shot-meter-feedback';
      }
    }
  }

  public updateShotMeter(ratio: number) {
    const clamped = Math.max(0, Math.min(1.0, ratio));
    if (this.shotFillEl) this.shotFillEl.style.width = `${clamped * 100}%`;
    if (this.shotNeedleEl) this.shotNeedleEl.style.left = `${clamped * 100}%`;
  }

  public showShotFeedback(result: 'PERFECT' | 'GOOD' | 'LATE' | 'EARLY') {
    if (this.shotFeedbackEl) {
      this.shotFeedbackEl.className = 'shot-meter-feedback';
      if (result === 'PERFECT') {
        this.shotFeedbackEl.textContent = '🔥 PERFECT! 完美空心！';
        this.shotFeedbackEl.classList.add('perfect');
      } else if (result === 'GOOD') {
        this.shotFeedbackEl.textContent = '✨ GOOD! 良好出手！';
        this.shotFeedbackEl.classList.add('good');
      } else if (result === 'LATE') {
        this.shotFeedbackEl.textContent = '❌ LATE! 出手太慢！';
        this.shotFeedbackEl.classList.add('bad');
      } else {
        this.shotFeedbackEl.textContent = '❌ EARLY! 蓄力不足！';
        this.shotFeedbackEl.classList.add('bad');
      }
      setTimeout(() => {
        this.hideShotMeter();
      }, 1000);
    } else {
      this.hideShotMeter();
    }
  }

  public hideShotMeter() {
    if (this.shotMeterEl) {
      this.shotMeterEl.style.display = 'none';
    }
  }

  public setupBGMClick(onToggle: () => void) {
    if (this.bgmBadgeEl) {
      this.bgmBadgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        onToggle();
      });
    }
  }

  public updateBGMStatus(mode: 'EXPLORE' | 'PURSUIT', isMuted: boolean) {
    if (!this.bgmBadgeEl || !this.bgmIconEl || !this.bgmTextEl || !this.bgmToggleBtnEl) return;

    if (isMuted) {
      this.bgmBadgeEl.className = 'bgm-badge muted';
      this.bgmIconEl.textContent = '🔇';
      this.bgmTextEl.textContent = 'BGM: 靜音';
      this.bgmToggleBtnEl.textContent = '[關]';
    } else if (mode === 'PURSUIT') {
      this.bgmBadgeEl.className = 'bgm-badge pursuit';
      this.bgmIconEl.textContent = '🚨';
      this.bgmTextEl.textContent = 'BGM: 通緝追逐!';
      this.bgmToggleBtnEl.textContent = '[開]';
    } else {
      this.bgmBadgeEl.className = 'bgm-badge';
      this.bgmIconEl.textContent = '🎵';
      this.bgmTextEl.textContent = 'BGM: 校園漫步';
      this.bgmToggleBtnEl.textContent = '[開]';
    }
  }

  public showPrompt(key: string, text: string) {
    if (this.actionPrompt && this.promptKey && this.promptText) {
      this.promptKey.textContent = key;
      this.promptText.textContent = text;
      this.actionPrompt.style.display = 'block';
    }
  }

  public setCash(cash: number) {
    if (this.cashTextEl) {
      this.cashTextEl.textContent = `NT$ ${cash}`;
    }
    if (this.commissaryCashValEl) {
      this.commissaryCashValEl.textContent = `NT$ ${cash}`;
    }
  }

  // 變異食人花 Boss 血條顯示與更新
  public setBossHealth(currentHp: number, maxHp: number, visible: boolean) {
    if (!this.bossHudEl || !this.bossHpTextEl || !this.bossBarFillEl) return;

    if (!visible || currentHp <= 0) {
      this.bossHudEl.style.display = 'none';
      return;
    }

    this.bossHudEl.style.display = 'block';
    const pct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
    this.bossBarFillEl.style.width = `${pct}%`;
    this.bossHpTextEl.textContent = `${Math.ceil(currentHp)} / ${maxHp}`;
  }

  // 武器 HUD 狀態更新 (高亮當前武器，顯示解鎖進度)
  public updateWeaponHUD(
    currentWeapon: 'FIST' | 'NORMAL_BAT' | 'SPECIAL_BAT',
    hasNormal: boolean,
    hasSpecial: boolean,
    studentDefeated: number,
    teacherDefeated: number,
    dogDefeated: number,
    bikeDefeated: number
  ) {
    // 徒手
    if (this.slotFistEl) {
      if (currentWeapon === 'FIST') {
        this.slotFistEl.className = 'weapon-slot active';
      } else {
        this.slotFistEl.className = 'weapon-slot';
      }
    }

    // 普通球棒 (需擊敗 20 名普通同學)
    if (this.slotNormalBatEl && this.normalBatProgressEl) {
      if (hasNormal) {
        this.slotNormalBatEl.className = (currentWeapon === 'NORMAL_BAT') ? 'weapon-slot active' : 'weapon-slot';
        this.normalBatProgressEl.textContent = 'ATK 55 (已裝備/按2)';
      } else {
        this.slotNormalBatEl.className = 'weapon-slot locked';
        this.normalBatProgressEl.textContent = `同學 ${Math.min(20, studentDefeated)}/20`;
      }
    }

    // 特殊球棒 (需擊敗生教 x1, 校犬 x1, 單車同學 x5)
    if (this.slotSpecialBatEl && this.specialBatProgressEl) {
      if (hasSpecial) {
        this.slotSpecialBatEl.className = (currentWeapon === 'SPECIAL_BAT') ? 'weapon-slot active' : 'weapon-slot';
        this.specialBatProgressEl.textContent = 'ATK 120 (神兵/按3)';
      } else {
        this.slotSpecialBatEl.className = 'weapon-slot locked';
        const tStr = teacherDefeated >= 1 ? '教✔' : `教${teacherDefeated}/1`;
        const dStr = dogDefeated >= 1 ? '犬✔' : `犬${dogDefeated}/1`;
        const bStr = bikeDefeated >= 5 ? '車✔' : `車${bikeDefeated}/5`;
        this.specialBatProgressEl.textContent = `${tStr} ${dStr} ${bStr}`;
      }
    }
  }

  // 合作社 (熱食補血部) 彈出式選單
  public openCommissary(playerCash: number, onBuyItem: (item: CommissaryItem) => void) {
    if (!this.commissaryModalEl || !this.commissaryGridEl || !this.commissaryCashValEl) return;

    this.isCommissaryOpen = true;
    this.commissaryCashValEl.textContent = `NT$ ${playerCash}`;
    this.commissaryGridEl.innerHTML = '';

    COMMISSARY_MENU.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'food-card';

      const info = document.createElement('div');
      info.className = 'food-info';

      const name = document.createElement('div');
      name.className = 'food-name';
      name.textContent = `${item.icon} ${item.name}`;

      const effect = document.createElement('div');
      effect.className = 'food-effect';
      effect.textContent = item.restoreStamina
        ? `💚 +${item.healHp} HP & ⚡ 精力全滿`
        : `💚 +${item.healHp} HP 體力`;

      const price = document.createElement('div');
      price.className = 'food-price';
      price.textContent = `NT$ ${item.price}`;

      info.appendChild(name);
      info.appendChild(effect);
      info.appendChild(price);

      const buyBtn = document.createElement('button');
      buyBtn.className = 'food-buy-btn';
      buyBtn.textContent = '購買品嚐';
      if (playerCash < item.price) {
        buyBtn.disabled = true;
        buyBtn.textContent = '餘額不足';
      } else {
        buyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          onBuyItem(item);
        });
      }

      card.appendChild(info);
      card.appendChild(buyBtn);
      this.commissaryGridEl!.appendChild(card);
    });

    this.commissaryModalEl.style.display = 'flex';
  }

  public closeCommissary() {
    if (this.commissaryModalEl) {
      this.commissaryModalEl.style.display = 'none';
      this.isCommissaryOpen = false;
    }
  }

  public hidePrompt() {
    if (this.actionPrompt) {
      this.actionPrompt.style.display = 'none';
    }
  }

  public update(
    playerPos: THREE.Vector3,
    playerRotY: number,
    hp: number,
    stamina: number,
    npcs: NPC[],
    bicycles: Bicycle[],
    isBeingChased: boolean = false,
    isHighDanger: boolean = false
  ) {
    // 1. 生命值與體力數值
    if (this.hpBar && this.hpNum) {
      this.hpBar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      this.hpNum.textContent = `${Math.round(hp)}%`;
    }
    if (this.staminaBar && this.staminaNum) {
      this.staminaBar.style.width = `${Math.max(0, Math.min(100, stamina))}%`;
      this.staminaNum.textContent = `${Math.round(stamina)}%`;
    }

    // 2. 地點分區偵測
    this.updateLocationZone(playerPos);

    // 3. 繪製 3D 雷達小地圖 (Minimap)
    this.renderMinimap(playerPos, playerRotY, npcs, bicycles);

    // 4. 被追捕外框紅色閃爍特效 (Pursuit Alert Vignette)
    if (this.pursuitVignetteEl) {
      if (isBeingChased) {
        this.pursuitVignetteEl.classList.add('active');
        if (isHighDanger) {
          this.pursuitVignetteEl.classList.add('danger');
        } else {
          this.pursuitVignetteEl.classList.remove('danger');
        }
      } else {
        this.pursuitVignetteEl.classList.remove('active', 'danger');
      }
    }
  }

  public setPoisonActive(active: boolean) {
    if (this.poisonVignetteEl) {
      if (active) {
        this.poisonVignetteEl.classList.add('active');
      } else {
        this.poisonVignetteEl.classList.remove('active');
      }
    }
  }

  private updateLocationZone(pos: THREE.Vector3) {
    if (!this.locationEl) return;

    let zone = '教學中庭廣場';
    if (pos.z > 107.0 || Math.abs(pos.x) > 118.0) {
      zone = '🏙️ 校外大街 (強盜出沒警戒區)';
    } else if (pos.x >= 63 && pos.x <= 87 && pos.z >= -55 && pos.z <= -15) {
      zone = '🏊 天天國中 25m 標準游泳館';
    } else if (pos.x < -45 && pos.z < -75) {
      zone = '🌿 自然生態探索園區 (秘境霸主)';
    } else if (pos.y > 8.0) {
      zone = '教學大樓 A 棟 · 天台高空';
    } else if (pos.x > 20 && pos.z < 0) {
      zone = '教學大樓 A 棟 (高三部走廊)';
    } else if (pos.x > 20 && pos.z > 20) {
      zone = '教學大樓 B 棟 (活動中心)';
    } else if (pos.x < -20 && pos.z > 10) {
      zone = '操場 PU 跑道 & 足球場';
    } else if (pos.x < -30 && pos.z < 5 && pos.z > -20) {
      zone = '全校升旗司令台';
    } else if (pos.x < 5 && pos.x > -25 && pos.z < -40) {
      zone = '🏪 天天合作社 (熱食補血部)';
    } else if (pos.x < -35 && pos.z < -40) {
      zone = '腳踏車專用車棚';
    } else if (pos.z > 80) {
      zone = '校門口 & 警衛守衛室';
    }

    this.locationEl.textContent = zone;
  }

  private renderMinimap(playerPos: THREE.Vector3, playerRotY: number, npcs: NPC[], bicycles: Bicycle[]) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const mapScale = 1.35; // 縮放比

    ctx.clearRect(0, 0, w, h);

    // 背景底色
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    // 將小地圖中心移到玩家位置，並依玩家視角旋轉
    ctx.translate(centerX, centerY);
    ctx.rotate(playerRotY);

    // 繪製代表校園建築的矩形色塊
    const drawBuilding = (bx: number, bz: number, bw: number, bd: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect((bx - playerPos.x - bw / 2) * mapScale, (bz - playerPos.z - bd / 2) * mapScale, bw * mapScale, bd * mapScale);
    };

    // 生態探索園區 (西北深綠森林泥土地)
    drawBuilding(-70, -98, 50, 42, '#14532d');

    // 25m 標準游泳館
    drawBuilding(75, -35, 20, 32, '#0284c7');

    // 大樓 A, B
    drawBuilding(40, -30, 48, 18, '#334155');
    drawBuilding(40, 45, 48, 18, '#334155');
    // 天天合作社
    drawBuilding(-15, -60, 18, 14, '#b45309');
    // 車棚
    drawBuilding(-50, -55, 24, 8, '#0369a1');
    // 司令台
    drawBuilding(-45, -8, 16, 10, '#475569');

    // 操場跑道 (真實橢圓體育場造型)
    const tCenterX = (-55 - playerPos.x) * mapScale;
    const tCenterZ = (30 - playerPos.z) * mapScale;
    const sHalf = 16 * mapScale;
    const rOuter = 26 * mapScale;
    const rInner = 16 * mapScale;

    // 紅磚色 PU 跑道
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 9 * mapScale;
    ctx.beginPath();
    ctx.moveTo(tCenterX + rOuter - 4 * mapScale, tCenterZ - sHalf);
    ctx.lineTo(tCenterX + rOuter - 4 * mapScale, tCenterZ + sHalf);
    ctx.arc(tCenterX, tCenterZ + sHalf, rOuter - 4 * mapScale, 0, Math.PI, false);
    ctx.lineTo(tCenterX - (rOuter - 4 * mapScale), tCenterZ - sHalf);
    ctx.arc(tCenterX, tCenterZ - sHalf, rOuter - 4 * mapScale, Math.PI, Math.PI * 2, false);
    ctx.stroke();

    // 內圈綠色草皮
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.moveTo(tCenterX + rInner, tCenterZ - sHalf);
    ctx.lineTo(tCenterX + rInner, tCenterZ + sHalf);
    ctx.arc(tCenterX, tCenterZ + sHalf, rInner, 0, Math.PI, false);
    ctx.lineTo(tCenterX - rInner, tCenterZ - sHalf);
    ctx.arc(tCenterX, tCenterZ - sHalf, rInner, Math.PI, Math.PI * 2, false);
    ctx.fill();

    // 繪製腳踏車標記 (藍色點)
    for (const bike of bicycles) {
      const bx = (bike.position.x - playerPos.x) * mapScale;
      const bz = (bike.position.z - playerPos.z) * mapScale;
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(bx, bz, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 繪製 NPC 標記 (生教:深紅, 糾察:紅, 單車糾察:紫, 校犬柴柴:赤柴橘黃, 學生:白)
    for (const npc of npcs) {
      const nx = (npc.position.x - playerPos.x) * mapScale;
      const nz = (npc.position.z - playerPos.z) * mapScale;
      let dotColor = '#e2e8f0';
      let dotRadius = 3.5;

      if (npc.role === 'TEACHER' || npc.role === 'INSTRUCTOR') {
        dotColor = '#dc2626';
        dotRadius = 5.5;
      } else if (npc.role === 'BANDIT') {
        dotColor = '#be123c';
        dotRadius = 5.0;
      } else if (npc.role === 'DOG') {
        dotColor = '#f97316';
        dotRadius = 4.5;
      } else if (npc.role === 'BIKE_PATROL') {
        dotColor = '#a855f7';
        dotRadius = 5.0;
      } else if (npc.role === 'INSPECTOR') {
        dotColor = '#ef4444';
        dotRadius = 4.0;
      }

      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(nx, nz, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // 玩家中央黃色箭頭標記
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 外框與刻度
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, w / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}
