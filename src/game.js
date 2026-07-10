// ⚾ 3D 棒球・主審視角(baseball3d)——參考籃球CO(fullcourt-3d-basketball)架構的 Three.js 棒球。
// 2026-07-10 使用者拍板 v1 範圍:
//   ① 視角=主審後方 3D(鏡頭在捕手後上方,球由遠而近飛來——2D 棒球打擊王的體感直接立體化)。
//      ★雙鏡位:投打時近景;打出去/盜壘/跑壘時鏡頭自動拉高,看得到四個壘包、內外野七名守備、
//      跑者上壘與全壘打牆(使用者點名的可視需求)。
//   ② 只操作投打+盜壘,守備自動:打出去「先擲命運再演軌跡」演出安打/接殺/全壘打;跑壘自動,
//      但打擊方可按 E(或 🏃 盜壘鈕)指揮壘上前位跑者盜壘——成功率看目標壘與難度,失敗=出局。
//   ③ 模式:打擊練習/投球挑戰/短場對戰(3 局)/雙人同機;年齡五檔+中文播報內建。
// 規則沿用 2D 棒球打擊王:九宮格好壞球(內 3×3=好球、外圈=引誘壞球)、五種球種(快/慢/曲/滑/伸卡,
//   彎的是途中軌跡、終點回選定落點)、時機窗以秒計、四壞保送、三好三振。
// ★人物臉部鐵則:投手/打者/野手/跑者都有眼睛與嘴巴。

import * as THREE from "three";

export const DIFFICULTY_LABELS = {
  kids: "幼兒",
  child: "兒童",
  easy: "入門",
  normal: "標準",
  hard: "職業",
};

// window=時機窗倍率(越大越好打);durMul=球速倍率(越大越慢);ballRate=AI 投手壞球率;
// kinds=AI 投手會用的球種;aiBat=AI 打者(你投球時):chase 追打壞球率、swing 好球出棒率、dist 結果分布
export const DIFFICULTY_PRESETS = {
  kids:   { window: 2.2,  durMul: 1.35,  ballRate: 0.18, kinds: ["slow"],                                     aiBat: { chase: 0.4,  swing: 0.82, dist: { homer: 0.08, hit: 0.24, foul: 0.34 } } },
  child:  { window: 1.7,  durMul: 1.2, ballRate: 0.25, kinds: ["slow", "fast"],                              aiBat: { chase: 0.3,  swing: 0.88, dist: { homer: 0.12, hit: 0.3,  foul: 0.32 } } },
  easy:   { window: 1.35, durMul: 1.1, ballRate: 0.3,  kinds: ["fast", "slow", "curve"],                     aiBat: { chase: 0.22, swing: 0.92, dist: { homer: 0.16, hit: 0.34, foul: 0.3 } } },
  normal: { window: 1.0,  durMul: 1.0,  ballRate: 0.32, kinds: ["fast", "slow", "curve", "slider"],           aiBat: { chase: 0.16, swing: 0.95, dist: { homer: 0.2,  hit: 0.36, foul: 0.28 } } },
  hard:   { window: 0.8,  durMul: 0.92, ballRate: 0.35, kinds: ["fast", "slow", "curve", "slider", "sinker"], aiBat: { chase: 0.1,  swing: 0.97, dist: { homer: 0.26, hit: 0.38, foul: 0.24 } } },
};

// dur=飛行秒數;brkX/brkY=途中彎折幅度(公尺);late=快到本壘才折(滑球/伸卡難讀)
export const PITCH_KINDS = {
  fast:   { label: "🔥 快速球", dur: 1.0,  brkX: 0,    brkY: 0,    late: false },
  slow:   { label: "🐢 慢速球", dur: 1.65, brkX: 0,    brkY: 0,    late: false },
  curve:  { label: "🌜 曲球",   dur: 1.35, brkX: 0.32, brkY: 0.22, late: false },
  slider: { label: "⚡ 滑球",   dur: 1.1,  brkX: 0.4,  brkY: 0,    late: true },
  sinker: { label: "⤵️ 伸卡球", dur: 1.15, brkX: 0,    brkY: 0.34, late: true },
};

export const GAME_MODES = {
  practice:  { id: "practice",  label: "打擊練習", pitches: 10 },
  pitchduel: { id: "pitchduel", label: "投球挑戰", pitches: 6 },
  match3:    { id: "match3",    label: "短場對戰", innings: 3 },
  duel2p:    { id: "duel2p",    label: "雙人同機", innings: 3 },
};

