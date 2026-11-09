(() => {
  "use strict";

  /* =====================================================================
     PAC-MAN RETRO - juego completo en un solo archivo
     ===================================================================== */

  // ------------------------- constantes -------------------------
  const TILE = 35;
  const COLS = 21;
  const ROWS = 23;
  const CANVAS_W = 1120;
  const CANVAS_H = 920;
  const MAZE_X = Math.round((CANVAS_W - COLS * TILE) / 2);
  const MAZE_Y = 96;
  const TUNNEL_ROW = 10;

  const DIRS = {
    up: { x: 0, y: -1 },
    left: { x: -1, y: 0 },
    down: { x: 0, y: 1 },
    right: { x: 1, y: 0 },
  };
  const DIR_LIST = ["up", "left", "down", "right"];
  const OPP = { up: "down", down: "up", left: "right", right: "left" };

  const PLAYER_COLORS = ["#ffe600", "#7dff5a", "#5ad4ff", "#ff7ae0"];
  const PLAYER_LABELS = ["P1", "P2", "P3", "P4"];
  const CONTROL_LABELS = ["W A S D", "FLECHAS", "I J K L", "T F G H"];
  const CONTROL_KEYS = [
    { up: "KeyW", left: "KeyA", down: "KeyS", right: "KeyD" },
    { up: "ArrowUp", left: "ArrowLeft", down: "ArrowDown", right: "ArrowRight" },
    { up: "KeyI", left: "KeyJ", down: "KeyK", right: "KeyL" },
    { up: "KeyT", left: "KeyF", down: "KeyG", right: "KeyH" },
  ];

  const GHOST_DEFS = [
    { name: "BLINKY", color: "#ff2b2b", home: { x: 10, y: 9 }, scatter: { x: COLS + 4, y: -4 }, base: 4.72 },
    { name: "PINKY", color: "#ff9ad5", home: { x: 9, y: 10 }, scatter: { x: -4, y: -4 }, base: 4.60 },
    { name: "INKY", color: "#38e8ff", home: { x: 11, y: 10 }, scatter: { x: COLS + 4, y: ROWS + 4 }, base: 4.54 },
    { name: "CLYDE", color: "#ffad3d", home: { x: 10, y: 11 }, scatter: { x: -4, y: ROWS + 4 }, base: 4.46 },
  ];

  const MODE_PLAN = [
    { mode: "scatter", time: 7 },
    { mode: "chase", time: 20 },
    { mode: "scatter", time: 7 },
    { mode: "chase", time: 20 },
    { mode: "scatter", time: 5 },
    { mode: "chase", time: Infinity },
  ];

  const STORAGE_KEY = "pacman_retro_profiles_v1";
  const SOUND_KEY = "pacman_retro_sound";
  const MAX_LIVES = 5;
  const MAX_LEVELS = 5;

  // ------------------------- utilidades -------------------------
  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const pad = (n, size) => String(Math.max(0, Math.floor(n))).padStart(size, "0");
  const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  const normAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const uid = () => {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  };

  // ------------------------- DOM -------------------------
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const cutscene = $("cutscene");
  const cutCtx = cutscene.getContext("2d");
  const screens = {
    start: $("screen-start"),
    auth: $("screen-auth"),
    menu: $("screen-menu"),
    setup: $("screen-setup"),
    help: $("screen-help"),
    game: $("screen-game"),
  };

  function showScreen(name) {
    for (const key of Object.keys(screens)) {
      screens[key].classList.toggle("active", key === name);
    }
    if (name !== "game") {
      $("pauseOverlay").classList.add("hidden");
      $("endOverlay").classList.add("hidden");
      stopCutscene();
    }
  }

  // ------------------------- perfiles -------------------------
  let profiles = [];
  let currentProfileId = null;

  function loadProfiles() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      profiles = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      profiles = [];
    }
  }
  function saveProfiles() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    } catch (err) {
      /* almacenamiento no disponible */
    }
  }
  function getCurrentProfile() {
    return profiles.find((p) => p.id === currentProfileId) || null;
  }
  function overallHighScore() {
    return profiles.reduce((max, p) => Math.max(max, p.highScore || 0), 0);
  }
  function findProfile(id) {
    return profiles.find((p) => p.id === id) || null;
  }

  // ------------------------- avatares -------------------------
  const AVATARS = [
    { id: "pac-yellow", kind: "pacman", color: "#ffe600" },
    { id: "pac-pink", kind: "pacman", color: "#ff7ae0" },
    { id: "ghost-red", kind: "ghost", color: "#ff2b2b" },
    { id: "ghost-pink", kind: "ghost", color: "#ff9ad5" },
    { id: "ghost-cyan", kind: "ghost", color: "#38e8ff" },
    { id: "ghost-orange", kind: "ghost", color: "#ffad3d" },
    { id: "cherry", kind: "fruit", fruit: "cherry" },
    { id: "strawberry", kind: "fruit", fruit: "strawberry" },
  ];
  function getAvatar(id) {
    return AVATARS.find((a) => a.id === id) || AVATARS[0];
  }
  function guestAvatar(index) {
    return { kind: "pacman", color: PLAYER_COLORS[index % PLAYER_COLORS.length] };
  }

  // ------------------------- dibujo de sprites -------------------------
  function drawPacmanPixels(context, cx, cy, size, color, dirName, mouth) {
    const grid = 16;
    const cell = size / grid;
    const x0 = cx - size / 2;
    const y0 = cy - size / 2;
    const base = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dirName] || 0;
    context.fillStyle = color;
    for (let py = 0; py < grid; py++) {
      for (let px = 0; px < grid; px++) {
        const dx = px + 0.5 - grid / 2;
        const dy = py + 0.5 - grid / 2;
        if (dx * dx + dy * dy > (grid / 2 - 0.35) * (grid / 2 - 0.35)) continue;
        const ang = Math.atan2(dy, dx);
        if (mouth > 0.001 && Math.abs(normAngle(ang - base)) < mouth) continue;
        context.fillRect(x0 + px * cell, y0 + py * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  }

  function ghostBodyAt(px, py) {
    if (py <= 2) {
      const margin = [5, 3, 2][py];
      return px >= margin && px <= 15 - margin;
    }
    if (py <= 12) return px >= 1 && px <= 14;
    if (py <= 15) {
      const feet = [[1, 3], [5, 7], [9, 11], [13, 14]];
      for (let i = 0; i < feet.length; i++) {
        if (px >= feet[i][0] && px <= feet[i][1]) return true;
      }
    }
    return false;
  }

  function drawGhostPixels(context, cx, cy, size, color, opts) {
    opts = opts || {};
    const grid = 16;
    const cell = size / grid;
    const x0 = cx - size / 2;
    const y0 = cy - size / 2;
    const eyesOnly = !!opts.eyesOnly;
    const frightened = !!opts.frightened;
    const flash = !!opts.flash;
    const bodyColor = flash ? "#ffffff" : frightened ? "#2121de" : color;
    const pupilColor = flash ? "#ff2b2b" : "#1b2bff";

    if (!eyesOnly) {
      context.fillStyle = bodyColor;
      for (let py = 0; py < grid; py++) {
        for (let px = 0; px < grid; px++) {
          if (ghostBodyAt(px, py)) {
            context.fillRect(x0 + px * cell, y0 + py * cell, Math.ceil(cell), Math.ceil(cell));
          }
        }
      }
    }

    const dir = opts.dir || "left";
    const off = {
      left: [0, 1],
      right: [2, 1],
      up: [1, 0],
      down: [1, 2],
    }[dir] || [0, 1];

    if (frightened && !eyesOnly) {
      context.fillStyle = flash ? "#ff2b2b" : "#ffffff";
      for (let i = 0; i < 2; i++) {
        const ex = i === 0 ? 4 : 10;
        context.fillRect(x0 + ex * cell, y0 + 6 * cell, cell * 2, cell * 2);
      }
      for (let px = 3; px <= 12; px++) {
        if (px === 7 || px === 8) continue;
        const yy = px % 2 === 0 ? 10 : 11;
        context.fillRect(x0 + px * cell, y0 + yy * cell, Math.ceil(cell), Math.ceil(cell));
      }
    } else {
      const eyeRows = [5, 6, 7, 8];
      const eyeCols = [[3, 6], [9, 12]];
      context.fillStyle = "#ffffff";
      for (const pair of eyeCols) {
        for (const row of eyeRows) {
          context.fillRect(x0 + pair[0] * cell, y0 + row * cell, cell * 4, Math.ceil(cell));
        }
      }
      context.fillStyle = pupilColor;
      for (const pair of eyeCols) {
        context.fillRect(
          x0 + (pair[0] + off[0]) * cell,
          y0 + (5 + off[1]) * cell,
          Math.ceil(cell * 2),
          Math.ceil(cell * 2)
        );
      }
    }
  }

  const FRUIT_MASKS = {
    cherry: [
      "................",
      "..........GG....",
      ".........GG.....",
      "....GG..GG......",
      "...GGGG.G.......",
      "...GGGG.........",
      "..WWWRR.........",
      ".WWRRRRRR.......",
      ".RRRRRRRR..WWW..",
      "RRRRRRRRR.WWRRR.",
      ".RRRRRRR..RRRRRR",
      ".RRRRRR...RRRRRR",
      "..RRRR.....RRRR.",
      "...RR.......RR..",
      "................",
      "................",
    ],
    strawberry: [
      "......GG........",
      "...G.GGGG.G.....",
      "...GGGGGGGG.....",
      "....RRRRRR......",
      "...RRRRRRRR.....",
      "..RRRRRRRRRR....",
      "..RWRRWRRWRR....",
      ".RRRRRRRRRRRR...",
      ".RRWRRRRWRRRR...",
      ".RRRRRRRRRRRR...",
      "..RRRRRRRRRR....",
      "...RRWRRRRR.....",
      "....RRRRRR......",
      ".....RWRR.......",
      "......RR........",
      "................",
    ],
  };
  const FRUIT_COLORS = {
    R: "#ff2b2b",
    D: "#b30000",
    G: "#38d44a",
    W: "#ffffff",
    Y: "#ffe600",
    B: "#8a4b1f",
  };

  function drawMaskPixels(context, mask, cx, cy, size) {
    const grid = mask.length;
    const cell = size / grid;
    const x0 = cx - size / 2;
    const y0 = cy - size / 2;
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < mask[y].length; x++) {
        const ch = mask[y][x];
        if (ch === ".") continue;
        context.fillStyle = FRUIT_COLORS[ch] || "#ff2b2b";
        context.fillRect(x0 + x * cell, y0 + y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  }

  function drawFruitPixels(context, type, cx, cy, size) {
    drawMaskPixels(context, FRUIT_MASKS[type] || FRUIT_MASKS.cherry, cx, cy, size);
  }

  function drawAvatarIcon(context, avatarId, cx, cy, size) {
    const avatar = getAvatar(avatarId);
    if (avatar.kind === "pacman") {
      drawPacmanPixels(context, cx, cy, size, avatar.color, "right", 0.42);
    } else if (avatar.kind === "ghost") {
      drawGhostPixels(context, cx, cy, size * 0.94, avatar.color, { dir: "left" });
    } else {
      drawFruitPixels(context, avatar.fruit, cx, cy, size * 0.95);
    }
  }

  function paintAvatarCanvas(cv, avatarId) {
    const c = cv.getContext("2d");
    const w = cv.width;
    const h = cv.height;
    c.clearRect(0, 0, w, h);
    c.imageSmoothingEnabled = false;
    drawAvatarIcon(c, avatarId, w / 2, h / 2, Math.min(w, h) * 0.8);
  }

  function makeAvatarCanvas(avatarId, size) {
    const cv = document.createElement("canvas");
    cv.width = size;
    cv.height = size;
    paintAvatarCanvas(cv, avatarId);
    return cv;
  }

  // ------------------------- audio (MP3 de sfx-ref) -------------------------
  const Sound = (() => {
    let muted = false;
    let masterVolume = 0.7;
    let lastWaka = 0;
    let bgm = null;
    let bgmPlaying = false;

    try {
      muted = localStorage.getItem(SOUND_KEY) === "off";
    } catch (err) {
      muted = false;
    }

    // mapa de eventos a archivos MP3 dentro de sfx-ref
    const SFX = {
      start: "sfx-ref/start-music.mp3",
      waka: "sfx-ref/eating.mp3",
      power: "sfx-ref/ghost-turn-to-blue.mp3",
      ghost: "sfx-ref/eating-ghost.mp3",
      fruit: "sfx-ref/eating-fruit.mp3",
      life: "sfx-ref/extend.mp3",
      death: "sfx-ref/miss.mp3",
      gameOver: "sfx-ref/miss.mp3",
      victory: "sfx-ref/credit.mp3",
      bgm: "sfx-ref/coffee-break-music.mp3",
    };

    // cache de elementos de audio reutilizables (uno por evento)
    const cache = {};
    function getAudio(key) {
      if (!cache[key]) {
        const a = new Audio(SFX[key]);
        a.preload = "auto";
        a.volume = masterVolume;
        cache[key] = a;
      }
      return cache[key];
    }

    function play(key, opts) {
      if (muted) return;
      opts = opts || {};
      const a = getAudio(key);
      try {
        a.pause();
        a.currentTime = 0;
        a.volume = opts.volume != null ? opts.volume : masterVolume;
        a.loop = !!opts.loop;
        const p = a.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (err) {
        /* silenciosamente ignora errores de reproducción */
      }
    }

    function stop(key) {
      const a = cache[key];
      if (a) {
        try { a.pause(); a.currentTime = 0; } catch (err) {}
      }
    }

    function stopAll() {
      for (const k of Object.keys(cache)) stop(k);
      stopBgm();
    }

    function startBgm() {
      if (muted || bgmPlaying) return;
      const a = getAudio("bgm");
      a.loop = true;
      a.volume = masterVolume * 0.5;
      bgm = a;
      bgmPlaying = true;
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => { bgmPlaying = false; });
    }

    function stopBgm() {
      bgmPlaying = false;
      if (bgm) {
        try { bgm.pause(); bgm.currentTime = 0; } catch (err) {}
      }
      bgm = null;
    }

    // click y move siguen siendo Web Audio (no hay MP3 dedicado para UI)
    let ac = null;
    let masterGain = null;
    function ensureAc() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        masterGain = ac.createGain();
        masterGain.gain.value = 0.22;
        masterGain.connect(ac.destination);
      }
      if (ac.state === "suspended") ac.resume();
      return ac;
    }
    function beep(freq, dur, type, vol) {
      if (muted) return;
      const c = ensureAc();
      if (!c) return;
      const t0 = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(Math.max(20, freq), t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol || 0.3), t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    return {
      init() { ensureAc(); },
      isMuted: () => muted,
      toggle() {
        muted = !muted;
        try { localStorage.setItem(SOUND_KEY, muted ? "off" : "on"); } catch (err) {}
        if (muted) {
          stopAll();
        } else {
          this.click();
        }
        return muted;
      },
      click() { beep(760, 0.045, "square", 0.24); },
      move() { beep(520, 0.04, "square", 0.18); },
      start() { stopBgm(); play("start"); },
      waka() {
        const now = performance.now();
        if (now - lastWaka < 140) return;
        lastWaka = now;
        play("waka", { volume: masterVolume * 0.7 });
      },
      power() { play("power"); },
      ghost() { play("ghost"); },
      fruit() { play("fruit"); },
      life() { play("life"); },
      death() { stopBgm(); play("death"); },
      gameOver() { stopBgm(); play("gameOver"); },
      victory() { stopBgm(); play("victory"); },
      frightEnd() { beep(500, 0.10, "square", 0.18); },
      startBgm,
      stopBgm,
      stopAll,
    };
  })();

  // ------------------------- mapas de niveles -------------------------
  // 5 laberintos inspirados en Pac-Man de Play Store.
  // 1 = muro, 2 = punto, 0 = exterior (se cierra como muro en createMap).
  const LEVEL_MAPS = [
    // NIVEL 1 - Clasico
    [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1],
      [1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1],
      [1, 2, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 2, 1, 2, 2, 2, 2, 2, 2, 2, 1, 2, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1],
      [2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2],
      [1, 1, 1, 1, 1, 2, 1, 2, 1, 2, 2, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 2, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 2, 1, 2, 2, 2, 2, 2, 2, 2, 1, 2, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1],
      [1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1, 2, 2, 2, 1],
      [1, 1, 2, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 2, 2, 1, 1],
      [1, 2, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
    // NIVEL 2 - Laberinto abierto con pasillos anchos
    [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 2, 1],
      [1, 2, 1, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 1],
      [1, 2, 1, 2, 1, 1, 1, 1, 2, 2, 1, 2, 1, 1, 1, 1, 2, 1, 2, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 2, 1, 2, 1, 2, 1, 1, 1, 2, 1, 2, 1, 2, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1],
      [0, 0, 0, 0, 1, 1, 1, 2, 1, 2, 2, 2, 1, 2, 1, 1, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1],
      [2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2],
      [1, 1, 1, 1, 1, 2, 1, 2, 1, 2, 2, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 2, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 2, 1],
      [1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
    // NIVEL 3 - Pasillos en zigzag
    [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 2, 1, 1, 1, 2, 1, 2, 1, 2, 1, 2, 1, 1, 1, 2, 1, 2, 1],
      [1, 2, 1, 2, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1, 2, 1],
      [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 1, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1],
      [0, 0, 0, 0, 1, 2, 2, 1, 1, 2, 2, 2, 2, 1, 2, 2, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1],
      [2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2],
      [1, 1, 1, 1, 1, 2, 1, 2, 1, 2, 2, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 2, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1],
      [1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 1],
      [1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
    // NIVEL 4 - Estructura central con pasos
    [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1],
      [1, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 1],
      [1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1],
      [1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1],
      [1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1],
      [0, 0, 0, 0, 1, 1, 1, 2, 1, 2, 2, 2, 1, 2, 1, 1, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1],
      [2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2],
      [1, 1, 1, 1, 1, 2, 1, 2, 1, 2, 2, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 2, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1],
      [1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1],
      [1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
    // NIVEL 5 - Laberinto complejo y apretado (dificil)
    [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1],
      [1, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 1],
      [1, 2, 2, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 2, 2, 1],
      [1, 1, 1, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 1, 1, 1, 2, 1],
      [0, 0, 0, 0, 1, 2, 1, 2, 1, 2, 2, 2, 1, 2, 1, 2, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1],
      [2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2],
      [1, 1, 1, 1, 1, 2, 1, 2, 1, 2, 2, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 2, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1],
      [1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
  ];

  const BASE_MAP = LEVEL_MAPS[0];

  function createMap(level) {
    const idx = clamp((level || 1) - 1, 0, LEVEL_MAPS.length - 1);
    const template = LEVEL_MAPS[idx];
    const m = template.map((row) => row.slice());
    // cierra los huecos decorativos del mapa original
    for (const r of [8, 12, 13]) {
      for (let c = 0; c < 4; c++) {
        m[r][c] = 1;
        m[r][COLS - 1 - c] = 1;
      }
    }
    // bolas de poder
    m[3][1] = 4;
    m[3][19] = 4;
    m[19][1] = 4;
    m[19][19] = 4;
    // salidas de jugadores
    m[1][1] = 3;
    m[1][19] = 3;
    m[21][1] = 3;
    m[21][19] = 3;
    // casas de los fantasmas (sin puntos)
    for (const d of GHOST_DEFS) m[d.home.y][d.home.x] = 3;
    m[10][10] = 3;
    return m;
  }

  function countPellets(map) {
    let n = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (map[y][x] === 2 || map[y][x] === 4) n++;
      }
    }
    return n;
  }

  function neighborTile(tx, ty, dirName, map) {
    const dir = DIRS[dirName];
    if (!dir || !map) return null;
    let nx = tx + dir.x;
    let ny = ty + dir.y;
    let wrapped = false;
    if (ny === TUNNEL_ROW && (nx < 0 || nx >= COLS)) {
      nx = (nx + COLS) % COLS;
      wrapped = true;
    }
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return null;
    if (map[ny][nx] === 1) return null;
    return { x: nx, y: ny, wrapped };
  }

  function computeField(start) {
    const dist = Array.from({ length: ROWS }, () => Array(COLS).fill(Infinity));
    if (!G.map) return dist;
    dist[start.y][start.x] = 0;
    const queue = [{ x: start.x, y: start.y }];
    while (queue.length) {
      const cur = queue.shift();
      for (const d of DIR_LIST) {
        const n = neighborTile(cur.x, cur.y, d, G.map);
        if (!n || dist[n.y][n.x] !== Infinity) continue;
        dist[n.y][n.x] = dist[cur.y][cur.x] + 1;
        queue.push(n);
      }
    }
    return dist;
  }

  function nearestWalkable(x, y) {
    const sx = clamp(Math.round(x), 0, COLS - 1);
    const sy = clamp(Math.round(y), 0, ROWS - 1);
    if (G.map[sy][sx] !== 1) return { x: sx, y: sy };
    const maxR = Math.max(COLS, ROWS);
    for (let r = 1; r < maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = sx + dx;
          const ny = sy + dy;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
          if (G.map[ny][nx] !== 1) return { x: nx, y: ny };
        }
      }
    }
    return { x: 1, y: 1 };
  }

  function fieldTo(target) {
    return computeField(nearestWalkable(target.x, target.y));
  }

  // ------------------------- estado global -------------------------
  const G = {
    map: null,
    players: [],
    ghosts: [],
    setup: [],
    phase: "idle",
    paused: false,
    level: 1,
    totalPellets: 0,
    pelletsEaten: 0,
    fright: 0,
    combo: 0,
    ghostMode: "scatter",
    modeIndex: 0,
    modeTimer: MODE_PLAN[0].time,
    readyTimer: 0,
    goTimer: 0,
    freezeTimer: 0,
    endTimer: 0,
    deathPlayer: null,
    deathT: 0,
    popups: [],
    fruit: null,
    fruitTimer: 0,
    fruitStage: 0,
    highScore: 0,
    anim: 0,
    frame: 0,
    result: null,
    raf: null,
    lastTime: 0,
  };

  function nearestPlayer(tx, ty) {
    let best = null;
    let bestD = Infinity;
    for (const p of G.players) {
      if (p.eliminated) continue;
      const d = dist2(tx, ty, p.tile.x, p.tile.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  // ------------------------- movimiento en rejilla -------------------------
  class Mover {
    constructor(tx, ty, speed) {
      this.tile = { x: tx, y: ty };
      this.next = { x: tx, y: ty };
      this.progress = 0;
      this.dir = null;
      this.speed = speed;
    }
    resetTo(tx, ty) {
      this.tile = { x: tx, y: ty };
      this.next = { x: tx, y: ty };
      this.progress = 0;
      this.dir = null;
    }
    tilePos() {
      return {
        x: this.tile.x + (this.next.x - this.tile.x) * this.progress,
        y: this.tile.y + (this.next.y - this.tile.y) * this.progress,
      };
    }
    pixelPos() {
      const p = this.tilePos();
      return {
        x: MAZE_X + (p.x + 0.5) * TILE,
        y: MAZE_Y + (p.y + 0.5) * TILE,
      };
    }
    beginMove(dirName) {
      if (!dirName) return false;
      const n = neighborTile(this.tile.x, this.tile.y, dirName, G.map);
      if (!n) {
        this.dir = null;
        return false;
      }
      this.dir = dirName;
      if (n.wrapped) {
        // salto instantaneo de tunel, de borde a borde
        this.tile = { x: n.x, y: n.y };
        const n2 = neighborTile(n.x, n.y, dirName, G.map);
        if (!n2) {
          this.dir = null;
          return false;
        }
        this.next = { x: n2.x, y: n2.y };
        this.progress = 0;
      } else {
        this.next = { x: n.x, y: n.y };
      }
      return true;
    }
    forceReverse() {
      if (!this.dir) return;
      if (this.progress === 0) {
        const back = OPP[this.dir];
        if (neighborTile(this.tile.x, this.tile.y, back, G.map)) {
          this.beginMove(back);
          return;
        }
      }
      const old = { x: this.tile.x, y: this.tile.y };
      this.tile = { x: this.next.x, y: this.next.y };
      this.next = old;
      this.progress = 1 - this.progress;
      this.dir = OPP[this.dir];
    }
    step(dt) {
      if (!this.dir) {
        this.onIdle();
        if (!this.dir) return;
      }
      this.progress += this.speed * dt;
      let guard = 0;
      while (this.progress >= 1 && guard++ < 12) {
        this.progress -= 1;
        this.tile = { x: this.next.x, y: this.next.y };
        this.onArrive();
        if (!this.dir) {
          this.progress = 0;
          break;
        }
      }
    }
    onIdle() {}
    onArrive() {}
  }

  // ------------------------- jugador -------------------------
  class Player extends Mover {
    constructor(participant, index, spawn) {
      super(spawn.x, spawn.y, 5.35);
      this.index = index;
      this.name = participant.name;
      this.avatarId = participant.avatar;
      this.profileId = participant.profileId;
      this.highScore = participant.highScore || 0;
      this.color = PLAYER_COLORS[index];
      this.spawn = { x: spawn.x, y: spawn.y };
      this.score = 0;
      this.lives = 5;
      this.eliminated = false;
      this.desired = null;
      this.facing = "right";
      this.mouth = 0;
      this.invuln = 1.5;
      this.nextExtra = 10000;
      this.deathT = 0;
    }
    resetAtSpawn() {
      this.tile = { x: this.spawn.x, y: this.spawn.y };
      this.next = { x: this.spawn.x, y: this.spawn.y };
      this.progress = 0;
      this.dir = null;
      this.desired = null;
      this.facing = "right";
      this.mouth = 0;
      this.invuln = 2.6;
    }
    update(dt) {
      if (this.invuln > 0) this.invuln -= dt;
      this.mouth += dt * (this.dir ? 9.5 : 3);
      this.step(dt);
    }
    onIdle() {
      if (this.desired) this.tryTurn(this.desired);
    }
    onArrive() {
      if (this.desired && this.beginMove(this.desired)) {
        this.facing = this.desired;
        return;
      }
      if (this.dir && this.beginMove(this.dir)) {
        this.facing = this.dir;
        return;
      }
      this.dir = null;
      this.mouth = 0;
    }
    tryTurn(dirName) {
      if (!G || G.phase !== "play" || G.paused) return;
      if (!this.dir) {
        if (this.beginMove(dirName)) this.facing = dirName;
        return;
      }
      if (OPP[this.dir] === dirName) {
        const old = { x: this.tile.x, y: this.tile.y };
        this.tile = { x: this.next.x, y: this.next.y };
        this.next = old;
        this.progress = 1 - this.progress;
        this.dir = dirName;
        this.facing = dirName;
        return;
      }
      if (this.progress === 0) {
        if (this.beginMove(dirName)) this.facing = dirName;
      }
    }
    addScore(points) {
      this.score += points;
      if (this.score > G.highScore) G.highScore = this.score;
      while (this.score >= this.nextExtra) {
        if (this.lives < MAX_LIVES) {
          this.lives++;
          Sound.life();
          addPopup(this, 1000, "#7dff5a", "VIDA EXTRA");
        }
        this.nextExtra += 10000;
      }
    }
    eatAt() {
      const v = G.map[this.tile.y][this.tile.x];
      if (v !== 2 && v !== 4) return false;
      G.map[this.tile.y][this.tile.x] = 3;
      G.pelletsEaten++;
      this.addScore(v === 4 ? 50 : 10);
      Sound.waka();
      if (v === 4) activatePower();
      if (G.pelletsEaten >= G.totalPellets && G.phase === "play") nextLevel();
      return true;
    }
  }

  // ------------------------- fantasma -------------------------
  class Ghost extends Mover {
    constructor(def) {
      super(def.home.x, def.home.y, def.base);
      this.name = def.name;
      this.color = def.color;
      this.home = { x: def.home.x, y: def.home.y };
      this.scatter = { x: def.scatter.x, y: def.scatter.y };
      this.baseSpeed = def.base;
      this.state = "normal";
      this.homeField = null;
      this.reviveGlow = 0;
    }
    update(dt) {
      this.speed = this.state === "eaten" ? 9.2 : this.state === "frightened" ? 3.25 : this.baseSpeed;
      if (this.reviveGlow > 0) this.reviveGlow -= dt;
      this.step(dt);
    }
    onIdle() {
      this.chooseDirection();
    }
    onArrive() {
      if (this.state === "eaten" && this.tile.x === this.home.x && this.tile.y === this.home.y) {
        this.state = "normal";
        this.reviveGlow = 0.7;
      }
      this.chooseDirection();
    }
    chooseDirection() {
      const forward = [];
      for (const d of DIR_LIST) {
        const n = neighborTile(this.tile.x, this.tile.y, d, G.map);
        if (!n) continue;
        if (this.dir && OPP[this.dir] === d) continue;
        forward.push({ d, n });
      }
      let pool = forward;
      if (!pool.length) {
        pool = [];
        for (const d of DIR_LIST) {
          const n = neighborTile(this.tile.x, this.tile.y, d, G.map);
          if (n) pool.push({ d, n });
        }
      }
      if (!pool.length) {
        this.dir = null;
        return;
      }
      let best = pool[0];
      if (this.state === "eaten") {
        let bestD = this.homeField ? this.homeField[best.n.y][best.n.x] : Infinity;
        for (const cand of pool) {
          const d = this.homeField ? this.homeField[cand.n.y][cand.n.x] : Infinity;
          if (d < bestD) {
            bestD = d;
            best = cand;
          }
        }
      } else if (this.state === "frightened") {
        const target = nearestPlayer(this.tile.x, this.tile.y);
        let bestScore = -Infinity;
        for (const cand of pool) {
          const score = target
            ? dist2(cand.n.x, cand.n.y, target.tile.x, target.tile.y) + Math.random() * 5
            : Math.random() * 50;
          if (score > bestScore) {
            bestScore = score;
            best = cand;
          }
        }
      } else {
        const target = this.targetTile();
        const field = fieldTo(target);
        let bestD = Infinity;
        for (const cand of pool) {
          const d = field[cand.n.y][cand.n.x];
          if (d < bestD) {
            bestD = d;
            best = cand;
          }
        }
        if (bestD === Infinity) {
          bestD = Infinity;
          for (const cand of pool) {
            const d = dist2(cand.n.x, cand.n.y, target.x, target.y);
            if (d < bestD) {
              bestD = d;
              best = cand;
            }
          }
        }
      }
      this.beginMove(best.d);
    }
    targetTile() {
      if (G.ghostMode === "scatter") return this.scatter;
      const p = nearestPlayer(this.tile.x, this.tile.y);
      if (!p) return this.scatter;
      const d = DIRS[p.facing] || { x: 0, y: 0 };
      if (this.name === "BLINKY") return { x: p.tile.x, y: p.tile.y };
      if (this.name === "PINKY") return { x: p.tile.x + d.x * 4, y: p.tile.y + d.y * 4 };
      if (this.name === "INKY") {
        const blinky = G.ghosts[0];
        const ax = p.tile.x + d.x * 2;
        const ay = p.tile.y + d.y * 2;
        return { x: ax * 2 - blinky.tile.x, y: ay * 2 - blinky.tile.y };
      }
      const distance = Math.sqrt(dist2(this.tile.x, this.tile.y, p.tile.x, p.tile.y));
      return distance > 8 ? { x: p.tile.x, y: p.tile.y } : this.scatter;
    }
  }

  // ------------------------- puntuaciones flotantes -------------------------
  function addPopup(entity, points, color, label) {
    const pos = entity.pixelPos();
    G.popups.push({
      x: pos.x,
      y: pos.y,
      text: label || "+" + points,
      color: color || "#ffe600",
      life: 1.1,
    });
  }
  function updatePopups(dt) {
    for (let i = G.popups.length - 1; i >= 0; i--) {
      G.popups[i].life -= dt;
      G.popups[i].y -= dt * 32;
      if (G.popups[i].life <= 0) G.popups.splice(i, 1);
    }
  }

  // ------------------------- reglas de partida -------------------------
  function activatePower() {
    G.fright = G._frightTime || 8;
    G.combo = 0;
    for (const g of G.ghosts) {
      if (g.state === "eaten") continue;
      g.state = "frightened";
      g.forceReverse();
    }
    Sound.power();
  }

  function endFright() {
    let any = false;
    for (const g of G.ghosts) {
      if (g.state === "frightened") {
        g.state = "normal";
        any = true;
      }
    }
    if (any) Sound.frightEnd();
    G.combo = 0;
  }

  function eatGhost(ghost, player) {
    G.combo = Math.min(4, G.combo + 1);
    const points = 200 * Math.pow(2, G.combo - 1);
    player.addScore(points);
    ghost.state = "eaten";
    addPopup(ghost, points, "#38e8ff");
    Sound.ghost();
  }

  function killPlayer(player) {
    if (player.eliminated || G.phase !== "play") return;
    player.lives--;
    player.deathT = 0;
    G.deathPlayer = player;
    G.deathT = 0;
    G.freezeTimer = 1.7;
    G.phase = "dying";
    G.fright = 0;
    for (const g of G.ghosts) if (g.state === "frightened") g.state = "normal";
    Sound.death();
  }

  function resetGhosts() {
    for (const g of G.ghosts) {
      g.resetTo(g.home.x, g.home.y);
      g.state = "normal";
      g.speed = g.baseSpeed;
      g.reviveGlow = 0;
    }
  }

  function resolveDeath() {
    const player = G.deathPlayer;
    G.deathPlayer = null;
    G.deathT = 0;
    if (!player) {
      G.phase = "play";
      return;
    }
    if (player.lives <= 0) {
      player.eliminated = true;
      player.lives = 0;
      resetGhosts();
      if (G.players.every((p) => p.eliminated)) {
        defeat();
      } else {
        G.phase = "play";
        G.goTimer = 0.7;
      }
      return;
    }
    player.resetAtSpawn();
    resetGhosts();
    G.fright = 0;
    G.combo = 0;
    G.phase = "ready";
    G.readyTimer = 1.3;
    G.goTimer = 0;
  }

  function updateModes(dt) {
    if (G.fright > 0) return;
    if (G.modeIndex >= MODE_PLAN.length - 1) return;
    G.modeTimer -= dt;
    if (G.modeTimer <= 0) {
      G.modeIndex++;
      G.ghostMode = MODE_PLAN[G.modeIndex].mode;
      G.modeTimer = MODE_PLAN[G.modeIndex].time;
      for (const g of G.ghosts) {
        if (g.state === "normal") g.forceReverse();
      }
    }
  }

  function updateFruit(dt) {
    if (G.fruit) {
      G.fruitTimer -= dt;
      if (G.fruitTimer <= 0) G.fruit = null;
      return;
    }
    if (!G.totalPellets) return;
    const p1 = G.totalPellets * 0.3;
    const p2 = G.totalPellets * 0.7;
    if (G.fruitStage === 0 && G.pelletsEaten >= p1) {
      G.fruitStage = 1;
      spawnFruit("cherry", 100);
    } else if (G.fruitStage === 1 && G.pelletsEaten >= p2) {
      G.fruitStage = 2;
      spawnFruit("strawberry", 300);
    }
  }

  function spawnFruit(type, value) {
    G.fruit = { x: 10, y: 13, type, value };
    G.fruitTimer = 11;
    Sound.fruit();
  }

  function checkFruit() {
    if (!G.fruit) return;
    for (const p of G.players) {
      if (p.eliminated) continue;
      if (dist2(p.tile.x, p.tile.y, G.fruit.x, G.fruit.y) < 0.55) {
        p.addScore(G.fruit.value);
        addPopup(p, G.fruit.value, "#ff9ad5");
        G.fruit = null;
        Sound.fruit();
        return;
      }
    }
  }

  function checkCollisions() {
    for (const p of G.players) {
      if (p.eliminated || G.phase !== "play") continue;
      const pp = p.tilePos();
      for (const g of G.ghosts) {
        if (g.state === "eaten") continue;
        const gp = g.tilePos();
        if (dist2(pp.x, pp.y, gp.x, gp.y) < 0.68 * 0.68) {
          if (g.state === "frightened") {
            eatGhost(g, p);
          } else if (p.invuln <= 0) {
            killPlayer(p);
            return;
          }
        }
      }
    }
  }

  function victory() {
    if (G.phase !== "play") return;
    G.phase = "victory";
    G.endTimer = 2.4;
    G.fright = 0;
    Sound.victory();
  }

  function defeat() {
    if (G.phase === "defeat" || G.phase === "ended") return;
    G.phase = "defeat";
    G.endTimer = 2.6;
    G.fright = 0;
    Sound.gameOver();
  }

  // ------------------------- actualizacion -------------------------
  function updateGame(dt) {
    if (G.phase === "idle" || G.phase === "ended") return;
    G.anim += dt;
    G.frame++;
    if (G.paused) return;

    if (G.phase === "ready") {
      G.readyTimer -= dt;
      if (G.readyTimer <= 0) {
        G.phase = "play";
        G.goTimer = 0.85;
        for (const p of G.players) p.invuln = Math.max(p.invuln, 0.6);
        Sound.startBgm();
      }
      return;
    }

    if (G.phase === "dying") {
      G.freezeTimer -= dt;
      G.deathT += dt;
      if (G.deathPlayer) G.deathPlayer.deathT += dt;
      if (G.freezeTimer <= 0) resolveDeath();
      return;
    }

    if (G.phase === "victory" || G.phase === "defeat") {
      G.endTimer -= dt;
      if (G.endTimer <= 0) showEnd();
      return;
    }

    if (G.phase !== "play") return;

    if (G.goTimer > 0) G.goTimer -= dt;
    if (G.fright > 0) {
      G.fright -= dt;
      if (G.fright <= 0) endFright();
    }
    updateModes(dt);
    updateFruit(dt);
    updatePopups(dt);

    for (const p of G.players) {
      if (!p.eliminated) {
        p.update(dt);
        p.eatAt();
      }
    }
    if (G.phase !== "play") return;

    for (const g of G.ghosts) g.update(dt);
    checkCollisions();
    checkFruit();
  }

  // ------------------------- entrada -------------------------
  function tryPlayerInput(index, dirName) {
    const p = G.players[index];
    if (!p || p.eliminated) return;
    if (G.phase !== "play" && G.phase !== "ready") return;
    p.desired = dirName;
    if (G.phase === "play" && !G.paused) p.tryTurn(dirName);
  }

  function handleKeyDown(event) {
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    Sound.init();
    const code = event.code;
    if (code === "KeyM") {
      event.preventDefault();
      toggleSound();
      return;
    }
    if (code === "KeyP" || code === "Escape") {
      if (screens.game.classList.contains("active")) {
        event.preventDefault();
        togglePause();
      }
      return;
    }
    if (!screens.game.classList.contains("active")) return;
    if (event.repeat) return;
    for (let i = 0; i < CONTROL_KEYS.length; i++) {
      for (const d of DIR_LIST) {
        if (CONTROL_KEYS[i][d] === code) {
          event.preventDefault();
          tryPlayerInput(i, d);
          return;
        }
      }
    }
  }

  // ------------------------- render del juego -------------------------
  function pxText(text, x, y, size, color, align, glow, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.font = size + 'px "Press Start 2P", monospace';
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color || "#ffffff";
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = Math.max(6, size * 0.55);
    }
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawGame() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    drawMaze();
    drawFoods();
    drawFruit();
    drawGhosts();
    drawPlayers();
    drawPopups();
    drawHUD();
    drawCenterMessages();
  }

  function wallAt(x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
    return G.map[y][x] === 1;
  }

  function drawMaze() {
    if (!G.map) return;

    // relleno oscuro de los muros
    ctx.fillStyle = "#04041a";
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (G.map[y][x] === 1) {
          ctx.fillRect(MAZE_X + x * TILE, MAZE_Y + y * TILE, TILE, TILE);
        }
      }
    }

    // lineas exteriores de la valla
    ctx.save();
    ctx.beginPath();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (G.map[y][x] !== 1) continue;
        const left = wallAt(x - 1, y);
        const right = wallAt(x + 1, y);
        const up = wallAt(x, y - 1);
        const down = wallAt(x, y + 1);
        const px = MAZE_X + x * TILE;
        const py = MAZE_Y + y * TILE;
        if (!up) {
          ctx.moveTo(px + (left ? 1 : 3), py + 3);
          ctx.lineTo(px + TILE - (right ? 1 : 3), py + 3);
        }
        if (!down) {
          ctx.moveTo(px + (left ? 1 : 3), py + TILE - 3);
          ctx.lineTo(px + TILE - (right ? 1 : 3), py + TILE - 3);
        }
        if (!left) {
          ctx.moveTo(px + 3, py + (up ? 1 : 3));
          ctx.lineTo(px + 3, py + TILE - (down ? 1 : 3));
        }
        if (!right) {
          ctx.moveTo(px + TILE - 3, py + (up ? 1 : 3));
          ctx.lineTo(px + TILE - 3, py + TILE - (down ? 1 : 3));
        }
      }
    }
    ctx.strokeStyle = "#2438ff";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.shadowColor = "#1b2bff";
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();

    // linea interior (doble valla clasica)
    ctx.save();
    ctx.beginPath();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (G.map[y][x] !== 1) continue;
        const left = wallAt(x - 1, y);
        const right = wallAt(x + 1, y);
        const up = wallAt(x, y - 1);
        const down = wallAt(x, y + 1);
        const px = MAZE_X + x * TILE;
        const py = MAZE_Y + y * TILE;
        if (!up) {
          ctx.moveTo(px + (left ? 1 : 8), py + 8);
          ctx.lineTo(px + TILE - (right ? 1 : 8), py + 8);
        }
        if (!down) {
          ctx.moveTo(px + (left ? 1 : 8), py + TILE - 8);
          ctx.lineTo(px + TILE - (right ? 1 : 8), py + TILE - 8);
        }
        if (!left) {
          ctx.moveTo(px + 8, py + (up ? 1 : 8));
          ctx.lineTo(px + 8, py + TILE - (down ? 1 : 8));
        }
        if (!right) {
          ctx.moveTo(px + TILE - 8, py + (up ? 1 : 8));
          ctx.lineTo(px + TILE - 8, py + TILE - (down ? 1 : 8));
        }
      }
    }
    ctx.strokeStyle = "#4d63ff";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.shadowColor = "#4d63ff";
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.restore();

    // marco tenue del laberinto
    ctx.save();
    ctx.strokeStyle = "rgba(27, 43, 255, 0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(MAZE_X - 6, MAZE_Y - 6, COLS * TILE + 12, ROWS * TILE + 12);
    ctx.restore();

    // sombra del tunel
    const tunY = MAZE_Y + TUNNEL_ROW * TILE;
    const grd = ctx.createLinearGradient(MAZE_X - 8, 0, MAZE_X + 60, 0);
    grd.addColorStop(0, "rgba(56, 232, 255, 0.22)");
    grd.addColorStop(1, "rgba(56, 232, 255, 0)");
    ctx.fillStyle = grd;
    ctx.fillRect(MAZE_X - 8, tunY, 68, TILE);
    const grd2 = ctx.createLinearGradient(MAZE_X + COLS * TILE + 8, 0, MAZE_X + COLS * TILE - 60, 0);
    grd2.addColorStop(0, "rgba(56, 232, 255, 0.22)");
    grd2.addColorStop(1, "rgba(56, 232, 255, 0)");
    ctx.fillStyle = grd2;
    ctx.fillRect(MAZE_X + COLS * TILE - 60, tunY, 68, TILE);
  }

  function drawFoods() {
    if (!G.map) return;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = G.map[y][x];
        if (v !== 2 && v !== 4) continue;
        const cx = MAZE_X + (x + 0.5) * TILE;
        const cy = MAZE_Y + (y + 0.5) * TILE;
        if (v === 2) {
          ctx.fillStyle = "#ffd9a0";
          ctx.fillRect(cx - 3, cy - 3, 6, 6);
        } else {
          const pulse = 0.5 + Math.sin(G.anim * 6) * 0.5;
          const r = 8 + pulse * 2.6;
          ctx.save();
          ctx.fillStyle = "#ffb8ae";
          ctx.shadowColor = "#ffb8ae";
          ctx.shadowBlur = 16 + pulse * 10;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  function drawFruit() {
    if (!G.fruit) return;
    const blink = G.fruitTimer < 3 && Math.floor(G.anim * 8) % 2 === 0;
    if (blink) return;
    const cx = MAZE_X + (G.fruit.x + 0.5) * TILE;
    const cy = MAZE_Y + (G.fruit.y + 0.5) * TILE;
    ctx.save();
    ctx.shadowColor = "#ff2b2b";
    ctx.shadowBlur = 10;
    drawFruitPixels(ctx, G.fruit.type, cx, cy, TILE * 0.95);
    ctx.restore();
  }

  function drawGhosts() {
    for (const g of G.ghosts) {
      const pos = g.pixelPos();
      const flashing = g.state === "frightened" && G.fright < 2 && Math.floor(G.fright * 8) % 2 === 0;
      const opts = { dir: g.dir || "left", eyesOnly: g.state === "eaten", frightened: g.state === "frightened", flash: flashing };
      if (g.state === "frightened") opts.frightened = true;
      const revived = g.reviveGlow > 0;
      if (revived) {
        ctx.save();
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 16 * Math.min(1, g.reviveGlow / 0.7);
      }
      drawGhostPixels(ctx, pos.x, pos.y, TILE * 1.04, g.color, opts);
      if (revived) ctx.restore();
    }
  }

  function drawPlayers() {
    for (const p of G.players) {
      if (p.eliminated && !(G.phase === "dying" && G.deathPlayer === p)) continue;
      const pos = p.pixelPos();
      if (p.invuln > 0 && G.phase === "play" && Math.floor(G.anim * 12) % 2 === 0) continue;
      if (G.phase === "dying" && G.deathPlayer === p) {
        const mouth = Math.min(Math.PI, p.deathT * 3.1);
        if (p.deathT < 1.45) {
          drawPacmanPixels(ctx, pos.x, pos.y, TILE, p.color, p.facing, mouth);
        }
        continue;
      }
      const mouth = p.dir ? 0.07 + Math.abs(Math.sin(p.mouth)) * 0.55 : 0.16;
      drawPacmanPixels(ctx, pos.x, pos.y, TILE, p.color, p.facing, mouth);
    }
  }

  function drawPopups() {
    for (const pop of G.popups) {
      const alpha = clamp(pop.life, 0, 1);
      pxText(pop.text, pop.x, pop.y, 10, pop.color, "center", pop.color, alpha);
    }
  }

  function drawHUD() {
    // barra superior
    ctx.save();
    ctx.fillStyle = "rgba(2, 3, 14, 0.92)";
    ctx.fillRect(0, 0, CANVAS_W, 84);
    ctx.strokeStyle = "rgba(27, 43, 255, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 84);
    ctx.lineTo(CANVAS_W, 84);
    ctx.stroke();
    ctx.restore();

    const n = G.players.length;

    // un jugador: marcador clasico + vidas a la derecha
    if (n === 1) {
      const p = G.players[0];
      pxText("1UP", 44, 24, 10, "#ffe600", "left");
      pxText(pad(p ? p.score : 0, 6), 44, 50, 18, "#ffffff", "left");
      pxText("HIGH SCORE", CANVAS_W / 2, 24, 10, "#38e8ff", "center");
      pxText(pad(G.highScore, 6), CANVAS_W / 2, 50, 18, "#ffffff", "center");
      pxText("NIVEL " + G.level + "/" + MAX_LEVELS, CANVAS_W / 2, 72, 8, "#ff9ad5", "center");

      if (p) {
        pxText(p.name.slice(0, 12), CANVAS_W - 44, 22, 9, p.eliminated ? "#555566" : p.color, "right");
        const shownLives = Math.min(p.lives, 5);
        for (let j = 0; j < shownLives; j++) {
          const cx = CANVAS_W - 44 - (shownLives - 1 - j) * 18;
          drawPacmanPixels(ctx, cx, 50, 15, p.color, "right", 0.45);
        }
        if (p.eliminated) {
          pxText("ELIMINADO", CANVAS_W - 44, 70, 7, "#ff2b2b", "right");
        } else if (p.invuln > 0) {
          pxText("ESCUDO", CANVAS_W - 44, 70, 7, "#38e8ff", "right");
        }
      }
      return;
    }

    // multijugador: fichas compactas en una sola fila
    const margin = 24;
    const gap = 10;
    const top = 10;
    const cardH = 64;
    const cardW = (CANVAS_W - margin * 2 - (n - 1) * gap) / n;

    for (let i = 0; i < n; i++) {
      const p = G.players[i];
      const x = margin + i * (cardW + gap);

      ctx.save();
      ctx.fillStyle = p.eliminated ? "rgba(8, 8, 14, 0.9)" : "rgba(4, 5, 24, 0.94)";
      ctx.fillRect(x, top, cardW, cardH);
      ctx.strokeStyle = p.eliminated ? "#2a2a3a" : p.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = p.eliminated ? "transparent" : p.color;
      ctx.shadowBlur = p.eliminated ? 0 : 7;
      ctx.strokeRect(x + 1, top + 1, cardW - 2, cardH - 2);
      ctx.restore();

      drawAvatarIcon(ctx, p.avatarId, x + 28, top + cardH / 2, 34);

      const tx = x + 54;
      const nameColor = p.eliminated ? "#555566" : p.color;
      pxText(p.name.slice(0, 10), tx, top + 17, 8, nameColor, "left");
      pxText(pad(p.score, 6), tx, top + 37, 14, p.eliminated ? "#555566" : "#ffffff", "left");

      const shownLives = Math.min(p.lives, 5);
      for (let j = 0; j < shownLives; j++) {
        drawPacmanPixels(ctx, tx + 5 + j * 14, top + 54, 11, p.color, "right", 0.45);
      }

      if (p.eliminated) {
        pxText("ELIMINADO", x + cardW - 10, top + 54, 6, "#ff2b2b", "right");
      } else if (p.invuln > 0) {
        pxText("ESCUDO", x + cardW - 10, top + 54, 6, "#38e8ff", "right");
      } else {
        pxText(CONTROL_LABELS[i], x + cardW - 10, top + 54, 6, "#6b78a8", "right");
      }

      if (cardW > 400) {
        pxText("RECORD " + pad(Math.max(p.highScore, p.score), 6), x + cardW - 10, top + 37, 7, "#6b78a8", "right");
      }
    }

    pxText("NIVEL " + G.level + "/" + MAX_LEVELS + "   HIGH SCORE " + pad(G.highScore, 6), CANVAS_W / 2, CANVAS_H - 10, 7, "#4b5480", "center");
  }

  function drawCenterMessages() {
    if (G.phase === "idle" || G.phase === "ended") return;
    const cx = MAZE_X + (COLS * TILE) / 2;
    const cy = MAZE_Y + 13 * TILE;
    let text = "";
    let color = "#ffe600";
    let size = 24;
    let glow = "#ffe600";
    if (G.phase === "ready") {
      text = "NIVEL " + G.level;
      color = "#ffe600";
      glow = "#ffe600";
      size = 22;
      if (Math.floor(G.anim * 3) % 2 === 0) {
        // parpadea el texto READY adicional
      }
    } else if (G.phase === "play" && G.goTimer > 0) {
      text = "GO!";
      color = "#7dff5a";
      glow = "#7dff5a";
      size = 28;
    } else if (G.phase === "victory") {
      text = "VICTORIA";
      color = "#ffe600";
    } else if (G.phase === "defeat") {
      text = "GAME OVER";
      color = "#ff2b2b";
      glow = "#ff2b2b";
    } else {
      return;
    }
    ctx.save();
    const w = Math.max(220, text.length * size * 0.78);
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(cx - w / 2, cy - size * 0.9, w, size * 1.8);
    ctx.restore();
    pxText(text, cx, cy, size, color, "center", glow);
  }

  // ------------------------- ciclo de juego -------------------------
  function startGame(setup) {
    Sound.init();
    Sound.stopAll();
    G.setup = setup.map((s) => Object.assign({}, s));
    G.level = 1;
    loadLevel(G.level, true);

    $("pauseOverlay").classList.add("hidden");
    $("endOverlay").classList.add("hidden");
    $("btnPause").textContent = "PAUSA";
    stopCutscene();
    updateSoundButton();
    showScreen("game");
    Sound.start();
    startLoop();
  }

  function loadLevel(level, fresh) {
    G.level = level;
    G.map = createMap(level);
    G.totalPellets = countPellets(G.map);
    G.pelletsEaten = 0;
    G.phase = "ready";
    G.paused = false;
    G.fright = 0;
    G.combo = 0;
    G.ghostMode = MODE_PLAN[0].mode;
    G.modeIndex = 0;
    G.modeTimer = MODE_PLAN[0].time;
    G.readyTimer = fresh ? 2.2 : 1.6;
    G.goTimer = 0;
    G.freezeTimer = 0;
    G.endTimer = 0;
    G.deathPlayer = null;
    G.deathT = 0;
    G.popups = [];
    G.fruit = null;
    G.fruitTimer = 0;
    G.fruitStage = 0;
    G.anim = 0;
    G.frame = 0;
    if (fresh) G.result = null;

    // dificultad creciente por nivel
    const speedBoost = (level - 1) * 0.12;
    const frightTime = Math.max(3, 8 - (level - 1) * 1.1);

    if (fresh) {
      const spawns = [
        { x: 1, y: 1 },
        { x: 19, y: 1 },
        { x: 1, y: 21 },
        { x: 19, y: 21 },
      ];
      G.players = G.setup.map((participant, i) => new Player(participant, i, spawns[i]));
      G.ghosts = GHOST_DEFS.map((def) => new Ghost(def));
    } else {
      // reutilizar jugadores (manteniendo puntuacion y vidas) y reiniciar posiciones
      for (const p of G.players) {
        if (!p.eliminated) {
          p.resetAtSpawn();
          p.invuln = 1.5;
        }
      }
      for (const g of G.ghosts) {
        g.resetTo(g.home.x, g.home.y);
        g.state = "normal";
        g.speed = g.baseSpeed;
        g.reviveGlow = 0;
      }
    }

    // aplicar velocidad de fantasmas segun nivel
    for (const g of G.ghosts) {
      g.baseSpeed = GHOST_DEFS.find((d) => d.name === g.name).base + speedBoost;
      g.homeField = computeField(g.home);
    }
    // ajustar duracion del susto en activatePower
    G._frightTime = frightTime;

    G.highScore = overallHighScore();
    for (const p of G.players) {
      G.highScore = Math.max(G.highScore, p.highScore || 0);
    }
  }

  function nextLevel() {
    if (G.level >= MAX_LEVELS) {
      victory();
      return;
    }
    Sound.stopBgm();
    Sound.life();
    loadLevel(G.level + 1, false);
    // mensaje de nivel completado
    G.phase = "ready";
    G.readyTimer = 1.8;
  }

  let loopTimer = null;

  function startLoop() {
    stopLoop();
    G.lastTime = performance.now();
    loopTimer = setInterval(() => {
      if (!screens.game.classList.contains("active")) {
        stopLoop();
        return;
      }
      const now = performance.now();
      const dt = Math.min(0.05, (now - G.lastTime) / 1000);
      G.lastTime = now;
      updateGame(dt);
      drawGame();
      if (G.phase === "ended") stopLoop();
    }, 1000 / 60);
  }

  function stopLoop() {
    if (loopTimer) clearInterval(loopTimer);
    loopTimer = null;
    if (G.raf) cancelAnimationFrame(G.raf);
    G.raf = null;
  }

  function togglePause() {
    if (G.phase === "idle" || G.phase === "ended") return;
    G.paused = !G.paused;
    $("pauseOverlay").classList.toggle("hidden", !G.paused);
    $("btnPause").textContent = G.paused ? "CONTINUAR" : "PAUSA";
    if (G.paused) Sound.stopBgm();
    else if (G.phase === "play") Sound.startBgm();
    Sound.click();
  }

  function updateSoundButton() {
    $("btnSound").textContent = Sound.isMuted() ? "SONIDO OFF" : "SONIDO ON";
  }

  function toggleSound() {
    Sound.toggle();
    updateSoundButton();
  }

  function quitToMenu() {
    stopLoop();
    stopCutscene();
    Sound.stopAll();
    G.phase = "idle";
    G.paused = false;
    $("pauseOverlay").classList.add("hidden");
    $("endOverlay").classList.add("hidden");
    showScreen("menu");
    renderMenu();
  }

  function updateScoresInProfiles() {
    const best = new Map();
    for (const p of G.players) {
      if (!p.profileId) continue;
      best.set(p.profileId, Math.max(best.get(p.profileId) || 0, p.score));
    }
    for (const [id, score] of best.entries()) {
      const profile = findProfile(id);
      if (!profile) continue;
      profile.highScore = Math.max(profile.highScore || 0, score);
      profile.lastScore = score;
      profile.games = (profile.games || 0) + 1;
    }
    saveProfiles();
  }

  // ------------------------- interfaz: perfiles -------------------------
  let selectedAvatar = AVATARS[0].id;
  let setupPlayerCount = 1;
  let setupSelections = [];
  const GUEST_AVATAR_IDS = ["pac-yellow", "ghost-red", "ghost-cyan", "ghost-orange"];

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderAvatarPicker() {
    const wrap = $("avatarPicker");
    wrap.innerHTML = "";
    for (const avatar of AVATARS) {
      const btn = el("button", "avatar-option" + (avatar.id === selectedAvatar ? " selected" : ""));
      btn.type = "button";
      btn.appendChild(makeAvatarCanvas(avatar.id, 72));
      btn.addEventListener("click", () => {
        Sound.init();
        Sound.click();
        selectedAvatar = avatar.id;
        renderAvatarPicker();
      });
      wrap.appendChild(btn);
    }
  }

  function renderAuth() {
    const list = $("profileList");
    list.innerHTML = "";
    const sorted = profiles.slice().sort((a, b) => (b.highScore || 0) - (a.highScore || 0));
    for (const profile of sorted) {
      const row = el("div", "profile-row");
      row.appendChild(makeAvatarCanvas(profile.avatar, 48));

      const meta = el("div", "profile-meta");
      meta.appendChild(el("div", "profile-name", profile.name));
      meta.appendChild(el("div", "profile-hi", "RECORD " + pad(profile.highScore || 0, 6)));
      row.appendChild(meta);

      const actions = el("div", "profile-actions");
      const play = el("button", "btn btn-yellow", "JUGAR");
      play.type = "button";
      play.addEventListener("click", () => selectProfile(profile.id));
      const del = el("button", "btn btn-ghost", "BORRAR");
      del.type = "button";
      del.addEventListener("click", () => {
        if (!window.confirm("BORRAR EL PERFIL DE " + profile.name + "?")) return;
        profiles = profiles.filter((p) => p.id !== profile.id);
        if (currentProfileId === profile.id) currentProfileId = null;
        saveProfiles();
        renderAuth();
        Sound.click();
      });
      actions.appendChild(play);
      actions.appendChild(del);
      row.appendChild(actions);
      list.appendChild(row);
    }

    $("authEmpty").classList.toggle("hidden", profiles.length > 0);
    $("authError").classList.add("hidden");
    $("nameInput").value = "";
    renderAvatarPicker();
  }

  function selectProfile(id) {
    const profile = findProfile(id);
    if (!profile) return;
    currentProfileId = profile.id;
    Sound.init();
    Sound.click();
    showScreen("menu");
    renderMenu();
  }

  // ------------------------- interfaz: menu -------------------------
  function renderMenu() {
    const profile = getCurrentProfile();
    if (!profile) {
      renderAuth();
      showScreen("auth");
      return;
    }
    const chip = $("currentProfile");
    chip.innerHTML = "";
    chip.appendChild(makeAvatarCanvas(profile.avatar, 48));
    const meta = el("div", "profile-meta");
    meta.appendChild(el("div", "chip-name", profile.name));
    meta.appendChild(el("div", "chip-sub", "RECORD PERSONAL " + pad(profile.highScore || 0, 6)));
    chip.appendChild(meta);

    const records = $("recordList");
    records.innerHTML = "";
    const sorted = profiles.slice().sort((a, b) => (b.highScore || 0) - (a.highScore || 0)).slice(0, 6);
    if (!sorted.length) {
      records.appendChild(el("p", "muted", "SIN RECORDS TODAVIA."));
    }
    sorted.forEach((p, index) => {
      const row = el("div", "record-row");
      row.appendChild(el("span", "record-rank", pad(index + 1, 2)));
      row.appendChild(makeAvatarCanvas(p.avatar, 34));
      row.appendChild(el("span", "record-name", p.name));
      row.appendChild(el("span", "record-score", pad(p.highScore || 0, 6)));
      records.appendChild(row);
    });
  }

  function participantFromProfile(profile, index) {
    if (!profile) {
      return {
        profileId: null,
        name: "INVITADO " + (index + 1),
        avatar: GUEST_AVATAR_IDS[index] || GUEST_AVATAR_IDS[0],
        highScore: 0,
      };
    }
    return {
      profileId: profile.id,
      name: profile.name,
      avatar: profile.avatar,
      highScore: profile.highScore || 0,
    };
  }

  function avatarIdForSlot(value, index) {
    if (!value || value === "guest") return GUEST_AVATAR_IDS[index] || GUEST_AVATAR_IDS[0];
    const p = findProfile(value);
    return p ? p.avatar : GUEST_AVATAR_IDS[index] || GUEST_AVATAR_IDS[0];
  }

  // ------------------------- interfaz: setup -------------------------
  function openSetup(count) {
    Sound.init();
    Sound.click();
    if (count === 1) {
      const profile = getCurrentProfile();
      if (!profile) return;
      startGame([participantFromProfile(profile, 0)]);
      return;
    }
    setupPlayerCount = count;
    showScreen("setup");
    renderSetup();
  }

  function renderSetup() {
    const current = getCurrentProfile();
    if (!current) {
      showScreen("auth");
      renderAuth();
      return;
    }
    $("setupSub").textContent = "SELECCIONA QUIEN JUEGA - " + setupPlayerCount + " JUGADORES";
    const list = $("slotList");
    list.innerHTML = "";
    const used = new Set([current.id]);
    setupSelections = [];

    for (let i = 0; i < setupPlayerCount; i++) {
      const slot = el("div", "slot" + (i === 0 ? " selected" : ""));
      const avatarBox = el("div", "slot-avatar");
      const body = el("div", "slot-body");
      body.appendChild(el("div", "slot-label", "P" + (i + 1) + "  //  " + (i === 0 ? "JUGADOR PRINCIPAL" : "ELIGE PERFIL")));

      let selectedId;
      if (i === 0) {
        selectedId = current.id;
        body.appendChild(el("div", "slot-hint", current.name));
      } else {
        const select = document.createElement("select");
        for (const p of profiles) {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.name;
          select.appendChild(opt);
        }
        const guest = document.createElement("option");
        guest.value = "guest";
        guest.textContent = "INVITADO";
        select.appendChild(guest);

        let def = "guest";
        const free = profiles.find((p) => !used.has(p.id));
        if (free) def = free.id;
        used.add(def);
        select.value = def;
        selectedId = def;

        const avatarCanvas = makeAvatarCanvas(avatarIdForSlot(selectedId, i), 48);
        avatarBox.appendChild(avatarCanvas);
        select.addEventListener("change", () => {
          selectedId = select.value;
          setupSelections[i] = selectedId;
          paintAvatarCanvas(avatarCanvas, avatarIdForSlot(selectedId, i));
          Sound.click();
        });
        body.appendChild(select);
      }

      if (i === 0) avatarBox.appendChild(makeAvatarCanvas(current.avatar, 48));
      body.appendChild(el("div", "slot-hint", "CONTROLES: " + CONTROL_LABELS[i]));
      slot.appendChild(avatarBox);
      slot.appendChild(body);
      list.appendChild(slot);
      setupSelections[i] = selectedId;
    }
    renderControlsList();
  }

  function renderControlsList() {
    const wrap = $("controlsList");
    if (!wrap) return;
    wrap.innerHTML = "";
    for (let i = 0; i < setupPlayerCount; i++) {
      const row = el("div", "control-row");
      row.appendChild(el("span", "p" + (i + 1), "P" + (i + 1)));
      row.appendChild(el("span", "", CONTROL_LABELS[i]));
      wrap.appendChild(row);
    }
  }

  function startFromSetup() {
    const current = getCurrentProfile();
    if (!current) return;
    const participants = [];
    for (let i = 0; i < setupPlayerCount; i++) {
      const value = setupSelections[i];
      if (i === 0) {
        participants.push(participantFromProfile(current, i));
      } else if (!value || value === "guest") {
        participants.push(participantFromProfile(null, i));
      } else {
        const p = findProfile(value);
        participants.push(p ? participantFromProfile(p, i) : participantFromProfile(null, i));
      }
    }
    startGame(participants);
  }

  // ------------------------- interfaz: final de partida -------------------------
  function renderEnd(won) {
    const title = $("endTitle");
    title.textContent = won ? "VICTORIA" : "GAME OVER";
    title.classList.toggle("lose", !won);

    const ranking = $("endRanking");
    ranking.innerHTML = "";
    const sorted = G.players.slice().sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    const subtitle = $("endSubtitle");
    if (won && winner) {
      subtitle.textContent = "GANADOR: " + winner.name + "  //  " + pad(winner.score, 6) + " PTS";
    } else if (winner) {
      subtitle.textContent = "FIN DE LA PARTIDA  //  MEJOR PUNTUACION: " + pad(winner.score, 6);
    } else {
      subtitle.textContent = "FIN DE LA PARTIDA";
    }

    sorted.forEach((p, index) => {
      const row = el("div", "end-row" + (won && index === 0 ? " winner" : ""));
      row.appendChild(el("span", "end-rank", pad(index + 1, 2)));
      row.appendChild(makeAvatarCanvas(p.avatarId, 34));
      row.appendChild(el("span", "end-name", p.name + (p.eliminated ? "  (ELIMINADO)" : "")));
      row.appendChild(el("span", "end-score", pad(p.score, 6)));
      ranking.appendChild(row);
    });
  }

  function showEnd() {
    const won = G.phase === "victory";
    G.result = won ? "victory" : "defeat";
    G.phase = "ended";
    stopLoop();
    updateScoresInProfiles();
    renderEnd(won);
    $("endOverlay").classList.remove("hidden");
    startCutscene(won);
  }

  // ------------------------- cinematica final -------------------------
  let cutRAF = null;
  let cutStart = 0;
  let cutWon = false;
  let cutStars = [];
  let cutConfetti = [];

  function makeCutsceneParticles() {
    cutStars = [];
    for (let i = 0; i < 70; i++) {
      cutStars.push({
        x: Math.random() * 960,
        y: Math.random() * 540,
        s: Math.random() * 2 + 1,
        p: Math.random() * Math.PI * 2,
      });
    }
    cutConfetti = [];
    const colors = ["#ffe600", "#38e8ff", "#ff9ad5", "#7dff5a", "#ff2b2b", "#ffad3d"];
    for (let i = 0; i < 55; i++) {
      cutConfetti.push({
        x: Math.random() * 960,
        y: Math.random() * 540,
        speed: 30 + Math.random() * 90,
        phase: Math.random() * Math.PI * 2,
        color: colors[i % colors.length],
        w: 3 + Math.random() * 5,
        h: 5 + Math.random() * 7,
      });
    }
  }

  function cutText(text, x, y, size, color, align, glow) {
    cutCtx.save();
    cutCtx.font = size + 'px "Press Start 2P", monospace';
    cutCtx.textAlign = align || "center";
    cutCtx.textBaseline = "middle";
    cutCtx.fillStyle = color || "#ffffff";
    if (glow) {
      cutCtx.shadowColor = glow;
      cutCtx.shadowBlur = Math.max(8, size * 0.6);
    }
    cutCtx.fillText(text, x, y);
    cutCtx.restore();
  }

  function drawCutsceneFrame(t) {
    const W = cutscene.width;
    const H = cutscene.height;
    cutCtx.clearRect(0, 0, W, H);
    cutCtx.fillStyle = "#000000";
    cutCtx.fillRect(0, 0, W, H);

    // estrellas
    for (const star of cutStars) {
      const alpha = 0.25 + Math.abs(Math.sin(t * 1.7 + star.p)) * 0.75;
      cutCtx.fillStyle = "rgba(120, 150, 255, " + alpha.toFixed(2) + ")";
      cutCtx.fillRect(star.x, star.y, star.s, star.s);
    }

    if (cutWon) drawVictoryCinematic(t, W, H);
    else drawDefeatCinematic(t, W, H);

    // barras de cine
    cutCtx.fillStyle = "#000000";
    cutCtx.fillRect(0, 0, W, 34);
    cutCtx.fillRect(0, H - 34, W, 34);
    cutCtx.strokeStyle = "rgba(27, 43, 255, 0.45)";
    cutCtx.lineWidth = 2;
    cutCtx.strokeRect(1, 35, W - 2, H - 70);
  }

  function drawVictoryCinematic(t, W, H) {
    // suelo de rejilla
    cutCtx.save();
    cutCtx.strokeStyle = "rgba(27, 43, 255, 0.25)";
    cutCtx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const y = 360 + ((i * 16 + t * 26) % 160);
      cutCtx.beginPath();
      cutCtx.moveTo(0, y);
      cutCtx.lineTo(W, y);
      cutCtx.stroke();
    }
    cutCtx.restore();

    // bolas
    for (let x = 70; x < W - 50; x += 34) {
      cutCtx.fillStyle = "#ffd9a0";
      cutCtx.fillRect(x, 300, 5, 5);
    }

    const px = -70 + ((t * 155 + 430) % (W + 260));
    const py = 300 + Math.sin(t * 3) * 5;
    const mouth = 0.12 + Math.abs(Math.sin(t * 13 + 0.9)) * 0.5;
    drawPacmanPixels(cutCtx, px, py, 64, "#ffe600", "right", mouth);

    for (let i = 0; i < 4; i++) {
      const gx = px - 95 - i * 62;
      const gy = py + Math.sin(t * 4 + i) * 10;
      const frightened = Math.floor(t * 2.2) % 3 === 0;
      drawGhostPixels(cutCtx, gx, gy, 54, GHOST_DEFS[i].color, {
        dir: "left",
        frightened,
        flash: frightened && G.anim % 1 > 0.5,
      });
    }

    // confeti
    for (const c of cutConfetti) {
      const y = (c.y + t * c.speed) % (H + 40) - 20;
      const x = c.x + Math.sin(t * 2 + c.phase) * 26;
      cutCtx.fillStyle = c.color;
      cutCtx.fillRect(x, y, c.w, c.h);
    }

    cutText("VICTORIA", W / 2, 114, 50, "#ffe600", "center", "#ffe600");
    const winner = G.players.slice().sort((a, b) => b.score - a.score)[0];
    cutText(winner ? winner.name : "PAC-MAN", W / 2, 180, 15, "#38e8ff", "center", "#38e8ff");
    cutText(winner ? pad(winner.score, 6) + " PTS" : "", W / 2, 214, 13, "#ffffff");
    cutText("PARTIDA COMPLETADA", W / 2, H - 58, 9, "#8a97ff");
  }

  function drawDefeatCinematic(t, W, H) {
    const gradient = cutCtx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 520);
    gradient.addColorStop(0, "rgba(90, 0, 0, 0.15)");
    gradient.addColorStop(1, "rgba(150, 0, 0, 0.62)");
    cutCtx.fillStyle = gradient;
    cutCtx.fillRect(0, 0, W, H);

    for (let i = 0; i < 4; i++) {
      const angle = t * 0.85 + Math.PI / 4 + i * (Math.PI / 2);
      const gx = W / 2 + Math.cos(angle) * 195;
      const gy = H / 2 + 65 + Math.sin(angle) * 100;
      drawGhostPixels(cutCtx, gx, gy, 50, GHOST_DEFS[i].color, { dir: i < 2 ? "left" : "right" });
    }

    const cycle = (t % 4.5) / 4.5;
    const mouth = Math.min(Math.PI, cycle * 3.4);
    const size = Math.max(0, 66 - cycle * 42);
    if (size > 2) drawPacmanPixels(cutCtx, W / 2, H / 2, size, "#ffe600", "right", mouth);

    cutText("GAME OVER", W / 2, 126, 48, "#ff2b2b", "center", "#ff2b2b");
    cutText("NADIE SOBREVIVIO", W / 2, 190, 13, "#ff9ad5", "center", "#ff2b2b");
    const winner = G.players.slice().sort((a, b) => b.score - a.score)[0];
    if (winner) cutText("MEJOR: " + winner.name + "  " + pad(winner.score, 6), W / 2, H - 58, 9, "#9aa4c8");
  }

  function startCutscene(won) {
    stopCutscene();
    cutWon = won;
    makeCutsceneParticles();
    cutStart = performance.now();

    const video = $("endVideo");
    video.classList.add("hidden");
    cutscene.classList.remove("hidden");
    video.onerror = () => {
      video.classList.add("hidden");
      cutscene.classList.remove("hidden");
    };
    video.onloadeddata = () => {
      video.classList.remove("hidden");
      cutscene.classList.add("hidden");
      video.play().catch(() => {});
    };
    if (window.fetch) {
      fetch("final.mp4", { method: "HEAD" })
        .then((res) => {
          if (!res.ok) return;
          video.src = "final.mp4";
          video.load();
        })
        .catch(() => {});
    }

    drawCutsceneFrame(0);
    const loop = (ts) => {
      const t = (ts - cutStart) / 1000;
      drawCutsceneFrame(t);
      cutRAF = requestAnimationFrame(loop);
    };
    cutRAF = requestAnimationFrame(loop);
  }

  function stopCutscene() {
    if (cutRAF) cancelAnimationFrame(cutRAF);
    cutRAF = null;
    const video = $("endVideo");
    if (video) {
      video.onloadeddata = null;
      video.onerror = null;
      video.pause();
    }
  }

  // ------------------------- pantalla de inicio -------------------------
  function drawStartArt() {
    const cv = $("startArt");
    if (!cv) return;
    const c = cv.getContext("2d");
    c.clearRect(0, 0, cv.width, cv.height);
    drawPacmanPixels(c, 42, 48, 66, "#ffe600", "right", 0.42);
    for (let i = 0; i < GHOST_DEFS.length; i++) {
      drawGhostPixels(c, 138 + i * 62, 48, 50, GHOST_DEFS[i].color, { dir: "left" });
    }
  }

  // ------------------------- eventos e inicio -------------------------
  function onCreateProfile(event) {
    event.preventDefault();
    Sound.init();
    const input = $("nameInput");
    const error = $("authError");
    const name = input.value.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 12);
    if (!name) {
      error.textContent = "ESCRIBE UN NOMBRE PARA TU PERFIL.";
      error.classList.remove("hidden");
      Sound.move();
      return;
    }
    if (profiles.some((p) => p.name.toUpperCase() === name)) {
      error.textContent = "ESE NOMBRE YA EXISTE. ELIGE OTRO.";
      error.classList.remove("hidden");
      Sound.move();
      return;
    }
    if (profiles.length >= 20) {
      error.textContent = "LIMITE DE 20 PERFILES ALCANZADO.";
      error.classList.remove("hidden");
      Sound.move();
      return;
    }
    const profile = {
      id: uid(),
      name,
      avatar: selectedAvatar,
      highScore: 0,
      lastScore: 0,
      games: 0,
      createdAt: Date.now(),
    };
    profiles.push(profile);
    saveProfiles();
    currentProfileId = profile.id;
    Sound.click();
    showScreen("menu");
    renderMenu();
  }

  function initEvents() {
    document.addEventListener("keydown", handleKeyDown);
    $("createForm").addEventListener("submit", onCreateProfile);

    $("btnPlaySolo").addEventListener("click", () => {
      Sound.init();
      Sound.click();
      renderAuth();
      showScreen("auth");
    });
    $("btnAuthBack").addEventListener("click", () => {
      Sound.click();
      showScreen("start");
    });

    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => openSetup(Number(btn.dataset.players)));
    });
    $("btnHow").addEventListener("click", () => {
      Sound.init();
      Sound.click();
      showScreen("help");
    });
    $("btnHelpBack").addEventListener("click", () => {
      Sound.click();
      showScreen("menu");
      renderMenu();
    });
    $("btnSwitchProfile").addEventListener("click", () => {
      Sound.click();
      currentProfileId = null;
      renderAuth();
      showScreen("auth");
    });
    $("btnStartGame").addEventListener("click", () => {
      Sound.init();
      Sound.click();
      startFromSetup();
    });
    $("btnBackMenu").addEventListener("click", () => {
      Sound.click();
      showScreen("menu");
      renderMenu();
    });
    $("btnPause").addEventListener("click", togglePause);
    $("btnSound").addEventListener("click", () => {
      Sound.init();
      toggleSound();
    });
    $("btnResume").addEventListener("click", togglePause);
    $("btnQuit").addEventListener("click", () => {
      Sound.click();
      quitToMenu();
    });
    $("btnReplay").addEventListener("click", () => {
      Sound.init();
      Sound.click();
      $("endOverlay").classList.add("hidden");
      stopCutscene();
      startGame(G.setup);
    });
    $("btnEndMenu").addEventListener("click", () => {
      Sound.click();
      quitToMenu();
    });

    // gestos para un jugador en pantallas tactiles
    let touchStart = null;
    canvas.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length !== 1) return;
        touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      },
      { passive: true }
    );
    canvas.addEventListener(
      "touchend",
      (event) => {
        if (!touchStart) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - touchStart.x;
        const dy = touch.clientY - touchStart.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) {
          if (Math.abs(dx) > Math.abs(dy)) tryPlayerInput(0, dx > 0 ? "right" : "left");
          else tryPlayerInput(0, dy > 0 ? "down" : "up");
        }
        touchStart = null;
      },
      { passive: true }
    );
    canvas.addEventListener("pointerdown", () => Sound.init());
  }

  function init() {
    loadProfiles();
    renderAuth();
    updateSoundButton();
    initEvents();
    drawStartArt();
    showScreen("start");
  }

  init();
})();
