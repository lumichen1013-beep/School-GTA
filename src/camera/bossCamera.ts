// 花劍客 Boss 戰鏡頭 (只在 FIGHT 階段啟用)：純函式與小型狀態機，零配置、可單元測試。
// 設計原則「固定遠景為主、動態只做小幅慢速」：
// - 基準：依裝置 (桌機 / 手機橫屏 / 直屏) 固定距離、俯角、FOV，看清結界大半；FOV 戰鬥中不做動態。
// - 動態 (可在設定切成「固定」)：只在大事件拉遠 —— S3/S4 預警 +20%、S5 預警 / 與 Boss 拉開 +15%；
//   臨界阻尼彈簧過渡 (單次 ≥ 0.8s)，觸發後至少維持 2s 才回復 (遲滯)。手動縮放後 5s 內不自動變化。
// - 雙目標 soft lock：Boss 落在畫面內圈以外才以低增益轉向，角速度上限 60°/s；手動轉鏡頭後 3s 內不介入。

export interface BossCamProfile {
  distance: number; // 鏡頭到焦點 (角色頭部) 距離 m
  pitch: number;    // 俯角 rad
  fov: number;      // 垂直 FOV 度
  lookAhead: number; // 視線焦點沿鏡頭前方推移 m (玩家落在畫面中下，前方戰場多入鏡)
}

/** 桌機 (橫屏、非觸控) */
export const BOSS_CAM_DESKTOP: Readonly<BossCamProfile> = { distance: 12, pitch: 0.8, fov: 70, lookAhead: 3.5 };
/** 手機橫屏 (觸控、aspect ≥ 1)：畫面小，略近一點保留角色辨識度，俯角稍大 */
export const BOSS_CAM_MOBILE_LANDSCAPE: Readonly<BossCamProfile> = { distance: 11.5, pitch: 0.82, fov: 68, lookAhead: 3.2 };
/** 直屏 (portraitFactor = 1)：水平視野窄 → 更遠更高 */
export const BOSS_CAM_PORTRAIT: Readonly<BossCamProfile> = { distance: 15, pitch: 0.88, fov: 78, lookAhead: 4.5 };

/** 依直屏係數 (0~1) 與是否觸控取得基準 (寫入 out) */
export function bossCamProfile(portrait: number, isTouch: boolean, out: BossCamProfile): BossCamProfile {
  const a = isTouch ? BOSS_CAM_MOBILE_LANDSCAPE : BOSS_CAM_DESKTOP;
  const b = BOSS_CAM_PORTRAIT;
  const t = portrait < 0 ? 0 : portrait > 1 ? 1 : portrait;
  out.distance = a.distance + (b.distance - a.distance) * t;
  out.pitch = a.pitch + (b.pitch - a.pitch) * t;
  out.fov = a.fov + (b.fov - a.fov) * t;
  out.lookAhead = a.lookAhead + (b.lookAhead - a.lookAhead) * t;
  return out;
}

// ===== 動態拉遠 (小幅、慢速、遲滯) =====

export const BOOST_WARN_BIG = 0.2;   // S3 / S4 全場招預警
export const BOOST_WARN = 0.15;      // S5 夾擊預警
export const BOOST_FAR = 0.15;       // 與 Boss 拉開
export const FAR_ON = 10;            // 距離 > 10m 啟動拉遠
export const FAR_OFF = 8;            // 距離 < 8m 才解除 (門檻遲滯)
export const BOOST_HOLD = 2;         // 觸發後至少維持秒數
export const BOOST_OMEGA = 4;        // 臨界阻尼角頻率 (步階 90% ≈ 0.97s)
export const MANUAL_ZOOM_PRIORITY = 5; // 手動縮放後自動變化暫停秒數
/** 手動縮放檔位 (乘在基準距離上)，預設索引 1 */
export const MANUAL_ZOOM_LEVELS: readonly number[] = [0.85, 1, 1.15];

export type BossAttackKind = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | null;

/** 戰況 → 想要的拉遠比例 (far 為門檻遲滯後的拉開狀態) */
export function wantedBoost(attack: BossAttackKind, far: boolean): number {
  let w = far ? BOOST_FAR : 0;
  if (attack === 'S3' || attack === 'S4') w = Math.max(w, BOOST_WARN_BIG);
  else if (attack === 'S5') w = Math.max(w, BOOST_WARN);
  return w;
}

/** 拉開判定 (門檻遲滯) */
export function updateFar(far: boolean, dist: number): boolean {
  return far ? dist > FAR_OFF : dist > FAR_ON;
}

export class BossZoomDirector {
  public boost = 0;      // 目前平滑後的拉遠比例
  public vel = 0;
  public target = 0;     // 遲滯後的目標
  private hold = 0;
  public far = false;
  public manualTimer = 0;

