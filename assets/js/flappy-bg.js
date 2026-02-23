(function () {
  'use strict';

  // Respect reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // --- Constants ---
  var GRAVITY = 0.2;
  var JUMP_FORCE = -4.5;
  var PIPE_SPEED = 1.5;
  var PIPE_GAP = 140;
  var PIPE_WIDTH = 40;
  var PIPE_CAP_H = 8;
  var PIPE_INTERVAL = 2200;
  var BIRD_SIZE = 16;
  var PIXEL_SCALE = 2;
  var RENDERED_SIZE = BIRD_SIZE * PIXEL_SCALE;
  var FRAME_MS = 120;
  var DEAD_PAUSE = 800;

  // Mobile adjustments
  var isMobile = window.innerWidth < 480;
  if (isMobile) {
    PIPE_GAP = 160;
    PIPE_SPEED = 1.2;
    PIPE_INTERVAL = 2600;
  }

  // --- Colors (site theme) ---
  var C = {
    body:    '#58a6ff',
    wing:    '#1f6feb',
    eye:     '#e6edf3',
    beak:    '#f0883e',
    pupil:   '#0d1117',
    pipe:    '#30363d',
    pipeBdr: '#8b949e',
    pipeGlow: 'rgba(88,166,255,0.25)',
    score:   '#58a6ff',
    prompt:  '#8b949e'
  };

  // --- Pixel art bird sprites (16x16, 3 frames) ---
  // 0=transparent, 1=body, 2=wing, 3=eye(white), 4=pupil, 5=beak
  var SPRITES = [
    // Frame 0: wings up
    [
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,1,1,1,1,3,3,1,0,0,0,0,0],
      [0,0,2,2,1,1,1,1,3,4,1,1,0,0,0,0],
      [0,0,2,2,2,1,1,1,1,1,1,1,5,5,0,0],
      [0,0,0,2,1,1,1,1,1,1,1,1,5,5,0,0],
      [0,0,0,0,1,1,1,1,1,1,1,5,5,0,0,0],
      [0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0],
      [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    ],
    // Frame 1: wings mid
    [
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,1,1,1,1,3,3,1,0,0,0,0,0],
      [0,0,0,0,1,1,1,1,3,4,1,1,0,0,0,0],
      [0,0,2,2,2,1,1,1,1,1,1,1,5,5,0,0],
      [0,0,2,2,2,1,1,1,1,1,1,1,5,5,0,0],
      [0,0,0,0,1,1,1,1,1,1,1,5,5,0,0,0],
      [0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0],
      [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    ],
    // Frame 2: wings down
    [
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,1,1,1,1,3,3,1,0,0,0,0,0],
      [0,0,0,0,1,1,1,1,3,4,1,1,0,0,0,0],
      [0,0,0,0,1,1,1,1,1,1,1,1,5,5,0,0],
      [0,0,0,2,1,1,1,1,1,1,1,1,5,5,0,0],
      [0,0,2,2,1,1,1,1,1,1,1,5,5,0,0,0],
      [0,0,2,2,2,1,1,1,1,1,1,1,0,0,0,0],
      [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    ]
  ];

  var colorMap = {
    1: C.body,
    2: C.wing,
    3: C.eye,
    4: C.pupil,
    5: C.beak
  };

  // --- DOM Setup ---
  var canvas = document.getElementById('flappy-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var hero = document.getElementById('hero');
  if (!hero) return;

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
  }
  resize();
  window.addEventListener('resize', function () {
    isMobile = window.innerWidth < 480;
    if (isMobile) {
      PIPE_GAP = 160;
      PIPE_SPEED = 1.2;
      PIPE_INTERVAL = 2600;
    } else {
      PIPE_GAP = 140;
      PIPE_SPEED = 1.5;
      PIPE_INTERVAL = 2200;
    }
    resize();
  });

  // --- Game State ---
  var state = 'idle'; // idle | playing | dead
  var bird = { x: 0, y: 0, vy: 0 };
  var pipes = [];
  var score = 0;
  var frameIdx = 0;
  var frameTimer = 0;
  var idleTime = 0;
  var opacity = { game: 0.4, target: 0.4 };
  var lastPipeTime = 0;
  var deadTimer = 0;
  var visible = true;
  var animId = null;
  var lastTime = 0;

  function resetBird() {
    bird.x = W * 0.2;
    bird.y = H * 0.45;
    bird.vy = 0;
  }

  function resetGame() {
    pipes = [];
    score = 0;
    lastPipeTime = 0;
    resetBird();
  }

  resetGame();

  // --- Pre-render sprite frames to offscreen canvases ---
  var spriteCanvases = [];
  function buildSprites() {
    spriteCanvases = [];
    for (var f = 0; f < SPRITES.length; f++) {
      var off = document.createElement('canvas');
      off.width = RENDERED_SIZE;
      off.height = RENDERED_SIZE;
      var oc = off.getContext('2d');
      oc.imageSmoothingEnabled = false;
      var grid = SPRITES[f];
      for (var row = 0; row < BIRD_SIZE; row++) {
        for (var col = 0; col < BIRD_SIZE; col++) {
          var v = grid[row][col];
          if (v === 0) continue;
          oc.fillStyle = colorMap[v];
          oc.fillRect(col * PIXEL_SCALE, row * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE);
        }
      }
      spriteCanvases.push(off);
    }
  }
  buildSprites();

  // --- Pipe helpers ---
  function spawnPipe() {
    var minY = PIPE_GAP * 0.7;
    var maxY = H - PIPE_GAP * 0.7;
    var gapY = minY + Math.random() * (maxY - minY);
    pipes.push({
      x: W + PIPE_WIDTH,
      gapY: gapY,
      scored: false
    });
  }

  // --- Drawing ---
  function drawBird(alpha) {
    var sprite = spriteCanvases[frameIdx];
    if (!sprite) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(bird.x, bird.y);
    // Rotation based on velocity
    var angle;
    if (state === 'idle') {
      angle = 0;
    } else {
      angle = Math.max(-25, Math.min(70, bird.vy * 4)) * Math.PI / 180;
    }
    ctx.rotate(angle);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, -RENDERED_SIZE / 2, -RENDERED_SIZE / 2, RENDERED_SIZE, RENDERED_SIZE);
    ctx.restore();
  }

  function drawPipe(p, alpha) {
    var hw = PIPE_WIDTH / 2;
    ctx.globalAlpha = alpha;

    // Top pipe
    ctx.fillStyle = C.pipe;
    ctx.fillRect(p.x - hw, 0, PIPE_WIDTH, p.gapY - PIPE_GAP / 2);
    // Top cap
    ctx.fillStyle = C.pipeBdr;
    ctx.fillRect(p.x - hw - 3, p.gapY - PIPE_GAP / 2 - PIPE_CAP_H, PIPE_WIDTH + 6, PIPE_CAP_H);
    // Top glow line
    ctx.fillStyle = C.pipeGlow;
    ctx.fillRect(p.x - hw + 4, 0, 3, p.gapY - PIPE_GAP / 2 - PIPE_CAP_H);

    // Bottom pipe
    ctx.fillStyle = C.pipe;
    ctx.fillRect(p.x - hw, p.gapY + PIPE_GAP / 2, PIPE_WIDTH, H - (p.gapY + PIPE_GAP / 2));
    // Bottom cap
    ctx.fillStyle = C.pipeBdr;
    ctx.fillRect(p.x - hw - 3, p.gapY + PIPE_GAP / 2, PIPE_WIDTH + 6, PIPE_CAP_H);
    // Bottom glow line
    ctx.fillStyle = C.pipeGlow;
    ctx.fillRect(p.x - hw + 4, p.gapY + PIPE_GAP / 2 + PIPE_CAP_H, 3, H - (p.gapY + PIPE_GAP / 2 + PIPE_CAP_H));
  }

  function drawScore(alpha) {
    if (state !== 'playing' && state !== 'dead') return;
    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = C.score;
    ctx.font = 'bold 32px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(score, W / 2, 60);
    ctx.restore();
  }

  function drawPrompt() {
    if (state !== 'idle') return;
    var pulse = 0.35 + Math.sin(idleTime * 2) * 0.15;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = C.prompt;
    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[ space / click to play ]', W / 2, H * 0.72);
    ctx.restore();
  }

  // --- Collision ---
  function checkCollision() {
    var r = RENDERED_SIZE * 0.35; // hitbox radius (smaller than visual)
    // Floor / ceiling
    if (bird.y - r < 0 || bird.y + r > H) return true;
    // Pipes
    for (var i = 0; i < pipes.length; i++) {
      var p = pipes[i];
      var hw = PIPE_WIDTH / 2;
      if (bird.x + r > p.x - hw && bird.x - r < p.x + hw) {
        if (bird.y - r < p.gapY - PIPE_GAP / 2 || bird.y + r > p.gapY + PIPE_GAP / 2) {
          return true;
        }
      }
    }
    return false;
  }

  // --- Game Loop ---
  function update(dt) {
    if (dt > 100) dt = 16; // cap large deltas

    // Animate frame index
    frameTimer += dt;
    if (frameTimer >= FRAME_MS) {
      frameTimer -= FRAME_MS;
      frameIdx = (frameIdx + 1) % 3;
    }

    // Opacity smoothing
    var opStep = dt * 0.003;
    if (opacity.game < opacity.target) {
      opacity.game = Math.min(opacity.game + opStep, opacity.target);
    } else if (opacity.game > opacity.target) {
      opacity.game = Math.max(opacity.game - opStep, opacity.target);
    }

    if (state === 'idle') {
      idleTime += dt * 0.001;
      opacity.target = 0.4;
      bird.y = H * 0.45 + Math.sin(idleTime * 1.5) * 15;
      bird.x = W * 0.2;

      // Move existing pipes slowly for ambiance
      for (var i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= PIPE_SPEED * 0.4;
        if (pipes[i].x < -PIPE_WIDTH) pipes.splice(i, 1);
      }
      // Spawn ambient pipes
      lastPipeTime += dt;
      if (lastPipeTime > PIPE_INTERVAL * 1.5) {
        lastPipeTime = 0;
        spawnPipe();
      }

    } else if (state === 'playing') {
      opacity.target = 0.7;
      bird.vy += GRAVITY;
      bird.y += bird.vy;

      // Move pipes
      for (var j = pipes.length - 1; j >= 0; j--) {
        pipes[j].x -= PIPE_SPEED;
        if (pipes[j].x < -PIPE_WIDTH) {
          pipes.splice(j, 1);
          continue;
        }
        // Score
        if (!pipes[j].scored && pipes[j].x < bird.x) {
          pipes[j].scored = true;
          score++;
        }
      }

      // Spawn pipes
      lastPipeTime += dt;
      if (lastPipeTime > PIPE_INTERVAL) {
        lastPipeTime = 0;
        spawnPipe();
      }

      // Collision
      if (checkCollision()) {
        state = 'dead';
        deadTimer = 0;
        opacity.target = 0.4;
      }

    } else if (state === 'dead') {
      bird.vy += GRAVITY;
      bird.y += bird.vy;
      if (bird.y > H + RENDERED_SIZE) bird.y = H + RENDERED_SIZE;

      // Move pipes to a stop gradually
      for (var k = pipes.length - 1; k >= 0; k--) {
        pipes[k].x -= PIPE_SPEED * 0.3;
        if (pipes[k].x < -PIPE_WIDTH) pipes.splice(k, 1);
      }

      deadTimer += dt;
      if (deadTimer >= DEAD_PAUSE) {
        state = 'idle';
        resetGame();
        idleTime = 0;
        showHeroContent();
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var ga = opacity.game;

    // Pipes
    for (var i = 0; i < pipes.length; i++) {
      drawPipe(pipes[i], ga);
    }

    // Bird
    drawBird(state === 'idle' ? ga * 1.1 : ga);

    // Score
    drawScore(ga);

    // Prompt
    drawPrompt();

    ctx.globalAlpha = 1;
  }

  function loop(ts) {
    if (!visible) {
      animId = null;
      return;
    }
    var dt = lastTime ? ts - lastTime : 16;
    lastTime = ts;
    update(dt);
    draw();
    animId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (animId) return;
    lastTime = 0;
    animId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  // --- Visibility via IntersectionObserver ---
  var observer = new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (visible) {
      startLoop();
    } else {
      stopLoop();
    }
  }, { threshold: 0.1 });
  observer.observe(hero);

  // --- Hero content show/hide ---
  var heroContent = hero.querySelector('.hero-content');

  function hideHeroContent() {
    if (heroContent) heroContent.style.opacity = '0';
  }

  function showHeroContent() {
    if (heroContent) heroContent.style.opacity = '';
  }

  // --- Input ---
  function jump() {
    if (state === 'idle') {
      state = 'playing';
      resetGame();
      bird.vy = JUMP_FORCE;
      hideHeroContent();
    } else if (state === 'playing') {
      bird.vy = JUMP_FORCE;
    }
  }

  hero.addEventListener('click', function (e) {
    if (e.target.closest('a, button, .btn')) return;
    jump();
  });

  hero.addEventListener('touchstart', function (e) {
    if (e.target.closest('a, button, .btn')) return;
    jump();
  }, { passive: true });

  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space') return;
    // Only act when hero is visible
    if (!visible) return;
    e.preventDefault();
    jump();
  });

  // Start
  startLoop();
})();
