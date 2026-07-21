// UI 接線+中文播報(參考籃球CO main.js 範式)
import "./styles.css";
import { BaseballGame, GAME_MODES } from "./game.js";
import { AudioManager } from "./audio.js";
import { speakLine, setVoiceEnabled } from "./voice.js";
import { loadSettings, saveSettings } from "./storage.js";

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $("gameCanvas"),
  homeScore: $("homeScore"), awayScore: $("awayScore"),
  homeName: $("homeName"), awayName: $("awayName"),
  inningLabel: $("inningLabel"), modeLabel: $("modeLabel"),
  ballLights: $("ballLights"), strikeLights: $("strikeLights"), outLights: $("outLights"),
  pitchPanel: $("pitchPanel"), pitchHint: $("pitchHint"), pitchSel: $("pitchSel"),
  statusMessage: $("statusMessage"), commentaryBar: $("commentaryBar"),
  touchAction: $("touchAction"), touchControls: $("touchControls"),
  menuButton: $("menuButton"), audioButton: $("audioButton"),
  matchOverlay: $("matchOverlay"), overlayTitle: $("overlayTitle"), overlayText: $("overlayText"),
  overlayMenuButton: $("overlayMenuButton"), overlayReplayButton: $("overlayReplayButton"),
  homeScreen: $("homeScreen"), modeCardGrid: $("modeCardGrid"),
  difficultySelect: $("difficultySelect"), audioSelect: $("audioSelect"),
  pitchCountInput: $("pitchCountInput"), pitchCountLabel: $("pitchCountLabel"),
  inningsInput: $("inningsInput"), inningsLabel: $("inningsLabel"),
  targetRunsInput: $("targetRunsInput"), targetRunsLabel: $("targetRunsLabel"),
  startMatchButton: $("startMatchButton"), modeHint: $("modeHint"),
};

const settings = loadSettings();
const audio = new AudioManager();
let audioEnabled = settings.audioEnabled !== false;
audio.setEnabled(audioEnabled);

const game = new BaseballGame({ canvas: ui.canvas });
if (typeof window !== "undefined") window.__baseball3d = game; // 開發/測試掛勾

let selectedMode = settings.modeId && GAME_MODES[settings.modeId] ? settings.modeId : "practice";
let selectedDifficulty = settings.difficulty || "easy";
ui.difficultySelect.value = selectedDifficulty;
ui.audioSelect.value = audioEnabled ? "on" : "off";

// 盜壘鈕(動態塞進 touch-controls)
const stealBtn = document.createElement("button");
stealBtn.className = "touch-action steal";
stealBtn.id = "stealButton";
stealBtn.textContent = "🏃 盜壘 (E)";
stealBtn.hidden = true;
ui.touchControls.prepend(stealBtn);

// 燈號
function buildLights(el, n, cls) {
  el.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const dot = document.createElement("i");
    dot.className = cls;
    el.appendChild(dot);
  }
}
buildLights(ui.ballLights, 3, "ball");
buildLights(ui.strikeLights, 2, "strike");
buildLights(ui.outLights, 3, "out");
function setLights(el, lit) {
  [...el.children].forEach((dot, i) => dot.classList.toggle("on", i < lit));
}

// ── 中文播報:字幕條+語音(隨機詞庫) ──
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// spoken=實際唸出的句子(預烤 mp3 人聲;含比分等動態字的字幕只唸固定部分)
function pushCommentary(text, tone = "info", spoken = text) {
  const bar = ui.commentaryBar;
  if (!bar || !text) return;
  bar.hidden = false;
  bar.dataset.tone = tone;
  bar.textContent = text;
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = "";
  speakLine(spoken);
}

