import type { Engine } from '../core/Engine';
import type { InputManager } from '../core/InputManager';
import type { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import type { CampusWorld, CollidableBox } from '../world/CampusWorld';
import type { DetentionWorld } from '../world/DetentionWorld';
import type { EcologicalGarden } from '../world/EcologicalGarden';
import type { Player } from '../entities/Player';
import type { NPC } from '../entities/NPC';
import type { Bicycle } from '../vehicles/Bicycle';
import type { HUD } from '../ui/HUD';
import type { WantedSystem } from '../systems/WantedSystem';
import type { WeatherSystem } from '../systems/WeatherSystem';
import type { BasketballGame } from '../systems/BasketballGame';
import type { RacingGame } from '../systems/RacingGame';
import type { TennisGame } from '../systems/TennisGame';
import type { WaterSplashVFX } from '../effects/WaterSplashVFX';
import type { Progression } from './Progression';
import type { DetentionMode } from './DetentionMode';
import type { CampusMode } from './CampusMode';
import type { CombatSystem } from './CombatSystem';

export type WorldType = 'CAMPUS' | 'DETENTION';

/**
 * 遊戲各子系統共用的執行期上下文 (由主程式實作)：
 * 子系統只透過此介面取用共用物件與跨系統操作，不直接依賴主程式類別，避免循環引用。
 */
export interface GameContext {
  readonly engine: Engine;
  readonly input: InputManager;
  readonly cameraCtrl: ThirdPersonCamera;
  readonly world: CampusWorld;
  readonly detentionWorld: DetentionWorld;
  readonly ecologicalGarden: EcologicalGarden;
  readonly player: Player;
  readonly hud: HUD;
  readonly wantedSystem: WantedSystem;
  readonly weatherSystem: WeatherSystem;
  readonly basketballGame: BasketballGame;
  readonly racingGame: RacingGame;
  readonly tennisGame: TennisGame;
  readonly waterSplashVFX: WaterSplashVFX;

  readonly progression: Progression;
  readonly detention: DetentionMode;
  readonly campus: CampusMode;
  readonly combat: CombatSystem;

  readonly currentWorldType: WorldType;
  readonly activeColliders: CollidableBox[];
  /** 當前世界的 NPC 名單 */
  readonly npcs: NPC[];
  readonly campusNPCs: NPC[];
  readonly detentionNPCs: NPC[];
  readonly bicycles: Bicycle[];
  currentRidingBike: Bicycle | null;

  /** 固定角色 NPC 快取 (NPC 名單於載入後不再增減) */
  readonly peCoachNpc?: NPC;
  readonly dodgeTeacherNpc?: NPC;

  /** 下車並恢復步行鏡頭 (未騎車時不做任何事) */
  forceDismount(): void;
  handlePlayerDeath(reason: string): void;
  switchWorld(targetWorld: WorldType, skipCutscene?: boolean): void;
  startTennisMatch(): void;
}
