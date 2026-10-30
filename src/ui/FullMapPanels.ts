import type { FullMapStatus, WeaponEquipEntry } from '../game/Progression';
import type { WeaponId } from '../weapons/types';
import type { MissionTrackerData } from './HUD';
import type { FullMapGoal } from './fullMapGoals';

type World = 'CAMPUS' | 'DETENTION';

export interface FullMapPanelDeps {
  getEntries(): WeaponEquipEntry[];
  equip(id: WeaponId): boolean;
  getStatus(): FullMapStatus | null;
}

const STATUS_LABELS: Record<WeaponEquipEntry['status'], string> = {
  equipped: '✅ 已裝備', unlocked: '🟢 已解鎖', locked: '🔒 未解鎖', unavailable: '🚫 本世界不可用'
};

function make(tag: string, cls: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

const fmtMult = (n: number) => `×${Number(n.toFixed(2))}`;

// 大地圖【地圖】側欄的學生證 / 下一步目標、【裝備】詳情、【任務】戰績
// 所有動態文字皆經髒檢查 (值未變不寫 DOM)；裝備詳情只在切入分頁 / 選取 / 裝備後重建
export class FullMapPanels {
  private readonly last = new Map<string, string | number>();
  private world: World | null = null;
  private selectedId: WeaponId | null = null;
  private gearEntries: WeaponEquipEntry[] = [];
  private readonly gearListEl = document.getElementById('fm-gear-list');
  private readonly gearDetailEl = document.getElementById('fm-gear-detail');
  private readonly gearSkillEl = document.getElementById('fm-gear-skill');

  constructor(private readonly deps: FullMapPanelDeps) {
    // 裝備清單：點選 = 查看詳情；詳情內「裝備」按鈕才真正換武器
    this.gearListEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = (e.target as HTMLElement).closest<HTMLElement>('.gear-card');
      if (!card?.dataset.weaponId) return;
      this.selectedId = card.dataset.weaponId as WeaponId;
      this.renderGear();
    });
    this.gearDetailEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.gear-equip-btn');
      if (!btn?.dataset.weaponId || btn.hasAttribute('disabled')) return;
      this.deps.equip(btn.dataset.weaponId as WeaponId);
      this.renderGear();
    });
    // 可折疊區塊 (圖例 / 操作說明)
    document.getElementById('fullmap-modal')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.fm-collapse-btn');
      if (!btn) return;
      const box = btn.closest<HTMLElement>('.fm-collapsible');
      if (!box) return;
      const open = box.classList.toggle('fm-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  private text(key: string, el: HTMLElement | null, value: string) {
    if (!el || this.last.get(key) === value) return;
    this.last.set(key, value);
    el.textContent = value;
  }

  private style(key: string, el: HTMLElement | null, prop: string, value: string) {
    if (!el || this.last.get(key) === value) return;
    this.last.set(key, value);
    el.style.setProperty(prop, value);
  }

  private flag(key: string, el: HTMLElement | null, cls: string, on: boolean) {
    const v = on ? 1 : 0;
    if (!el || this.last.get(key) === v) return;
    this.last.set(key, v);
    el.classList.toggle(cls, on);
  }

  private $(id: string): HTMLElement | null {
    return document.getElementById(id);
  }

  // 世界切換：軍規綠主題、受訓人員檔案、特訓院戰績
  public setWorld(world: World) {
    if (this.world === world) return;
    this.world = world;
    const det = world === 'DETENTION';
    document.querySelector('.fullmap-modal-card')?.classList.toggle('is-detention', det);
    this.text('school', this.$('idc-school'), det ? '第七少年特訓院　受訓人員檔案' : '天天國中　學生證');
    this.text('photo', this.$('idc-photo'), det ? '🪖' : '🧑‍🎓');
    this.text('cashLabel', this.$('idc-cash-label'), det ? '資金' : '零用錢');
    this.text('worldIcon', this.$('idc-world'), det ? '⛓️' : '🏫');
    this.text('statsTitle', this.$('fm-stats-title'), det ? '🏅 特訓院戰績' : '🏅 校園戰績');
    this.text('ringCap', this.$('fm-ring-caption'), det ? '逃脫任務進度' : '歷練總進度');
    const campusStats = this.$('fm-stats-campus');
    const campusBadges = this.$('fm-badges-campus');
    const detStats = this.$('fm-stats-detention');
    if (campusStats) campusStats.style.display = det ? 'none' : '';
    if (campusBadges) campusBadges.style.display = det ? 'none' : '';
    if (detStats) detStats.style.display = det ? '' : 'none';
    if (this.gearEntries.length > 0) this.renderGear();
  }

  // 學生證 / 受訓人員檔案 (約 20Hz，僅數值變動才寫 DOM)
  public updateIdCard(st: FullMapStatus, weaponIcon: string, weaponAtk: number, zone: string) {
    const hpPct = st.maxHp > 0 ? Math.round(Math.max(0, Math.min(1, st.hp / st.maxHp)) * 100) : 0;
    const spPct = st.maxStamina > 0 ? Math.round(Math.max(0, Math.min(1, st.stamina / st.maxStamina)) * 100) : 0;
    this.text('hpText', this.$('idc-hp-text'), `${Math.ceil(st.hp)}/${st.maxHp}`);
    this.style('hpW', this.$('idc-hp-fill'), 'width', `${hpPct}%`);
    this.flag('hpLow', this.$('idc-hp-fill')?.parentElement ?? null, 'is-low', hpPct <= 25);
    this.text('spText', this.$('idc-sp-text'), `${Math.ceil(st.stamina)}/${st.maxStamina}`);
    this.style('spW', this.$('idc-sp-fill'), 'width', `${spPct}%`);
    this.text('cash', this.$('idc-cash'), `NT$ ${st.cash}`);
    const stars = Math.max(0, Math.min(5, st.stars));
    this.text('stars', this.$('idc-stars'), '★'.repeat(stars) + '☆'.repeat(5 - stars));
    this.flag('wanted', this.$('idc-wanted-title')?.parentElement ?? null, 'is-wanted', stars > 0);
    this.text('wantedTitle', this.$('idc-wanted-title'), st.wantedTitle);
    let skill = '未習得';
    if (st.dodgeLevel > 0) {
      const name = st.dodgeLevel >= 2 ? '狗熊哆嗦毛' : '閃身步';
      skill = `${name}　${st.dodgeCooldown > 0 ? `冷卻 ${st.dodgeCooldown.toFixed(1)}s` : '就緒'}`;
    }
    this.text('skill', this.$('idc-skill'), skill);
    this.text('zone', this.$('idc-zone'), zone);
    this.text('wIcon', this.$('idc-weapon-icon'), weaponIcon);
    this.text('wAtk', this.$('idc-weapon-atk'), `ATK ${weaponAtk}`);
  }

  // 下一步目標卡 (goal = null 代表全部完成)
  public updateGoal(goal: FullMapGoal | null, distText: string) {
    this.text('goalIcon', this.$('fm-goal-icon'), goal ? goal.icon : '🎉');
    this.text('goalTitle', this.$('fm-goal-title'), goal ? goal.title : '全部歷練已完成');
    this.text('goalDesc', this.$('fm-goal-desc'), goal ? goal.desc : '自由探索校園吧');
    this.text('goalDist', this.$('fm-goal-dist'), distText);
  }

  // 任務分頁：環形總進度
  public setRing(done: number, total: number) {
    this.text('ringText', this.$('fm-ring-text'), `${done}/${total}`);
    this.style('ringPct', this.$('fm-ring'), '--pct', `${Math.min(100, Math.round((done / total) * 100))}%`);
  }

  // 任務分頁：校園擊倒統計與成就徽章 (任務資料變動時才呼叫)
  public setCampusStats(d: MissionTrackerData) {
    this.text('stStudent', this.$('fm-st-student'), `${d.studentDefeated}`);
    this.text('stTeacher', this.$('fm-st-teacher'), `${d.teacherDefeated}`);
    this.text('stDog', this.$('fm-st-dog'), `${d.dogDefeated}`);
    this.text('stBike', this.$('fm-st-bike'), `${d.bikeDefeated}`);
    this.text('stInspector', this.$('fm-st-inspector'), `${d.inspectorDefeated}`);
    this.flag('bdBike', this.$('fm-bd-bike'), 'is-done', d.hasRiddenBike);
    this.flag('bdDog', this.$('fm-bd-dog'), 'is-done', d.hasEscapedDog);
    this.flag('bdPond', this.$('fm-bd-pond'), 'is-done', d.hasWishedPond);
    this.flag('bdFood', this.$('fm-bd-food'), 'is-done', d.hasTastedHotFood);
  }

  // 任務分頁：特訓院戰績 (約 20Hz，值變才寫 DOM)
  public updateDetentionStats(st: FullMapStatus) {
    this.text('stTakedown', this.$('fm-st-takedown'), `${st.takedowns}`);
    this.text('stFrontal', this.$('fm-st-frontal'), `${st.frontalKos}`);
    this.text('stAlert', this.$('fm-st-alert'), `${st.alerts}`);
    let timer = '已逃脫';
    if (st.escapeSeconds >= 0) {
      const m = Math.floor(st.escapeSeconds / 60);
      const s = st.escapeSeconds % 60;
      timer = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    this.text('stTimer', this.$('fm-st-timer'), timer);
  }

  // 【裝備】分頁：清單 + 詳情 + 技能卡 (切入分頁 / 選取 / 裝備後呼叫)
  public renderGear(resetSelection = false) {
    const list = this.gearListEl;
    const detail = this.gearDetailEl;
    if (!list || !detail) return;
    this.gearEntries = this.deps.getEntries();
    if (this.gearEntries.length === 0) return;
    if (resetSelection || !this.gearEntries.some((w) => w.id === this.selectedId)) {
      this.selectedId = (this.gearEntries.find((w) => w.status === 'equipped') ?? this.gearEntries[0]).id;
    }
    const sel = this.gearEntries.find((w) => w.id === this.selectedId)!;

    list.replaceChildren(...this.gearEntries.map((w) => {
      const card = make('button', `gear-card is-${w.status}${w.id === sel.id ? ' is-selected' : ''}`) as HTMLButtonElement;
      card.type = 'button';
      card.dataset.weaponId = w.id;
      card.setAttribute('aria-pressed', w.id === sel.id ? 'true' : 'false');
      card.append(make('span', 'gear-icon', w.icon), make('span', 'gear-name', w.name), make('span', 'gear-status', STATUS_LABELS[w.status]));
      return card;
    }));
    detail.replaceChildren(...this.buildDetail(sel));
    this.renderSkill();
  }

  private buildDetail(w: WeaponEquipEntry): HTMLElement[] {
    const head = make('div', 'gear-detail-head');
    const title = make('div', 'gear-detail-title');
    title.append(make('div', 'gear-detail-name', w.name));
    if (w.name !== w.baseName) title.append(make('div', 'gear-detail-sub', `本名：${w.baseName}`));
    head.append(make('span', 'gear-detail-icon', w.icon), title, make('span', `gear-status gear-status-${w.status}`, STATUS_LABELS[w.status]));

    const stat = (label: string, value: string, note?: string) => {
      const box = make('div', 'gear-stat');
      box.append(make('em', '', label), make('b', '', value));
      if (note) box.append(make('small', '', note));
      return box;
    };
    const s = w.summary;
    const grid = make('div', 'gear-stat-grid');
    grid.append(
      stat('ATK', `${w.damage}`),
      stat('射程', `${w.reach}`),
      stat('擊退', `${w.knockback}`),
      stat('約秒傷', `約 ${Math.round(s.dps)}/s`, '估算'),
      stat('整套總傷', `${s.totalDamage}`, `${s.moves.length} 招 · ${s.totalSeconds.toFixed(1)} 秒`)
    );

    const table = make('div', 'gear-combo');
    table.append(make('div', 'gear-combo-title', '連段 (依序出招)'));
    s.moves.forEach((m, i) => {
      const row = make('div', `gear-combo-row${m.finisher ? ' is-finisher' : ''}`);
      row.append(
        make('span', 'gc-idx', `${i + 1}`),
        make('span', 'gc-name', m.finisher ? `★ ${m.name}` : m.name),
        make('span', 'gc-mult', m.mults.map(fmtMult).join(' ')),
        make('b', 'gc-dmg', `${m.damage}`)
      );
      table.append(row);
    });

    const out: HTMLElement[] = [head, grid, table];
    if (w.unlockSteps.length > 0) {
      const box = make('div', 'gear-unlock');
      box.append(make('div', 'gear-combo-title', w.status === 'locked' ? '解鎖進度' : '解鎖條件'));
      for (const step of w.unlockSteps) {
        const row = make('div', 'gear-unlock-row');
        const bar = make('div', 'gear-unlock-bar');
        const fill = make('i', '');
        fill.style.width = `${Math.round((step.cur / step.max) * 100)}%`;
        bar.append(fill);
        row.append(make('span', 'gu-label', step.label), bar, make('b', 'gu-count', `${step.cur}/${step.max}`));
        box.append(row);
      }
      out.push(box);
    }
    if (w.hint && (w.unlockSteps.length === 0 || w.status === 'unavailable')) out.push(make('div', 'gear-hint', w.hint));

    const btn = make('button', 'gear-equip-btn') as HTMLButtonElement;
    btn.type = 'button';
    btn.dataset.weaponId = w.id;
    if (w.status === 'unlocked') {
      btn.textContent = `裝備 ${w.name}`;
    } else {
      btn.textContent = STATUS_LABELS[w.status];
      btn.setAttribute('disabled', '');
    }
    out.push(btn);
    return out;
  }

  private renderSkill() {
    const box = this.gearSkillEl;
    const st = this.deps.getStatus();
    if (!box || !st) return;
    const det = this.world === 'DETENTION';
    const lines: string[] = [];
    let name: string;
    if (st.dodgeLevel === 0) {
      name = '閃身步　未習得';
      lines.push(det ? '需返回【天天國中】敬業樓 A 棟尋訪「閃身步老師」學習' : '前往敬業樓 A 棟 1F 走廊尋訪「閃身步老師」學習');
      lines.push(`學費 NT$ ${st.dodgeNextFee}`);
    } else if (st.dodgeLevel === 1) {
      name = '閃身步';
      lines.push(`冷卻 ${st.dodgeCooldownMax} 秒　按 [Q] 手動施放`);
      lines.push(`被攻擊命中時有 ${Math.round(st.autoDodgeChance * 100)}% 機率自動發動 (僅閃身步)`);
      lines.push(`進階【狗熊哆嗦毛】學費 NT$ ${st.dodgeNextFee}`);
    } else {
      name = '狗熊哆嗦毛　已精通 🌟';
      lines.push(`冷卻 ${st.dodgeCooldownMax} 秒　按 [Q] 連續瞬移規避`);
      lines.push('需手動施放，不會自動發動');
    }
    box.replaceChildren(
      make('div', 'fm-block-title', '🥋 身法技能'),
      make('div', 'gear-skill-name', name),
      ...lines.map((l) => make('div', 'gear-skill-line', l))
    );
  }
}
