# CLAUDE.md — 3D 棒球(baseball3d)

Vite + Three.js 主審視角棒球。2026-07-10 一天內從零建成;參考 `C:\Users\HFP\Desktop\籃球CO` 的架構
(場景/HUD/PWA/儲存),規則昇維自 hfpc-paul-game 的 2D `baseball`(九宮格/五球種/時機窗)。

## 檔案

| 檔 | 用途 |
|---|---|
| `src/game.js` | 全部遊戲邏輯:Three 場景(球場/看台/人物)、狀態機(menu→ready→pitching→result→done)、規則、AI、跑壘/盜壘、雙鏡位相機 |
| `src/main.js` | UI 接線+中文播報(字幕條+人聲)+操作(鍵盤/觸控) |
| `src/voicePhrases.js` | 播報詞庫(固定句)+voiceKey(FNV-1a)——烤製與 runtime 共用 |
| `src/voice.js` | 人聲 runtime:mp3 優先,缺檔=只出字幕(★不用 Web Speech 機器聲) |
| `scripts/gen-voice.mjs` | msedge-tts 烤 mp3(zh-TW-YunJheNeural 雲哲男聲)→ public/voice/;累加式 |
| `src/audio.js` | 合成音效(擊球/接球/歡呼)+觀眾環境聲(噪音迴圈)/喝采浪/節奏拍手 |

## 關鍵設計

- **座標**:本壘=原點,-z 朝投手丘(MOUND_Z -17.5)、壘間 19m、牆 72m。好球帶 ZONE(0.62×0.72m)。
- **雙鏡位**:PLATE_CAM(0,2.3,3.5)投打近景 / FIELD_CAM(0,16.5,17)全場——打出去(非界外)、盜壘、
  跑者動畫時自動 lerp 過去;要看得到四壘包+七守備+牆+觀眾(使用者點名)。
- **視角三檔(07-11)**:V 鍵/視角鈕循環 主審→投手肩後(PITCHER_CAM)→高空俯瞰(TOP_CAM);
  ★打擊半局鎖主審(球飛向你才抓得準時機),投球/AI 打擊半局任切;選擇記 localStorage(bb3d-camview);
  俯瞰檔打出去維持俯瞰,其餘照舊跳 FIELD_CAM。
- **先擲命運再演軌跡**:swing() 按時機窗判 homer/hit(單二三)/contact(40% 安打 60% 接殺)/foul/whiff,
  然後 launchHit 演球飛+接殺派最近野手跑過去。守備不可操作(v1 拍板)。
- **跑壘**:runner 物件制 {mesh, base},沿壘線路徑動畫(1B→3B 會經過 2B);保送=強迫進壘鏈。
- **盜壘**:canSteal(前位跑者且下一壘空)→ attemptSteal 動畫起跑,0.8s 後判定(2壘 0.72/3壘 0.52,
  幼+0.16/童+0.08/職業-0.08);失敗=出局。AI 打擊方 16% 機率自己發動。
- **難度五檔**:window(時機窗倍率)/durMul(球速)/ballRate+kinds(AI 投手)/aiBat(AI 打者結果分布)。
  07-10 使用者回報太好打→WIN 收緊為 perfect 0.062/good 0.15,contact 出局率 60%。
- **人物臉部鐵則**:makePerson 頭上有眼睛+嘴巴(faceDir 控面向)。
- **觀眾**:牆後三層看台+InstancedMesh 420 顆彩點;cheerCrowd() 看台彈跳;audio 有環境人聲/喝采/拍手。

## 播報人聲鐵則(2026-07-10 使用者點名「太機器聲」)

- 所有唸出的句子=預烤 mp3(雲哲);**絕不用 Web Speech fallback**。
- 動態字幕(含比分/人名)只唸固定部分:pushCommentary(text, tone, spoken)。
- 新增句子:src/voicePhrases.js PHRASES + `node scripts/gen-voice.mjs`(需網路;字串要跟 main.js 完全一致)。

## 驗證

`npm run build` 綠;Playwright 用 `window.__baseball3d` 注入狀態截圖(主審視角/全場鏡位/跑者/盜壘)。
headless 背景分頁 rAF 會節流——時鐘變慢是測試假象。