const HIT_NAME = { single: "一壘安打", double: "二壘安打", triple: "三壘安打" };
function handleGameEvent(event) {
  const batting = game.battingTeam();
  const batterName = batting === "home" ? (game.modeId === "duel2p" ? "P1(藍)" : game.modeId === "pitchduel" ? "阿福" : "你") : (game.modeId === "duel2p" ? "P2(紅)" : "阿福");
  const tone = batting === "home" ? "hot" : "cool";
  switch (event.type) {
    case "match-start":
      audio.cheer();
      audio.startCrowd();
      audio.crowdCheer(0.8);
      game.cheerCrowd(0.8);
      pushCommentary(pick(["比賽開始!全場屏息以待!", "哨聲響起——來打棒球吧!", "球員就位,比賽開始!"]));
      break;
    case "pitch":
      audio.pitchWhoosh();
      break;
    case "strike-take":
      audio.catchPop();
      pushCommentary(pick(["進好球帶——好球!", "看過去了,主審判好球!", "這顆很甜,可惜沒揮!"]));
      break;
    case "ball-take":
      audio.catchPop();
      pushCommentary(pick(["壞球,選得好!", "引誘球沒上當——壞球!", "眼光犀利,壞球!"]));
      break;
    case "foul":
      audio.batCrack();
      audio.crowdCheer(0.35);
      pushCommentary(pick(["擦棒界外!", "打到了,可惜偏出界外!", "界外球,再來!"]));
      break;
    case "whiff":
      audio.buzz();
      audio.crowdCheer(0.3);
      pushCommentary(pick(["大棒一揮——落空!", "揮棒落空!", "球從棒下溜過去了!"]));
      break;
    case "hbp":
      audio.buzz();
      audio.crowdCheer(0.6);
      pushCommentary(`哎呀,觸身球!${batterName} 保送上壘!`, tone, "觸身球!保送上壘!");
      break;
    case "walk":
      audio.cheer();
      audio.crowdCheer(0.5);
      pushCommentary(`四壞球保送!${batterName} 上一壘!`, tone, "四壞球保送!");
      break;
    case "strikeout":
      audio.buzz();
      audio.crowdCheer(0.45);
      pushCommentary(pick(["三振出局!", "三好球——三振!", "漂亮的三振!"]), batting === "home" ? "cool" : "hot");
      break;
    case "contact":
      audio.batCrack();
      break;
    case "hit":
      audio.crowdCheer(0.7);
      game.cheerCrowd(0.7);
      pushCommentary(pick([
        `${HIT_NAME[event.hitType]}!${batterName} 上壘!`,
        `打穿防線——${HIT_NAME[event.hitType]}!`,
        `漂亮的 ${HIT_NAME[event.hitType]}!`,
      ]), tone, `${HIT_NAME[event.hitType]}!`);
      break;
    case "homer":
      audio.cheer();
      audio.crowdCheer(1.2);
      audio.crowdChant();
      game.cheerCrowd(1.3);
      audio.vibrate([80, 40, 120]);
      pushCommentary(pick([
        "球飛得又高又遠——全壘打!",
        "再見了!飛越全壘打牆!全壘打!",
        "轟出去了!這是一發全壘打!",
      ]), tone);
      break;
    case "flyout":
      audio.catchPop();
      audio.crowdCheer(0.7);
      game.cheerCrowd(0.7);
      pushCommentary(pick(["高飛球——被接殺了!", "野手站好位置,接殺出局!", "可惜,正面高飛球被沒收!"]), batting === "home" ? "cool" : "hot");
      break;
    case "run":
      audio.crowdCheer(1);
      game.cheerCrowd(1);
      pushCommentary(`跑者回本壘得分!目前 ${event.homeScore} 比 ${event.awayScore}!`, tone, "跑者回本壘得分!");
      break;
    case "steal-go":
      audio.crowdCheer(0.55);
      pushCommentary(`跑者起跑——要盜${["一", "二", "三"][event.toBase - 1]}壘!`, tone, "跑者起跑,要盜壘了!");
      break;
    case "catcher-throw":
      audio.pitchWhoosh();
      audio.crowdCheer(0.45);
      pushCommentary('捕手長傳' + ['一','二','三'][event.toBase - 1] + '壘!', batting === 'home' ? 'cool' : 'hot', '');
      break;
    case "steal-safe":
      audio.cheer();
      audio.crowdCheer(0.9);
      game.cheerCrowd(0.9);
      pushCommentary(pick([`滑壘——安全上壘!盜壘成功!`, `快一步!盜壘成功!`]), tone);
      break;
    case "steal-out":
      audio.buzz();
      pushCommentary(pick([`傳球到位——盜壘失敗,出局!`, `被抓到了!盜壘出局!`]), batting === "home" ? "cool" : "hot");
      break;
    case "status":
      pushCommentary(event.text, "info", "");
      break;
    case "half":
      audio.catchPop();
      audio.crowdCheer(0.6);
      audio.crowdChant();
      pushCommentary(`${event.text},攻守交換!`, "info", "攻守交換!");
      break;
    case "match-end":
      audio.horn();
      audio.crowdCheer(1.3);
      audio.crowdChant();
      game.cheerCrowd(1.4);
      ui.overlayTitle.textContent = event.title;
      ui.overlayText.textContent = event.text;
      ui.matchOverlay.classList.add("visible");
      pushCommentary(event.title, "info", "比賽結束!");
      try { if (!['localhost','127.0.0.1'].includes(location.hostname)) {   // -done:玩完一局(t=本局秒數,/stats 使用次數與平均停留吃這個)
        var __dt = Math.round((Date.now() - (window.__matchT0 || Date.now())) / 1000);
        navigator.sendBeacon?.('https://hfpc-play-stats.summer09201017.workers.dev/api/ping?g=baseball3d-done&t=' + __dt);
      } } catch (_) {}
      break;
    default:
      break;
  }
}
game.onEvent = handleGameEvent;