  public reset() {
    this.boost = 0;
    this.vel = 0;
    this.target = 0;
    this.hold = 0;
    this.far = false;
    this.manualTimer = 0;
  }

  /** 手動縮放：暫停自動變化一段時間 (並把自動部分收回 0) */
  public onManualZoom() {
    this.manualTimer = MANUAL_ZOOM_PRIORITY;
  }

  /** dynamic=false (固定模式) 時目標恆為 0；回傳平滑後 boost */
  public update(dt: number, attack: BossAttackKind, dist: number, dynamic: boolean): number {
    this.far = updateFar(this.far, dist);
    if (this.manualTimer > 0) this.manualTimer = Math.max(0, this.manualTimer - dt);
    const want = dynamic && this.manualTimer <= 0 ? wantedBoost(attack, this.far) : 0;
    if (want >= this.target - 1e-6) {
      if (want > this.target + 1e-6 || want > 0) this.hold = BOOST_HOLD;
      this.target = want;
    } else {
      this.hold -= dt;
      // 手動縮放 / 固定模式立即解除 (不必等遲滯)，其餘等滿 2s
      if (this.hold <= 0 || !dynamic || this.manualTimer > 0) {
        this.target = want;
        this.hold = 0;
      }
    }
    // 臨界阻尼彈簧 (半隱式歐拉，子步長 ≤ 1/60 s)
    let rem = Math.min(dt, 0.1);
    const w = BOOST_OMEGA;
    while (rem > 1e-6) {
      const h = Math.min(rem, 1 / 60);
      const acc = w * w * (this.target - this.boost) - 2 * w * this.vel;
      this.vel += acc * h;
      this.boost += this.vel * h;
      rem -= h;
    }
    return this.boost;
  }
}

// ===== 雙目標 soft lock =====

