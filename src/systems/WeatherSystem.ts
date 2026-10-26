import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { soundManager } from '../audio/SoundEffects';

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
    fogDensity: 0.007,
    dirIntensity: 1.25,
    dirColor: 0xfff5e6,
    hemiIntensity: 0.75,
    hemiSkyColor: 0xffffff,
    hemiGroundColor: 0x444455,
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
    skyColor: 0x5d6d7e,
    fogColor: 0x5d6d7e,
    fogDensity: 0.013,
    dirIntensity: 0.55,
    dirColor: 0xc8d6e5,
    hemiIntensity: 0.45,
    hemiSkyColor: 0x8395a7,
    hemiGroundColor: 0x34495e,
    rainCount: 4000,
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
    bannerText: '⛈️ 狂風驟雨：烏雲蔽日，電閃雷鳴席捲校園！',
    skyColor: 0x415364,
    fogColor: 0x415364,
    fogDensity: 0.013,
    dirIntensity: 0.58,
    dirColor: 0x95a5a6,
    hemiIntensity: 0.50,
    hemiSkyColor: 0x576574,
    hemiGroundColor: 0x2c3e50,
    rainCount: 6000,
    rainSpeed: 38.0,
    rainWindX: -6.5,
    rainWindZ: 4.5,
    rainVolume: 0.70,
    hasThunder: true
  },
  FOG: {
    type: 'FOG',
    name: '清晨迷霧',
    badgeText: '🌫️ 濃霧',
    bannerText: '🌫️ 迷霧校園：晨霧縹緲，建築若隱若現宛如仙境！',
    skyColor: 0xcad3df,
    fogColor: 0xcad3df,
    fogDensity: 0.030,
    dirIntensity: 0.65,
    dirColor: 0xdfe4ea,
    hemiIntensity: 0.60,
    hemiSkyColor: 0xf1f2f6,
    hemiGroundColor: 0xa4b0be,
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
    skyColor: 0xd35400,
    fogColor: 0xe67e22,
    fogDensity: 0.008,
    dirIntensity: 1.10,
    dirColor: 0xff9f43,
    hemiIntensity: 0.70,
    hemiSkyColor: 0xf39c12,
    hemiGroundColor: 0x574b90,
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
      color: 0x95afc0,
      size: 0.22,
      transparent: true,
      opacity: 0.65,
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

  public update(delta: number, playerPos: THREE.Vector3) {
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

    // 4. 雨滴粒子系統即時模擬 (圍繞玩家以 60m 空間動態更新，0-GC 高效下落)
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

        // 觸地循環重置回上方隨機位置
        if (pos[idx + 1] < minY) {
          pos[idx + 1] = maxY + Math.random() * 4.0;
          pos[idx] = playerPos.x + (Math.random() - 0.5) * rangeX * 2.0;
          pos[idx + 2] = playerPos.z + (Math.random() - 0.5) * rangeZ * 2.0;
        }

        // 水平超出玩家範圍跟隨包裝
        if (pos[idx] < playerPos.x - rangeX) pos[idx] += rangeX * 2.0;
        else if (pos[idx] > playerPos.x + rangeX) pos[idx] -= rangeX * 2.0;

        if (pos[idx + 2] < playerPos.z - rangeZ) pos[idx + 2] += rangeZ * 2.0;
        else if (pos[idx + 2] > playerPos.z + rangeZ) pos[idx + 2] -= rangeZ * 2.0;
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