game.onHud = (s) => {
  const isPractice = s.modeId === "practice";
  const isPitchduel = s.modeId === "pitchduel";
  ui.homeName.textContent = s.modeId === "duel2p" ? "P1" : "你";
  ui.awayName.textContent = s.p2Label;
  ui.homeScore.textContent = isPractice ? String(s.points) : String(s.rawScore.home);
  ui.awayScore.textContent = String(s.rawScore.away);
  ui.inningLabel.textContent = isPractice || isPitchduel
    ? `第 ${Math.min(s.totalPitches, s.pitchCount + 1)}/${s.totalPitches} 球`
    : `${s.inning} 局${s.half === "top" ? "上" : "下"}`;
  ui.modeLabel.textContent = s.modeLabel;
  setLights(ui.ballLights, s.balls);
  setLights(ui.strikeLights, s.strikes);
  setLights(ui.outLights, s.outs);
  ui.statusMessage.textContent = `${s.message} ・ 壘上:${s.basesText}`;
  ui.pitchPanel.hidden = !s.humanPitching || s.phase === "done" || s.phase === "menu";
  ui.pitchSel.textContent = s.pitchSel;
  ui.touchAction.textContent = s.humanPitching ? "投球!" : "揮棒!";
  stealBtn.hidden = !s.canSteal;
};

