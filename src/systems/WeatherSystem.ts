import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { soundManager } from '../audio/SoundEffects';
import { IndoorManager } from './IndoorManager';

export type WeatherType = 'SUNNY' | 'RAIN' | 'THUNDERSTORM' | 'FOG' | 'SUNSET';

export interface WeatherPreset {
  type: WeatherType;
  name: string;
  badgeText: string;
  bannerText: string;
  skyColor: number;
  fogColor: number;
  fogDensity: number;
  dirIntensity: number;
  dirColor: number;
  hemiIntensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  rainCount: number;
  rainSpeed: number;
  rainWindX: number;
  rainWindZ: number;
  rainVolume: number;
  hasThunder: boolean;
}

export const WEATHER_PRESETS: Record<WeatherType, WeatherPreset> = {
  SUNNY: {
    type: 'SUNNY',
    name: '晴朗校園',
    badgeText: '☀️ 晴朗',
    bannerText: '☀️ 天氣晴朗：陽光明媚，微風拂面校園！',
    skyColor: 0xa0c4e2,
    fogColor: 0xa0c4e2,
    fogDensity: 0.005,
    dirIntensity: 1.30,
    dirColor: 0xfff5e6,
    hemiIntensity: 0.80,
    hemiSkyColor: 0xffffff,
    hemiGroundColor: 0x555566,
    rainCount: 0,
    rainSpeed: 0,
    rainWindX: 0,
    rainWindZ: 0,
    rainVolume: 0,
    hasThunder: false
  },
  RAIN: {
    type: 'RAIN',
    name: '綿綿細雨',
    badgeText: '🌧️ 小雨',
    bannerText: '🌧️ 天降甘霖：細雨綿綿，校園水氣氤氳！',
    skyColor: 0x8fa3b5,      // 明亮舒適的雨天淺藍天色，不再暗沉
    fogColor: 0x9cb0c0,      // 清爽微亮雨霧，不阻擋視線
    fogDensity: 0.006,       // 霧氣濃度降至 0.006，遠處景物一清二楚
    dirIntensity: 1.08,      // 大幅提亮直射日光 (原 0.55 -> 1.08)
    dirColor: 0xdde9f5,      // 柔和微藍白光
    hemiIntensity: 0.82,     // 大幅提亮環境天光 (原 0.45 -> 0.82)
    hemiSkyColor: 0xb5c6d6,  // 明亮的天空環境色
    hemiGroundColor: 0x6e7e8e,// 明朗的地表漫射，讓建築牆面與人物陰影處清晰可辨
    rainCount: 3800,
    rainSpeed: 28.0,
    rainWindX: -1.8,
    rainWindZ: 1.2,
    rainVolume: 0.35,
    hasThunder: false
  },
  THUNDERSTORM: {
    type: 'THUNDERSTORM',
    name: '雷陣雨',
    badgeText: '⛈️ 雷雨',
    bannerText: '⛈️ 狂風驟雨：烏雲奔湧，電閃雷鳴席捲校園！',
    skyColor: 0x768898,      // 大幅提亮暴風雨天色 (原 0x415364 -> 0x768898，銀灰藍質感，視野開朗)
    fogColor: 0x8294a4,      // 提亮暴風雨霧氣 (原 0x415364 -> 0x8294a4)
    fogDensity: 0.0065,      // 霧氣濃度從 0.013 減半至 0.0065！徹底避免霧氣暗黑遮蔽視線
    dirIntensity: 1.00,      // 直射光強度從 0.58 大幅提升至 1.00！保證畫面立體通透
    dirColor: 0xd0e0ec,      // 耀眼的暴風雨銀藍高光，不再死灰暗淡
    hemiIntensity: 0.80,     // 環境光強度從 0.50 提升至 0.80！徹底消除死黑陰影
    hemiSkyColor: 0x9cb0c0,  // 上方天光漫射大幅提亮 (原 0x576574 提升)
    hemiGroundColor: 0x627382,// 地表漫射光大幅提亮 (原 0x2c3e50 提升)，地板與牆面完全清晰明辨
    rainCount: 5500,
    rainSpeed: 38.0,
    rainWindX: -6.5,
    rainWindZ: 4.5,
    rainVolume: 0.65,
    hasThunder: true
  },
  FOG: {
    type: 'FOG',
    name: '清晨迷霧',
    badgeText: '🌫️ 濃霧',
    bannerText: '🌫️ 迷霧校園：晨霧縹緲，建築若隱若現宛如仙境！',
    skyColor: 0xd6dfe8,      // 晨霧淺白色
    fogColor: 0xd6dfe8,
    fogDensity: 0.012,       // 從 0.030 降至 0.012 (柔和仙氣晨霧，視野清晰不刺眼)
    dirIntensity: 0.95,      // 從 0.65 提升至 0.95
    dirColor: 0xe8ecf2,
    hemiIntensity: 0.82,     // 從 0.60 提升至 0.82
    hemiSkyColor: 0xf4f6fa,
    hemiGroundColor: 0x9ca9b8,
    rainCount: 0,
    rainSpeed: 0,
    rainWindX: 0,
    rainWindZ: 0,
    rainVolume: 0,
    hasThunder: false
  },
  SUNSET: {
    type: 'SUNSET',
    name: '金黃暮霞',
    badgeText: '🌅 暮霞',
    bannerText: '🌅 暮色金黃：夕陽染紅操場，校園沉浸浪漫餘暉！',
    skyColor: 0xd86218,
    fogColor: 0xea8830,
    fogDensity: 0.006,
    dirIntensity: 1.20,
    dirColor: 0xffa44e,
    hemiIntensity: 0.78,
    hemiSkyColor: 0xf5a623,
    hemiGroundColor: 0x6b588e,
    rainCount: 0,
    rainSpeed: 0,
    rainWindX: 0,
    rainWindZ: 0,
    rainVolume: 0,
    hasThunder: false
  }
};

