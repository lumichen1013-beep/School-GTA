# 《學校 GTA 3D》項目拆分與分工實作計畫書

依據《學校 GTA 3D》系統規格書，將整體專案解構為 8 大核心工程模組（含第二世界【第七特訓院】），確立各子系統介面、職責邊界與開發排期。下列模組與檔案路徑對應目前實際程式碼。

---

## 1. 系統模組架構圖 (System Architecture)

```
+---------------------------------------------------------------------------------------+
|                                    【學校 GTA 3D】                                     |
+---------------------------------------------------------------------------------------+
|  [Module 7: UI & 音效層]                                                              |
|   - HUD (血量/精力/記過處分) | 雷達小地圖 & 全螢幕大地圖任務 | 互動提示 | 合作社/對話框  |
|   - 開始畫面世界選擇 | 手機虛擬搖桿與觸控按鍵 | WebAudio 程序化音效與動態 BGM           |
+---------------------------------------------------------------------------------------+
|  [Module 2: 攝影機系統]               |  [Module 6: 玩法、戰鬥與通緝系統]              |
|   - 第三人稱追尾攝影機 (Orbit & Follow)|   - NPC 視錐 + 射線遮擋偵測、聽覺判定          |
|   - 防穿牆 AABB 掃掠檢測              |   - 0~5 級記過處分狀態機與逃脫倒數             |
|   - 樓梯間/天花板約束、暗殺慢動作特寫  |   - 戰鬥擊倒結算、武器解鎖、互動表、小遊戲     |
+---------------------------------------+-----------------------------------------------+
|  [Module 3: 角色與動作控制]           |  [Module 5: 載具系統]                         |
|   - WASD 移動、衝刺精力、潛行、游泳   |   - 火柴人自行車騎乘物理與轉向                 |
|   - 跳躍、階梯坡道貼地、擊飛受創      |   - 上下車、搶車與車主牽回                     |
|   - 身法技能 (閃身步/狗熊哆嗦毛)      |   - 高速衝撞擊飛 NPC                           |
+---------------------------------------+-----------------------------------------------+
|  [Module 4: 3D 場景與物體]            |  [Module 8: 第二世界【特訓院】]                |
|   - 天天國中：教學大樓 1F~3F+天台、    |   - A/B/C 三區場景、閘門、鑰匙卡、草堆藏匿點   |
|     操場、泳池、4F 羽球館、生態園      |   - 探照燈、MGS 全域警戒階段、背後暗殺         |
|   - 靜態碰撞盒、層板坡道、互動點位     |   - 鐵面總教官 Boss、存檔點、開場劇情與結算    |
+---------------------------------------+-----------------------------------------------+
|  [Module 1: 核心引擎基建]                                                             |
|   - Three.js 渲染器、陰影光照、動態天氣、主迴圈調度 (main.ts)、輸入管理器、碰撞網格    |
+---------------------------------------------------------------------------------------+
```

---

## 2. 模組分工與責任矩陣 (WBS & Responsibility Matrix)