export const SOFTLOCK_MAX_RATE = Math.PI / 3; // 60°/s
export const SOFTLOCK_GAIN = 1.2;             // 超出內圈的角度 × 增益 = 想要角速度
export const SOFTLOCK_ACCEL = 3;              // 角速度平滑 (每秒)
export const SOFTLOCK_INNER = 0.55;           // 內圈 = 水平半視角 × 0.55
export const SOFTLOCK_MIN_DIST = 2.5;         // Boss 與玩家距離 < 2.5m 不介入 (近身時角度不穩)
export const SOFTLOCK_FULL_DIST = 5;          // 5m 以上全權重
export const MANUAL_ROTATE_PRIORITY = 3;      // 手動轉鏡頭後 soft lock 暫停秒數

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** 從 (fromX, fromZ) 看向 (toX, toZ) 所需的鏡頭 yaw (本專案鏡頭位於焦點 + (sin yaw, cos yaw)·d，視線為其反方向) */
export function yawToward(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

export class SoftLock {
  public angVel = 0;

  public reset() {
    this.angVel = 0;
  }

  /**
   * 回傳新 yaw。camX/Z 為目前鏡頭位置 (判斷 Boss 是否在畫面內圈)，halfHFov 為水平半視角 (rad)，
   * weight 0~1 (手動優先、瞄準時給 0)。
   */
  public step(
    yaw: number, dt: number,
    camX: number, camZ: number, bossX: number, bossZ: number,
    playerBossDist: number, halfHFov: number, weight: number
  ): number {
    let want = 0;
    if (weight > 0 && dt > 0) {
      const err = wrap(yawToward(camX, camZ, bossX, bossZ) - yaw);
      const inner = halfHFov * SOFTLOCK_INNER;
      const excess = Math.abs(err) - inner;
      if (excess > 0) {
        const d = (playerBossDist - SOFTLOCK_MIN_DIST) / (SOFTLOCK_FULL_DIST - SOFTLOCK_MIN_DIST);
        const k = d <= 0 ? 0 : d >= 1 ? 1 : d * d * (3 - 2 * d);
        // 正後方附近 (|err| > 170°) 沿用目前轉向，避免左右翻轉
        let sign = Math.sign(err);
        if (Math.abs(err) > 2.967 && this.angVel !== 0) sign = Math.sign(this.angVel);
        want = sign * Math.min(SOFTLOCK_MAX_RATE, excess * SOFTLOCK_GAIN) * k * weight;
      }
    }
    this.angVel += (want - this.angVel) * Math.min(1, dt * SOFTLOCK_ACCEL);
    if (Math.abs(this.angVel) > SOFTLOCK_MAX_RATE) this.angVel = Math.sign(this.angVel) * SOFTLOCK_MAX_RATE;
    if (Math.abs(this.angVel) < 1e-4 && want === 0) this.angVel = 0;
    return yaw + this.angVel * dt;
  }
}

// ===== 結界邊界：靠牆時水平往內收、抬高維持總距離 =====

export const ARENA_FIT_MAX_PITCH = 1.2; // 抬高上限 (約 69°)
export const ARENA_FIT_MAX_LIFT = 1.4;  // 抬高後高度不超過原高度 × 1.4 (其餘距離直接內收，避免貼牆時鏡頭過高、角色過小)

/**
 * 焦點 (fx, fz)、鏡頭水平方向 (dx, dz) 單位向量、理想水平距 hd 與高度差 h；
 * 機位超出圓 (cx, cz, r) 時把水平距縮到圓上，並抬高盡量維持總距離 (俯角上限 ARENA_FIT_MAX_PITCH、高度上限原高 × ARENA_FIT_MAX_LIFT)。結果寫入 out。
 */
export function arenaFit(
  fx: number, fz: number, dx: number, dz: number, hd: number, h: number,
  cx: number, cz: number, r: number, out: { hd: number; h: number }
): { hd: number; h: number } {
  out.hd = hd;
  out.h = h;
  const ox = fx - cx;
  const oz = fz - cz;
  const b = ox * dx + oz * dz;
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - c;
  const maxHd = disc <= 0 ? 0 : Math.max(0, -b + Math.sqrt(disc));
  if (hd <= maxHd) return out;
  const total = Math.sqrt(hd * hd + h * h);
  out.hd = maxHd;
  const hMax = Math.min(total * Math.sin(ARENA_FIT_MAX_PITCH), h * ARENA_FIT_MAX_LIFT);
  out.h = Math.min(hMax, Math.sqrt(Math.max(0, total * total - maxHd * maxHd)));
  if (out.h < h) out.h = h;
  return out;
}

/** 結界牆頂高 (與 BossArena WALL_H 一致) */
export const ARENA_WALL_TOP = 10;

/**
 * 鏡頭高度上限：鏡頭水平離圓心 cr、邊界半徑 r。靠牆時壓在牆頂下 0.5m (不越過近側牆頂看到牆外)，
 * 每往內 1m 放寬 1m (遠側牆遠，越過牆頂只看到霧中遠景)。
 */
export function arenaHeightCap(cr: number, r: number): number {
  return ARENA_WALL_TOP - 0.5 + Math.max(0, r - cr);
}

// ===== Boss 遮擋：抬高俯角越過 Boss 頭頂 (取代遠景時「拉到 Boss 前」的大幅跳近) =====

/**
 * 鏡頭沿 yaw 方向、俯角 pitch 自焦點 (高 fy) 出發的射線若在 Boss 圓柱 (半徑 r、頂高 top) 內低於頂高，
 * 回傳越過頂部 (+0.3m) 所需俯角；不遮擋回傳 pitch。
 */
export function pitchToClear(
  fx: number, fy: number, fz: number, yaw: number, pitch: number,
  ox: number, oz: number, r: number, top: number, maxPitch: number
): number {
  const ux = Math.sin(yaw);
  const uz = Math.cos(yaw);
  const along = (ox - fx) * ux + (oz - fz) * uz;
  if (along <= 0) return pitch;
  const lx = fx + ux * along - ox;
  const lz = fz + uz * along - oz;
  const lat2 = lx * lx + lz * lz;
  if (lat2 >= r * r) return pitch;
  const near = Math.max(0.2, along - Math.sqrt(r * r - lat2));
  const need = Math.atan2(top + 0.3 - fy, near);
  return need > pitch ? Math.min(maxPitch, need) : pitch;
}

// ===== 畫外方向箭頭 =====

export interface OffscreenArrow {
  visible: boolean;
  x: number;     // 箭頭位置 (NDC -1~1，已內縮到邊緣)
  y: number;
  angle: number; // 指向角 (rad，0 = 右，逆時針為正；螢幕座標 y 向上)
}

/**
 * Boss 投影後 NDC (ndcX, ndcY) 與是否在鏡頭後方 (behind)；margin 為 NDC 內縮 (箭頭貼邊位置)。
 * 在畫面內 (含 inset 容差) 時不顯示。
 */
export function offscreenArrow(ndcX: number, ndcY: number, behind: boolean, margin: number, out: OffscreenArrow): OffscreenArrow {
  let x = ndcX;
  let y = ndcY;
  if (behind) {
    // 鏡頭後方：投影會鏡像，取反並推到下緣 (Boss 在身後 → 箭頭朝下)
    x = -x;
    y = -Math.abs(y) - 1;
  }
  if (!behind && x >= -1 && x <= 1 && y >= -1 && y <= 1) {
    out.visible = false;
    return out;
  }
  if (x === 0 && y === 0) y = -1;
  const lim = 1 - margin;
  const s = lim / Math.max(Math.abs(x), Math.abs(y));
  out.visible = true;
  out.x = x * s;
  out.y = y * s;
  out.angle = Math.atan2(y, x);
  return out;
}