const WEATHER_ORDER: WeatherType[] = ['SUNNY', 'RAIN', 'THUNDERSTORM', 'FOG', 'SUNSET'];

// 模組頂層靜態共享 Scratch 色彩物件 (0-GC，完全避免 per-frame new THREE.Color)
const _fromSkyColor = new THREE.Color();
const _toSkyColor = new THREE.Color();
const _fromFogColor = new THREE.Color();
const _toFogColor = new THREE.Color();
const _fromDirColor = new THREE.Color();
const _toDirColor = new THREE.Color();
const _fromHemiSkyColor = new THREE.Color();
const _toHemiSkyColor = new THREE.Color();
const _fromHemiGroundColor = new THREE.Color();
const _toHemiGroundColor = new THREE.Color();

export class WeatherSystem {
  private engine: Engine;
  public currentWeather: WeatherType = 'SUNNY';
  public targetWeather: WeatherType = 'SUNNY';

  // 平滑過渡計時與狀態
  public isTransitioning: boolean = false;
  private transitionTimer: number = 0;
  public transitionDuration: number = 4.5;

  private fromFogDensity: number = 0.007;
  private toFogDensity: number = 0.007;
  private fromDirIntensity: number = 1.25;
  private toDirIntensity: number = 1.25;
  private fromHemiIntensity: number = 0.75;
  private toHemiIntensity: number = 0.75;

  private fromRainCount: number = 0;
  private toRainCount: number = 0;
  private currentRainCount: number = 0;

  // 自然天氣循環計時器 (每 120~180 秒隨機切換)
  private autoCycleTimer: number = 0;
  private autoCycleInterval: number = 140.0;

  // 雷陣雨電閃雷鳴計時器
  private lightningTimer: number = 0;
  private nextLightningTime: number = 11.0;
  private isFlashing: boolean = false;
  private flashTimer: number = 0;
  private thunderDelayTimer: number = 0;

  // 0-GC 雨滴粒子系統 (Max 6000 顆粒，圍繞玩家動態循環更新)
  private maxRainCount: number = 6000;
  private rainGeometry: THREE.BufferGeometry;
  private rainMaterial: THREE.PointsMaterial;
  private rainPoints: THREE.Points;
  private rainPositions: Float32Array;
  public currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS';

  // 天氣變更回呼 (同步更新 HUD 與 Banner)
  public onWeatherChange?: (preset: WeatherPreset, isManual: boolean) => void;

  constructor(engine: Engine) {
    this.engine = engine;

    // 1. 初始化 0-GC 雨滴粒子系統
    this.rainPositions = new Float32Array(this.maxRainCount * 3);
    for (let i = 0; i < this.maxRainCount; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 60.0;
      this.rainPositions[i * 3 + 1] = Math.random() * 28.0;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 60.0;
    }

    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainGeometry.setDrawRange(0, 0);

    this.rainMaterial = new THREE.PointsMaterial({
      color: 0xcfe2f3,
      size: 0.24,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });

    this.rainPoints = new THREE.Points(this.rainGeometry, this.rainMaterial);
    this.rainPoints.visible = false;
    this.engine.scene.add(this.rainPoints);

    // 2. 初始化初始天氣狀態 (SUNNY)
    this.setWeather('SUNNY', false, false);
    this.autoCycleInterval = 130.0 + Math.random() * 50.0;
  }

