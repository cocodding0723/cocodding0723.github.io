(function () {
  'use strict';

  // ── Section 1: Early exit ──
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var canvas = document.getElementById('hero-game-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var hero = document.getElementById('hero');
  if (!hero) return;

  // ── Section 2: Constants & Colors ──
  var GRAVITY = 0.15;
  var JUMP_FORCE = -4.0;
  var PIPE_SPEED = 1.5;
  var PIPE_GAP = 140;
  var PIPE_WIDTH = 40;
  var PIPE_CAP_H = 8;
  var PIPE_INTERVAL = 2200;
  var BIRD_SIZE = 16;
  var PIXEL_SCALE = 2;
  var RENDERED_SIZE = BIRD_SIZE * PIXEL_SCALE;
  var BIRD_FRAME_MS = 120;

  var SNAKE_CELL = 16;
  var SNAKE_TICK_PLAY = 120;
  var SNAKE_TICK_AUTO = 180;
  var SNAKE_INIT_LEN = 4;

  var WIPE_IN_MS = 400;
  var WIPE_OUT_MS = 500;
  var DEAD_PAUSE = 800;

  var isMobile = window.innerWidth < 480;
  if (isMobile) { PIPE_GAP = 160; PIPE_SPEED = 1.2; PIPE_INTERVAL = 2600; }

  var C = {
    body: '#58a6ff', wing: '#1f6feb', eye: '#e6edf3',
    beak: '#f0883e', pupil: '#0d1117',
    pipe: '#30363d', pipeBdr: '#8b949e',
    pipeGlow: 'rgba(88,166,255,0.25)',
    score: '#58a6ff', prompt: '#8b949e',
    snakeHead: '#58a6ff', snakeTail: '#1f6feb',
    apple: '#f0883e',
    diagonal: '#30363d', diagGlow: 'rgba(88,166,255,0.15)',
    wipeGlow: 'rgba(88,166,255,0.4)',
    label: '#8b949e', labelHover: '#e6edf3'
  };

  // ── Section 3: Canvas / DOM setup ──
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W, H;

  function resize() {
    W = hero.offsetWidth;
    H = hero.offsetHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    snake.gridW = Math.floor(W / SNAKE_CELL);
    snake.gridH = Math.floor(H / SNAKE_CELL);
  }
  resize();
  window.addEventListener('resize', function () {
    isMobile = window.innerWidth < 480;
    if (isMobile) { PIPE_GAP = 160; PIPE_SPEED = 1.2; PIPE_INTERVAL = 2600; }
    else { PIPE_GAP = 140; PIPE_SPEED = 1.5; PIPE_INTERVAL = 2200; }
    resize();
  });

  // ── Section 4: Bird sprites ──
  var BIRD_SPRITES = [
    [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],[0,0,0,0,1,1,1,1,3,3,1,0,0,0,0,0],[0,0,2,2,1,1,1,1,3,4,1,1,0,0,0,0],[0,0,2,2,2,1,1,1,1,1,1,1,5,5,0,0],[0,0,0,2,1,1,1,1,1,1,1,1,5,5,0,0],[0,0,0,0,1,1,1,1,1,1,1,5,5,0,0,0],[0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0],[0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],
    [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],[0,0,0,0,1,1,1,1,3,3,1,0,0,0,0,0],[0,0,0,0,1,1,1,1,3,4,1,1,0,0,0,0],[0,0,2,2,2,1,1,1,1,1,1,1,5,5,0,0],[0,0,2,2,2,1,1,1,1,1,1,1,5,5,0,0],[0,0,0,0,1,1,1,1,1,1,1,5,5,0,0,0],[0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0],[0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],
    [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],[0,0,0,0,1,1,1,1,3,3,1,0,0,0,0,0],[0,0,0,0,1,1,1,1,3,4,1,1,0,0,0,0],[0,0,0,0,1,1,1,1,1,1,1,1,5,5,0,0],[0,0,0,2,1,1,1,1,1,1,1,1,5,5,0,0],[0,0,2,2,1,1,1,1,1,1,1,5,5,0,0,0],[0,0,2,2,2,1,1,1,1,1,1,1,0,0,0,0],[0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]]
  ];
  var birdColorMap = { 1: C.body, 2: C.wing, 3: C.eye, 4: C.pupil, 5: C.beak };
  var birdSpriteCanvases = [];
  function buildBirdSprites() {
    birdSpriteCanvases = [];
    for (var f = 0; f < BIRD_SPRITES.length; f++) {
      var off = document.createElement('canvas');
      off.width = RENDERED_SIZE; off.height = RENDERED_SIZE;
      var oc = off.getContext('2d');
      oc.imageSmoothingEnabled = false;
      var grid = BIRD_SPRITES[f];
      for (var row = 0; row < BIRD_SIZE; row++) {
        for (var col = 0; col < BIRD_SIZE; col++) {
          var v = grid[row][col];
          if (v === 0) continue;
          oc.fillStyle = birdColorMap[v];
          oc.fillRect(col * PIXEL_SCALE, row * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE);
        }
      }
      birdSpriteCanvases.push(off);
    }
  }
  buildBirdSprites();

  // ── Helpers ──
  function roundRect(c, x, y, w, h, r) {
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  function lerpColor(c1, c2, t) {
    var r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
    var r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
    return 'rgb(' + Math.round(r1 + (r2 - r1) * t) + ',' + Math.round(g1 + (g2 - g1) * t) + ',' + Math.round(b1 + (b2 - b1) * t) + ')';
  }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }

  // ── Section 5: Flappy Bird ──
  var flappy = {
    bird: { x: 0, y: 0, vy: 0 },
    pipes: [],
    score: 0,
    frameIdx: 0,
    frameTimer: 0,
    idleTime: 0,
    lastPipeTime: 0,

    reset: function () {
      this.bird.x = W * 0.2; this.bird.y = H * 0.45; this.bird.vy = 0;
      this.pipes = []; this.score = 0; this.lastPipeTime = 0; this.idleTime = 0;
    },
    spawnPipe: function () {
      var minY = PIPE_GAP * 0.7, maxY = H - PIPE_GAP * 0.7;
      this.pipes.push({ x: W + PIPE_WIDTH, gapY: minY + Math.random() * (maxY - minY), scored: false });
    },
    jump: function () { this.bird.vy = JUMP_FORCE; },

    updateIdle: function (dt) {
      this.idleTime += dt * 0.001;
      this.bird.y = H * 0.45 + Math.sin(this.idleTime * 1.5) * 15;
      this.bird.x = W * 0.2;
      this.frameTimer += dt;
      if (this.frameTimer >= BIRD_FRAME_MS) { this.frameTimer -= BIRD_FRAME_MS; this.frameIdx = (this.frameIdx + 1) % 3; }
      for (var i = this.pipes.length - 1; i >= 0; i--) {
        this.pipes[i].x -= PIPE_SPEED * 0.4;
        if (this.pipes[i].x < -PIPE_WIDTH) this.pipes.splice(i, 1);
      }
      this.lastPipeTime += dt;
      if (this.lastPipeTime > PIPE_INTERVAL * 1.5) { this.lastPipeTime = 0; this.spawnPipe(); }
    },

    updatePlaying: function (dt) {
      this.frameTimer += dt;
      if (this.frameTimer >= BIRD_FRAME_MS) { this.frameTimer -= BIRD_FRAME_MS; this.frameIdx = (this.frameIdx + 1) % 3; }
      this.bird.vy += GRAVITY;
      this.bird.y += this.bird.vy;
      for (var j = this.pipes.length - 1; j >= 0; j--) {
        this.pipes[j].x -= PIPE_SPEED;
        if (this.pipes[j].x < -PIPE_WIDTH) { this.pipes.splice(j, 1); continue; }
        if (!this.pipes[j].scored && this.pipes[j].x < this.bird.x) { this.pipes[j].scored = true; this.score++; }
      }
      this.lastPipeTime += dt;
      if (this.lastPipeTime > PIPE_INTERVAL) { this.lastPipeTime = 0; this.spawnPipe(); }
      return this.checkCollision();
    },

    checkCollision: function () {
      var r = RENDERED_SIZE * 0.35;
      if (this.bird.y - r < 0 || this.bird.y + r > H) return true;
      for (var i = 0; i < this.pipes.length; i++) {
        var p = this.pipes[i], hw = PIPE_WIDTH / 2;
        if (this.bird.x + r > p.x - hw && this.bird.x - r < p.x + hw) {
          if (this.bird.y - r < p.gapY - PIPE_GAP / 2 || this.bird.y + r > p.gapY + PIPE_GAP / 2) return true;
        }
      }
      return false;
    },

    draw: function (alpha) {
      for (var i = 0; i < this.pipes.length; i++) this.drawPipe(this.pipes[i], alpha);
      this.drawBird(alpha);
    },

    drawBird: function (alpha) {
      var sprite = birdSpriteCanvases[this.frameIdx];
      if (!sprite) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this.bird.x, this.bird.y);
      var angle = (gameState === 'SPLIT_IDLE' || gameState === 'WIPE_IN' || gameState === 'WIPE_OUT')
        ? 0 : Math.max(-25, Math.min(70, this.bird.vy * 4)) * Math.PI / 180;
      ctx.rotate(angle);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, -RENDERED_SIZE / 2, -RENDERED_SIZE / 2, RENDERED_SIZE, RENDERED_SIZE);
      ctx.restore();
    },

    drawPipe: function (p, alpha) {
      var hw = PIPE_WIDTH / 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = C.pipe;
      ctx.fillRect(p.x - hw, 0, PIPE_WIDTH, p.gapY - PIPE_GAP / 2);
      ctx.fillStyle = C.pipeBdr;
      ctx.fillRect(p.x - hw - 3, p.gapY - PIPE_GAP / 2 - PIPE_CAP_H, PIPE_WIDTH + 6, PIPE_CAP_H);
      ctx.fillStyle = C.pipeGlow;
      ctx.fillRect(p.x - hw + 4, 0, 3, p.gapY - PIPE_GAP / 2 - PIPE_CAP_H);
      ctx.fillStyle = C.pipe;
      ctx.fillRect(p.x - hw, p.gapY + PIPE_GAP / 2, PIPE_WIDTH, H - (p.gapY + PIPE_GAP / 2));
      ctx.fillStyle = C.pipeBdr;
      ctx.fillRect(p.x - hw - 3, p.gapY + PIPE_GAP / 2, PIPE_WIDTH + 6, PIPE_CAP_H);
      ctx.fillStyle = C.pipeGlow;
      ctx.fillRect(p.x - hw + 4, p.gapY + PIPE_GAP / 2 + PIPE_CAP_H, 3, H - (p.gapY + PIPE_GAP / 2 + PIPE_CAP_H));
    },

    drawScore: function (alpha) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = C.score;
      ctx.font = 'bold 32px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.score, W / 2, 60);
      ctx.restore();
    }
  };

  // ── Section 6: Snake game ──
  var snake = {
    cells: [],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    apple: { x: 0, y: 0 },
    score: 0,
    tickTimer: 0,
    gridW: 0,
    gridH: 0,
    alive: true,
    glowTime: 0,

    reset: function () {
      this.gridW = Math.floor(W / SNAKE_CELL);
      this.gridH = Math.floor(H / SNAKE_CELL);
      this.cells = [];
      var sx = Math.floor(this.gridW / 2), sy = Math.floor(this.gridH / 2);
      for (var i = 0; i < SNAKE_INIT_LEN; i++) this.cells.push({ x: sx - i, y: sy });
      this.dir = { x: 1, y: 0 };
      this.nextDir = { x: 1, y: 0 };
      this.score = 0;
      this.tickTimer = 0;
      this.alive = true;
      this.spawnApple();
    },

    spawnApple: function () {
      var occ = {};
      for (var i = 0; i < this.cells.length; i++) occ[this.cells[i].x + ',' + this.cells[i].y] = true;
      var free = [];
      for (var x = 0; x < this.gridW; x++)
        for (var y = 0; y < this.gridH; y++)
          if (!occ[x + ',' + y]) free.push({ x: x, y: y });
      if (free.length > 0) { var p = free[Math.floor(Math.random() * free.length)]; this.apple.x = p.x; this.apple.y = p.y; }
    },

    setDirection: function (dx, dy) {
      if (this.dir.x === -dx && this.dir.y === -dy) return;
      this.nextDir = { x: dx, y: dy };
    },

    tick: function () {
      this.dir = this.nextDir;
      var head = this.cells[0];
      var nx = head.x + this.dir.x, ny = head.y + this.dir.y;
      if (nx < 0 || nx >= this.gridW || ny < 0 || ny >= this.gridH) { this.alive = false; return; }
      for (var i = 0; i < this.cells.length; i++) {
        if (this.cells[i].x === nx && this.cells[i].y === ny) { this.alive = false; return; }
      }
      this.cells.unshift({ x: nx, y: ny });
      if (nx === this.apple.x && ny === this.apple.y) { this.score++; this.spawnApple(); }
      else this.cells.pop();
    },

    updateAuto: function (dt) {
      this.glowTime += dt * 0.001;
      this.tickTimer += dt;
      if (this.tickTimer >= SNAKE_TICK_AUTO) {
        this.tickTimer -= SNAKE_TICK_AUTO;
        if (!this.alive) { this.reset(); return; }
        this.aiStep();
        this.tick();
      }
    },

    updatePlaying: function (dt) {
      this.glowTime += dt * 0.001;
      this.tickTimer += dt;
      if (this.tickTimer >= SNAKE_TICK_PLAY) {
        this.tickTimer -= SNAKE_TICK_PLAY;
        this.tick();
      }
      return !this.alive;
    },

    aiStep: function () {
      var head = this.cells[0], target = this.apple;
      var gw = this.gridW, gh = this.gridH;
      var bodySet = {};
      for (var i = 1; i < this.cells.length; i++) bodySet[this.cells[i].x + ',' + this.cells[i].y] = true;
      var dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

      // BFS to apple
      var queue = [{ x: head.x, y: head.y, fd: null }];
      var vis = {};
      vis[head.x + ',' + head.y] = true;
      for (var k in bodySet) vis[k] = true;
      var foundDir = null, cap = 500;
      while (queue.length > 0 && cap-- > 0) {
        var cur = queue.shift();
        if (cur.x === target.x && cur.y === target.y && cur.fd) { foundDir = cur.fd; break; }
        for (var d = 0; d < 4; d++) {
          var nx = cur.x + dirs[d].x, ny = cur.y + dirs[d].y;
          if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
          var nk = nx + ',' + ny;
          if (vis[nk]) continue;
          vis[nk] = true;
          queue.push({ x: nx, y: ny, fd: cur.fd || dirs[d] });
        }
      }
      if (foundDir && !(foundDir.x === -this.dir.x && foundDir.y === -this.dir.y)) {
        this.nextDir = foundDir; return;
      }

      // Fallback: flood fill for safest direction
      var bestDir = null, bestCount = -1;
      for (var d2 = 0; d2 < 4; d2++) {
        if (dirs[d2].x === -this.dir.x && dirs[d2].y === -this.dir.y) continue;
        var nx2 = head.x + dirs[d2].x, ny2 = head.y + dirs[d2].y;
        if (nx2 < 0 || nx2 >= gw || ny2 < 0 || ny2 >= gh) continue;
        if (bodySet[nx2 + ',' + ny2]) continue;
        var count = this.floodFill(nx2, ny2, bodySet, 30);
        if (count > bestCount) { bestCount = count; bestDir = dirs[d2]; }
      }
      if (bestDir) this.nextDir = bestDir;
    },

    floodFill: function (sx, sy, bodySet, cap) {
      var vis = {}, queue = [{ x: sx, y: sy }], count = 0;
      vis[sx + ',' + sy] = true;
      var dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
      while (queue.length > 0 && count < cap) {
        var cur = queue.shift(); count++;
        for (var d = 0; d < 4; d++) {
          var nx = cur.x + dirs[d].x, ny = cur.y + dirs[d].y;
          if (nx < 0 || nx >= this.gridW || ny < 0 || ny >= this.gridH) continue;
          var key = nx + ',' + ny;
          if (vis[key] || bodySet[key]) continue;
          vis[key] = true;
          queue.push({ x: nx, y: ny });
        }
      }
      return count;
    },

    draw: function (alpha) {
      var cs = SNAKE_CELL, len = this.cells.length;
      // Apple with pulse glow
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = C.apple;
      ctx.shadowBlur = 8 + Math.sin(this.glowTime * 3) * 4;
      ctx.fillStyle = C.apple;
      ctx.beginPath();
      roundRect(ctx, this.apple.x * cs + cs * 0.1, this.apple.y * cs + cs * 0.1, cs * 0.8, cs * 0.8, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Body segments (tail→head so head draws on top)
      for (var i = len - 1; i >= 0; i--) {
        var cell = this.cells[i];
        var t = len > 1 ? i / (len - 1) : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = lerpColor(C.snakeTail, C.snakeHead, t);
        ctx.beginPath();
        roundRect(ctx, cell.x * cs + 1, cell.y * cs + 1, cs - 2, cs - 2, 3);
        ctx.fill();
        ctx.restore();
      }

      // Eyes on head
      if (len > 0) {
        var h = this.cells[0], hx = h.x * cs, hy = h.y * cs;
        var ex1, ey1, ex2, ey2, es = 3, ps = 1.5;
        if (this.dir.x === 1)       { ex1 = hx+10; ey1 = hy+3; ex2 = hx+10; ey2 = hy+10; }
        else if (this.dir.x === -1) { ex1 = hx+3;  ey1 = hy+3; ex2 = hx+3;  ey2 = hy+10; }
        else if (this.dir.y === -1) { ex1 = hx+3;  ey1 = hy+3; ex2 = hx+10; ey2 = hy+3;  }
        else                        { ex1 = hx+3;  ey1 = hy+10;ex2 = hx+10; ey2 = hy+10; }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = C.eye;
        ctx.fillRect(ex1, ey1, es, es);
        ctx.fillRect(ex2, ey2, es, es);
        ctx.fillStyle = C.pupil;
        ctx.fillRect(ex1 + 0.75, ey1 + 0.75, ps, ps);
        ctx.fillRect(ex2 + 0.75, ey2 + 0.75, ps, ps);
        ctx.restore();
      }
    },

    drawScore: function (alpha) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = C.apple;
      ctx.font = 'bold 32px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.score, W / 2, 60);
      ctx.restore();
    }
  };

  // ── Section 7: Diagonal geometry ──
  function getSide(px, py) {
    return (px * H + py * W < W * H) ? 'flappy' : 'snake';
  }
  function clipFlappy() {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(0, H); ctx.closePath(); ctx.clip();
  }
  function clipSnake() {
    ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.clip();
  }
  function drawDiagonalLine() {
    ctx.save();
    ctx.strokeStyle = C.diagGlow; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(0, H); ctx.stroke();
    ctx.strokeStyle = C.diagonal; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(0, H); ctx.stroke();
    ctx.restore();
  }

  // ── Section 8: Radial wipe ──
  var wipe = { cx: 0, cy: 0, radius: 0, maxRadius: 0, progress: 0 };
  function calcMaxRadius(cx, cy) {
    var corners = [[0,0],[W,0],[0,H],[W,H]], maxR = 0;
    for (var i = 0; i < 4; i++) {
      var dx = cx - corners[i][0], dy = cy - corners[i][1];
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > maxR) maxR = d;
    }
    return maxR;
  }

  // ── Section 9: Hover effect ──
  var hover = { side: null, flappyOp: 0.35, snakeOp: 0.35, tgtF: 0.35, tgtS: 0.35 };
  function updateHover(dt) {
    if (gameState !== 'SPLIT_IDLE') return;
    var k = 1 - Math.exp(-dt * 0.01);
    hover.flappyOp += (hover.tgtF - hover.flappyOp) * k;
    hover.snakeOp  += (hover.tgtS - hover.snakeOp) * k;
  }
  hero.addEventListener('mousemove', function (e) {
    if (gameState !== 'SPLIT_IDLE') return;
    var rect = canvas.getBoundingClientRect();
    hover.side = getSide(e.clientX - rect.left, e.clientY - rect.top);
    if (hover.side === 'flappy') { hover.tgtF = 0.65; hover.tgtS = 0.2; }
    else { hover.tgtF = 0.2; hover.tgtS = 0.65; }
  });
  hero.addEventListener('mouseleave', function () {
    hover.side = null; hover.tgtF = 0.35; hover.tgtS = 0.35;
  });

  // ── Section 10: State machine ──
  var gameState = 'SPLIT_IDLE';
  var activeGame = null;
  var stateTimer = 0;
  var visible = true;
  var animId = null;
  var lastTime = 0;

  var heroContent = hero.querySelector('.hero-content');
  function minimizeHeroContent() { if (heroContent) heroContent.classList.add('minimized'); }
  function restoreHeroContent()  { if (heroContent) heroContent.classList.remove('minimized'); }

  flappy.reset();
  snake.reset();

  function update(dt) {
    if (dt > 100) dt = 16;
    switch (gameState) {
      case 'SPLIT_IDLE':
        updateHover(dt);
        flappy.updateIdle(dt);
        snake.updateAuto(dt);
        break;

      case 'WIPE_IN':
        stateTimer += dt;
        wipe.progress = Math.min(stateTimer / WIPE_IN_MS, 1);
        wipe.radius = wipe.maxRadius * easeOutCubic(wipe.progress);
        flappy.updateIdle(dt);
        snake.updateAuto(dt);
        if (wipe.progress >= 1) {
          gameState = 'GAME_ACTIVE';
          stateTimer = 0;
          if (activeGame === 'flappy') { flappy.reset(); flappy.bird.vy = JUMP_FORCE; }
          else { snake.reset(); }
        }
        break;

      case 'GAME_ACTIVE':
        if (activeGame === 'flappy') {
          if (flappy.updatePlaying(dt)) { gameState = 'GAME_OVER'; stateTimer = 0; }
        } else {
          if (snake.updatePlaying(dt)) { gameState = 'GAME_OVER'; stateTimer = 0; }
        }
        break;

      case 'GAME_OVER':
        stateTimer += dt;
        if (activeGame === 'flappy') {
          flappy.bird.vy += GRAVITY;
          flappy.bird.y += flappy.bird.vy;
          if (flappy.bird.y > H + RENDERED_SIZE) flappy.bird.y = H + RENDERED_SIZE;
          for (var k = flappy.pipes.length - 1; k >= 0; k--) {
            flappy.pipes[k].x -= PIPE_SPEED * 0.3;
            if (flappy.pipes[k].x < -PIPE_WIDTH) flappy.pipes.splice(k, 1);
          }
        }
        if (stateTimer >= DEAD_PAUSE) {
          gameState = 'WIPE_OUT';
          stateTimer = 0;
          wipe.progress = 0;
          flappy.reset();
          snake.reset();
          restoreHeroContent();
        }
        break;

      case 'WIPE_OUT':
        stateTimer += dt;
        wipe.progress = Math.min(stateTimer / WIPE_OUT_MS, 1);
        wipe.radius = wipe.maxRadius * (1 - easeInCubic(wipe.progress));
        flappy.updateIdle(dt);
        snake.updateAuto(dt);
        if (wipe.progress >= 1) {
          gameState = 'SPLIT_IDLE';
          activeGame = null;
          stateTimer = 0;
          hover.flappyOp = 0.35;
          hover.snakeOp = 0.35;
        }
        break;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    switch (gameState) {
      case 'SPLIT_IDLE':
        drawSplitView();
        break;
      case 'WIPE_IN':
      case 'WIPE_OUT':
        drawSplitView();
        drawWipeCircle();
        break;
      case 'GAME_ACTIVE':
      case 'GAME_OVER':
        drawFullGame();
        break;
    }
    ctx.globalAlpha = 1;
  }

  function drawSplitView() {
    ctx.save(); clipFlappy(); flappy.draw(hover.flappyOp); ctx.restore();
    ctx.save(); clipSnake();  snake.draw(hover.snakeOp);   ctx.restore();
    drawDiagonalLine();
    drawLabels();
    drawSplitPrompt();
  }

  function drawLabels() {
    var fAlpha = hover.side === 'flappy' ? 0.8 : 0.4;
    var sAlpha = hover.side === 'snake'  ? 0.8 : 0.4;
    ctx.save();
    ctx.font = 'bold 18px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.globalAlpha = fAlpha;
    ctx.fillStyle = hover.side === 'flappy' ? C.labelHover : C.label;
    ctx.fillText('FLAPPY', W * 0.3, H * 0.35);
    ctx.globalAlpha = sAlpha;
    ctx.fillStyle = hover.side === 'snake' ? C.labelHover : C.label;
    ctx.fillText('SNAKE', W * 0.7, H * 0.65);
    ctx.restore();
  }

  function drawSplitPrompt() {
    var t = performance.now() * 0.001;
    var pulse = 0.25 + Math.sin(t * 2) * 0.1;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = C.prompt;
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[ click / space: flappy | arrows: snake ]', W / 2, H * 0.92);
    ctx.restore();
  }

  function drawWipeCircle() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(wipe.cx, wipe.cy, Math.max(wipe.radius, 0), 0, Math.PI * 2);
    ctx.clip();
    if (activeGame === 'flappy') flappy.draw(0.7);
    else snake.draw(0.7);
    ctx.restore();
    if (wipe.radius > 2) {
      ctx.save();
      ctx.strokeStyle = C.wipeGlow;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(wipe.cx, wipe.cy, wipe.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFullGame() {
    if (activeGame === 'flappy') { flappy.draw(0.7); flappy.drawScore(0.7); }
    else { snake.draw(0.7); snake.drawScore(0.7); }
  }

  // ── Section 11: Input handlers ──
  function startGame(side, cx, cy) {
    if (gameState !== 'SPLIT_IDLE') return;
    activeGame = side;
    wipe.cx = cx; wipe.cy = cy;
    wipe.maxRadius = calcMaxRadius(cx, cy);
    wipe.radius = 0; wipe.progress = 0;
    gameState = 'WIPE_IN';
    stateTimer = 0;
    minimizeHeroContent();
  }

  function applySnakeKey(code) {
    switch (code) {
      case 'ArrowUp':    case 'KeyW': snake.setDirection(0, -1); break;
      case 'ArrowDown':  case 'KeyS': snake.setDirection(0,  1); break;
      case 'ArrowLeft':  case 'KeyA': snake.setDirection(-1, 0); break;
      case 'ArrowRight': case 'KeyD': snake.setDirection(1,  0); break;
    }
  }

  hero.addEventListener('click', function (e) {
    if (e.target.closest('a, button, .btn')) return;
    var rect = canvas.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (gameState === 'SPLIT_IDLE') { startGame(getSide(px, py), px, py); }
    else if (gameState === 'GAME_ACTIVE' && activeGame === 'flappy') { flappy.jump(); }
  });

  var touchStart = null;
  hero.addEventListener('touchstart', function (e) {
    if (e.target.closest('a, button, .btn')) return;
    var touch = e.touches[0], rect = canvas.getBoundingClientRect();
    touchStart = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    if (gameState === 'SPLIT_IDLE') {
      startGame(getSide(touchStart.x, touchStart.y), touchStart.x, touchStart.y);
      e.preventDefault();
    } else if (gameState === 'GAME_ACTIVE' && activeGame === 'flappy') {
      flappy.jump();
      e.preventDefault();
    }
  }, { passive: false });

  hero.addEventListener('touchend', function (e) {
    if (!touchStart || gameState !== 'GAME_ACTIVE' || activeGame !== 'snake') { touchStart = null; return; }
    var touch = e.changedTouches[0], rect = canvas.getBoundingClientRect();
    var dx = (touch.clientX - rect.left) - touchStart.x;
    var dy = (touch.clientY - rect.top) - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) snake.setDirection(dx > 0 ? 1 : -1, 0);
    else snake.setDirection(0, dy > 0 ? 1 : -1);
  }, { passive: true });

  document.addEventListener('keydown', function (e) {
    if (!visible) return;
    var isArrowOrWASD = e.code === 'ArrowUp' || e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' || e.code === 'ArrowRight' ||
      e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD';

    if (gameState === 'SPLIT_IDLE') {
      if (e.code === 'Space') { e.preventDefault(); startGame('flappy', W / 2, H / 2); }
      else if (isArrowOrWASD) { startGame('snake', W / 2, H / 2); applySnakeKey(e.code); }
      return;
    }
    if (gameState === 'GAME_ACTIVE') {
      if (activeGame === 'flappy' && e.code === 'Space') { e.preventDefault(); flappy.jump(); }
      else if (activeGame === 'snake' && isArrowOrWASD) { e.preventDefault(); applySnakeKey(e.code); }
    }
  });

  // ── Section 12: Observer, loop, start ──
  var observer = new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (visible) startLoop(); else stopLoop();
  }, { threshold: 0.1 });
  observer.observe(hero);

  function loop(ts) {
    if (!visible) { animId = null; return; }
    var dt = lastTime ? ts - lastTime : 16;
    lastTime = ts;
    update(dt);
    draw();
    animId = requestAnimationFrame(loop);
  }
  function startLoop() { if (animId) return; lastTime = 0; animId = requestAnimationFrame(loop); }
  function stopLoop()  { if (animId) { cancelAnimationFrame(animId); animId = null; } }

  startLoop();
})();