| 模組編號 | 模組名稱 | 負責核心功能 | 交付物 / 關鍵檔案 |
| :--- | :--- | :--- | :--- |
| **M1: Core & Engine** | 核心基建與輸入 | Three.js 場景、陰影光照、主迴圈與世界切換、鍵鼠指針鎖定/觸控輸入、AABB 碰撞與網格索引、動態天氣 | `src/main.ts`<br>`src/core/Engine.ts`<br>`src/core/InputManager.ts`<br>`src/physics/aabb.ts`<br>`src/physics/ColliderGrid.ts`<br>`src/systems/WeatherSystem.ts`<br>`src/systems/IndoorManager.ts` |
| **M2: Camera System** | 3D 視角系統 | 第三人稱追尾、滑鼠環視旋轉、防穿牆平滑拉近、載具視野切換、暗殺慢動作特寫、鏡頭震動 | `src/camera/ThirdPersonCamera.ts`<br>`src/effects/cameraShake.ts` |
| **M3: Character & Locomotion**| 角色與運動 | 玩家移動、衝刺精力、潛行、游泳、跳躍、階梯坡道貼地、擊飛、身法技能 | `src/entities/Player.ts`<br>`src/entities/shared/*.ts` |
| **M4: Campus Environment** | 天天國中 3D 場景 | 教學大樓、操場、泳池、羽球館、生態園等程序化建模、碰撞體登記與平面配置 | `src/world/CampusWorld.ts`<br>`src/world/campusLayout.ts`<br>`src/world/EcologicalGarden.ts`<br>`src/world/ColliderRegistry.ts`<br>`src/world/sceneUtils.ts` |
| **M5: Vehicle System** | 載具駕駛系統 | 火柴人自行車物理、騎乘狀態、按 E 上下車、搶車與車主牽回、衝撞擊飛 | `src/vehicles/Bicycle.ts`<br>`src/game/CampusMode.ts` |
| **M6: Gameplay, Wanted & AI** | 玩法、通緝與 NPC AI | NPC 巡邏/視線/追捕 AI 與角色數值、NPC 生成名單、記過處分、戰鬥結算、互動表、成長與武器解鎖、小遊戲 | `src/entities/NPC.ts`<br>`src/entities/npc/*.ts`<br>`src/entities/RaceRival.ts`<br>`src/world/NPCSpawner.ts`<br>`src/systems/WantedSystem.ts`<br>`src/game/CombatSystem.ts`<br>`src/game/InteractionSystem.ts`<br>`src/game/Progression.ts`<br>`src/game/CampusMode.ts`<br>`src/systems/BasketballGame.ts`<br>`src/systems/RacingGame.ts`<br>`src/systems/TennisGame.ts` |
| **M7: HUD & Audio** | 介面與音效 | HUD、雷達小地圖、全螢幕大地圖與任務、合作社選單、開始畫面、手機觸控、程序化音效與動態 BGM、特效 | `src/ui/HUD.ts`<br>`src/ui/StartScreen.ts`<br>`src/input/MobileControls.ts`<br>`src/input/Fullscreen.ts`<br>`src/audio/*.ts`<br>`src/effects/*.ts`<br>`src/data/announcements.ts` |
| **M8: Detention World** | 第二世界【特訓院】 | 三區場景與配置資料、閘門與鑰匙卡、草堆藏匿點、探照燈、MGS 全域警戒階段、背後暗殺、鐵面總教官 Boss、存檔點、開場劇情、通關評級 | `src/world/DetentionWorld.ts`<br>`src/world/detentionLayout.ts`<br>`src/world/DetentionCutscene.ts`<br>`src/game/DetentionMode.ts` |

---

## 3. 分工實作步驟與交付里程碑 (Implementation Plan)

> 📝 **註**：以下為專案初期排期規劃；其中翻越、機車、NavMesh 尋路、1~5 星通緝 UI 等項目已調整或未實作（通緝改為記過處分制度、載具僅火柴人自行車），現行規格請見《GAME_SPECIFICATION.md》。

- [ ] **階段 1：專案骨架與引擎環境就位**
  - 初始化 Vite + TypeScript 專案。
  - 配置 Three.js 渲染管線、環境光、方向光（陽光）、柔和陰影、地面網格與天空盒。
- [ ] **階段 2：第三人稱攝影機與主角物理控制器**
  - 實作完整 `InputManager`（PointerLock、WASD、Shift、Space、E 鍵）。
  - 建立平滑第三人稱攝影機，帶防穿牆與滑鼠環視。
  - 建立主角膠囊控制器，支援走動、奔跑加速、體力條消耗、重力跳躍與地面檢測。
- [ ] **階段 3：3D 校園實景建構**
  - 生成多樓層教學大樓（1F~3F）、走廊、階梯、天台欄杆、操場 200m 跑道草坪、司令台、腳踏車棚。
  - 建立障礙物碰撞體，角色可在操場奔跑、上樓梯抵達天台俯瞰全校。
- [ ] **階段 4：校園載具系統（腳踏車）**
  - 實作停靠於車棚的腳踏車，靠近顯示「按 E 騎乘」。
  - 騎乘時角色上車，鏡頭平滑拉遠，支援加速踩踏、轉向傾斜與煞車甩尾。
- [ ] **階段 5：通緝系統、風紀糾察與教官追捕 AI**
  - 實作糾察隊 NPC 巡邏與 3D 視野錐偵測。
  - 違規或碰撞糾察觸發警戒，星級攀升（1~5 星），NPC 吹哨並展開全速追捕。
- [ ] **階段 6：校園音效與 GTA 風格 HUD**
  - 以 Web Audio API 程序化合成台灣經典鐘聲（西敏寺鐘聲）、教官哨音、腳踏車鈴聲。
  - 繪製 GTA 風格五星警戒 UI、雷達小地圖、體力/生命值計量表。
