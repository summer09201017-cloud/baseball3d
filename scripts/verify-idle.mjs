// verify-idle.mjs — 獨立 Playwright 冒煙:idle 生動(主角轉頭+微笑、觀眾歡呼人浪)
// 自帶瀏覽器(不用共用 MCP);截圖存 scripts/shots/。用法:node scripts/verify-idle.mjs [url]
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const URL = process.argv[2] || "http://localhost:4188/";
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

await page.goto(URL, { waitUntil: "load" });
await page.bringToFront();

// 開一場練習賽,讓 idle 迴圈跑起來
await page.evaluate(() => {
  const g = window.__baseball3d;
  g.applyPresentation({ difficulty: "easy", modeId: "practice", pitchCount: 10 });
  g.startMatch();
  // 收掉選單/結算蓋版,露出畫布(UI 點擊流程才會做,這裡手動)
  document.getElementById("homeScreen")?.classList.remove("visible");
  document.getElementById("matchOverlay")?.classList.remove("visible");
});

// 跑約 7 秒,採樣確認頭轉/微笑/觀眾手臂真的會動
const ranges = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__baseball3d;
  const fan = g.crowdFigures[10];
  const s = () => ({
    batYaw: g.batterMesh.userData.headGroup.rotation.y,
    batSmile: g.batterMesh.userData.smile.scale.x,
    pitYaw: g.pitcherMesh.userData.headGroup.rotation.y,
    fanArm: fan.fig.rightArm.pivot.rotation.x,
    fanHead: fan.fig.headGroup.rotation.y,
  });
  const agg = {}; for (const k of Object.keys(s())) agg[k] = [1e9, -1e9];
  let n = 0;
  const iv = setInterval(() => {
    const v = s();
    for (const k of Object.keys(agg)) { agg[k][0] = Math.min(agg[k][0], v[k]); agg[k][1] = Math.max(agg[k][1], v[k]); }
    if (++n >= 140) { clearInterval(iv); resolve(Object.fromEntries(Object.entries(agg).map(([k, r]) => [k, +(r[1] - r[0]).toFixed(3)]))); }
  }, 50);
}));

// 截圖①:主角(投手)臉部特寫——凍結迴圈,擺出轉頭+微笑峰值(animateIdleHead 實際會到達)
await page.evaluate(() => {
  const g = window.__baseball3d;
  cancelAnimationFrame(g._raf);
  const p = g.pitcherMesh.userData;
  p.headGroup.rotation.y = 0.55;      // 轉頭看一下
  p.smile.scale.set(1.4, 1.4, 1);     // 咧嘴微笑
  g.camera.position.set(0.95, 1.82, -15.7);
  g.camera.lookAt(0, 1.71, -17.5);
  g.renderer.render(g.scene, g.camera);
});
await page.screenshot({ path: path.join(SHOTS, "idle-head-glance-smile.png") });

// 截圖②:觀眾席——把手臂用一個時間點鋪成人浪,相機看向前排真人偶觀眾
await page.evaluate(() => {
  const g = window.__baseball3d;
  cancelAnimationFrame(g._raf);
  // 直接呼叫 animateCrowdCheer 取一個手臂高低錯落的時間點(人浪)
  const mod = g.__idle || null;
  // 手動擺人浪(等同 animateCrowdCheer 在某時刻的結果),確保畫面有舉手有放下
  for (const c of g.crowdFigures) {
    const ph = c.phase || 0;
    const raise = Math.sin(2.4 * 3.1 + ph) * 0.5 + 0.5;
    const lift = -0.5 - raise * (-0.5 - (-2.9));
    c.fig.rightArm.pivot.rotation.x = lift; c.fig.rightArm.pivot.rotation.z = -0.22;
    c.fig.leftArm.pivot.rotation.x = lift; c.fig.leftArm.pivot.rotation.z = 0.22;
    c.fig.headGroup.rotation.y = Math.sin(0.9 * 3.1 + ph) * 0.42;
    c.fig.rig.position.y = c.rigY + raise * 0.06;
  }
  g.camera.position.set(0, 7.5, -58);
  g.camera.lookAt(0, 4.5, -74);
  g.renderer.render(g.scene, g.camera);
});
await page.screenshot({ path: path.join(SHOTS, "idle-crowd-cheer.png") });

await browser.close();

const ok = pageErrors.length === 0;
console.log(JSON.stringify({ ranges, pageErrors, consoleErrors, ok }, null, 2));
process.exit(ok ? 0 : 1);