// ── 場地幾何(公尺,本壘=原點,+z 朝捕手/鏡頭,-z 朝投手丘) ──
const MOUND_Z = -17.5;
const RELEASE = { x: 0.25, y: 1.75, z: MOUND_Z + 0.6 };
const BASE_DIST = 19; // 壘間(縮小版球場)
const WALL_R = 72; // 全壘打牆距離
// 好球帶(3D):寬 0.76m、高 0.46~1.3m(07-10 使用者兩度點名放大——畫面上要大要清楚)
const ZONE = { x0: -0.38, x1: 0.38, y0: 0.46, y1: 1.3 };
const ZW = ZONE.x1 - ZONE.x0, ZH = ZONE.y1 - ZONE.y0;
// 5×5 瞄準格:內 3×3=好球帶三等分格心、外圈=引誘壞球位
const GRID_C = [ZONE.x0 - 0.26, ZONE.x0 + ZW / 6, 0, ZONE.x1 - ZW / 6, ZONE.x1 + 0.26];
const GRID_R = [ZONE.y1 + 0.26, ZONE.y1 - ZH / 6, (ZONE.y0 + ZONE.y1) / 2, ZONE.y0 + ZH / 6, ZONE.y0 - 0.26];
const COL_LABEL = ["⬅⬅ 左壞球", "左格", "中格", "右格", "➡➡ 右壞球"];
const ROW_LABEL = ["⬆⬆ 高壞球", "上格", "中格", "下格", "⬇⬇ 低壞球"];
// 時機窗(秒,乘 difficulty.window;07-10 二調:先嫌太好打、後嫌入門打不到——落在中間)
const WIN = { perfect: 0.08, good: 0.19 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pickFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 兩個鏡位:主審近景(投打)/全場高景(打出去、盜壘、跑壘——看得到四壘包+內外野守備+全壘打牆)
const PLATE_CAM = { pos: new THREE.Vector3(0, 2.3, 3.5), look: new THREE.Vector3(0, 1.05, -12) };
const FIELD_CAM = { pos: new THREE.Vector3(0, 16.5, 17), look: new THREE.Vector3(0, 0, -26) };

export class BaseballGame {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.onEvent = () => {};
    this.onHud = () => {};
    this.modeId = "practice";
    this.difficulty = "easy";
    this.phase = "menu"; // menu → ready → pitching → result → done
    this.message = "選擇模式後開始比賽。";
    this._raf = 0;
    this._clock = new THREE.Clock();
    this.anims = []; // {obj, from, to, t, dur, arc?, done?}
    this.setupScene();
    this.resetMatchState();
    this.render();
  }

  // ───────────────────────── 場景 ─────────────────────────
  setupScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1c2a4a);
    this.scene.fog = new THREE.Fog(0x1c2a4a, 90, 190);

    this.camera = new THREE.PerspectiveCamera(56, 1, 0.1, 400);
    this.camera.position.set(0, 2.3, 3.5);
    this.camera.lookAt(0, 1.05, -12);
    this.cameraShake = 0;

    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x27401f, 1.05);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xfff2d8, 1.15);
    dir.position.set(-30, 60, 20);
    this.scene.add(dir);

    this.buildField();
    this.buildZone();
    this.buildPlayers();

    // 球:真棒球縫線貼圖(兩道紅縫線+齒紋;07-10 使用者點名「球不像棒球」)
    const ballTex = (() => {
      const cv = document.createElement("canvas");
      cv.width = 256; cv.height = 128;
      const c = cv.getContext("2d");
      c.fillStyle = "#f6f2e8";
      c.fillRect(0, 0, 256, 128);
      c.strokeStyle = "#c03a3a";
      c.lineWidth = 3;
      const seamY = (x, phase) => 64 + 30 * Math.sin((x / 256) * Math.PI * 2 + phase) * (phase === 0 ? 1 : -1) + (phase === 0 ? -22 : 22);
      for (const phase of [0, Math.PI]) {
        c.beginPath();
        for (let x = 0; x <= 256; x += 4) {
          const y = seamY(x, phase);
          if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
        // 縫線齒紋(短斜線)
        c.lineWidth = 2;
        for (let x = 0; x <= 256; x += 9) {
          const y = seamY(x, phase);
          c.beginPath();
          c.moveTo(x - 3, y - 4);
          c.lineTo(x + 3, y + 4);
          c.stroke();
        }
        c.lineWidth = 3;
      }
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = THREE.RepeatWrapping;
      return t;
    })();
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 24, 24),
      new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.45 }),
    );
    this.ballMesh.visible = false;
    this.scene.add(this.ballMesh);

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  buildField() {
    // 外野草地
    const grass = new THREE.Mesh(
      new THREE.CircleGeometry(WALL_R + 14, 48),
      new THREE.MeshStandardMaterial({ color: 0x2e6b3c, roughness: 1 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    this.scene.add(grass);

    // 內野土(扇形;shape 的 +y 經 rotation.x=-90° 映到世界 -z=朝外野,不需再轉)
    const dirtShape = new THREE.Shape();
    dirtShape.moveTo(0, 0);
    dirtShape.absarc(0, 0, BASE_DIST * 1.55, Math.PI * 0.25, Math.PI * 0.75, false);
    dirtShape.lineTo(0, 0);
    const dirt = new THREE.Mesh(
      new THREE.ShapeGeometry(dirtShape, 24),
      new THREE.MeshStandardMaterial({ color: 0x9a6b40, roughness: 1 }),
    );
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.01;
    this.scene.add(dirt);

    // 壘包+壘線
    const baseGeo = new THREE.BoxGeometry(0.9, 0.12, 0.9);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xf2efe4 });
    const d = BASE_DIST / Math.SQRT2;
    this.basePos = [
      new THREE.Vector3(d, 0.07, -d), // 一壘
      new THREE.Vector3(0, 0.07, -BASE_DIST * Math.SQRT2), // 二壘
      new THREE.Vector3(-d, 0.07, -d), // 三壘
      new THREE.Vector3(0, 0.07, 0), // 本壘(回來得分)
    ];
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(baseGeo, baseMat);
      b.position.copy(this.basePos[i]);
      b.rotation.y = Math.PI / 4;
      this.scene.add(b);
    }
    // 本壘板
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.55), baseMat);
    plate.position.set(0, 0.02, 0);
    plate.rotation.y = Math.PI / 4;
    this.scene.add(plate);
    // 投手丘+投手板
    const mound = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 3.1, 0.4, 24),
      new THREE.MeshStandardMaterial({ color: 0xa87848, roughness: 1 }),
    );
    mound.position.set(0, 0.2, MOUND_Z);
    this.scene.add(mound);

    // 邊線(白)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f0 });
    for (const sign of [1, -1]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.25, WALL_R), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = (sign * Math.PI) / 4;
      const half = WALL_R / 2 / Math.SQRT2;
      line.position.set(sign * half, 0.01, -half);
      this.scene.add(line);
    }

    // 全壘打牆(弧形)+牆上字
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(WALL_R, WALL_R, 3.4, 48, 1, true, Math.PI * 0.75, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x1e4028, side: THREE.DoubleSide }),
    );
    wall.position.y = 1.7;
    this.scene.add(wall);

    // 觀眾看台(牆後三層)+人群(07-10 使用者點名)
    this.crowdGroup = new THREE.Group();
    const standMat = new THREE.MeshStandardMaterial({ color: 0x3a4255, roughness: 1, side: THREE.DoubleSide });
    for (let tier = 0; tier < 3; tier++) {
      const r = WALL_R + 3 + tier * 4;
      const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 2.6, 48, 1, true, Math.PI * 0.72, Math.PI * 0.56),
        standMat,
      );
      stand.position.y = 2.6 + tier * 2.4;
      this.crowdGroup.add(stand);
    }
    const crowdColors = [0xffd24a, 0xe05040, 0x38a9ff, 0x5ad06a, 0xf2d8b0, 0xd7a6ff, 0xff9a62];
    const crowdGeo = new THREE.SphereGeometry(0.55, 6, 6);
    const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const N_CROWD = 540;
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, N_CROWD);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < N_CROWD; i++) {
      const tier = i % 3;
      const r = WALL_R + 3 + tier * 4 + rand(-0.8, 0.8);
      // 左中右鋪滿:方位角 -43°~+43°(0=正中外野),與球場方位同一套參數(07-10 使用者點名)
      const phi = rand(-Math.PI / 4 * 0.95, Math.PI / 4 * 0.95);
      const x = Math.sin(phi) * r;
      const z = -Math.cos(phi) * r;
      const y = 4.1 + tier * 2.4 + rand(-0.2, 0.2);
      m4.setPosition(x, y, z);
      crowd.setMatrixAt(i, m4);
      crowd.setColorAt(i, new THREE.Color(crowdColors[i % crowdColors.length]));
    }
    crowd.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    this.crowdGroup.add(crowd);
    this.scene.add(this.crowdGroup);
    this.crowdCheerT = 0;

    // 後方大計分板(07-10 使用者點名):9 局逐局計分+壘上有人菱形燈+B/S/O
    this.sbCanvas = document.createElement("canvas");
    this.sbCanvas.width = 1024; this.sbCanvas.height = 384;
    this.sbCtx = this.sbCanvas.getContext("2d");
    this.sbTexture = new THREE.CanvasTexture(this.sbCanvas);
    const sbMat = new THREE.MeshBasicMaterial({ map: this.sbTexture });
    const sb = new THREE.Mesh(new THREE.PlaneGeometry(46, 17.25), sbMat); // 07-10 使用者點名再放大
    sb.position.set(0, 16, -88);
    this.scene.add(sb);
    const sbPole = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 8, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x3a4255 }),
    );
    sbPole.position.set(0, 5, -88.5);
    this.scene.add(sbPole);

    // 夜賽燈塔(裝飾)
    const lightMat = new THREE.MeshStandardMaterial({ color: 0x8a8f9a });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
    for (const sx of [-46, 46]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 22, 8), lightMat);
      pole.position.set(sx, 11, -46);
      this.scene.add(pole);
      const bulbs = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 0.8), bulbMat);
      bulbs.position.set(sx, 23, -46);
      this.scene.add(bulbs);
    }
  }

  buildZone() {
    // 好球帶九宮格(半透明)+選格準星(投球模式)
    this.zoneGroup = new THREE.Group();
    const frameMat = new THREE.LineBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.9 });
    const gridMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
    const mkLine = (pts, mat) => {
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      return new THREE.Line(g, mat);
    };
    const { x0, x1, y0, y1 } = ZONE;
    this.zoneGroup.add(
      mkLine([
        new THREE.Vector3(x0, y0, 0), new THREE.Vector3(x1, y0, 0),
        new THREE.Vector3(x1, y1, 0), new THREE.Vector3(x0, y1, 0),
        new THREE.Vector3(x0, y0, 0),
      ], frameMat),
    );
    for (let i = 1; i <= 2; i++) {
      const gx = x0 + ((x1 - x0) * i) / 3;
      const gy = y0 + ((y1 - y0) * i) / 3;
      this.zoneGroup.add(mkLine([new THREE.Vector3(gx, y0, 0), new THREE.Vector3(gx, y1, 0)], gridMat));
      this.zoneGroup.add(mkLine([new THREE.Vector3(x0, gy, 0), new THREE.Vector3(x1, gy, 0)], gridMat));
    }
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0, y1 - y0),
      new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.06 }),
    );
    fill.position.set(0, (y0 + y1) / 2, 0);
    this.zoneGroup.add(fill);
    this.scene.add(this.zoneGroup);

    this.crosshair = new THREE.Mesh(
      new THREE.RingGeometry(0.055, 0.085, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.95 }),
    );
    this.crosshair.visible = false;
    this.scene.add(this.crosshair);
  }

  // 小人(★臉部鐵則:眼睛+嘴巴;faceDir=頭面向 +z(朝鏡頭) or -z(朝投手))
  makePerson(color, { faceDir = 1, scale = 1 } = {}) {
    const g = new THREE.Group();
    const jersey = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x3a3f52, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf2d8b0, roughness: 0.7 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), pants);
    legL.position.set(-0.11, 0.25, 0);
    const legR = legL.clone(); legR.position.x = 0.11;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.26), jersey);
    torso.position.y = 0.78;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.42, 0.11), jersey);
    armL.position.set(-0.3, 0.8, 0);
    const armR = armL.clone(); armR.position.x = 0.3;
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), skin);
    const capMat = new THREE.MeshStandardMaterial({ color });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.175, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat);
    cap.position.y = 0.03;
    // 臉:兩眼+嘴(貼在面向側)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a2018 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), eyeMat);
    eyeL.position.set(-0.06, 0.02, 0.155 * faceDir);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.06;
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.02), eyeMat);
    mouth.position.set(0, -0.07, 0.16 * faceDir);
    head.add(skull, cap, eyeL, eyeR, mouth);
    head.position.y = 1.22;
    g.add(legL, legR, torso, armL, armR, head);
    g.scale.setScalar(scale);
    g.userData = { head, armR, armL };
    return g;
  }

  buildPlayers() {
    // 投手(面向鏡頭 +z)
    this.pitcherMesh = this.makePerson(0xc83a3a, { faceDir: 1 });
    this.pitcherMesh.position.set(0, 0.4, MOUND_Z);
    this.scene.add(this.pitcherMesh);

    // 打者(站左打擊區,面向投手 -z;球棒)
    this.batterMesh = this.makePerson(0x2a5ac8, { faceDir: -1 });
    this.batSide = 1; // 1=右打區(畫面右)/-1=左打區——每個打席隨機(07-10 使用者點名要有左打者)
    this.batterMesh.position.set(1.1, 0, 0.35);
    this.batterMesh.rotation.y = Math.PI * 0.08;
    // 真棒形球棒(07-10 使用者點名):尾鈕→細握把→漸粗棒身→圓頭;握把纏帶深色
    this.bat = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0xd2a565, roughness: 0.55 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.85 });
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12), grip);
    knob.position.y = 0.015;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.34, 12), grip);
    handle.position.y = 0.2;
    const taper = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.03, 0.38, 12), wood);
    taper.position.y = 0.56;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.056, 0.34, 12), wood);
    barrel.position.y = 0.92;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 8), wood);
    tip.position.y = 1.09;
    this.bat.add(knob, handle, taper, barrel, tip);
    this.batPivot = new THREE.Group();
    this.batPivot.position.set(-0.28, 1.0, 0);
    this.batPivot.add(this.bat);
    this.batPivot.rotation.z = -0.5;
    this.batPivot.rotation.x = 0.3;
    this.batterMesh.add(this.batPivot);
    this.scene.add(this.batterMesh);
    this.swingT = 0;
    this.buildDefense();
  }

  // 套用打擊區(左/右打):站位、面向、球棒位置鏡像
  applyBatSide(side) {
    this.batSide = side;
    this.batterMesh.position.set(1.1 * side, 0, 0.35);
    this.batterMesh.rotation.y = Math.PI * 0.08 * side;
    this.batPivot.position.x = -0.28 * side;
    this.batPivot.rotation.z = -0.5 * side;
  }

  buildDefense() {
    // 捕手(蹲在本壘後,面向投手;盜壘時由他長傳封殺——07-10 使用者點名)
    this.catcherMesh = this.makePerson(0xc83a3a, { faceDir: -1, scale: 0.95 });
    this.catcherMesh.scale.y = 0.68; // 蹲捕
    this.catcherMesh.position.set(0.2, 0, 1.25);
    this.scene.add(this.catcherMesh);

    // 野手(自動守備演出用;顏色隨守備方換)
    this.fielders = [];
    const spots = [
      [11.5, -12], [3, -24.5], [-3, -24.5], [-11.5, -12], // 內野 1B/2B/SS/3B(07-10 使用者再點名:二壘手/游擊貼著二壘兩側站)
      [-24, -42], [0, -50], [24, -42], // 外野 LF/CF/RF
    ];
    for (const [x, z] of spots) {
      const f = this.makePerson(0xc83a3a, { faceDir: 1, scale: 0.96 });
      f.position.set(x, 0, z);
      f.userData.home = new THREE.Vector3(x, 0, z);
      this.fielders.push(f);
      this.scene.add(f);
    }

    // 跑者棋子池(自動跑壘+盜壘;最多 3 壘上+1 名打者跑者)
    this.runnerPool = [];
    for (let i = 0; i < 4; i++) {
      const r = this.makePerson(0x2a5ac8, { faceDir: 1, scale: 0.82 });
      r.visible = false;
      this.runnerPool.push(r);
      this.scene.add(r);
    }
  }

  borrowRunnerMesh() {
    const m = this.runnerPool.find((r) => !r.userData.busy);
    if (m) { m.userData.busy = true; m.visible = true; }
    return m;
  }
  returnRunnerMesh(m) {
    if (!m) return;
    m.userData.busy = false;
    m.visible = false;
  }

  setTeamColors() {
    // 打擊方=藍、守備方=紅(雙人時 P1 藍/P2 紅,依 battingSide 切)
    const batting = 0x2a5ac8;
    const fielding = 0xc83a3a;
    const paint = (mesh, color) => {
      mesh.traverse((o) => {
        if (o.isMesh && o.material && o.material.color && o.material.roughness === 0.8) o.material.color.setHex(color);
      });
    };
    paint(this.batterMesh, batting);
    paint(this.pitcherMesh, fielding);
    paint(this.catcherMesh, fielding);
    for (const f of this.fielders) paint(f, fielding);
    for (const r of this.runnerPool) paint(r, batting);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ───────────────────────── 比賽狀態 ─────────────────────────
  resetMatchState() {
    this.score = { home: 0, away: 0 };
    this.balls = 0;
    this.strikes = 0;
    this.outs = 0;
    this.inning = 1;
    this.half = "top"; // top=主隊(你/P1)打擊
    this.pitchCount = 0;
    this.lineScore = { home: [], away: [] }; // 逐局得分(後方大計分板用)
    this.runners = []; // {mesh, base:0|1|2}(跑者物件制,支援動畫與盜壘)
    this.ball = null; // {t,dur,kind,tx,ty,brkX,brkY,late,isStrike,swung}
    this.hitFly = null;
    this.aiPlan = null;
    this.aiT = 0;
    this.aiStealT = 0;
    this.stealing = null; // {runner, to, t, safe, runnerDur, resolved}
    this.stealThrow = null;
    this.stealBallLinger = 0;
    this.stealUsed = false;
    this.aimRow = 2;
    this.aimCol = 2;
    this.pitchKindIdx = 0;
    this.resultT = 0;
    this.stars = 0;
    this.points = 0; // 練習模式得分
    if (this.runnerPool) for (const m of this.runnerPool) this.returnRunnerMesh(m);
  }

  baseOccupied(i) { return this.runners.some((r) => r.base === i); }
  runnerAt(i) { return this.runners.find((r) => r.base === i); }

  get preset() { return DIFFICULTY_PRESETS[this.difficulty]; }
  get mode() { return GAME_MODES[this.modeId]; }
  // 誰在打擊/投球是「人」:practice=人打;pitchduel=人投;match3=上半人打/下半人投;duel2p=都人
  humanBatting() {
    if (this.modeId === "practice") return true;
    if (this.modeId === "pitchduel") return false;
    if (this.modeId === "duel2p") return true;
    return this.half === "top";
  }
  humanPitching() {
    if (this.modeId === "practice") return false;
    if (this.modeId === "pitchduel") return true;
    if (this.modeId === "duel2p") return true;
    return this.half === "bottom";
  }
  battingTeam() { return this.half === "top" ? "home" : "away"; }
  inningsMode() { return this.modeId === "match3" || this.modeId === "duel2p"; }

  applyPresentation({ difficulty, modeId, pitchCount, innings }) {
    if (DIFFICULTY_PRESETS[difficulty]) this.difficulty = difficulty;
    if (GAME_MODES[modeId]) this.modeId = modeId;
    // ★量值通則(07-10 使用者拍板):球數/局數一律玩家輸入,GAME_MODES 的值只是預設
    if (pitchCount >= 1) this.pitchLimit = Math.min(30, Math.round(pitchCount));
    if (innings >= 1) this.inningLimit = Math.min(9, Math.round(innings));
  }

  startMatch() {
    this.resetMatchState();
    this.setTeamColors();
    this.applyBatSide(Math.random() < 0.5 ? 1 : -1);
    this.phase = "ready";
    this.pitchKindIdx = 0;
    this.aimRow = 2; this.aimCol = 2;
    this.message = this.humanPitching() ? "選好球種與落點,空白鍵投球!" : "球到最大時揮棒!壞球別揮!";
    if (!this.humanPitching()) this.aiT = rand(1.1, 2.0);
    this.emit("match-start", {});
    this.pushHud();
  }

  emit(type, payload) { this.onEvent({ type, ...payload }); }

  cheerCrowd(strength = 1) { this.crowdCheerT = Math.max(this.crowdCheerT, 1.4 * strength); }

  // ───────────────────────── 投球 ─────────────────────────
  cycleKind(dir) {
    const kinds = this.humanPitching() ? Object.keys(PITCH_KINDS) : this.preset.kinds;
    this.pitchKindIdx = (this.pitchKindIdx + dir + kinds.length) % kinds.length;
    this.pushHud();
  }
  moveAim(dr, dc) {
    this.aimRow = clamp(this.aimRow + dr, 0, 4);
    this.aimCol = clamp(this.aimCol + dc, 0, 4);
    this.pushHud();
  }
  currentKind() {
    const kinds = this.humanPitching() ? Object.keys(PITCH_KINDS) : this.preset.kinds;
    return kinds[this.pitchKindIdx % kinds.length];
  }

  humanPitch() {
    if (this.phase !== "ready" || !this.humanPitching()) return;
    if (this.stealing || this.stealThrow) return; // 盜壘攻防中,球不在投手手上
    const tx = GRID_C[this.aimCol] + rand(-0.03, 0.03);
    const ty = GRID_R[this.aimRow] + rand(-0.03, 0.03);
    this.pitch(this.currentKind(), tx, ty);
  }

  aiPitch() {
    const p = this.preset;
    const kind = pickFrom(p.kinds);
    let tx, ty;
    if (Math.random() < p.ballRate) {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { tx = rand(ZONE.x0, ZONE.x1); ty = ZONE.y1 + rand(0.18, 0.3); }
      else if (side === 1) { tx = rand(ZONE.x0, ZONE.x1); ty = ZONE.y0 - rand(0.18, 0.3); }
      else if (side === 2) { tx = ZONE.x0 - rand(0.18, 0.3); ty = rand(ZONE.y0, ZONE.y1); }
      else { tx = ZONE.x1 + rand(0.18, 0.3); ty = rand(ZONE.y0, ZONE.y1); }
    } else {
      tx = rand(ZONE.x0 + 0.06, ZONE.x1 - 0.06);
      ty = rand(ZONE.y0 + 0.08, ZONE.y1 - 0.08);
    }
    this.pitch(kind, tx, ty);
  }

  pitch(kind, tx, ty) {
    const spec = PITCH_KINDS[kind];
    const isStrike = tx >= ZONE.x0 - 0.05 && tx <= ZONE.x1 + 0.05 && ty >= ZONE.y0 - 0.05 && ty <= ZONE.y1 + 0.05;
    this.ball = {
      t: 0,
      dur: spec.dur * this.preset.durMul,
      kind, tx, ty,
      brkX: spec.brkX ? (Math.random() < 0.5 ? -spec.brkX : spec.brkX) : 0,
      brkY: spec.brkY || 0,
      late: spec.late,
      isStrike,
      swung: false,
    };
    this.phase = "pitching";
    this.hitFly = null;
    this.ballMesh.visible = true;
    this.emit("pitch", { kind: PITCH_KINDS[kind].label });
    // 投球挑戰:AI 打者出棒計畫(照結果反推時間點,與 2D 版同法)
    if (!this.humanBatting()) {
      const ai = this.preset.aiBat;
      const swings = this.ball.isStrike ? Math.random() < ai.swing : Math.random() < ai.chase;
      if (!swings) this.aiPlan = { swing: false };
      else {
        const w = this.windows();
        const roll = Math.random();
        const d = this.ball.isStrike ? ai.dist : { homer: 0, hit: 0.1, foul: 0.42 };
        let adt;
        if (roll < d.homer) adt = Math.random() * w.perfect;
        else if (roll < d.homer + d.hit) adt = w.perfect + Math.random() * (w.good * 0.6 - w.perfect);
        else if (roll < d.homer + d.hit + d.foul) adt = w.good + Math.random() * w.good * 0.9;
        else adt = w.good * 1.9 + 0.05 + Math.random() * 0.2;
        this.aiPlan = { swing: true, at: this.ball.dur - adt };
      }
    } else this.aiPlan = null;
    this.pushHud();
  }

  windows() {
    const s = this.preset.window;
    return { perfect: WIN.perfect * s, good: WIN.good * s };
  }

  ballPos(b) {
    const p = Math.min(1.3, b.t / b.dur);
    const pp = Math.min(1, p);
    const prof = Math.sin(Math.PI * (b.late ? Math.pow(pp, 2.2) : pp));
    const x = RELEASE.x + (b.tx - RELEASE.x) * p + prof * b.brkX;
    let y = RELEASE.y + (b.ty - RELEASE.y) * p + prof * b.brkY * -1;
    if (b.kind === "slow") y += Math.sin(pp * Math.PI) * 0.5; // 慢速球吊高
    const z = RELEASE.z + (0.35 - RELEASE.z) * p;
    return new THREE.Vector3(x, y, z);
  }

  // ───────────────────────── 揮棒與判定 ─────────────────────────
  swing() {
    if (this.phase !== "pitching" || !this.ball || this.ball.swung) return;
    if (!this.humanBatting() && !this._aiSwinging) return; // 投球挑戰:人不能替 AI 揮
    const b = this.ball;
    b.swung = true;
    const w = this.windows();
    const adt = Math.abs(b.t - b.dur);
    let outcome;
    if (adt <= w.perfect) outcome = "homer";
    else if (adt <= w.good * 0.6) outcome = "hit";
    else if (adt <= w.good) outcome = Math.random() < 0.5 ? "hit" : "flyout"; // 邊緣接觸:一半被接殺
    else if (adt <= w.good * 1.9) outcome = "foul";
    else outcome = "whiff";
    // 追打壞球:打不好(全壘打降級、安打半數變接殺)
    if (!b.isStrike) {
      if (outcome === "homer") outcome = "hit";
      if (outcome === "hit" && Math.random() < 0.5) outcome = "flyout";
    }
    if (outcome === "whiff") {
      // 揮空:立刻揮棒,球繼續飛進捕手(result 階段續飛)
      this.swingT = 0.18;
      this.resolveSwing(outcome);
    } else {
      // ★接觸類(全壘打/安打/接殺/界外):等球「真的到本壘九宮格」那一刻才揮棒+起飛
      //   (07-10 使用者回報 bug:不能球還在半路就被打飛)
      b.pendingOutcome = outcome;
      if (b.t >= b.dur) this.contactNow(); // 已在窗內晚揮=當下就接觸
    }
  }

  // 球抵達本壘的接觸瞬間:揮棒動畫+從九宮格接觸點起飛
  contactNow() {
    const b = this.ball;
    if (!b || !b.pendingOutcome) return;
    this.swingT = 0.18;
    b.t = b.dur; // 對齊接觸點=選定落點(九宮格上)
    this.resolveSwing(b.pendingOutcome);
  }

  resolveSwing(outcome) {
    const pos = this.ballPos(this.ball);
    if (outcome !== "whiff") this.ball = null; // 揮空的球留著,result 階段續飛進捕手
    else this.ball.pendingOutcome = null;
    switch (outcome) {
      case "homer": this.launchHit(pos, "homer"); break;
      case "hit": {
        const r = Math.random();
        const type = r < 0.68 ? "single" : r < 0.92 ? "double" : "triple";
        this.launchHit(pos, type);
        break;
      }
      case "flyout": this.launchHit(pos, "flyout"); break;
      case "foul": {
        this.launchFoul(pos);
        if (this.strikes < 2) this.strikes += 1;
        this.emit("foul", {});
        this.afterPitch(0);
        break;
      }
      default: { // whiff
        this.strikes += 1;
        this.emit("whiff", {});
        this.afterCount();
        // 等球飛完進九宮格(捕手手套位)再停 0.8 秒,才進下一球
        this.afterPitch(Math.max(0, this.ball.dur - this.ball.t) + 0.8);
      }
    }
    this.pushHud();
  }

  // 先擲命運,再演軌跡——★判定=畫面(07-10 使用者回報根治):
  //   接殺的球「一定飛向某個野手身上」(手套高度空中被接走);
  //   安打的球「一定落在守備空檔」(離所有野手 ≥6m 的草地)。
  launchHit(from, type) {
    let to, dist, peak;
    if (type === "flyout") {
      // 挑一個野手,球就朝他飛(微小偏移,他墊一步接住)
      const f = pickFrom(this.fielders);
      const home = f.userData.home;
      to = new THREE.Vector3(home.x + rand(-1.2, 1.2), 1.15, home.z + rand(-1.2, 1.2));
      dist = Math.hypot(to.x, to.z);
      peak = rand(10, 15);
    } else {
      let angle = 0; dist = 30;
      if (type === "homer") { dist = rand(WALL_R + 6, WALL_R + 20); peak = rand(16, 24); }
      else if (type === "triple") { dist = rand(58, 68); peak = rand(9, 13); }
      else if (type === "double") { dist = rand(44, 58); peak = rand(7, 11); }
      else { dist = rand(24, 40); peak = rand(4, 8); }
      // 安打落點避開野手(最多取樣 10 次,挑離最近野手最遠的點)
      let best = null;
      for (let i = 0; i < 10; i++) {
        angle = rand(-Math.PI / 4 + 0.12, Math.PI / 4 - 0.12);
        const cand = new THREE.Vector3(Math.sin(angle) * dist, 0.2, -Math.cos(angle) * dist);
        const nearest = Math.min(...this.fielders.map((f) => Math.hypot(f.position.x - cand.x, f.position.z - cand.z)));
        if (!best || nearest > best.nearest) best = { cand, nearest };
        if (type !== "homer" && nearest >= 6) { best = { cand, nearest }; break; }
      }
      to = best.cand;
    }
    this.hitFly = { from: from.clone(), to, t: 0, dur: clamp(dist / 34, 0.9, 2.0), peak, type };
    this.phase = "result";
    this.resultT = this.hitFly.dur + (type === "homer" ? 1.4 : 1.0);
    if (type === "flyout") this.sendFielder(to, this.hitFly.dur);
    this.cameraShake = type === "homer" ? 0.3 : 0.12;
    this.emit("contact", { type });
  }

  launchFoul(from) {
    const back = Math.random() < 0.5;
    const angle = back ? rand(-Math.PI, Math.PI) : (Math.random() < 0.5 ? rand(-Math.PI / 2, -Math.PI / 3) : rand(Math.PI / 3, Math.PI / 2));
    const dist = rand(10, 26);
    const to = new THREE.Vector3(Math.sin(angle) * dist, 0.2, back ? rand(4, 14) : -Math.cos(angle) * dist * 0.4);
    this.hitFly = { from: from.clone(), to, t: 0, dur: 1.0, peak: rand(6, 11), type: "foul" };
    this.phase = "result";
    this.resultT = 1.4;
  }

  sendFielder(to, dur) {
    let best = null;
    for (const f of this.fielders) {
      const d = f.position.distanceTo(to);
      if (!best || d < best.d) best = { f, d };
    }
    if (!best) return;
    this.catchFielder = best.f; // 接殺瞬間要舉手接住(球結束在他手套位)
    this.anims.push({ obj: best.f, from: best.f.position.clone(), to: to.clone().setY(0), t: 0, dur: Math.max(0.5, dur * 0.85), back: true });
  }

  // 沒揮棒:過本壘=主審宣判
  take() {
    const b = this.ball;
    b.swung = true;
    if (b.isStrike) { this.strikes += 1; this.emit("strike-take", {}); }
    else { this.balls += 1; this.emit("ball-take", {}); }
    this.afterCount();
    this.afterPitch(0.9);
    this.pushHud();
  }

  afterCount() {
    if (this.balls >= 4) {
      this.advanceRunners("walk");
      this.emit("walk", {});
      this.balls = 0; this.strikes = 0;
      if (this.modeId === "practice") this.points += 1;
    } else if (this.strikes >= 3) {
      this.emit("strikeout", {});
      this.balls = 0; this.strikes = 0;
      if (this.inningsMode()) this.registerOut();
    }
  }

  registerOut() {
    this.outs += 1;
    if (this.outs >= 3) this.queueHalfSwitch = true;
  }

  afterPitch(delay) {
    this.pitchCount += 1;
    if (this.phase !== "result") { this.phase = "result"; this.resultT = delay || 0.9; }
  }

  // ───────────────────────── 跑壘(自動,壘間有跑動動畫) ─────────────────────────
  // 跑者沿壘包路徑跑(1B→3B 會經過 2B);跑回本壘=得分,棋子隱回池子。
  runnerPath(fromBase, toBase) {
    // fromBase: -1=打者(本壘起跑);toBase: 3=回本壘得分
    const pts = [];
    const start = fromBase < 0 ? new THREE.Vector3(0.6, 0, 0.4) : this.basePos[fromBase].clone().setY(0);
    pts.push(start);
    for (let b = fromBase + 1; b <= Math.min(toBase, 3); b++) {
      pts.push(this.basePos[b].clone().setY(0));
    }
    return pts;
  }

  animateRunner(runner, toBase, speed = 10) {
    const pts = this.runnerPath(runner.base ?? -1, toBase);
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += pts[i].distanceTo(pts[i - 1]);
    this.anims.push({
      obj: runner.mesh,
      path: pts,
      t: 0,
      dur: Math.max(0.5, total / speed),
      onDone: () => {
        if (toBase >= 3) this.returnRunnerMesh(runner.mesh); // 回本壘得分
      },
    });
  }

  advanceRunners(kind) {
    const team = this.battingTeam();
    let runs = 0;
    const scoreRunner = (r) => {
      runs += 1;
      this.animateRunner(r, 3);
      this.runners = this.runners.filter((x) => x !== r);
    };
    if (kind === "walk") {
      // 保送:只推「被迫」的跑者(滿壘擠回一分;由前往後連鎖)
      if (this.baseOccupied(0) && this.baseOccupied(1) && this.baseOccupied(2)) scoreRunner(this.runnerAt(2));
      if (this.baseOccupied(0) && this.baseOccupied(1)) { const r = this.runnerAt(1); r.base = 2; this.animateRunner({ mesh: r.mesh, base: 1 }, 2); }
      if (this.baseOccupied(0)) { const r = this.runnerAt(0); r.base = 1; this.animateRunner({ mesh: r.mesh, base: 0 }, 1); }
      const mesh = this.borrowRunnerMesh();
      if (mesh) { this.runners.push({ mesh, base: 0 }); this.animateRunner({ mesh, base: -1 }, 0); }
    } else if (kind === "homer") {
      for (const r of [...this.runners].sort((a, b) => b.base - a.base)) scoreRunner(r);
      const mesh = this.borrowRunnerMesh();
      if (mesh) { runs += 1; this.animateRunner({ mesh, base: -1 }, 3, 14); }
    } else {
      const n = kind === "single" ? 1 : kind === "double" ? 2 : 3;
      for (const r of [...this.runners].sort((a, b) => b.base - a.base)) {
        const dest = r.base + n;
        if (dest >= 3) scoreRunner(r);
        else { const old = r.base; r.base = dest; this.animateRunner({ mesh: r.mesh, base: old }, dest); }
      }
      const mesh = this.borrowRunnerMesh();
      if (mesh) { const nr = { mesh, base: n - 1 }; this.runners.push(nr); this.animateRunner({ mesh, base: -1 }, n - 1); }
    }
    if (runs > 0) {
      this.score[team] += runs;
      const inn = Math.max(0, this.inning - 1);
      this.lineScore[team][inn] = (this.lineScore[team][inn] || 0) + runs;
      this.emit("run", { team, runs, homeScore: this.score.home, awayScore: this.score.away });
      if (this.modeId === "practice") this.points += runs; // 練習模式跑分也算分
    }
  }

  // ───────────────────────── 盜壘(使用者點名功能) ─────────────────────────
  // 打擊方在等球/來球途中可指揮「最前位、下一壘沒人」的跑者盜壘;失敗=出局(壘上事,打席不變)。
  canSteal() {
    if (this.stealing || this.stealUsed) return false;
    if (this.phase !== "ready") return false; // 投球前才能盜(捕手手上有球可傳)
    const lead = [...this.runners].sort((a, b) => b.base - a.base).find((r) => r.base < 2 && !this.baseOccupied(r.base + 1));
    return !!lead;
  }
  attemptSteal() {
    if (!this.canSteal()) return false;
    const lead = [...this.runners].sort((a, b) => b.base - a.base).find((r) => r.base < 2 && !this.baseOccupied(r.base + 1));
    const to = lead.base + 1;
    this.stealUsed = true;
    // 先擲勝負,再編排演出:出局=捕手傳球先到、安全=跑者先到(判定=畫面)
    let chance = to === 1 ? 0.72 : 0.52;
    if (this.difficulty === "kids") chance += 0.16;
    else if (this.difficulty === "child") chance += 0.08;
    else if (this.difficulty === "hard") chance -= 0.08;
    const safe = Math.random() < chance;
    const runnerDur = BASE_DIST / 7.5;
    this.stealing = { runner: lead, to, t: 0, safe, runnerDur, throwStarted: false, resolved: false };
    this.animateRunner({ mesh: lead.mesh, base: lead.base }, to, 7.5);
    // 守壘野手補位到壘包【留守阻殺】(07-10 使用者點名:必須待在壘上等球觸殺,判完才歸位)
    const cover = this.fielders[to === 1 ? 1 : 3];
    if (cover) {
      this.stealCover = cover;
      this.anims.push({ obj: cover, from: cover.position.clone(), to: this.basePos[to].clone().setY(0), t: 0, dur: Math.max(0.4, runnerDur * 0.5) });
    }
    this.emit("steal-go", { toBase: to + 1 });
    this.pushHud();
    return true;
  }

  resolveSteal() {
    const s = this.stealing;
    if (!s || s.resolved) return;
    s.resolved = true;
    if (s.safe) {
      s.runner.base = s.to;
      this.emit("steal-safe", { toBase: s.to + 1 });
    } else {
      this.runners = this.runners.filter((r) => r !== s.runner);
      this.returnRunnerMesh(s.runner.mesh);
      if (this.inningsMode()) this.registerOut();
      this.emit("steal-out", { toBase: s.to + 1 });
      if (this.queueHalfSwitch && this.phase === "ready") { this.phase = "result"; this.resultT = 0.9; }
    }
    this.stealing = null;
    this.stealBallLinger = 0.6; // 傳到壘包的球停一下再收
    this._coverReturnT = 0.8; // 留守野手觸殺完才走回守位
    this.pushHud();
  }

  // ───────────────────────── 主迴圈 ─────────────────────────
  update(dt) {
    this.swingT = Math.max(0, this.swingT - dt);
    this.cameraShake = Math.max(0, this.cameraShake - dt * 1.6);
    // 動畫佇列:from/to 直線(野手)或 path 多路徑點(跑者沿壘線)
    for (const a of this.anims) {
      a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1);
      if (a.path) {
        // 沿路徑點等速前進
        let total = 0;
        const segs = [];
        for (let i = 1; i < a.path.length; i++) { const d = a.path[i].distanceTo(a.path[i - 1]); segs.push(d); total += d; }
        let dist = k * total;
        let idx = 0;
        while (idx < segs.length - 1 && dist > segs[idx]) { dist -= segs[idx]; idx++; }
        const segK = segs[idx] > 0 ? clamp(dist / segs[idx], 0, 1) : 1;
        a.obj.position.lerpVectors(a.path[idx], a.path[idx + 1], segK);
        // 跑步小彈跳
        a.obj.position.y = Math.abs(Math.sin(a.t * 10)) * 0.12;
      } else {
        a.obj.position.lerpVectors(a.from, a.to, k);
      }
      if (k >= 1 && !a.finished) {
        a.finished = true;
        if (a.onDone) a.onDone();
        if (a.back && !a.returning) { a.returning = true; a.finished = false; a.t = 0; a.dur = 1.6; a.from = a.to.clone(); a.to = a.obj.userData.home.clone(); a.path = null; }
      }
    }
    this.anims = this.anims.filter((a) => !a.finished);
    // 盜壘演出:捕手 0.35s 反應→長傳到壘包;跑者到位那一刻宣判(球先到=出局/人先到=安全)
    if (this.stealing) {
      const st = this.stealing;
      st.t += dt;
      if (!st.throwStarted && st.t >= 0.35) {
        st.throwStarted = true;
        const arrive = st.runnerDur + (st.safe ? 0.25 : -0.18); // 到位時間差=勝負
        this.stealThrow = {
          from: new THREE.Vector3(0.2, 1.0, 1.1),
          to: this.basePos[st.to].clone().setY(0.55),
          t: 0,
          dur: Math.max(0.45, arrive - 0.35),
        };
        this.catcherMesh.userData.armR.rotation.x = -2.4; // 捕手抬臂傳球
        this._catcherArmT = 0.5;
        this.emit("catcher-throw", { toBase: st.to + 1 });
      }
      if (!st.resolved && st.t >= st.runnerDur) this.resolveSteal();
    }
    if (this.stealThrow) {
      this.stealThrow.t += dt;
      if (!this.stealThrow.caught && this.stealThrow.t >= this.stealThrow.dur) {
        this.stealThrow.caught = true;
        if (this.stealCover) { this.catchFielder = this.stealCover; this._catchPoseT = 0.7; } // 壘上接球+觸殺
      }
    }
    if (this.stealBallLinger > 0) {
      this.stealBallLinger -= dt;
      if (this.stealBallLinger <= 0) this.stealThrow = null;
    }
    if (this._coverReturnT > 0) {
      this._coverReturnT -= dt;
      if (this._coverReturnT <= 0 && this.stealCover) {
        const cv = this.stealCover;
        this.anims.push({ obj: cv, from: cv.position.clone(), to: cv.userData.home.clone(), t: 0, dur: 1.4 });
        this.stealCover = null;
      }
    }
    // AI 打擊方偶爾發動盜壘
    if (this.aiStealT > 0) {
      this.aiStealT -= dt;
      if (this.aiStealT <= 0 && !this.humanBatting() && this.canSteal()) this.attemptSteal();
    }

    if (this.phase === "ready") {
      if (!this.humanPitching() && !this.stealing && !this.stealThrow) {
        this.aiT -= dt;
        if (this.aiT <= 0) this.aiPitch();
      }
      return;
    }
    if (this.phase === "pitching" && this.ball) {
      this.ball.t += dt;
      // AI 打者到點出棒
      if (this.aiPlan?.swing && !this.ball.swung && this.ball.t >= this.aiPlan.at) {
        this._aiSwinging = true; this.swing(); this._aiSwinging = false;
      }
      // 早揮的接觸類:等球到本壘那一刻才真的打到(球棒與球在九宮格相遇)
      if (this.ball && this.ball.pendingOutcome && this.ball.t >= this.ball.dur) { this.contactNow(); return; }
      if (this.ball && !this.ball.swung && this.ball.t >= this.ball.dur + 0.06) this.take();
      return;
    }
    if (this.phase === "result") {
      // 揮空/看過去的球:飛完全程後「停在九宮格落點」(捕手手套位),下一球才收走
      // (07-10 使用者點名:球不要消失,要進九宮格裡)
      if (this.ball) this.ball.t = Math.min(this.ball.t + dt, this.ball.dur);
      if (this.hitFly) {
        this.hitFly.t += dt;
        if (this.hitFly.t >= this.hitFly.dur && !this.hitFly.landed) {
          this.hitFly.landed = true;
          const ty = this.hitFly.type;
          if (ty === "homer" || ty === "single" || ty === "double" || ty === "triple") {
            this.advanceRunners(ty === "homer" ? "homer" : ty);
            if (this.modeId === "practice") this.points += ty === "homer" ? 3 : 1;
            this.emit(ty === "homer" ? "homer" : "hit", { hitType: ty, homeScore: this.score.home, awayScore: this.score.away, team: this.battingTeam() });
            this.balls = 0; this.strikes = 0;
          } else if (ty === "flyout") {
            this.ballMesh.visible = false; // 進了野手手套
            this._catchPoseT = 0.7; // 野手舉手接住(頭上/手套位)
            this.emit("flyout", {});
            this.balls = 0; this.strikes = 0;
            if (this.inningsMode()) this.registerOut();
          }
          this.pushHud();
        }
      }
      this.resultT -= dt;
      // ★07-10 使用者回報 bug:安打/全壘打後跑者還在跑,投手就投下一球——
      //   跑壘動畫(path 動畫)與盜壘沒收完前,不進下一球(投手等待)。
      const runnersStillRunning = this.anims.some((a) => a.path && !a.finished) || this.stealing;
      if (this.resultT <= 0 && !runnersStillRunning) this.endOfPlay();
    }
  }

  endOfPlay() {
    this.ballMesh.visible = false;
    this.ball = null;
    this.hitFly = null;
    this.stealThrow = null;
    this.stealUsed = false;
    // 半局/比賽推進
    if (this.queueHalfSwitch) {
      this.queueHalfSwitch = false;
      this.outs = 0; this.balls = 0; this.strikes = 0;
      for (const r of this.runners) this.returnRunnerMesh(r.mesh);
      this.runners = [];
      if (this.half === "top") {
        this.half = "bottom";
        this.emit("half", { text: `${this.inning} 局下半` });
      } else {
        if (this.inning >= (this.inningLimit || this.mode.innings)) return this.finishMatch();
        this.inning += 1;
        this.half = "top";
        this.emit("half", { text: `${this.inning} 局上半` });
      }
      this.pitchKindIdx = 0; this.aimRow = 2; this.aimCol = 2;
    }
    // 球數制模式結束判定
    if (!this.inningsMode() && this.pitchCount >= (this.pitchLimit || this.mode.pitches)) return this.finishMatch();
    this.phase = "ready";
    // 新打席(球數歸零)=打者可能換打擊區(左打/右打隨機)
    if (this.balls === 0 && this.strikes === 0) this.applyBatSide(Math.random() < 0.5 ? 1 : -1);
    if (!this.humanPitching()) this.aiT = rand(1.0, 1.9);
    // AI 打擊方(投球挑戰/短場下半):偶爾指揮盜壘
    if (!this.humanBatting() && this.runners.length && Math.random() < 0.16) this.aiStealT = rand(0.4, 1.0);
    this.message = this.humanPitching() ? "選好球種與落點,空白鍵投球!" : "球到最大時揮棒!壞球別揮!(E=盜壘)";
    this.pushHud();
  }

  finishMatch() {
    this.phase = "done";
    let title, text;
    if (this.modeId === "practice") {
      const n = this.pitchLimit || 10;
      this.stars = this.points >= n * 1.6 ? 3 : this.points >= n * 0.8 ? 2 : 1;
      title = this.stars === 3 ? `🏆 打擊王!${this.points} 分!` : this.stars === 2 ? `🎉 好打者!${this.points} 分!` : `⚾ 練習完成!${this.points} 分!`;
      text = "看清好壞球、抓好時機——下一球永遠是新的機會!";
    } else if (this.modeId === "pitchduel") {
      const s = this.score.away;
      const n = this.pitchLimit || 6;
      this.stars = s <= n * 0.35 ? 3 : s <= n * 0.85 ? 2 : 1;
      title = this.stars === 3 ? `🏆 王牌投手!只讓阿福得 ${s} 分!` : `🎯 投球挑戰結束,阿福得 ${s} 分`;
      text = "好球搶好球數、壞球引誘出棒——控球就是投手的本事!";
    } else {
      const { home, away } = this.score;
      const p2 = this.modeId === "duel2p" ? "P2" : "阿福";
      title = home > away ? "🏆 你贏了!" : home < away ? `⚾ ${p2} 拿下比賽!` : "🤝 平手,好比賽!";
      text = `最終比分 ${home} : ${away}。進了要開心,沒進也要開心,再來一場就是了!`;
    }
    this.emit("match-end", { title, text, homeScore: this.score.home, awayScore: this.score.away });
    this.pushHud();
  }

  // ───────────────────────── 繪製 ─────────────────────────
  render() {
    const loop = () => {
      const dt = Math.min(0.05, this._clock.getDelta());
      if (this.phase !== "menu" && this.phase !== "done") this.update(dt);
      // 球位置
      if (this.stealThrow) {
        // 捕手長傳:低平快弧線飛向壘包(盜壘只在投球前,球此刻不在別處)
        const th = this.stealThrow;
        const k = clamp(th.t / th.dur, 0, 1);
        const pos = new THREE.Vector3().lerpVectors(th.from, th.to, k);
        pos.y += Math.sin(k * Math.PI) * 1.6;
        this.ballMesh.position.copy(pos);
        this.ballMesh.visible = true;
      } else if (this.ball && (this.phase === "pitching" || this.phase === "result")) {
        this.ballMesh.position.copy(this.ballPos(this.ball));
        this.ballMesh.visible = true;
      } else if (this.hitFly) {
        const f = this.hitFly;
        const k = clamp(f.t / f.dur, 0, 1);
        const pos = new THREE.Vector3().lerpVectors(f.from, f.to, k);
        pos.y += Math.sin(k * Math.PI) * f.peak;
        this.ballMesh.position.copy(pos);
        this.ballMesh.visible = f.t < f.dur + 0.5;
      }
      // 揮棒動畫(0.18s 快揮,前段吃掉大部分角度;左右打鏡像)
      const sSide = this.batSide || 1;
      if (this.swingT > 0) {
        const k = 1 - this.swingT / 0.18;
        const ease = 1 - Math.pow(1 - k, 2);
        this.batPivot.rotation.y = -ease * 2.6 * sSide;
        this.batPivot.rotation.z = -1.35 * sSide;
      } else {
        this.batPivot.rotation.y = 0;
        this.batPivot.rotation.z = -0.5 * sSide;
      }
      // 投手投球抬手
      const throwing = this.phase === "pitching" && this.ball && this.ball.t < 0.3;
      this.pitcherMesh.userData.armR.rotation.x = throwing ? -2.4 : 0;
      // 捕手傳球手臂復位
      if (this._catcherArmT > 0) {
        this._catcherArmT -= dt;
        if (this._catcherArmT <= 0) this.catcherMesh.userData.armR.rotation.x = 0;
      }
      // 接殺野手舉手接球
      if (this._catchPoseT > 0) {
        this._catchPoseT -= dt;
        if (this.catchFielder) {
          this.catchFielder.userData.armR.rotation.x = -2.8;
          this.catchFielder.userData.armL.rotation.x = -2.8;
          if (this._catchPoseT <= 0) {
            this.catchFielder.userData.armR.rotation.x = 0;
            this.catchFielder.userData.armL.rotation.x = 0;
          }
        }
      }
      // 準星(人投球時)
      const aiming = this.phase === "ready" && this.humanPitching();
      this.crosshair.visible = aiming;
      if (aiming) this.crosshair.position.set(GRID_C[this.aimCol], GRID_R[this.aimRow], 0.02);
      // ★雙鏡位:投打=主審近景;打出去/盜壘/跑者移動=拉高看全場(四壘包+守備+全壘打牆)
      const fairFly = this.hitFly && this.hitFly.type !== "foul";
      const runnersMoving = this.anims.some((a) => a.path) || this.stealing;
      const wantField = fairFly || runnersMoving;
      if (!this._camPos) { this._camPos = PLATE_CAM.pos.clone(); this._camLook = PLATE_CAM.look.clone(); }
      const targetPos = wantField ? FIELD_CAM.pos : PLATE_CAM.pos;
      const targetLook = wantField ? FIELD_CAM.look : PLATE_CAM.look;
      const k = 1 - Math.exp(-dt * 2.6);
      this._camPos.lerp(targetPos, k);
      this._camLook.lerp(targetLook, k);
      // 球自旋(飛行中)
      if (this.ballMesh.visible) { this.ballMesh.rotation.x += dt * 9; this.ballMesh.rotation.z += dt * 3; }
      // 觀眾歡呼:整片看台輕彈
      this.crowdCheerT = Math.max(0, this.crowdCheerT - dt);
      this.crowdGroup.position.y = this.crowdCheerT > 0 ? Math.abs(Math.sin(this.crowdCheerT * 14)) * 0.45 : 0;
      const shake = this.cameraShake;
      this.camera.position.set(
        this._camPos.x + rand(-shake, shake) * 0.15,
        this._camPos.y + rand(-shake, shake) * 0.1,
        this._camPos.z,
      );
      this.camera.lookAt(this._camLook);
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  // 後方大計分板重繪(事件時呼叫,不每幀畫)
  drawScoreboard() {
    if (!this.sbCtx) return;
    const c = this.sbCtx;
    const W = 1024, H = 384;
    c.fillStyle = "#081120"; c.fillRect(0, 0, W, H);
    c.strokeStyle = "#ffe070"; c.lineWidth = 8; c.strokeRect(4, 4, W - 8, H - 8);
    const innings = 9;
    const gridX = 130, gridW = 62, rowY = [104, 188, 272];
    c.font = "bold 44px 'Noto Sans TC', sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    // 表頭 1..9 R
    c.fillStyle = "#8fa3c8";
    for (let i = 0; i < innings; i++) c.fillText(String(i + 1), gridX + i * gridW + gridW / 2, 52);
    c.fillStyle = "#ffe070";
    c.fillText("R", gridX + innings * gridW + 44, 52);
    // 兩隊名+逐局
    const p1 = this.modeId === "duel2p" ? "P1" : "你";
    const p2 = this.modeId === "duel2p" ? "P2" : "阿福";
    const rows = [
      { name: p1, team: "home", color: "#7db2ff" },
      { name: p2, team: "away", color: "#ff9a8a" },
    ];
    rows.forEach((row, r) => {
      const y = rowY[r];
      c.fillStyle = row.color;
      c.textAlign = "left";
      c.fillText(row.name, 26, y);
      c.textAlign = "center";
      for (let i = 0; i < innings; i++) {
        const v = this.lineScore[row.team][i];
        const isCur = this.inningsMode() && this.inning === i + 1 && ((row.team === "home") === (this.half === "top")) && this.phase !== "done";
        c.fillStyle = isCur ? "#ffe070" : "#e8eef8";
        c.fillText(v === undefined ? (isCur ? "•" : "-") : String(v), gridX + i * gridW + gridW / 2, y);
      }
      c.fillStyle = "#ffe070";
      c.font = "bold 52px 'Noto Sans TC', sans-serif";
      c.fillText(String(this.score[row.team]), gridX + innings * gridW + 44, y);
      c.font = "bold 44px 'Noto Sans TC', sans-serif";
    });
    // 壘上有人:菱形三燈(左=一壘在右側習慣?照棒球記分牌:中上=二壘,左下=三壘,右下=一壘)
    const bx = 880, by = 262, r2 = 26, gap = 34;
    const diamonds = [
      { base: 1, x: bx, y: by - gap },        // 二壘(上)
      { base: 0, x: bx + gap, y: by + 6 },    // 一壘(右下)
      { base: 2, x: bx - gap, y: by + 6 },    // 三壘(左下)
    ];
    c.save();
    for (const d of diamonds) {
      c.save();
      c.translate(d.x, d.y);
      c.rotate(Math.PI / 4);
      c.fillStyle = this.baseOccupied(d.base) ? "#ffe070" : "rgba(255,255,255,0.14)";
      c.fillRect(-r2 / 1.6, -r2 / 1.6, r2 * 1.25, r2 * 1.25);
      c.restore();
    }
    c.restore();
    // B/S/O 燈
    c.font = "bold 34px 'Noto Sans TC', sans-serif";
    const lights = [
      { label: "B", n: 3, lit: this.balls, color: "#5ad06a", y: 96 },
      { label: "S", n: 2, lit: this.strikes, color: "#ffd24a", y: 144 },
      { label: "O", n: 3, lit: this.outs, color: "#e05040", y: 192 },
    ];
    for (const L of lights) {
      c.fillStyle = "#8fa3c8";
      c.textAlign = "left";
      c.fillText(L.label, 812, L.y);
      for (let i = 0; i < L.n; i++) {
        c.beginPath();
        c.arc(856 + i * 44, L.y, 14, 0, Math.PI * 2);
        c.fillStyle = i < L.lit ? L.color : "rgba(255,255,255,0.14)";
        c.fill();
      }
    }
    this.sbTexture.needsUpdate = true;
  }

  pushHud() {
    const p2 = this.modeId === "duel2p" ? "P2" : "阿福";
    const kinds = this.humanPitching() ? Object.keys(PITCH_KINDS) : this.preset.kinds;
    const kind = kinds[this.pitchKindIdx % kinds.length];
    this.onHud({
      homeScore: this.modeId === "practice" || this.modeId === "pitchduel" ? (this.modeId === "practice" ? this.points : this.score.away) : this.score.home,
      awayScore: this.score.away,
      rawScore: this.score,
      points: this.points,
      balls: this.balls,
      strikes: this.strikes,
      outs: this.outs,
      inning: this.inning,
      half: this.half,
      pitchCount: this.pitchCount,
      totalPitches: this.pitchLimit || this.mode.pitches || 0,
      modeId: this.modeId,
      modeLabel: this.mode.label,
      p2Label: p2,
      humanPitching: this.humanPitching(),
      pitchSel: `球種:${PITCH_KINDS[kind].label} ・ 落點:${ROW_LABEL[this.aimRow]}×${COL_LABEL[this.aimCol]}`,
      message: this.message,
      phase: this.phase,
      canSteal: this.canSteal() && this.humanBatting(),
      basesText: ["一", "二", "三"].filter((_, i) => this.baseOccupied(i)).map((n) => n + "壘").join("、") || "壘上無人",
    });
    this.drawScoreboard();
  }
}