// ── 選單 ──
function persist() {
  saveSettings({ modeId: selectedMode, difficulty: selectedDifficulty, audioEnabled });
}
// 球數/局數輸入:依模式顯示(練習/投球挑戰=球數;對戰=局數);預設只是預設,玩家可改(量值通則)
function syncCountInputs() {
  const isInnings = selectedMode === "match3" || selectedMode === "duel2p";
  const isRace = selectedMode === "racerun";
  ui.pitchCountInput.hidden = isInnings || isRace; ui.pitchCountLabel.hidden = isInnings || isRace;
  ui.inningsInput.hidden = !isInnings; ui.inningsLabel.hidden = !isInnings;
  ui.targetRunsInput.hidden = !isRace; ui.targetRunsLabel.hidden = !isRace;
  if (!isInnings && !isRace) ui.pitchCountInput.value = String(selectedMode === "pitchduel" ? (settings.pitchduelCount || 6) : (settings.practiceCount || 10));
}
ui.modeCardGrid.addEventListener("click", (e) => {
  const card = e.target.closest(".mode-card");
  if (!card) return;
  audio.unlock(); audio.uiTap();
  selectedMode = card.dataset.mode;
  syncCountInputs();
  for (const c of ui.modeCardGrid.querySelectorAll(".mode-card")) c.classList.toggle("selected", c === card);
  ui.modeHint.textContent = {
    practice: "球到本壘上方(最大)時揮棒:空白鍵/Enter/點畫面。壞球別揮,四壞保送!",
    pitchduel: "你當投手:W/S 高低、A/D 左右(九宮格)、Q/E 換球種、空白鍵投球——騙過阿福!",
    match3: "3 局攻防:上半你打(E=盜壘)、下半你投。得分多的贏!",
    duel2p: "P1 打擊(Enter 揮棒、E 盜壘)/P2 投球(WASD+QE+空白鍵),換局攻守交換!",
  }[selectedMode];
  persist();
});
ui.difficultySelect.addEventListener("change", (e) => { selectedDifficulty = e.target.value; persist(); });
ui.audioSelect.addEventListener("change", (e) => {
  audio.unlock();
  audioEnabled = e.target.value === "on";
  audio.setEnabled(audioEnabled);
  setVoiceEnabled(audioEnabled);
  ui.audioButton.textContent = audioEnabled ? "音效開啟" : "音效靜音";
  persist();
});
syncCountInputs();
ui.startMatchButton.addEventListener("click", () => {
  window.__matchT0 = Date.now();   // -done beacon 用:本局開始時間
  audio.unlock(); audio.uiTap();
  const pitchCount = Math.max(1, Math.min(30, parseInt(ui.pitchCountInput.value, 10) || 10));
  const innings = Math.max(1, Math.min(9, parseInt(ui.inningsInput.value, 10) || 3));
  const targetRuns = Math.max(1, Math.min(30, parseInt(ui.targetRunsInput.value, 10) || 5));
  if (selectedMode === "practice") settings.practiceCount = pitchCount;
  if (selectedMode === "pitchduel") settings.pitchduelCount = pitchCount;
  saveSettings({ ...settings, modeId: selectedMode, difficulty: selectedDifficulty, audioEnabled });
  game.applyPresentation({ difficulty: selectedDifficulty, modeId: selectedMode, pitchCount, innings, targetRuns });
  ui.homeScreen.classList.remove("visible");
  ui.matchOverlay.classList.remove("visible");
  game.startMatch();
});
ui.menuButton.addEventListener("click", () => {
  audio.uiTap();
  audio.stopCrowd();
  game.phase = "menu";
  ui.matchOverlay.classList.remove("visible");
  ui.homeScreen.classList.add("visible");
});
ui.overlayMenuButton.addEventListener("click", () => {
  audio.uiTap();
  ui.matchOverlay.classList.remove("visible");
  ui.homeScreen.classList.add("visible");
});
ui.overlayReplayButton.addEventListener("click", () => {
  audio.uiTap();
  ui.matchOverlay.classList.remove("visible");
  game.startMatch();
});
ui.audioButton.addEventListener("click", () => {
  audio.unlock();
  audioEnabled = !audioEnabled;
  audio.setEnabled(audioEnabled);
  setVoiceEnabled(audioEnabled);
  ui.audioButton.textContent = audioEnabled ? "音效開啟" : "音效靜音";
  ui.audioSelect.value = audioEnabled ? "on" : "off";
  persist();
});

// ── 操作:鍵盤 ──
window.addEventListener("keydown", (e) => {
  if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (game.phase === "menu" || game.phase === "done") return;
  audio.unlock();
  const humanPitching = game.humanPitching();
  if (e.code === "Space") {
    if (humanPitching) game.humanPitch();
    else game.swing();
  }
  if (e.code === "Enter" && !e.repeat) game.swing(); // 打者(對決 P1/雙人打擊方)
  if (e.code === "KeyE" && !e.repeat && game.humanBatting()) game.attemptSteal();
  if (e.code === "KeyV" && !e.repeat) game.cycleCamView();
  if (humanPitching && game.phase === "ready") {
    if (e.code === "KeyW" || e.code === "ArrowUp") game.moveAim(-1, 0);
    if (e.code === "KeyS" || e.code === "ArrowDown") game.moveAim(1, 0);
    if (e.code === "KeyA" || e.code === "ArrowLeft") game.moveAim(0, -1);
    if (e.code === "KeyD" || e.code === "ArrowRight") game.moveAim(0, 1);
    if (e.code === "KeyQ" && !e.repeat) game.cycleKind(-1);
    if (e.code === "KeyE" && !e.repeat && !game.humanBatting()) game.cycleKind(1);
  }
});

// ── 操作:觸控/滑鼠 ──
document.getElementById("cameraButton").addEventListener("click", () => {
  game.cycleCamView();
});

ui.touchAction.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  audio.unlock();
  if (game.humanPitching()) game.humanPitch();
  else game.swing();
});
stealBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  audio.unlock();
  game.attemptSteal();
});
ui.canvas.addEventListener("pointerdown", () => {
  audio.unlock();
  if (game.phase === "menu" || game.phase === "done") return;
  if (!game.humanPitching()) game.swing();
});

// PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