  public getCurrentPreset(): WeatherPreset {
    return WEATHER_PRESETS[this.currentWeather];
  }

  public getTargetPreset(): WeatherPreset {
    return WEATHER_PRESETS[this.targetWeather];
  }

  // 手動循環切換下一種天氣 (按 [P] 鍵或點擊 HUD 天氣按鈕)
  public cycleWeather(isManual: boolean = true) {
    const currentIdx = WEATHER_ORDER.indexOf(this.targetWeather);
    const nextIdx = (currentIdx + 1) % WEATHER_ORDER.length;
    const nextWeather = WEATHER_ORDER[nextIdx];
    this.setWeather(nextWeather, true, isManual);
  }

  // 設定目標天氣 (支援平滑漸層插值過渡)
  public setWeather(type: WeatherType, smooth: boolean = true, notify: boolean = true) {
    const targetPreset = WEATHER_PRESETS[type];
    this.targetWeather = type;

    if (!smooth) {
      // 瞬間套用天氣數值 (用於遊戲開局或重置)
      this.currentWeather = type;
      this.isTransitioning = false;
      this.transitionTimer = 0;
      this.currentRainCount = targetPreset.rainCount;

      (this.engine.scene.background as THREE.Color).setHex(targetPreset.skyColor);
      (this.engine.scene.fog as THREE.FogExp2).color.setHex(targetPreset.fogColor);
      (this.engine.scene.fog as THREE.FogExp2).density = targetPreset.fogDensity;

      this.engine.dirLight.intensity = targetPreset.dirIntensity;
      this.engine.dirLight.color.setHex(targetPreset.dirColor);

      this.engine.hemiLight.intensity = targetPreset.hemiIntensity;
      this.engine.hemiLight.color.setHex(targetPreset.hemiSkyColor);
      this.engine.hemiLight.groundColor.setHex(targetPreset.hemiGroundColor);

      soundManager.setRainIntensity(targetPreset.rainVolume, 0.5);

      if (notify && this.onWeatherChange) {
        this.onWeatherChange(targetPreset, false);
      }
      return;
    }

    // 平滑過渡初始化：快照當前畫面色彩與強度作為起點
    _fromSkyColor.copy(this.engine.scene.background as THREE.Color);
    _toSkyColor.setHex(targetPreset.skyColor);

    _fromFogColor.copy((this.engine.scene.fog as THREE.FogExp2).color);
    _toFogColor.setHex(targetPreset.fogColor);
    this.fromFogDensity = (this.engine.scene.fog as THREE.FogExp2).density;
    this.toFogDensity = targetPreset.fogDensity;

    this.fromDirIntensity = this.engine.dirLight.intensity;
    this.toDirIntensity = targetPreset.dirIntensity;
    _fromDirColor.copy(this.engine.dirLight.color);
    _toDirColor.setHex(targetPreset.dirColor);

    this.fromHemiIntensity = this.engine.hemiLight.intensity;
    this.toHemiIntensity = targetPreset.hemiIntensity;
    _fromHemiSkyColor.copy(this.engine.hemiLight.color);
    _toHemiSkyColor.setHex(targetPreset.hemiSkyColor);
    _fromHemiGroundColor.copy(this.engine.hemiLight.groundColor);
    _toHemiGroundColor.setHex(targetPreset.hemiGroundColor);

    this.fromRainCount = this.currentRainCount;
    this.toRainCount = targetPreset.rainCount;

    this.isTransitioning = true;
    this.transitionTimer = 0;

    // 音訊音量平滑線性過渡
    soundManager.setRainIntensity(targetPreset.rainVolume, this.transitionDuration);

    if (notify && this.onWeatherChange) {
      this.onWeatherChange(targetPreset, true);
    }
  }

