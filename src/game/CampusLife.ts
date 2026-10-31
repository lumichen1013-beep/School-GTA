import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { soundManager } from '../audio/SoundEffects';
import type { NPC, NPCIdleBehavior, NPCLifeTask } from '../entities/NPC';
import type { CollidableBox } from '../world/ColliderRegistry';
import type { GameContext } from './GameContext';
import { RUMOR } from './fencer/fencerStory';

/**
 * 第一世界【天天國中】校園生活導演：讓 NPC 不只沿固定路線來回
 * - 地點活動：合作社排隊、籃球場練投、長椅/花台/棋桌坐著、洗手台洗手
 * - 小團體：同學結伴同行，停下時圍圈聊天，老師靠近就散開裝沒事
 * - 對玩家的反應：圍觀/拍攝/起鬨/逃跑、通報老師、被撞抱怨、閃避單車、打招呼
 * - 角色專屬事件：巡堂老師攔下快走同學、主任教官檢查服儀、糾察站崗校門、柴柴追鴿子與討食、強盜勒索同學
 * - 固定個性：每名同學固定膽小 / 愛湊熱鬧 / 乖寶寶 / 調皮其一，決定反應方式
 * 決策以 0.2 秒為單位批次判斷 (不逐幀)，只指派 NPC.lifeTask，移動與動作由 NPC 自身執行
 * 固定駐點同學 (泳池小魚、操場阿凱、籃球場鬥牛與操場踢足球雙人組，npc.campusAnchor) 由 CampusSportsCrew 管理：
 * 不參與地點活動、小團體、師長攔查與勒索事件，只保留對玩家的反應 (打招呼、被撞、閃車、圍觀打架、通報)
 */

type Persona = 'NOSY' | 'GOOD' | 'PRANK' | 'TIMID';
// 依同學生成順序輪流套用的固定個性
const PERSONA_ORDER: Persona[] = ['NOSY', 'GOOD', 'PRANK', 'TIMID'];

type Activity = 'NONE' | 'POI' | 'GROUP' | 'REACT' | 'EVENT';

interface StudentState {
  npc: NPC;
  persona: Persona;
  activity: Activity;
  slot: PoiSlot | null;
  group: StudentGroup | null;
  poiCooldown: number;
  greetCooldown: number;
  bumpCooldown: number;
  reportCooldown: number;
  dodgeCooldown: number;
}

interface StudentGroup {
  members: StudentState[]; // [0] 為帶頭者 (沿原巡邏路線)，其餘跟隨
  chatting: boolean;
  chatLineIdx: number;
  chatTimer: number;
  scatterCooldown: number;
}

interface PoiSlot {
  x: number;
  z: number;
  faceX: number;
  faceZ: number;
  hold: NPCIdleBehavior;
  holdTime: number;
  sitBack: number;
  lines: string[];
  occupant: NPC | null;
}

interface StaffState {
  npc: NPC;
  eventCooldown: number;
  busy: boolean;
}

// ---------- 地點活動 (皆為 1F 地面、開闊可直線抵達的位置) ----------
const mkSlots = (
  pts: [number, number][], faceX: number, faceZ: number, hold: NPCIdleBehavior, holdTime: number, lines: string[], sitBack = 0
): PoiSlot[] => pts.map(([x, z]) => ({ x, z, faceX, faceZ, hold, holdTime, sitBack, lines, occupant: null }));

