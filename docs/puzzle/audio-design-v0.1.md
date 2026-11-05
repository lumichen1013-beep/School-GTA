# 《圖紙之間》配樂與音效設計 v0.1

> 狀態：設計（2026-11-03），先於實作。對應 `game-spec-v0.2.md` 9.1（下稱「規格」）、`architecture-v0.2.md` 2.2 / 4.13（下稱「架構」）、`cutscenes-v0.1.md` 2.5 / 5（下稱「分鏡」）、`story-bible-v0.2.md` 8（下稱「劇情」）。
> 標記：**〔規格 X〕** = 依據文件章節；**〔碼 file〕** = 依據現有程式；**〔推論〕** = 我的判斷，需真人試聽確認。

---

## 0. 現況（已讀程式）

| 項目 | 現況 | 出處 |
|------|------|------|
| 音訊模組 | 不存在；架構預留 `audio/`（L4，權限同 `render`：可用 DOM / Web Audio，不得 import three 以外的裸模組；`core / mechanics / meta / text / devtools / ui / input` 不得 import `audio/`；只有 `app` 可以） | 架構 2.2、`tests/puzzle/architecture.test.ts` `MATRIX.audio` |
| 過場音訊掛點 | `ShotDef.audio: AudioCue[]`（`at: start / line / end`），播放器在 `drain()` 送出 `{ type:'audio', cue }`；`app.ts` 的 `onAudioCue` 是空函式 | 〔碼 content/cutsceneTypes.ts、app/cutscene.ts、app/app.ts〕 |
| 序章的提示名 | `pad.in` `wind` `car.climb` `signal.drop` `door.creak` `paper.rub` `pad.warm` `notebook.close` `rug.roll` `pad.low` `circle.hum` `pen.rise` `pen.grip` `house.rumble` `wall.slide` `stairs.flip` `door.rattle` `pen.engrave` `pen.click` `switch.lowpass` `pad.semitoneDown` `paper.flutter` `pad.out`（23 個） | 〔碼 content/cutscenes/prologue.ts〕 |
| 驗證器的音訊規則 | 提示名須符合 `^[a-z][\w.]*$`；名稱含 `scare / jump / shriek / scream` 即報錯（過場內不放驚嚇） | 〔碼 devtools/validateCutscene.ts〕 |
| 世界事件 | `GameEvent = switch / switchDenied / door / turnRequest / objCross / labelOpen / card / flag / dialActivate / done`；`LevelLoop` 每步 `splice` 取走，`switch` 自己處理，其餘經 `onEvent` 交給 `LevelSession` | 〔碼 core/types.ts、app/loop.ts、app/levelSession.ts〕 |
| 沒有事件、只改狀態的互動 | 撿到物品（`inv`）、書擋倒下 / 燈書亮滅 / 拉繩 / 壓板 / 抽書（`ObjState.used`）、魔方轉動（`ChapterState.cube`）、跳躍 / 落地（`Player.vy / onGround`）、切換（`Player.mode`）、展開圖 / 轉動模式 / 字卡匣開關（`LevelSession` getter） | 〔碼 mechanics/*.ts、core/chapter.ts〕 |
| 驚嚇 | 只有 1-3 衣帽間的大衣滑落：持有銅鑰匙進房、安靜 2.5 秒後 `flag:'scare:coats'`（R 不重演，旗標記在章節） | 〔碼 mechanics/coats.ts〕 |
| 設定 | `calmTension` 已有欄位、沒有 UI 開關；沒有音量欄位 | 〔碼 meta/settings.ts〕 |
| 強度資料 | `content/moodTypes.ts` 尚未建立（`LevelEntry.mood` 未實作） | 〔碼 content/〕 |

---

## 1. 原則

| # | 原則 | 理由 |
|---|------|------|
| 1 | **全部程序化合成**（Web Audio 振盪器 / 雜訊 / 濾波 / 包絡 / 卷積殘響），不放任何音檔 | 規格 9.1「不引入音檔」；沒有授權問題；包體不變 |
| 2 | **純邏輯與 Web Audio 分開**：音符序列、調式、排程時間、混音曲線、事件 → 音效對映、驚嚇閘門都是純函式（Node 可測、確定性、用自寫的 `mulberry32` 種子亂數，不用 `Math.random`）；只有 `engine / music / manager` 碰 `AudioContext` | 架構 2.3「確定性與 Node 可跑」；可單元測試 |
| 3 | **只屬呈現層**：讀事件與狀態、不寫回 world / chapter；不改任何遊戲邏輯 | 規格 9.1 護欄；架構 4.13「單向事件匯流」 |
| 4 | 溫暖、低調、留白：大部分時間只有長音墊與零星的音；動機短（≤ 2 小節），每章換調式與配器，讓人聽得出「到了新的地方」 | 劇情 8「森林中的圖書館」；P3「以安靜推理為主」 |
| 5 | 響度有硬上限：總輸出經限幅器、峰值 ≤ −6 dBFS；一般時段 ≤ −14 dBFS | 規格 9.1 聲音表 |

---

## 2. 音樂

### 2.1 配器（全部合成音色，`audio/engine.ts` 的 instrument）

| 音色 | 合成方式 | 用途 |
|------|---------|------|
| `pad` 長音墊 | 兩個失諧三角波 + 一個低八度正弦 → 低通 900 Hz（緩慢 LFO ±150 Hz）；起音 1.6 秒、釋音 2.4 秒 | 各章底色 |
| `strings` 弦樂墊 | 三個失諧鋸齒波 → 低通 1.8 kHz；起音 0.5 秒 | 第二、五章、結局 |
| `glock` 鐘琴 | 正弦 + 2.76× / 5.4× 泛音，快速指數衰減 1.2 秒 | 第一章、序章標題 |
| `celesta` 鋼片琴 | 正弦 + 4× 泛音，衰減 1.6 秒 | 主動機 |
| `flute` 木管 | 三角波 + 4.5 Hz 顫音 + 帶通雜訊氣聲，起音 80 ms | 第一、三章動機 |
| `clarinet` 單簧管 | 方波 → 低通 1.2 kHz（奇次泛音） | 第二章動機 |
| `piano` 類鋼琴 | 三角波 + 2× 正弦，起音 4 ms、指數衰減 2 秒 | 第二、五章琶音、爸爸動機 |
| `marimba` 木琴 / 水滴 | 正弦 + 4× 泛音，衰減 0.5 秒 | 第三章水滴 |
| `harp` 豎琴 | 三角波撥弦，衰減 1.4 秒 | 第五章琶音 |
| `drone` 低頻持續音 | 正弦 + 2× 正弦（40～80 Hz），**增益 ≤ 0.03** | 第四章、緊張 |
| `pulse` 脈動低音 | 正弦 50～70 Hz，每拍一個 0.35 秒的包絡；**≤ 96 BPM**、變速漸變 ≥ 2 秒 | 第三章（輕）、緊張 |

### 2.2 動機

以「調式內的級數」記錄（0 = 主音），同一動機放進各章調式後音程會變，旋律輪廓不變——玩家聽得出是同一個主題、但顏色不同。

| 動機 | 級數（拍數） | 意義 |
|------|-------------|------|
| **圖紙主題** M | 4(1) 3(½) 2(½) 4(1½) 0(½) 1(2) | 序章標題、各章每 8 小節出現一次；**停在第 2 級**＝試煉還沒解開 |
| 還原 M′ | 4(1) 3(½) 2(½) 4(1½) 1(½) 0(2) | 結局 A：同一句最後落回主音 |
| 爸爸動機 F | 2(1½) 1(½) 0(1) −1(1) 0(2) | 第二章、結局 B：慢、往下走、回到主音前停一下 |
| 章動機 | 每章一句（2.3） | 章的辨識度 |

### 2.3 各章主題（`audio/score.ts`；強度 0～3 由規格 9.1 曲線查表）

| 章 / 場景 | 調式（主音） | BPM | 和聲進行（級） | 配器（層） | 章動機 | 聽感 |
|----------|-------------|-----|---------------|-----------|--------|------|
| 一 玄關 | D 利底亞 | 64 | I – II – vi – I | pad + glock（零星）+ flute（動機） | 0 2 4 3(升 4) 4 | 好奇、安靜；升 4 級帶一點「這房子不太一樣」 |
| 二 書房 | A 多利亞 | 58 | i – IV – i – VII | strings + piano 琶音 + clarinet（動機）；強度 ≥ 2 時高音域偶爾一聲 ♭2 | 0 −1 0 2 1 | 書卷氣、木頭與紙；♭2 是輕微不安 |
| 三 溫室 | F 混合利底亞 | 72 | I – VII – IV – I | pad + marimba 水滴（種子亂數）+ flute；**輕脈動**（規格） | 0 4 5 6 4 | 濕潤、生長：琶音每小節多長一個音 |
| 四 地下室 | C 弗里吉亞 | — | — | **不放 BGM**（規格）：drone 40～80 Hz + 局部環境音（翻紙、門軸、遠處腳步，同類 ≥ 20 秒一次）；強度 3 加 pulse | — | 低沉、緊張、空 |
| 五 閣樓 | E♭ 大調 ↔ C 小調 | 60 | I – vi – IV – V | strings + harp 琶音 + glock + 圖紙主題全句；分層音軌（規格） | 主題全句 | 宏大、感傷 |
| 終章 草地 | G 大調 | 54 | I（逐層疊成和弦） | pad + strings + glock | M′ 的頭 | 黎明：收成一個和弦 |
| 序章 | D 多利亞 | 60 | i – VII – IV – i | pad + celesta；提示切換段落（2.5） | 圖紙主題（標題卡全句） | 安靜、懷念、慢慢不對勁 |
| 結局 A | D 大調 | 60 | I – IV – I – V – I | strings + celesta + glock | M′（落回主音） | 釋懷、完成 |
| 結局 B | D 多利亞 → 大調 | 56 | i – IV – VII – IV | pad + piano + celesta | F 接 M（停在 IV） | 苦甜、留著一點懸而未決 |

### 2.4 情境層（`setContext`；純函式 `layerMix(context, intensity, calm)` 算各層增益）

| 情境 | 層 | 觸發 |
|------|----|------|
| `explore` 探索 | 依強度：0 = pad；1 = + melody；2 = + arp / texture；3 = + pulse | 關卡內預設 |
| `turn` 轉動魔方 | melody ×0.4、arp ×1.3、加 texture | 打開轉動模式 / 展開圖 |
| `tension` 追逐 / 緊張 | pulse 開（calm 時關）、melody 關、pad 變暗 | 追逐（N19 實作後）、強度 3 的段落 |
| `solved` 解謎完成 | 全部 ×0.35 約 2.5 秒（讓完成旋律出來）後回到前一情境 | `done` 事件 |
| `quiet` 安靜 | 只剩 pad ×0.5；**驚嚇後 15 秒**一律進這裡、環境音停 | 驚嚇、選單 |

### 2.5 序章配樂（分鏡第 5 節 12 鏡；掛點 = 現有 23 個提示名 + 鏡頭開始事件）

| 鏡 | 音樂 | 音效（提示 → 音效 id） |
|----|------|----------------------|
| 1 | `pad.in`：序章長音墊淡入 4 秒 | `wind` → 風吹樹葉（環境，−30 dBFS） |
| 2 | — | `car.climb` → 腳步踩碎石；`signal.drop` → 三個往下的柔和短音 |
| 3 | — | `door.creak` → 木地板輕響；`paper.rub` → 紙張摩擦 |
| 4 | `pad.warm`：和聲轉成大調 IV，低通打開 | `notebook.close` → 闔書（很輕） |
| 5 | `pad.low`：長音墊降八度、變暗 | `rug.roll` → 地毯摩擦 |
| 6 | — | `circle.hum` → 魔法陣低沉和聲由無到有（起音 400 ms）；`pen.rise` → 鋼筆升起的上升泛音 |
| 7 | — | `pen.grip` → 握住（輕扣 + 靜止）；`house.rumble` → 木頭低鳴（≤ −24 dBFS、起音 ≥ 150 ms） |
| 8 | — | `wall.slide` → 機括與木頭摩擦（≤ −24 dBFS）；`stairs.flip` → 翻轉後最後一聲輕「喀」 |
| 9 | — | `door.rattle` → 門把卡住的悶響（輕）；`pen.engrave` → 筆身發光的細高音 |
| 10 | `switch.lowpass`：低通 1.2 kHz；`pad.semitoneDown`：長音墊降半音 | `pen.click` → 筆尖點下（同遊戲內切換聲）；壓平成圖的紙聲 |
| 11 | （鏡頭開始）低通回到 4 kHz、轉暖 | `paper.flutter` → 字條被風吹動 |
| 12 | （鏡頭開始）**標題卡主旋律**：圖紙主題全句（celesta + strings） | `pad.out` → 全部 3 秒淡出 |

其他過場（`cs:ch1` 起尚未實作）：提示對映表先列出分鏡第 5 節已出現的名稱（撕紙、鳥聲、水壺、和弦…），之後新增過場時只加表格列；**測試檢查 `CUTSCENES` 裡每個提示都有對映**。

---

## 3. 音效清單（`audio/sfx.ts`；每項是純資料配方：振盪器 / 雜訊 + 濾波 + 包絡 + 音高滑動 + 延遲）

| 類別 | id | 觸發 | 合成 | 峰值設計 |
|------|----|------|------|---------|
| 腳步 | `step.wood` / `step.paper` | 3D / 2D 地面上每走 1.1 單位 | 低通雜訊短敲 + 120 Hz 正弦；種子亂數 ±8% 音高 | −32 dBFS |
| 跳 / 落地 | `jump` / `land` | 離地且 vy > 0 / 落地前 vy < −4 | 雜訊上掃 / 低通雜訊 + 90 Hz | −30 / −28 |
| 2D ↔ 3D 切換 | `switch.to2d` / `switch.to3d` | `Player.mode` 改變 | 筆尖輕扣 + 紙張雜訊掃頻（往下 = 壓平、往上 = 立起） | −22 |
| 拾取 | `pickup` / `pickup.key` / `pickup.paper` | 持有物增加（依物品 id 分） | 兩個鐘音上行 / 金屬泛音 / 紙聲 | −22 |
| 拉桿 | `lever.pull` | `turnRequest` | 木頭摩擦 + 金屬喀 | −22 |
| 魔方轉動 | `cube.turn` / `dial.turn` | `ChapterState.cube` 改變（拉桿 / 控制盤） | 低沉木頭滑動 0.9 秒 + 尾端 **卡緊「咚」100 Hz**（規格關鍵動作回饋） | −20；咚 ≤ −18 |
| 魔方儀 | `dial.activate` / `dial.mode` | `dialActivate` / 進轉動模式 | 黃銅鐘音 + 齒輪 | −22 |
| 墨水 | `ink.drop` | 控制盤轉動花掉墨 | 低通正弦「滴」下滑 | −26 |
| 字卡 | `card.stick` / `card.wrong` | `card` ok / 不 ok | 紙貼上 + 咚 100 Hz / 柔和下行兩音（不刺耳，規格 D15） | −22 / −24 |
| 字卡匣 / 展開圖 | `tray.open` / `map.open` / `map.close` | 開關 | 紙張翻動 | −28 |
| 門 / 拱門 | `door.open` / `door.unseal` | `door` 事件 / 大門解封 | 木門軸低吟 / 鐘音 + 門 | −22 |
| 書擋倒下 | `bookend.fall` | `bookend` used | 木頭倒下 + 低頻咚（≤ −18） | −18 |
| 燈書 | `lamp.on` / `lamp.off` | `lampBook` used 改變 | 暖鐘音上行（三本依序音高往上）/ 柔和下滑 | −24 |
| 抽書 / 暗格 | `book.pull` / `drawer.open` | `spine` / `bookLock` / `drawer` used | 書頁摩擦 / 木抽屜 | −24 |
| 拉繩 / 壓板 / 閘門 | `cord.pull` / `cord.reset` / `plate.press` / `gate.open` | used / gone 改變 | 繩摩擦 / 咚 / 石門 | −24 / −18 |
| 推箱 | `crate.push` | 木箱位置改變（0.35 秒一次） | 低通雜訊刮擦 | −30 |
| 字條 | `note.read` | 讀到字條（訊息 key 含 `.note.`） | 紙張 | −28 |
| 驚嚇 | `scare.coats` | `flag:'scare:*'`（只在 calm = false） | 短促重音 ≤ 1.2 秒：低頻衝擊 + 木頭撞擊 + 不和諧弦 | **峰值 ≤ −6 dBFS（經限幅器）** |
| 驚嚇平靜版 | `scare.gentle` | 同上（calm = true） | 柔和布料滑落 + 低音鐘 | **≤ −24 dBFS** |
| 完成謎題 | `puzzle.solved` | `done` 事件 | 圖紙主題頭三音（鐘琴 + 鋼片琴），約 1.6 秒 | −18 |
| 通關 | `level.clear` | 通關畫面 | 主題前半 + 主音和弦 | −16 |
| UI | `ui.click` | 任何 `button` 點擊 | 木頭輕敲 | −30 |
| 過場 | `cs.*` | 過場提示（2.5） | 見 2.5 | 環境 ≤ −24、撕紙 ≤ −18 |

> 名稱注意：音效 id 不得以 `ui.` / `msg.` / `obj.` / `lvl.` / `term.` 開頭的「字串常值」出現在程式中（`tests/puzzle/content/textKeys.test.ts` 會當成文字 key 檢查）；程式內一律寫成 `'sfx.ui.click'` 這類帶 `sfx.` 前綴的 id，上表省略前綴。

---

## 4. 混音規格

```
music deck A ┐                                  ┌→ reverb send ┐
music deck B ┴→ musicGain → viewFilter ─┐       │              │
sfx(world)  → sfxGain  → viewFilter ────┼→ preMaster(trim) → muteGain → masterGain → compressor → clip shaper → ctx.destination
sfx(ui)     → sfxGain ──────────────────┘                                    (−6 dBFS 門檻)  (峰值硬上限 0.49)
```

| 項目 | 數值 | 依據 |
|------|------|------|
| 三條音量 | master / music / sfx，0～1，預設 **0.8 / 0.6 / 0.8**；增益 = 音量²（感知較線性）；改變時 50 ms 平滑 | 〔推論〕 |
| 靜音 | `mute` 開 → muteGain 0.12 秒淡到 0（不 suspend，取消靜音不需重建） | |
| 限幅器 | `DynamicsCompressorNode`：threshold −6 dB、knee 0、ratio 20、attack 0.003、release 0.25；其後的增益補償抵消瀏覽器自動補償增益，之後接**柔性削波 WaveShaper**（|x| ≤ 0.35 線性，往 0.49 漸近），保證峰值 ≤ −6.2 dBFS | 規格 9.1 限幅器 |
| 一般時段 | 音樂峰值設計 ≤ −16 dBFS；總輸出 ≤ −14 dBFS（過場同樣） | 規格 9.1、分鏡 2.5 |
| 低頻持續音 | 增益 ≤ 0.03 | 規格 9.1 |
| 環境音 | 峰值 ≤ −24 dBFS、起音 ≥ 150 ms、同類 ≥ 20 秒一次 | 規格 9.1 |
| 關鍵動作回饋音 | 80～120 Hz、≤ −18 dBFS、間隔 ≥ 0.5 秒 | 規格 9.1 |
| 包絡 | 每個聲音起音 ≥ 5 ms、釋音 ≥ 20 ms，停止時間 = 釋音結束後；**不得硬切**（避免 pop） | 〔推論〕 |
| 淡入淡出 | 進畫面 1.5 秒；換章交叉淡化 2.5 秒（兩個 deck）；過場結束 3 秒；頁面隱藏 0.25 秒淡出後 `suspend()`，回來 `resume()` 後 0.6 秒淡入 | |
| 驚嚇 | 峰值 ≤ −6 dBFS、長度 ≤ 1.2 秒；**前 ≥ 2 秒相對安靜**（衣帽間機制本身安靜 2.5 秒；音訊在驚嚇前 2 秒不排新的環境音）；**後 15 秒進 `quiet`、不播環境音與裝飾音**；`calmTension` → 改 `scare.gentle`（≤ −24 dBFS），並把低頻衝擊（drone / pulse / 咚）降 6 dB | 規格 9.1 驚嚇、減弱模式 |
| 切換音色 | 藏寶圖（2D）低通 1.2 kHz、實景 4 kHz，0.3 秒漸變；只套在音樂與世界音效，不套 UI 聲 | 規格 9.1 |

---

## 5. 執行環境

| 項目 | 設計 |
|------|------|
| 自動播放政策 | `AudioContext` 在**第一次使用者手勢**（`pointerdown` / `keydown` / `touchend`，capture）時才建立並 `resume()`；之前的 `setChapter / setContext` 只記狀態，建立後套用；建立失敗（沒有 Web Audio）→ 整個管理器變成無聲空殼，不拋錯 |
| 排程 | 「兩個時鐘」：`setInterval(50 ms)` 叫 `pump(currentTime + 0.25)`，把這段時間內的音符（純函式算出）排到 Web Audio 時間軸；離線渲染時直接 `pump(終點)` |
| 節點上限 | 同時發聲 ≤ 64 個聲部（每聲部 2～8 個節點）；音樂的音、腳步、UI 是低優先，只能用到上限的 3/4（剩下留給音效），超過 → 丟棄新的聲音並計數；每個聲部在 `onended` 時 `disconnect()` 並移出清單；`stats()` 回報 active / dropped |
| 不洩漏 | 不保留已結束的節點；`dispose()` 停排程、移除監聽、`close()` context |
| 頁面隱藏 | `visibilitychange`（hidden）與 `blur` → 淡出 + `suspend()`；回來 → `resume()` + 淡入 |

---

## 6. 無障礙

- 設定頁有**靜音**與三條音量滑桿；設定存在 `puzzle:settings`（`masterVolume / musicVolume / sfxVolume / mute`），舊設定沒有這些欄位 → 用預設值。
- 設定頁同時放「減弱緊張效果」開關（`calmTension` 已存在、原本沒有 UI）：驚嚇改平靜版、脈動低音關閉、低頻衝擊降 6 dB（音訊），其餘視覺效果照架構 4.13。
- 不使用快速閃爍式的節奏：脈動 ≤ 96 BPM、琶音 ≤ 8 分音符、沒有 > 4 Hz 的音量顫動（顫音只在音高）。
- 聲音不承載通關必需資訊（每個音效都有既有的畫面 / 文字回饋）。

---

## 7. 程式結構（架構 2.2：`audio/` 權限同 `render`；只有 `app` import 它）

| 檔案 | 層 | 內容 | 純？ |
|------|----|------|------|
| `audio/rng.ts` | audio | `mulberry32`、`hashSeed(string)` | 純 |
| `audio/theory.ts` | audio | 調式表、級數 → MIDI、`mtof`、和弦 | 純 |
| `audio/score.ts` | audio | 各章 / 過場的 `Score`、動機、`composeBar()`、`pulseTimes()`、`levelIntensity()` | 純 |
| `audio/mix.ts` | audio | 上限常數、`volumeGain`、`dbToGain`、`layerMix()`、`fadeCurve()`、`clipCurve()` | 純 |
| `audio/sfx.ts` | audio | 音效配方表 `SFX` | 純資料 |
| `audio/events.ts` | audio | `worldEventSfx()`、`CUE_MAP`（過場提示 → 音效 / 音樂動作）、`LevelObserver`（狀態差 → 音效）、`Throttle`、`ScareGate` | 純 |
| `audio/engine.ts` | audio | `AudioEngine`：匯流排、限幅、殘響、聲部、配方播放、樂器 | Web Audio |
| `audio/music.ts` | audio | `MusicDirector`：兩個 deck、排程、交叉淡化、脈動 | Web Audio |
| `audio/manager.ts` | audio | `AudioManager` 介面與 `WebAudioManager`（init / resume / setChapter / setIntensity / setContext / setView / play / cue / setVolumes / mute / dispose / stats）、手勢解鎖、頁面隱藏 | Web Audio / DOM |
| `app/audioBridge.ts` | app | 畫面 → 章節 / 情境；每幀把 `LevelSession` 的狀態交給 `LevelObserver`；世界事件、過場事件、按鈕點擊 → 管理器；設定頁開關 | DOM |
| `ui/screens/sound.ts` | ui | 聲音設定面板（三條滑桿、靜音、減弱緊張效果） | DOM |

> 與架構 4.13 的差異：架構草案的 `audio/synth.ts`（`PuzzleAudio`：setBed / setLayers / setPulseBpm / chime / sting / thump / setViewFilter）拆成 `engine / music / manager` 三檔；對應關係：setBed / setLayers → `setChapter` + `setContext` + `setIntensity`（層由 `layerMix` 算）、setPulseBpm → `MusicDirector.setPulseBpm`、sting → 驚嚇動作（`ScareGate`）、thump → 回饋類音效、setViewFilter → `setView`；`content/moodTypes.ts` 尚未建立，強度暫由 `score.levelIntensity`（規格 9.1 表）提供。

既有檔案只加掛點：`app/app.ts`（建立 bridge、`go` / 每幀 / 過場事件 / 選單「聲音」）、`app/levelSession.ts`（`SessionContext.onWorldEvent` 一行轉發）、`meta/settings.ts`（4 個欄位與校正）、`ui/screens/menu.ts`（選單一個連結）、文字表（新增 `ui-sound.ts` 分檔與 index 一行）、`tests/puzzle/architecture.test.ts`（層集合加入 `audio`）。

---

## 8. 測試策略

| 類型 | 內容 |
|------|------|
| 單元（Node，`tests/puzzle/audio/`） | `mulberry32` 確定性；調式 / 級數 / 動機在各章調式的音程；`composeBar` 同種子兩次相同、不同小節不同、音域與拍內時間合法、強度 0 只有 pad；`pulseTimes` ≤ 96 BPM、變速漸變 ≥ 2 秒；`layerMix` 各情境、calm 時 pulse = 0；`volumeGain` 單調、0 → 0、1 → 1；`fadeCurve` 端點與單調；`clipCurve` 峰值 ≤ 0.49；音效配方：每個 id 有配方、驚嚇 ≤ 1.2 秒、環境類起音 ≥ 150 ms、回饋類頻率 80～120 Hz、所有聲音起音 ≥ 5 ms；**事件映射完整性**：每種 `GameEvent` 都有處理、`CUTSCENES` 裡每個提示都有對映、對映的音效都存在；`ScareGate`：calm 時驚嚇改平靜版、驚嚇後 15 秒內環境音被擋；`Throttle`：環境同類 ≥ 20 秒、回饋 ≥ 0.5 秒；`LevelObserver`：撿到、切換、跳、腳步、書擋、燈書亮滅、轉動、換房重置（不誤報） |
| 設定 | 舊設定（沒有音量欄位）→ 預設值；越界 → 校正 |
| 架構 | `architecture.test.ts` 的層集合加入 `audio`；矩陣規則不放寬（`audio` 只被 `app` import） |
| 瀏覽器（playwright-core，headless Chrome，不進專案） | 手勢後 `AudioContext.state === 'running'`；每個音樂層 / 情境 / 音效播放不拋錯、console error 0；換章交叉淡化無 pop（錄下輸出，檢查換章前後的一階差分沒有尖峰）；頁面隱藏 → `suspended`、回來 → `running`；節點數播完後回到 0 |
| 離線渲染（`OfflineAudioContext`） | 各章主題 30 秒、序章全程、每個音效、驚嚇（一般 / 平靜）→ 峰值（≤ −6 dBFS）、RMS、非靜音、無 NaN、無削波（|x| ≥ 0.999 的樣本數 = 0）、頻譜重心；輸出 WAV 供人工試聽 |
| 人工 | 音色、音量平衡、動機辨識度、驚嚇是否過度：需真人試聽（〔推論〕的數值都在這一步調整） |

### 8.1 實測（2026-11-03，headless Chrome 離線渲染 44.1 kHz；音量 master / music / sfx = 1，最壞情況）

| 項目 | 峰值 dBFS | RMS dBFS | 400 ms 短時 RMS 最大 | 削波 / NaN | 頻譜重心 Hz |
|------|----------|---------|-------------------|-----------|------------|
| 第一章 30 秒（強度 1） | −19.9 | −32.6 | −30.7 | 0 / 0 | 318 |
| 第二章（強度 2） | −22.4 | −35.9 | −31.8 | 0 / 0 | 407 |
| 第三章（強度 2） | −17.6 | −32.1 | −30.2 | 0 / 0 | 332 |
| 第四章（強度 3，只有低頻） | −18.7 | −36.2 | −31.3 | 0 / 0 | 64 |
| 第五章（強度 3） | −18.1 | −36.6 | −32.4 | 0 / 0 | 323 |
| 終章 / 結局 A / 結局 B | −21.3 / −23.0 / −19.3 | −33.5 / −38.5 / −32.7 | — | 0 / 0 | 338 / 579 / 295 |
| 序章全程（108.4 秒，播放器實際時間軸、22 個提示事件） | −20.0 | −34.9 | −29.9 | 0 / 0 | 311 |
| 序章（預設音量 0.8 / 0.6 / 0.8） | −31.1 | −47.2 | −40.4 | 0 / 0 | 454 |
| 驚嚇（一般 / 平靜版） | −12.1 / −31.6 | −30.1 / −51.1 | — | 0 / 0 | 82 / 608 |
| 驚嚇疊在第一章音樂上 | −9.8 | — | −21.4 | 0 / 0 | — |
| 200 個音效同時（節點上限） | −7.6 | — | — | 0 / 0 | 100 播 / 95 丟棄 |

- 限幅器校正：−20 dBFS 正弦進 → −20.0 出（補償增益抵消正確）；+3.5 dBFS 過載進 → −6.5 出（削波器上限 0.49）。
- 換章交叉淡化（第一 → 第二、第三 → 第四）：切換後 3.5 秒內的一階差分最大值 0.0085 / 0.0046，低於其餘時段 0.0091 / 0.0083 → 沒有 pop；即時錄音（ScriptProcessor）同樣 0.0009 vs 0.0008。
- 67 個音效逐一量測：環境類全部 ≤ −24 dBFS、回饋類 ≤ −18 dBFS、過場撕紙 −22.6 dBFS。

---

## 9. 不做 / 之後

- 不做：音檔、空間音訊（PannerNode）、動態混音自動化、使用者自訂音色。
- 之後：`content/moodTypes.ts` 建好後，強度改讀 `LevelEntry.mood`（目前 `levelIntensity()` 依規格 9.1 表查）；（已做，2026-11-05 3-4 追逐 1：`chase` 事件 → `tension` 情境 3 秒漸強 + 遠處腳步、被追上 `sfx.chase.caught`、終點後 `quiet` 20 秒；`audio/events.CHASE_ACTIONS`、`WebAudioManager.chase`）；`cs:ch1` 以後的過場加入時，只需補 `CUE_MAP`（測試會提醒）。