  public update(delta: number, playerPos: THREE.Vector3, currentWorld?: 'CAMPUS' | 'DETENTION') {
    if (currentWorld) {
      this.currentWorld = currentWorld;
    }
    // 1. 天氣平滑過渡插值運算 (4.5s 柔和平滑漸變，絕無生硬瞬切)
    let curPreset = WEATHER_PRESETS[this.currentWeather];
    let tgtPreset = WEATHER_PRESETS[this.targetWeather];
    let transitionBlend = 0;

    if (this.isTransitioning) {
      this.transitionTimer += delta;
      const progress = Math.min(1.0, this.transitionTimer / this.transitionDuration);
      // Hermite Smoothstep 曲線 (3t^2 - 2t^3)
      transitionBlend = progress * progress * (3.0 - 2.0 * progress);

      // 插值背景天空色
      (this.engine.scene.background as THREE.Color).lerpColors(_fromSkyColor, _toSkyColor, transitionBlend);

      // 插值霧氣顏色與濃度
      const fog = this.engine.scene.fog as THREE.FogExp2;
      fog.color.lerpColors(_fromFogColor, _toFogColor, transitionBlend);
      fog.density = THREE.MathUtils.lerp(this.fromFogDensity, this.toFogDensity, transitionBlend);

      // 插值日光與天光
      this.engine.dirLight.intensity = THREE.MathUtils.lerp(this.fromDirIntensity, this.toDirIntensity, transitionBlend);
      this.engine.dirLight.color.lerpColors(_fromDirColor, _toDirColor, transitionBlend);

      this.engine.hemiLight.intensity = THREE.MathUtils.lerp(this.fromHemiIntensity, this.toHemiIntensity, transitionBlend);
      this.engine.hemiLight.color.lerpColors(_fromHemiSkyColor, _toHemiSkyColor, transitionBlend);
      this.engine.hemiLight.groundColor.lerpColors(_fromHemiGroundColor, _toHemiGroundColor, transitionBlend);

      // 插值雨滴粒子數
      this.currentRainCount = Math.round(THREE.MathUtils.lerp(this.fromRainCount, this.toRainCount, transitionBlend));

      if (progress >= 1.0) {
        this.isTransitioning = false;
        this.currentWeather = this.targetWeather;
        curPreset = tgtPreset;
      }
    } else {
      // 2. 自然時間循環 (每隔 2~3 分鐘自然變更天氣)
      this.autoCycleTimer += delta;
      if (this.autoCycleTimer >= this.autoCycleInterval) {
        this.autoCycleTimer = 0;
        this.autoCycleInterval = 130.0 + Math.random() * 50.0;
        this.cycleWeather(false);
      }
      this.currentRainCount = curPreset.rainCount;
    }

    // 3. 雷陣雨專屬電閃雷鳴邏輯 (THUNDERSTORM)
    const isStormy = (this.currentWeather === 'THUNDERSTORM' || this.targetWeather === 'THUNDERSTORM');
    if (isStormy && !this.isTransitioning) {
      this.lightningTimer += delta;
      if (this.lightningTimer >= this.nextLightningTime) {
        this.lightningTimer = 0;
        this.nextLightningTime = 9.0 + Math.random() * 9.0; // 每 9~18 秒隨機一道閃電

        // 觸發白熾閃光
        this.isFlashing = true;
        this.flashTimer = 0.12;

        this.engine.dirLight.intensity = 3.6;
        this.engine.dirLight.color.setHex(0xffffff);
        this.engine.hemiLight.intensity = 2.4;
        (this.engine.scene.background as THREE.Color).setHex(0xe0e6ed);
        (this.engine.scene.fog as THREE.FogExp2).color.setHex(0xe0e6ed);

        // 閃電後 0.15~0.4 秒隨即滾來震天動地雷鳴
        this.thunderDelayTimer = 0.15 + Math.random() * 0.25;
      }

      if (this.isFlashing) {
        this.flashTimer -= delta;
        if (this.flashTimer <= 0) {
          this.isFlashing = false;
          // 復原風暴幽暗光照
          this.engine.dirLight.intensity = curPreset.dirIntensity;
          this.engine.dirLight.color.setHex(curPreset.dirColor);
          this.engine.hemiLight.intensity = curPreset.hemiIntensity;
          this.engine.hemiLight.color.setHex(curPreset.hemiSkyColor);
          (this.engine.scene.background as THREE.Color).setHex(curPreset.skyColor);
          (this.engine.scene.fog as THREE.FogExp2).color.setHex(curPreset.fogColor);
        }
      }

      if (this.thunderDelayTimer > 0) {
        this.thunderDelayTimer -= delta;
        if (this.thunderDelayTimer <= 0) {
          soundManager.playThunder();
        }
      }
    }

    // 4. 即時室內聽雨音效調整 (室內音量衰減且低通濾波，呈現真實隔牆隔頂聽雨效果)
    const isPlayerIndoors = IndoorManager.isIndoors(playerPos, this.currentWorld);
    if (this.currentRainCount > 0) {
      const targetRainVol = this.isTransitioning
        ? THREE.MathUtils.lerp(curPreset.rainVolume, tgtPreset.rainVolume, transitionBlend)
        : curPreset.rainVolume;
      soundManager.setRainIntensity(targetRainVol, 0.4, isPlayerIndoors);
    }

    // 5. 雨滴粒子系統即時模擬 (圍繞玩家以 60m 空間動態更新，0-GC 高效下落)
    if (this.currentRainCount > 0) {
      const pos = this.rainPositions;
      const count = this.currentRainCount;
      const fallSpeed = this.isTransitioning
        ? THREE.MathUtils.lerp(curPreset.rainSpeed, tgtPreset.rainSpeed, transitionBlend)
        : curPreset.rainSpeed;
      const windX = this.isTransitioning
        ? THREE.MathUtils.lerp(curPreset.rainWindX, tgtPreset.rainWindX, transitionBlend)
        : curPreset.rainWindX;
      const windZ = this.isTransitioning
        ? THREE.MathUtils.lerp(curPreset.rainWindZ, tgtPreset.rainWindZ, transitionBlend)
        : curPreset.rainWindZ;

      const minY = playerPos.y - 1.0;
      const maxY = playerPos.y + 26.0;
      const rangeX = 30.0;
      const rangeZ = 30.0;

      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        pos[idx] += windX * delta;
        pos[idx + 1] -= fallSpeed * delta;
        pos[idx + 2] += windZ * delta;

        // 檢查該粒子所在 (X, Z) 地面投影上方是否有建築物屋頂
        const px = pos[idx];
        const pz = pos[idx + 2];
        const roofY = IndoorManager.getRoofHeightAt(px, pz, this.currentWorld);
        const effectiveFloorY = (roofY !== null) ? roofY : minY;

        // 觸地/觸及建築屋頂循環重置回天空隨機位置 (雨水落到屋頂即被阻擋吸收，絕不滲透落入室內！)
        if (pos[idx + 1] <= effectiveFloorY) {
          const newX = playerPos.x + (Math.random() - 0.5) * rangeX * 2.0;
          const newZ = playerPos.z + (Math.random() - 0.5) * rangeZ * 2.0;
          pos[idx] = newX;
          pos[idx + 2] = newZ;

          const spawnRoofY = IndoorManager.getRoofHeightAt(newX, newZ, this.currentWorld);
          const minSpawnY = (spawnRoofY !== null) ? Math.max(maxY, spawnRoofY + 2.5) : maxY;
          pos[idx + 1] = minSpawnY + Math.random() * 4.0;
        }

        // 水平超出玩家範圍跟隨包裝
        let wrapped = false;
        if (pos[idx] < playerPos.x - rangeX) { pos[idx] += rangeX * 2.0; wrapped = true; }
        else if (pos[idx] > playerPos.x + rangeX) { pos[idx] -= rangeX * 2.0; wrapped = true; }

        if (pos[idx + 2] < playerPos.z - rangeZ) { pos[idx + 2] += rangeZ * 2.0; wrapped = true; }
        else if (pos[idx + 2] > playerPos.z + rangeZ) { pos[idx + 2] -= rangeZ * 2.0; wrapped = true; }
        // 水平循環後若粒子不幸位於室內 (Y < 屋頂高度)，立即提至天空上方 (僅發生循環時才需查詢屋頂)
        if (wrapped) {
          const wrapRoofY = IndoorManager.getRoofHeightAt(pos[idx], pos[idx + 2], this.currentWorld);
          if (wrapRoofY !== null && pos[idx + 1] < wrapRoofY) {
            pos[idx + 1] = Math.max(maxY, wrapRoofY + 2.5) + Math.random() * 4.0;
          }
        }
      }

      this.rainGeometry.attributes.position.needsUpdate = true;
      this.rainGeometry.setDrawRange(0, count);
      this.rainPoints.visible = true;
    } else {
      this.rainPoints.visible = false;
    }
  }

  // 資源處置清理
  public dispose() {
    this.engine.scene.remove(this.rainPoints);
    this.rainGeometry.dispose();
    this.rainMaterial.dispose();
    soundManager.setRainIntensity(0, 0.5);
  }
}