const buildPoiSlots = (): PoiSlot[] => [
  // 合作社排隊 (面向取餐櫃台)
  ...mkSlots([[-17, -48.4], [-17, -47.2], [-17, -46.0]], -17, -52, 'PHONE', 7, ['老闆，一份雞排！', '今天有珍奶嗎？', '排好久喔…']),
  // 籃球場練投 (面向籃框)
  ...mkSlots([[20.6, -61.2], [23.4, -61.2]], 22, -66.95, 'SHOOT_HOOP', 7, ['唰！空心！', '又打鐵了啦…', '看我後仰跳投！']),
  ...mkSlots([[38, -60.6]], 38, -66.95, 'SHOOT_HOOP', 7, ['三分球！', '手感好熱！']),
  // 籃球場旁長椅 (椅面朝 +Z，站在椅前再向後坐上椅面)
  ...[[12, -55], [12, -35], [48, -45]].map(([bx, bz]) => ({
    x: bx, z: bz + 0.95, faceX: bx, faceZ: bz + 5, hold: 'SIT' as NPCIdleBehavior, holdTime: 10, sitBack: 0.9,
    lines: ['累死了，休息一下', '等等要考數學…', '好想放學喔'], occupant: null
  })),
  // 中庭石棋桌 (坐石凳面向棋桌)
  ...[[-1.2, 0], [1.2, 0], [0, -1.2], [0, 1.2]].map(([sx, sz]) => ({
    x: -20 + sx * 1.75, z: sz * 1.75, faceX: -20, faceZ: 0, hold: 'SIT' as NPCIdleBehavior, holdTime: 12, sitBack: 0.65,
    lines: ['將軍！', '等一下，我悔一步', '這步好難…'], occupant: null
  })),
  // 中央花台邊緣 (背對花台坐在邊緣)
  ...[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((a) => ({
    x: Math.sin(a) * 4.7, z: 15 + Math.cos(a) * 4.7, faceX: Math.sin(a) * 9, faceZ: 15 + Math.cos(a) * 9,
    hold: 'SIT' as NPCIdleBehavior, holdTime: 10, sitBack: 0.55, lines: ['今天天氣真好～', '花開得好漂亮', '午休好短喔', RUMOR.bench], occupant: null
  })),
  // 洗手台 (面向洗手台)
  ...mkSlots([[18.5, -6.3], [21.5, -6.3]], 20, -5, 'WASH', 3.5, ['洗手洗手～', '水好冰！'])
];

// ---------- 台詞 ----------
const GREET_LINES: Record<Persona, string> = {
  NOSY: '嘿！你是轉學生嗎？',
  GOOD: '早安～',
  PRANK: '幹嘛啦～盯著我看',
  TIMID: '……你、你好'
};
const BUMP_LINES: Record<Persona, string> = {
  NOSY: '喂！撞到人了啦！',
  GOOD: '小心一點喔',
  PRANK: '走路不看路喔～',
  TIMID: '對、對不起…'
};
const DODGE_LINES: Record<Persona, string> = {
  NOSY: '騎慢一點啦！',
  GOOD: '小心車！',
  PRANK: '哇～飆車族！',
  TIMID: '哇啊！'
};
const FIGHT_LINES: Record<Persona, string[]> = {
  NOSY: ['打架了！快拍！', '上傳限動！', '哇靠，真的假的？'],
  PRANK: ['打啊！打啊！', '喔喔喔喔！', '加油～'],
  TIMID: ['嗚哇…好可怕…', '不要打了啦…'],
  GOOD: ['我去叫老師！', '不要打架啦！']
};
const GROUP_CHAT_BASE = [
  '昨天的影片你看了嗎？', '哈哈哈笑死', '真的假的啦', '下節是體育課耶！', '午餐要吃什麼？',
  '大如老師今天又在殺球', '你作業寫完沒？', '週末要去哪？'
];
// 花劍客傳聞 (前導) / 後日談 (首勝後)：依旗標選表，預先組好不每次配置
const GROUP_CHAT_LINES = [...GROUP_CHAT_BASE, RUMOR.chatBefore];
const GROUP_CHAT_LINES_AFTER = [...GROUP_CHAT_BASE, ...RUMOR.chatAfter];

// ---------- 鴿子 ----------
const PIGEON_SPOTS: [number, number][] = [[6, 28], [-8, -14], [10, -12]];
const PIGEON_COUNT = 5;
const PIGEON_FLEE_DIST = 4.0;

const EVENT_TICK = 0.2;
const GATE_INNER = new THREE.Vector3(3.8, 0, 100.5);
const GATE_OUTER = new THREE.Vector3(3.8, 0, 109.6);
const BANDIT_SPOT = new THREE.Vector3(3.8, 0, 111.4);

const _dummy = new THREE.Object3D();
const _tmpV = new THREE.Vector3();

export class CampusLife {
  private initialized = false;
  private tickTimer = 0;
  private students: StudentState[] = [];
  private studentByNpc = new Map<NPC, StudentState>();
  private groups: StudentGroup[] = [];
  private poiSlots: PoiSlot[] = buildPoiSlots();
  private staff: StaffState[] = [];
  private dog: NPC | null = null;
  private dogCooldown = 20;
  private dogBegTimer = 0;
  private fightCooldown = 0;
  private bumpWasClose = new Set<NPC>();

  // 強盜勒索事件
  private extortCooldown = 60;
  private extort: { bandit: NPC; student: StudentState; stage: 'WALK_IN' | 'WALK_OUT' | 'CORNERED'; timer: number } | null = null;

  // 鴿群 (InstancedMesh 單一繪製)
  private pigeons: THREE.InstancedMesh | null = null;
  private pigeonPos: THREE.Vector3[] = [];
  private pigeonVel: THREE.Vector3[] = [];
  private pigeonSpot = 0;
  private pigeonFlying = false;
  private pigeonFlyTimer = 0;
  private pigeonAnim = 0;

  constructor(private readonly ctx: GameContext) {}

  // ===== 初始化 (NPC 載入完成後第一次更新時建立) =====
  private init() {
    this.initialized = true;
    let personaIdx = 0;
    for (const npc of this.ctx.campusNPCs) {
      if (npc.role === 'STUDENT') {
        const st: StudentState = {
          npc,
          persona: PERSONA_ORDER[personaIdx++ % PERSONA_ORDER.length],
          activity: 'NONE',
          slot: null,
          group: null,
          poiCooldown: 6 + (personaIdx % 5) * 3,
          greetCooldown: 0,
          bumpCooldown: 0,
          reportCooldown: 0,
          dodgeCooldown: 0
        };
        this.students.push(st);
        this.studentByNpc.set(npc, st);
      } else if (npc.role === 'TEACHER' || npc.role === 'DISCIPLINE_CHIEF' || npc.role === 'INSTRUCTOR' || npc.role === 'INSPECTOR') {
        this.staff.push({ npc, eventCooldown: 15 + this.staff.length * 8, busy: false });
      } else if (npc.role === 'DOG') {
        this.dog = npc;
      }
    }

    // 小團體：1F 散步同學依序組成 3 / 2 / 2 人一組
    const casual = this.students.filter((s) => s.npc.movementStyle === 'CASUAL_WALK' && this.isGround(s.npc) && !s.npc.campusAnchor);
    const sizes = [3, 2, 2];
    let idx = 0;
    for (const size of sizes) {
      if (idx + size > casual.length) break;
      const members = casual.slice(idx, idx + size);
      idx += size;
      const group: StudentGroup = { members, chatting: false, chatLineIdx: this.groups.length * 3, chatTimer: 0, scatterCooldown: 0 };
      for (const m of members) m.group = group;
      this.groups.push(group);
    }

    this.buildPigeons();
  }

  private isGround(npc: NPC): boolean {
    return Math.abs(npc.baseFloorY) < 0.5;
  }

  // 切換世界或玩家死亡重生時收回所有活動
  public reset() {
    for (const st of this.students) this.endActivity(st);
    for (const sf of this.staff) {
      sf.npc.clearLifeTask();
      sf.busy = false;
    }
    if (this.dog) this.dog.clearLifeTask();
    this.dogBegTimer = 0;
    for (const g of this.groups) g.chatting = false;
    if (this.extort) {
      this.extort.bandit.clearLifeTask();
      this.extort = null;
    }
  }

  // ===== 每幀 (僅天天國中) =====
  public update(delta: number, playerPos: THREE.Vector3) {
    if (!this.initialized) this.init();
    this.updatePigeons(delta, playerPos);

    this.tickTimer += delta;
    if (this.tickTimer < EVENT_TICK) return;
    const dt = this.tickTimer;
    this.tickTimer = 0;

    if (this.fightCooldown > 0) this.fightCooldown -= dt;
    const wanted = this.ctx.wantedSystem.stars;
    const raining = this.ctx.weatherSystem.currentWeather === 'RAIN' || this.ctx.weatherSystem.currentWeather === 'THUNDERSTORM';

    // 1. 收回完成 / 被打斷的活動
    for (const st of this.students) {
      st.poiCooldown -= dt;
      st.greetCooldown -= dt;
      st.bumpCooldown -= dt;
      st.reportCooldown -= dt;
      st.dodgeCooldown -= dt;
      const npc = st.npc;
      if (this.extort && this.extort.student === st) continue; // 勒索事件中的同學由事件流程管理
      if (this.isBusyNpc(npc)) {
        if (st.activity !== 'NONE') this.endActivity(st);
        continue;
      }
      if (st.activity !== 'NONE' && (!npc.lifeTask || npc.lifeTask.phase === 'DONE')) {
        if (st.activity === 'POI') st.poiCooldown = 25 + (st.npc.position.x % 7 + 7) % 7 * 3;
        if (st.activity !== 'GROUP') this.endActivity(st);
        else {
          npc.clearLifeTask();
          st.activity = 'NONE';
        }
      }
    }
    for (const sf of this.staff) {
      sf.eventCooldown -= dt;
      if (sf.busy && (!sf.npc.lifeTask || sf.npc.lifeTask.phase === 'DONE' || this.isBusyNpc(sf.npc))) {
        sf.npc.clearLifeTask();
        sf.busy = false;
      }
    }

    // 2. 對玩家的反應
    this.updatePlayerReactions(playerPos, wanted);

    // 3. 角色專屬事件
    this.updateStaffEvents(wanted);
    this.updateDog(dt, playerPos, wanted, raining);
    this.updateExtortion(dt, playerPos, wanted);

    // 4. 小團體
    for (const g of this.groups) this.updateGroup(g, dt, raining);

    // 5. 地點活動
    if (!raining) {
      for (const st of this.students) {
        if (st.activity === 'NONE' && !st.group && !st.npc.campusAnchor && st.poiCooldown <= 0 && st.npc.isPaused && !st.npc.lifeTask) {
          this.tryAssignPoi(st);
        }
      }
    }
  }

  // 追捕中、倒地、被擊飛、聽廣播定格、暫離名單 (泳池小魚比賽中) 時不參與校園生活
  private isBusyNpc(npc: NPC): boolean {
    return npc.isChasing || npc.isKnockedDown || npc.isKnockedFlying || npc.isPermanentlyKnockedOut || npc.freezeTimer > 0 || npc.isOffstage;
  }

  private endActivity(st: StudentState) {
    st.npc.clearLifeTask();
    if (st.slot) {
      st.slot.occupant = null;
      st.slot = null;
    }
    st.activity = 'NONE';
  }

  private makeTask(
    x: number, z: number, opts: Partial<Omit<NPCLifeTask, 'target' | 'phase'>> = {}
  ): NPCLifeTask {
    return {
      target: new THREE.Vector3(x, 0, z),
      speedMul: opts.speedMul ?? 1.0,
      run: opts.run ?? false,
      arriveDist: opts.arriveDist ?? 0.6,
      hold: opts.hold ?? 'LOOK_AROUND',
      holdTime: opts.holdTime ?? 2.0,
      hasFace: opts.hasFace ?? false,
      faceX: opts.faceX ?? 0,
      faceZ: opts.faceZ ?? 0,
      sitBack: opts.sitBack ?? 0,
      bubble: opts.bubble ?? '',
      phase: 'GO'
    };
  }

  private assign(npc: NPC, task: NPCLifeTask) {
    task.target.y = npc.baseFloorY;
    npc.assignLifeTask(task);
  }

  // 直線路徑是否暢通 (NPC 無尋路，只指派直線可達的活動)
  private pathClear(fromX: number, fromZ: number, toX: number, toZ: number, y: number): boolean {
    const colliders: CollidableBox[] = this.ctx.activeColliders;
    const r = 0.5;
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (b.isFloorOnly) continue;
      if (b.max.y < y + 0.3 || b.min.y > y + 1.6) continue;
      const minX = b.min.x - r, maxX = b.max.x + r, minZ = b.min.z - r, maxZ = b.max.z + r;
      // 2D 線段與擴張 AABB 的 slab 相交
      let t0 = 0, t1 = 1;
      if (Math.abs(dx) < 1e-6) {
        if (fromX < minX || fromX > maxX) continue;
      } else {
        let a = (minX - fromX) / dx, c = (maxX - fromX) / dx;
        if (a > c) { const tmp = a; a = c; c = tmp; }
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-6) {
        if (fromZ < minZ || fromZ > maxZ) continue;
      } else {
        let a = (minZ - fromZ) / dz, c = (maxZ - fromZ) / dz;
        if (a > c) { const tmp = a; a = c; c = tmp; }
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        if (t0 > t1) continue;
      }
      return false;
    }
    return true;
  }

  // ===== 地點活動 =====
  private tryAssignPoi(st: StudentState) {
    const npc = st.npc;
    if (!this.isGround(npc)) return;
    let best: PoiSlot | null = null;
    let bestDist = 35 * 35;
    for (const slot of this.poiSlots) {
      if (slot.occupant) continue;
      const d = (slot.x - npc.position.x) ** 2 + (slot.z - npc.position.z) ** 2;
      if (d < bestDist && this.pathClear(npc.position.x, npc.position.z, slot.x, slot.z, npc.baseFloorY)) {
        best = slot;
        bestDist = d;
      }
    }
    if (!best) {
      st.poiCooldown = 15;
      return;
    }
    best.occupant = npc;
    st.slot = best;
    st.activity = 'POI';
    const line = best.lines[(this.students.indexOf(st) + Math.floor(npc.position.z)) % best.lines.length] ?? '';
    this.assign(npc, this.makeTask(best.x, best.z, {
      arriveDist: 0.45,
      hold: best.hold,
      holdTime: best.holdTime + (st.persona === 'GOOD' ? 0 : 2),
      hasFace: true,
      faceX: best.faceX,
      faceZ: best.faceZ,
      sitBack: best.sitBack,
      bubble: line
    }));
  }

  // ===== 小團體 =====
  private updateGroup(g: StudentGroup, dt: number, raining: boolean) {
    if (g.scatterCooldown > 0) g.scatterCooldown -= dt;
    const leaderSt = g.members[0];
    const leader = leaderSt.npc;
    if (this.isBusyNpc(leader) || leaderSt.activity === 'REACT' || leaderSt.activity === 'EVENT') {
      g.chatting = false;
      return;
    }

    // 老師 / 教官 / 糾察靠近：散開裝沒事
    if (g.chatting) {
      for (const sf of this.staff) {
        if (sf.npc.isChasing || !this.isGround(sf.npc)) continue;
        if (sf.npc.position.distanceToSquared(leader.position) < 81) {
          this.scatterGroup(g);
          return;
        }
      }
    }

    // 帶頭者停下駐足：全組圍圈聊天
    if (leader.isPaused && !leader.lifeTask && !raining && g.scatterCooldown <= 0) {
      if (!g.chatting) {
        g.chatting = true;
        leader.currentIdleBehavior = 'CHAT';
        leader.pauseTimer = Math.max(leader.pauseTimer, 8);
        g.chatTimer = 0.4;
      }
    } else if (!leader.isPaused) {
      g.chatting = false;
    }

    // 跟隨者
    const rotY = leader.rotationY;
    const fx = Math.sin(rotY), fz = Math.cos(rotY);
    const rx = Math.cos(rotY), rz = -Math.sin(rotY);
    for (let i = 1; i < g.members.length; i++) {
      const st = g.members[i];
      const npc = st.npc;
      if (this.isBusyNpc(npc) || st.activity === 'REACT' || st.activity === 'EVENT') continue;
      let tx: number, tz: number;
      if (g.chatting) {
        // 圍圈面向帶頭者
        const a = rotY + (i === 1 ? 2.2 : -2.2);
        tx = leader.position.x + Math.sin(a) * 1.3;
        tz = leader.position.z + Math.cos(a) * 1.3;
      } else {
        // 並肩同行 (左右兩側稍後方)
        const side = i === 1 ? 1.1 : -1.1;
        tx = leader.position.x + rx * side - fx * 0.4;
        tz = leader.position.z + rz * side - fz * 0.4;
      }
      const dist = Math.hypot(tx - npc.position.x, tz - npc.position.z);
      const task = npc.lifeTask;
      if (task && st.activity === 'GROUP' && task.phase === 'GO') {
        task.target.set(tx, npc.baseFloorY, tz);
        task.speedMul = dist > 4 ? 2.0 : (dist > 1.5 ? 1.35 : 1.0);
        task.run = dist > 4;
        task.hold = g.chatting ? 'CHAT' : 'LOOK_AROUND';
        task.holdTime = g.chatting ? Math.max(0.5, leader.pauseTimer) : 0.3;
        task.faceX = leader.position.x;
        task.faceZ = leader.position.z;
        task.hasFace = g.chatting;
      } else if (!task || task.phase === 'DONE') {
        // 跟隨者永遠持有活動 (避免走回自己的舊巡邏路線)
        st.activity = 'GROUP';
        this.assign(npc, this.makeTask(tx, tz, {
          arriveDist: g.chatting ? 0.5 : 0.25,
          speedMul: dist > 4 ? 2.0 : 1.2,
          run: dist > 4,
          hold: g.chatting ? 'CHAT' : 'LOOK_AROUND',
          holdTime: g.chatting ? Math.max(0.5, leader.pauseTimer) : 0.3,
          hasFace: g.chatting,
          faceX: leader.position.x,
          faceZ: leader.position.z
        }));
      }
    }

    // 聊天台詞輪流
    if (g.chatting) {
      g.chatTimer -= dt;
      if (g.chatTimer <= 0) {
        g.chatTimer = 2.4;
        const speaker = g.members[g.chatLineIdx % g.members.length].npc;
        const chat = this.ctx.progression.fencerDefeated ? GROUP_CHAT_LINES_AFTER : GROUP_CHAT_LINES;
        speaker.showSpeechBubble(`💬 ${chat[g.chatLineIdx % chat.length]}`, false, 2.2);
        g.chatLineIdx++;
      }
    }
  }

  private scatterGroup(g: StudentGroup) {
    g.chatting = false;
    g.scatterCooldown = 15;
    const leader = g.members[0].npc;
    leader.showSpeechBubble('😳 老師來了！', true, 1.8);
    if (leader.isPaused && !leader.lifeTask) leader.currentIdleBehavior = 'PHONE';
    for (let i = 1; i < g.members.length; i++) {
      const st = g.members[i];
      const npc = st.npc;
      if (this.isBusyNpc(npc)) continue;
      const a = leader.rotationY + (i === 1 ? 1.4 : -1.4);
      const tx = npc.position.x + Math.sin(a) * 2.5;
      const tz = npc.position.z + Math.cos(a) * 2.5;
      if (!this.pathClear(npc.position.x, npc.position.z, tx, tz, npc.baseFloorY)) continue;
      st.activity = 'GROUP';
      this.assign(npc, this.makeTask(tx, tz, { hold: 'PHONE', holdTime: 3.5, bubble: '(假裝滑手機)' }));
    }
  }

  // ===== 對玩家的反應 =====
  private updatePlayerReactions(playerPos: THREE.Vector3, wanted: number) {
    const { player, currentRidingBike, activeColliders } = this.ctx;
    const riding = currentRidingBike;
    const bikeSpeed = riding ? riding.speed : 0;
    const bikeFx = riding ? Math.sin(riding.rotationY) : 0;
    const bikeFz = riding ? Math.cos(riding.rotationY) : 0;

    for (const st of this.students) {
      const npc = st.npc;
      if (this.isBusyNpc(npc)) continue;
      const dx = npc.position.x - playerPos.x;
      const dz = npc.position.z - playerPos.z;
      const dy = Math.abs(npc.position.y - playerPos.y);
      const d2 = dx * dx + dz * dz;
      if (dy > 2.5 || d2 > 400) {
        this.bumpWasClose.delete(npc);
        continue;
      }

      // 閃避單車：在車頭前方 5m 內
      if (riding && bikeSpeed > 7 && st.dodgeCooldown <= 0 && st.activity !== 'REACT' && d2 < 25) {
        const ahead = dx * bikeFx + dz * bikeFz;
        if (ahead > 0) {
          const lateral = dx * bikeFz - dz * bikeFx; // >0 位於車頭左側
          const side = lateral >= 0 ? 1 : -1;
          const tx = npc.position.x + bikeFz * side * 2.6;
          const tz = npc.position.z - bikeFx * side * 2.6;
          st.dodgeCooldown = 4;
          npc.showSpeechBubble(DODGE_LINES[st.persona], st.persona === 'TIMID', 1.6);
          if (this.pathClear(npc.position.x, npc.position.z, tx, tz, npc.baseFloorY)) {
            this.startReact(st, this.makeTask(tx, tz, { speedMul: 2.4, run: true, arriveDist: 0.4, hold: 'LOOK_AROUND', holdTime: 1.0 }));
          }
          continue;
        }
      }

      // 被玩家撞到 (步行貼身)
      const close = d2 < 0.9 * 0.9 && !riding;
      if (close && !this.bumpWasClose.has(npc) && player.isMoving && st.bumpCooldown <= 0) {
        st.bumpCooldown = 6;
        npc.showSpeechBubble(BUMP_LINES[st.persona], false, 1.8);
        if (npc.isPaused) npc.faceTowards(playerPos.x, playerPos.z);
      }
      if (close) this.bumpWasClose.add(npc);
      else this.bumpWasClose.delete(npc);

      // 通緝中：看見玩家的同學大喊並引老師過來
      if (wanted > 0 && st.reportCooldown <= 0 && d2 < 196 && npc.canSeePlayer(playerPos, activeColliders)) {
        st.reportCooldown = 10;
        if (st.persona === 'TIMID') {
          npc.showSpeechBubble('(假裝沒看到…)', false, 1.8);
        } else {
          npc.showSpeechBubble(st.persona === 'PRANK' ? '老師！他在這裡啦～' : '📢 他在這裡！', true, 2.0);
          this.summonStaff(playerPos, npc.position);
        }
        continue;
      }

      // 打招呼
      if (wanted === 0 && !riding && st.greetCooldown <= 0 && d2 < 9) {
        st.greetCooldown = 30;
        npc.showSpeechBubble(GREET_LINES[st.persona], false, 2.0);
        if (npc.isPaused) npc.faceTowards(playerPos.x, playerPos.z);
      }
    }
  }

  private startReact(st: StudentState, task: NPCLifeTask) {
    if (st.slot) {
      st.slot.occupant = null;
      st.slot = null;
    }
    st.activity = 'REACT';
    this.assign(st.npc, task);
  }

  // 呼叫最近的師長 (未追捕中) 前往指定地點查看；抵達後若看見通緝中的玩家即會自行追捕
  private summonStaff(target: THREE.Vector3, from: THREE.Vector3) {
    let best: StaffState | null = null;
    let bestD = 45 * 45;
    for (const sf of this.staff) {
      const n = sf.npc;
      if (sf.busy || this.isBusyNpc(n) || !this.isGround(n)) continue;
      const d = n.position.distanceToSquared(from);
      if (d < bestD && this.pathClear(n.position.x, n.position.z, target.x, target.z, n.baseFloorY)) {
        best = sf;
        bestD = d;
      }
    }
    if (!best) return;
    best.busy = true;
    this.assign(best.npc, this.makeTask(target.x, target.z, {
      speedMul: 1.8, run: true, arriveDist: 2.0, hold: 'LOOK_AROUND', holdTime: 2.5, bubble: '誰在鬧事？！'
    }));
  }

  // 玩家在校園中打人 (CombatSystem 命中 NPC 時呼叫)
  public onFight(victim: NPC) {
    if (this.ctx.currentWorldType !== 'CAMPUS') return;
    if (this.extort && victim === this.extort.bandit) this.resolveExtortion(true);
    if (this.fightCooldown > 0) return;
    this.fightCooldown = 3;
    const fp = victim.position;
    let goodCalled = false;
    for (const st of this.students) {
      const npc = st.npc;
      if (npc === victim || this.isBusyNpc(npc) || st.activity === 'EVENT') continue;
      if (Math.abs(npc.position.y - fp.y) > 2.5) continue;
      const dx = npc.position.x - fp.x;
      const dz = npc.position.z - fp.z;
      const d = Math.hypot(dx, dz);
      if (d > 16 || d < 0.01) continue;
      const ux = dx / d, uz = dz / d;
      const lines = FIGHT_LINES[st.persona];
      const line = lines[(this.students.indexOf(st)) % lines.length];
      let tx: number, tz: number;
      let task: NPCLifeTask;
      if (st.persona === 'TIMID') {
        tx = npc.position.x + ux * 10;
        tz = npc.position.z + uz * 10;
        npc.showSpeechBubble('哇啊啊！', true, 1.4);
        task = this.makeTask(tx, tz, { speedMul: 2.3, run: true, hold: 'COWER', holdTime: 3, bubble: line, hasFace: true, faceX: fp.x, faceZ: fp.z });
      } else if (st.persona === 'NOSY') {
        tx = fp.x + ux * 5;
        tz = fp.z + uz * 5;
        task = this.makeTask(tx, tz, { speedMul: 1.9, run: true, hold: 'FILM', holdTime: 6, bubble: line, hasFace: true, faceX: fp.x, faceZ: fp.z });
      } else if (st.persona === 'PRANK') {
        tx = fp.x + ux * 3.5;
        tz = fp.z + uz * 3.5;
        task = this.makeTask(tx, tz, { speedMul: 1.9, run: true, hold: 'CHEER', holdTime: 5, bubble: line, hasFace: true, faceX: fp.x, faceZ: fp.z });
      } else {
        // 乖寶寶：喊老師並退開
        tx = npc.position.x + ux * 4;
        tz = npc.position.z + uz * 4;
        npc.showSpeechBubble(line, true, 1.8);
        if (!goodCalled) {
          goodCalled = true;
          this.summonStaff(fp, npc.position);
        }
        task = this.makeTask(tx, tz, { speedMul: 1.6, run: true, hold: 'LOOK_AROUND', holdTime: 4, hasFace: true, faceX: fp.x, faceZ: fp.z });
      }
      if (!this.pathClear(npc.position.x, npc.position.z, tx, tz, npc.baseFloorY)) {
        // 走不過去：原地轉頭看 (仍有對應台詞)
        npc.faceTowards(fp.x, fp.z);
        if (st.persona !== 'GOOD' && st.persona !== 'TIMID') npc.showSpeechBubble(line, false, 2.0);
        continue;
      }
      this.startReact(st, task);
    }
  }

  // ===== 角色專屬事件：巡堂老師攔快走同學、主任教官檢查服儀、糾察站崗校門 =====
  private updateStaffEvents(wanted: number) {
    if (wanted > 0) return;
    for (const sf of this.staff) {
      const n = sf.npc;
      if (sf.busy || sf.eventCooldown > 0 || this.isBusyNpc(n) || !this.isGround(n) || n.lifeTask) continue;

      if (n.role === 'INSPECTOR') {
        // 糾察 (一次一人) 前往校門內側站崗
        if (this.staff.some((o) => o !== sf && o.busy && o.npc.role === 'INSPECTOR')) continue;
        const gx = sf === this.staff.find((o) => o.npc.role === 'INSPECTOR') ? -2.5 : 5.5;
        sf.eventCooldown = 70;
        if (!this.pathClear(n.position.x, n.position.z, gx, 101, 0)) continue;
        sf.busy = true;
        this.assign(n, this.makeTask(gx, 101, {
          speedMul: 1.2, hold: 'HANDS_BEHIND_BACK', holdTime: 14, hasFace: true, faceX: gx, faceZ: 110,
          bubble: '進出校門請出示學生證！'
        }));
        continue;
      }

      // 巡堂老師 / 生教組長：攔下快走的同學；主任教官：攔下任何同學檢查服儀
      const isTeacher = n.role === 'TEACHER' || n.role === 'DISCIPLINE_CHIEF';
      const range2 = isTeacher ? 144 : 64;
      let target: StudentState | null = null;
      for (const st of this.students) {
        if (st.activity !== 'NONE' && st.activity !== 'POI') continue;
        if (st.npc.campusAnchor) continue;
        if (st.group && st.activity === 'NONE' && st !== st.group.members[0]) continue;
        if (this.isBusyNpc(st.npc) || !this.isGround(st.npc)) continue;
        if (isTeacher && st.npc.movementStyle !== 'HURRIED_WALK') continue;
        if (st.npc.position.distanceToSquared(n.position) > range2) continue;
        if (!this.pathClear(n.position.x, n.position.z, st.npc.position.x, st.npc.position.z, 0)) continue;
        target = st;
        break;
      }
      if (!target) {
        sf.eventCooldown = 2;
        continue;
      }
      sf.eventCooldown = isTeacher ? 40 : 45;
      sf.busy = true;
      if (target.slot) {
        target.slot.occupant = null;
        target.slot = null;
      }
      const sp = target.npc.position;
      // 被叫住的同學原地低頭挨罵
      target.activity = 'EVENT';
      this.assign(target.npc, this.makeTask(sp.x, sp.z, {
        arriveDist: 5, hold: 'WASH', holdTime: 6, hasFace: true, faceX: n.position.x, faceZ: n.position.z,
        bubble: isTeacher ? '是…對不起…' : '是！馬上紮好！'
      }));
      n.showSpeechBubble(isTeacher ? '站住！走廊不准奔跑！' : '那位同學站住！制服紮好！', true, 2.2);
      soundManager.playWhistle(n.position);
      // 師長走到同學面前訓話
      const ux = n.position.x - sp.x, uz = n.position.z - sp.z;
      const ul = Math.hypot(ux, uz) || 1;
      this.assign(n, this.makeTask(sp.x + (ux / ul) * 1.4, sp.z + (uz / ul) * 1.4, {
        speedMul: 1.5, arriveDist: 0.5, hold: 'SCOLD', holdTime: 5, hasFace: true, faceX: sp.x, faceZ: sp.z,
        bubble: isTeacher ? '下次再讓我看到就記警告！' : '服裝儀容是基本禮貌！'
      }));
    }
  }

  // ===== 柴柴：追鴿子、跟著剛買熱食的玩家討食 =====
  public onPlayerAte() {
    if (this.ctx.currentWorldType !== 'CAMPUS') return;
    this.dogBegTimer = 15;
  }

  private updateDog(dt: number, playerPos: THREE.Vector3, wanted: number, raining: boolean) {
    const dog = this.dog;
    if (!dog) return;
    if (this.dogCooldown > 0) this.dogCooldown -= dt;
    if (this.isBusyNpc(dog) || wanted > 0 || raining) {
      if (dog.lifeTask && !dog.isChasing) dog.clearLifeTask();
      this.dogBegTimer = 0;
      return;
    }
    if (dog.lifeTask && dog.lifeTask.phase === 'DONE') dog.clearLifeTask();

    // 討食：持續跟在玩家身旁坐下盯著食物
    if (this.dogBegTimer > 0) {
      this.dogBegTimer -= dt;
      const d = dog.position.distanceTo(playerPos);
      if (this.dogBegTimer <= 0 || d > 60 || Math.abs(dog.position.y - playerPos.y) > 1.5) {
        dog.clearLifeTask();
        this.dogBegTimer = 0;
        return;
      }
      _tmpV.subVectors(dog.position, playerPos).setY(0);
      if (_tmpV.lengthSq() < 0.01) _tmpV.set(1, 0, 0);
      _tmpV.normalize().multiplyScalar(1.4).add(playerPos);
      if (!dog.lifeTask) {
        this.assign(dog, this.makeTask(_tmpV.x, _tmpV.z, {
          speedMul: 2.2, run: true, arriveDist: 0.6, hold: 'DOG_SIT', holdTime: 1.2, hasFace: true,
          faceX: playerPos.x, faceZ: playerPos.z, bubble: d > 6 ? '🐾 汪！(聞到香味了)' : ''
        }));
      } else if (dog.lifeTask.phase === 'GO') {
        dog.lifeTask.target.set(_tmpV.x, dog.baseFloorY, _tmpV.z);
        dog.lifeTask.faceX = playerPos.x;
        dog.lifeTask.faceZ = playerPos.z;
      }
      return;
    }

    // 追鴿子 (鴿群停在地面且距離 30m 內)
    if (!dog.lifeTask && this.dogCooldown <= 0 && !this.pigeonFlying) {
      const [sx, sz] = PIGEON_SPOTS[this.pigeonSpot];
      const d2 = (dog.position.x - sx) ** 2 + (dog.position.z - sz) ** 2;
      if (d2 < 900 && this.pathClear(dog.position.x, dog.position.z, sx, sz, dog.baseFloorY)) {
        this.dogCooldown = 50;
        dog.showSpeechBubble('🐾 汪汪汪！(發現鴿子)', true, 1.6);
        soundManager.playDogBark(dog.position);
        this.assign(dog, this.makeTask(sx, sz, {
          speedMul: 2.4, run: true, arriveDist: 1.5, hold: 'DOG_SNIFF', holdTime: 2.5, bubble: '🐾 嗚…飛走了'
        }));
      } else {
        this.dogCooldown = 10;
      }
    }
  }

  // ===== 強盜勒索同學 (校門外)：玩家出手打強盜即可解救 =====
  private updateExtortion(dt: number, playerPos: THREE.Vector3, wanted: number) {
    const ev = this.extort;
    if (!ev) {
      if (this.extortCooldown > 0) {
        this.extortCooldown -= dt;
        return;
      }
      this.extortCooldown = 30;
      if (wanted > 0) return;
      // 找一名可直線走到校門內側的 1F 同學，以及一名閒置的校門外強盜
      const bandit = this.ctx.campusNPCs.find((n) => n.role === 'BANDIT' && !this.isBusyNpc(n) && n.position.z > 110 && Math.abs(n.position.x) < 60);
      if (!bandit) return;
      const st = this.students.find((s) => s.activity === 'NONE' && !s.group && !s.npc.campusAnchor && this.isGround(s.npc) && !this.isBusyNpc(s.npc)
        && s.npc.position.distanceToSquared(GATE_INNER) < 70 * 70
        && this.pathClear(s.npc.position.x, s.npc.position.z, GATE_INNER.x, GATE_INNER.z, 0));
      if (!st) return;
      this.extortCooldown = 120;
      st.activity = 'EVENT';
      this.assign(st.npc, this.makeTask(GATE_INNER.x, GATE_INNER.z, { arriveDist: 0.8, hold: 'LOOK_AROUND', holdTime: 0.2 }));
      this.extort = { bandit, student: st, stage: 'WALK_IN', timer: 40 };
      return;
    }

    ev.timer -= dt;
    const sn = ev.student.npc;
    if (ev.timer <= 0 || this.isBusyNpc(sn) || ev.bandit.isKnockedDown || ev.bandit.isPermanentlyKnockedOut) {
      this.resolveExtortion(ev.bandit.isKnockedDown && ev.stage === 'CORNERED');
      return;
    }
    // 強盜轉而追捕校外的玩家時事件暫停 (同學持續抱頭)，需實際攻擊強盜才算解救
    if (ev.bandit.isChasing) return;

    if (ev.stage === 'WALK_IN' && sn.lifeTask && sn.lifeTask.phase !== 'GO') {
      ev.stage = 'WALK_OUT';
      this.assign(sn, this.makeTask(GATE_OUTER.x, GATE_OUTER.z, { arriveDist: 0.6, hold: 'COWER', holdTime: 30, hasFace: true, faceX: BANDIT_SPOT.x, faceZ: BANDIT_SPOT.z, bubble: '救、救命啊！' }));
      this.assign(ev.bandit, this.makeTask(BANDIT_SPOT.x, BANDIT_SPOT.z, {
        speedMul: 1.6, run: true, arriveDist: 0.6, hold: 'SCOLD', holdTime: 30, hasFace: true, faceX: GATE_OUTER.x, faceZ: GATE_OUTER.z,
        bubble: '小子，把午餐錢交出來！'
      }));
    } else if (ev.stage === 'WALK_IN' && (!sn.lifeTask || sn.lifeTask.phase === 'DONE')) {
      this.resolveExtortion(false, true);
    } else if (ev.stage === 'WALK_OUT' && sn.lifeTask?.phase === 'HOLD' && ev.bandit.lifeTask?.phase === 'HOLD') {
      ev.stage = 'CORNERED';
      ev.timer = 25;
      if (playerPos.distanceToSquared(GATE_OUTER) < 90 * 90) {
        this.ctx.wantedSystem.showBanner('📢 校門口有同學被校外強盜勒索！快去幫忙 (攻擊強盜)！', 3500);
      }
    }
  }

  // 結束勒索事件：rescued = 玩家出手解救；silent = 事件未成形直接取消
  private resolveExtortion(rescued: boolean, silent = false) {
    const ev = this.extort;
    if (!ev) return;
    this.extort = null;
    const sn = ev.student.npc;
    if (!silent && ev.stage === 'CORNERED') {
      if (rescued) {
        sn.showSpeechBubble('謝謝你！你是英雄！', true, 2.6);
        this.ctx.progression.addCash(80);
        this.ctx.wantedSystem.showBanner('🦸 見義勇為！救下被勒索的同學，獲得謝禮 +$80！', 3500);
      } else {
        sn.showSpeechBubble('嗚嗚…午餐錢被搶走了…', false, 2.6);
        ev.bandit.showSpeechBubble('嘿嘿，謝啦～', false, 2.0);
      }
    }
    if (!ev.bandit.isChasing) ev.bandit.clearLifeTask();
    // 已走出校門的同學先沿原路走回校門內側，再恢復巡邏路線 (直線移動無尋路)
    if (sn.position.z > 104 && !this.isBusyNpc(sn)) {
      ev.student.activity = 'EVENT';
      this.assign(sn, this.makeTask(GATE_INNER.x, GATE_INNER.z, { arriveDist: 0.8, hold: 'LOOK_AROUND', holdTime: 0.5 }));
    } else {
      this.endActivity(ev.student);
    }
  }

  // ===== 鴿群 =====
  private buildPigeons() {
    const body = new THREE.BoxGeometry(0.22, 0.16, 0.34);
    body.translate(0, 0.12, 0);
    const head = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    head.translate(0, 0.25, 0.17);
    // 合併頭與身體 (同材質，單一繪製)
    const geo = mergeGeometries([body, head]);
    const mat = new THREE.MeshLambertMaterial({ color: 0x8e9aaf });
    this.pigeons = new THREE.InstancedMesh(geo, mat, PIGEON_COUNT);
    this.pigeons.castShadow = false;
    this.pigeons.frustumCulled = false;
    const [sx, sz] = PIGEON_SPOTS[0];
    for (let i = 0; i < PIGEON_COUNT; i++) {
      const a = (i / PIGEON_COUNT) * Math.PI * 2;
      this.pigeonPos.push(new THREE.Vector3(sx + Math.cos(a) * 1.2, 0, sz + Math.sin(a) * 1.2));
      this.pigeonVel.push(new THREE.Vector3());
    }
    this.ctx.world.group.add(this.pigeons);
    this.syncPigeons();
  }

  private syncPigeons() {
    if (!this.pigeons) return;
    for (let i = 0; i < PIGEON_COUNT; i++) {
      const p = this.pigeonPos[i];
      _dummy.position.copy(p);
      const v = this.pigeonVel[i];
      _dummy.rotation.set(0, this.pigeonFlying ? Math.atan2(v.x, v.z) : i * 1.3 + Math.sin(this.pigeonAnim * 0.7 + i) * 0.6, 0);
      // 地面啄食：身體上下點頭
      const peck = this.pigeonFlying ? 0 : Math.max(0, Math.sin(this.pigeonAnim * 4 + i * 1.7)) * 0.25;
      _dummy.rotation.x = peck;
      _dummy.updateMatrix();
      this.pigeons.setMatrixAt(i, _dummy.matrix);
    }
    this.pigeons.instanceMatrix.needsUpdate = true;
  }

  private updatePigeons(delta: number, playerPos: THREE.Vector3) {
    if (!this.pigeons) return;
    this.pigeonAnim += delta;
    if (!this.pigeonFlying) {
      // 玩家或柴柴靠近即驚飛
      const [sx, sz] = PIGEON_SPOTS[this.pigeonSpot];
      const near = (x: number, z: number) => (x - sx) ** 2 + (z - sz) ** 2 < PIGEON_FLEE_DIST * PIGEON_FLEE_DIST;
      const dogNear = this.dog && !this.dog.isKnockedDown && near(this.dog.position.x, this.dog.position.z);
      if ((Math.abs(playerPos.y) < 2 && near(playerPos.x, playerPos.z)) || dogNear) {
        this.pigeonFlying = true;
        this.pigeonFlyTimer = 0;
        this.pigeonSpot = (this.pigeonSpot + 1) % PIGEON_SPOTS.length;
        soundManager.playDodge(false, { x: sx, y: 0, z: sz });
      }
    } else {
      this.pigeonFlyTimer += delta;
      const [tx, tz] = PIGEON_SPOTS[this.pigeonSpot];
      let landed = 0;
      for (let i = 0; i < PIGEON_COUNT; i++) {
        const p = this.pigeonPos[i];
        const a = (i / PIGEON_COUNT) * Math.PI * 2;
        const gx = tx + Math.cos(a) * 1.2;
        const gz = tz + Math.sin(a) * 1.2;
        const dx = gx - p.x, dz = gz - p.z;
        const dist = Math.hypot(dx, dz);
        // 先爬升至 6m 巡航，接近目的地再降落
        const cruiseY = dist > 3 ? 6 + Math.sin(this.pigeonFlyTimer * 3 + i) * 0.4 : 0;
        const v = this.pigeonVel[i];
        v.set(dist > 0.05 ? (dx / dist) * Math.min(9, dist * 3) : 0, 0, dist > 0.05 ? (dz / dist) * Math.min(9, dist * 3) : 0);
        p.x += v.x * delta;
        p.z += v.z * delta;
        p.y += (cruiseY - p.y) * Math.min(1, delta * 3);
        if (dist < 0.1 && p.y < 0.05) {
          p.y = 0;
          landed++;
        }
      }
      if (landed === PIGEON_COUNT || this.pigeonFlyTimer > 12) {
        this.pigeonFlying = false;
        for (const p of this.pigeonPos) p.y = 0;
      }
    }
    this.syncPigeons();
  }
}
