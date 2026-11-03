// 音訊模組入口 (audio-design 7；只有 app 可以 import)
export { WebAudioManager, CUTSCENE_TRIM, type AudioManager, type AudioStats, type ManagerOptions } from './manager';
export { AudioEngine } from './engine';
export { LevelObserver, worldEventActions, CUE_MAP, type AudioAction, type LevelSnap, type ObjSnap } from './events';
export { DEFAULT_VOLUMES, type MusicContext, type Volumes } from './mix';
export { levelIntensity, scoreForChapter, SCORE_IDS, type ScoreId } from './score';
export { SFX_IDS } from './sfx';
