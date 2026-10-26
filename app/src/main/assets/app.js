// =======================================================
// 4 Games by Alex - Logic & Mobile Interactions
// Fast, lightweight, solid filled chess pieces & castling
// =======================================================

// --- State Management ---
const state = {
  currentPage: 'main',
  soundEnabled: true,
};

// --- Web Audio Synthesizer for Retro & Board Sound FX ---
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freq, type = 'sine', duration = 0.15, gainValue = 0.08) {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function playChessMoveSound(isCapture = false, isCastle = false) {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (isCastle) {
      // Dual-step slide tone for castling
      playTone(320, 'sine', 0.1, 0.12);
      setTimeout(() => playTone(440, 'sine', 0.12, 0.12), 80);
      return;
    }

    if (isCapture) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(550, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(280, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    }
  } catch(e) {}
}

function playFlapSound() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch(e) {}
}

function playBarkSound() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(680, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(340, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch (e) {}
}

function playScoreSound() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987, ctx.currentTime);
    osc.frequency.setValueAtTime(1318, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.28);
  } catch(e) {}
}

function playHitSound() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch(e) {}
}

function playChime(theme) {
  if (!state.soundEnabled) return;
  const notes = {
    main: [261.63, 329.63, 392.00],
    flappy: [523.25, 659.25, 783.99],
    chess: [349.23, 440.00, 523.25],
    pet: [392.00, 493.88, 587.33],
    economy: [196.00, 246.94, 293.66]
  };
  const freqs = notes[theme] || notes.main;
  freqs.forEach((freq, idx) => {
    setTimeout(() => {
      playTone(freq, 'sine', 0.2, 0.05);
    }, idx * 50);
  });
}

// --- Navigation & Page Transitions ---

function switchPage(targetPageId) {
  if (state.currentPage === targetPageId) return;

  // Captured before state.currentPage is reassigned below. Testing it after
  // that assignment is a silent no-op: it has already become the target page,
  // so "are we leaving chess?" never evaluates true and the cleanup never
  // runs.
  const leavingPage = state.currentPage;

  const currentEl = document.getElementById(`page-${state.currentPage}`);
  const targetEl = document.getElementById(`page-${targetPageId}`);
  if (!targetEl) return;

  document.body.className = `theme-${targetPageId}`;

  if (currentEl) currentEl.classList.remove('active');
  targetEl.classList.add('active');
  state.currentPage = targetPageId;

  if (window.location.hash !== `#${targetPageId}`) {
    window.location.hash = targetPageId;
  }

  playChime(targetPageId);

  /* Game 4 is Proto 2 in an iframe: mount it on first entry and re-measure
     when the page comes back. See the comment on mountProtoFrame below. */
  mountProtoFrame(targetPageId);

  if (targetPageId === 'flappy') {
    flappyGame.resume();
    requestAnimationFrame(() => flappyGame.resize());
  } else {
    flappyGame.pause();
  }

  /* The pet's 3D stage is built the first time the pet page opens, then
     stopped whenever it is left. Both calls are no-ops until setupVirtualPet
     has run, and it has by the time any navigation can happen. */
  if (targetPageId === 'pet') {
    if (typeof window.ensurePet3D === 'function') window.ensurePet3D();
    if (typeof window.setPet3DActive === 'function') window.setPet3DActive(true);
  } else if (typeof window.setPet3DActive === 'function') {
    window.setPet3DActive(false);
  }

  /* The 2x Stockfish match keeps two wasm-backed workers alive between
     moves. Leaving the chess page stops the match and frees both, which
     matters on a phone; they reload in about a second when the match restarts. */
  if (leavingPage === 'chess') {
    chessDuel.suspend();
    // The 1x bot's engine lives here rather than on the duel controller, so
    // it is released alongside it.
    chessGame.releaseBotEngine();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =======================================================
// FLAPPY BIRD GAME ENGINE
// =======================================================

const flappyGame = {
  canvas: null,
  ctx: null,
  animId: null,
  isRunning: false,
  gameState: 'idle',
  
  width: 360,
  height: 520,
  groundHeight: 65,
  score: 0,
  highScore: 0,
  
  bird: {
    x: 80,
    y: 220,
    radius: 14,
    velocity: 0,
    gravity: 0.38,
    jumpPower: -6.8,
    rotation: 0,
    wingAngle: 0
  },
  
  pipes: [],
  pipeSpacing: 100,
  pipeTimer: 0,
  pipeWidth: 54,
  pipeGap: 130,
  speed: 2.3,

  // Difficulty profile. Hardcore is faster and tighter but stays playable:
  // the gap is never allowed to fall below a floor the bird can still fit
  // through, and the jump arc is tuned so one flap still clears the gap.
  hardcore: false,
  DIFFICULTY: {
    normal: { speed: 2.3, pipeGap: 130, pipeSpacing: 100, gravity: 0.38, jumpPower: -6.8 },
    // Faster scroll and a narrower window, with a slightly stronger flap so
    // the bird still rises decisively instead of drifting.
    //
    // These numbers were tuned against an in-page autopilot rather than by
    // feel, because "feels too hard" is not a measurement. An earlier attempt
    // used gap 96 at speed 3.9 and was literally unplayable: the opening pipe
    // reached the bird about 40 frames after spawning and at gravity 0.44 the
    // bird could not cross a 96px window in time. It died at score 0 on every
    // run. The gap is now 108 with slightly higher gravity, which gives the
    // bird authority while still demanding quicker, more accurate taps than
    // classic.
    hardcore: { speed: 3.4, pipeGap: 108, pipeSpacing: 82, gravity: 0.41, jumpPower: -7.1 }
  },
  // The narrowest gap the generator may produce, as a fraction of the
  // profile gap. Prevents an unlucky random gap from being impossible.
  MIN_GAP_RATIO: 0.86,

  applyDifficulty() {
    const d = this.hardcore ? this.DIFFICULTY.hardcore : this.DIFFICULTY.normal;
    this.speed = d.speed;
    this.pipeGap = d.pipeGap;
    this.pipeSpacing = d.pipeSpacing;
    this.bird.gravity = d.gravity;
    this.bird.jumpPower = d.jumpPower;
    this.updateDifficultyUI();
  },

  toggleHardcore() {
    this.hardcore = !this.hardcore;
    this.applyDifficulty();
    this.setStatus('');
    // Apply immediately: a mode switch mid-run should not require a restart,
    // but existing pipes keep whatever gap they were spawned with.
    this.reset();
  },

  updateDifficultyUI() {
    const btn = document.getElementById('btn-hardcore');
    if (btn) {
      btn.classList.toggle('active', this.hardcore);
      btn.setAttribute('aria-pressed', this.hardcore ? 'true' : 'false');
    }
    const label = document.getElementById('flappy-mode-label');
    if (label) label.textContent = this.hardcore ? 'HARDCORE' : 'CLASSIC';

    const body = document.getElementById('stage-flappy');
    if (body) body.classList.toggle('hardcore-mode', this.hardcore);
  },

  setStatus(msg) {
    const el = document.getElementById('flappy-status');
    if (el) el.textContent = msg || '';
  },
  
  clouds: [
    { x: 30, y: 50, scale: 1 },
    { x: 190, y: 110, scale: 0.75 },
    { x: 290, y: 70, scale: 0.9 }
  ],
  groundOffset: 0,

  init() {
    this.canvas = document.getElementById('flappy-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    this.highScore = parseInt(localStorage.getItem('flappy_best_score') || '0', 10);
    this.updateScoreUI();

    const handleTap = (e) => {
      if (state.currentPage !== 'flappy') return;
      if (this.gameState === 'idle') {
        this.start();
        this.jump();
      } else if (this.gameState === 'playing') {
        this.jump();
      }
      if (e) e.preventDefault();
    };

    this.canvas.addEventListener('pointerdown', handleTap);
    window.addEventListener('resize', () => this.resize());

    window.addEventListener('keydown', (e) => {
      if (state.currentPage !== 'flappy') return;
      if (e.code === 'Space' || e.key === ' ' || e.code === 'ArrowUp') {
        handleTap(e);
      }
    });

    const btnStart = document.getElementById('btn-start-flappy');
    if (btnStart) btnStart.addEventListener('click', (e) => {
      e.stopPropagation();
      this.start();
      this.jump();
    });

    const btnRestart = document.getElementById('btn-restart-flappy');
    if (btnRestart) btnRestart.addEventListener('click', (e) => {
      e.stopPropagation();
      this.reset();
      this.start();
      this.jump();
    });

    const btnHardcore = document.getElementById('btn-hardcore');
    if (btnHardcore) btnHardcore.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleHardcore();
    });

    this.applyDifficulty();
    this.reset();
    this.resize();
    this.draw();
  },

  resize() {
    if (!this.canvas || !this.ctx) return;

    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const nextHeight = Math.max(1, Math.round(rect.height * this.width / rect.width));
    const heightScale = nextHeight / this.height;
    const dpr = window.devicePixelRatio || 1;

    if (this.canvas.width !== this.width * dpr || this.canvas.height !== nextHeight * dpr) {
      this.canvas.width = this.width * dpr;
      this.canvas.height = nextHeight * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    this.height = nextHeight;
    this.bird.y *= heightScale;
    this.pipes.forEach(pipe => {
      pipe.topHeight *= heightScale;
      pipe.bottomY *= heightScale;
    });
    this.clouds.forEach(cloud => {
      cloud.y *= heightScale;
    });

    if (this.gameState === 'idle') this.bird.y = this.height * 0.42;
    this.draw();
  },

  reset() {
    this.gameState = 'idle';
    this.score = 0;
    this.bird.x = 80;
    this.bird.y = this.height * 0.42;
    this.bird.velocity = 0;
    this.bird.rotation = 0;
    this.pipes = [];
    this.pipeTimer = 0;
    // Re-apply so a mode switch always takes effect on a fresh run.
    this.applyDifficulty();

    this.showOverlay('flappy-start-screen');
    this.hideOverlay('flappy-gameover-screen');
    this.setStatus('');
  },

  start() {
    this.gameState = 'playing';
    this.hideOverlay('flappy-start-screen');
    this.hideOverlay('flappy-gameover-screen');
  },

  jump() {
    if (this.gameState !== 'playing') return;
    this.bird.velocity = this.bird.jumpPower;
    playFlapSound();
  },

  gameOver() {
    this.gameState = 'gameover';
    playHitSound();

    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('flappy_best_score', this.highScore.toString());
    }

    this.updateScoreUI();

    const finalScoreEl = document.getElementById('flappy-final-score');
    const bestScoreEl = document.getElementById('flappy-best-score');
    if (finalScoreEl) finalScoreEl.textContent = this.score;
    if (bestScoreEl) bestScoreEl.textContent = this.highScore;

    this.showOverlay('flappy-gameover-screen');
  },

  updateScoreUI() {
    const sideBest = document.getElementById('sidebar-high-score');
    if (sideBest) sideBest.textContent = this.highScore;
  },

  showOverlay(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  },

  hideOverlay(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  },

  resume() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.loop = this.loop.bind(this);
      this.animId = requestAnimationFrame(this.loop);
    }
  },

  pause() {
    this.isRunning = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  },

  spawnPipe() {
    const minHeight = 50;
    // Clamp the gap so a random draw can never produce an impossible wall.
    // The bird is 28px across, so a gap below that would be unfair.
    const minGap = Math.max(56, Math.round(this.pipeGap * this.MIN_GAP_RATIO));
    const gap = Math.max(minGap, this.pipeGap);
    const maxHeight = this.height - this.groundHeight - gap - minHeight;
    const topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
    const bottomY = topHeight + gap;

    this.pipes.push({
      x: this.width,
      topHeight: topHeight,
      bottomY: bottomY,
      passed: false
    });
  },

  update() {
    this.clouds.forEach(c => {
      c.x -= 0.4 * c.scale;
      if (c.x < -80) c.x = this.width + 40;
    });

    this.groundOffset = (this.groundOffset + this.speed) % 18;

    if (this.gameState === 'idle') {
      this.bird.y = this.height * 0.42 + Math.sin(Date.now() / 200) * 8;
      this.bird.rotation = 0;
      this.bird.wingAngle = Math.sin(Date.now() / 100) * 0.4;
      return;
    }

    if (this.gameState === 'gameover') {
      if (this.bird.y + this.bird.radius < this.height - this.groundHeight) {
        this.bird.velocity += this.bird.gravity * 1.5;
        this.bird.y += this.bird.velocity;
        this.bird.rotation = Math.min(Math.PI / 2, this.bird.rotation + 0.1);
      }
      return;
    }

    this.bird.velocity += this.bird.gravity;
    this.bird.y += this.bird.velocity;
    this.bird.wingAngle = Math.sin(Date.now() / 60) * 0.5;

    if (this.bird.velocity < 0) {
      this.bird.rotation = -0.38;
    } else {
      this.bird.rotation = Math.min(Math.PI / 2.2, this.bird.rotation + 0.05);
    }

    if (this.bird.y + this.bird.radius >= this.height - this.groundHeight) {
      this.bird.y = this.height - this.groundHeight - this.bird.radius;
      this.gameOver();
      return;
    }

    if (this.bird.y - this.bird.radius <= 0) {
      this.bird.y = this.bird.radius;
      this.bird.velocity = 0;
    }

    this.pipeTimer++;
    if (this.pipeTimer >= this.pipeSpacing) {
      this.pipeTimer = 0;
      this.spawnPipe();
    }

    for (let i = this.pipes.length - 1; i >= 0; i--) {
      const p = this.pipes[i];
      p.x -= this.speed;

      if (!p.passed && p.x + this.pipeWidth < this.bird.x) {
        p.passed = true;
        this.score++;
        playScoreSound();
      }

      const birdBox = {
        left: this.bird.x - this.bird.radius + 3,
        right: this.bird.x + this.bird.radius - 3,
        top: this.bird.y - this.bird.radius + 3,
        bottom: this.bird.y + this.bird.radius - 3
      };

      if (birdBox.right > p.x && birdBox.left < p.x + this.pipeWidth) {
        if (birdBox.top < p.topHeight || birdBox.bottom > p.bottomY) {
          this.gameOver();
          return;
        }
      }

      if (p.x + this.pipeWidth < -10) {
        this.pipes.splice(i, 1);
      }
    }
  },

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.height - this.groundHeight);
    skyGrad.addColorStop(0, '#4ec0ca');
    skyGrad.addColorStop(0.7, '#70c5ce');
    skyGrad.addColorStop(1, '#cbf0f3');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    this.clouds.forEach(c => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 20 * c.scale, 0, Math.PI * 2);
      ctx.arc(c.x + 22 * c.scale, c.y - 6 * c.scale, 24 * c.scale, 0, Math.PI * 2);
      ctx.arc(c.x + 46 * c.scale, c.y, 18 * c.scale, 0, Math.PI * 2);
      ctx.fill();
    });

    this.pipes.forEach(p => {
      ctx.fillStyle = '#73bf2e';
      ctx.strokeStyle = '#558022';
      ctx.lineWidth = 3;

      ctx.fillRect(p.x, 0, this.pipeWidth, p.topHeight);
      ctx.strokeRect(p.x, -2, this.pipeWidth, p.topHeight + 2);

      const lipHeight = 20;
      const lipOverlap = 4;
      ctx.fillStyle = '#82cf36';
      ctx.fillRect(p.x - lipOverlap, p.topHeight - lipHeight, this.pipeWidth + lipOverlap * 2, lipHeight);
      ctx.strokeRect(p.x - lipOverlap, p.topHeight - lipHeight, this.pipeWidth + lipOverlap * 2, lipHeight);

      const bottomHeight = this.height - this.groundHeight - p.bottomY;
      ctx.fillStyle = '#73bf2e';
      ctx.fillRect(p.x, p.bottomY, this.pipeWidth, bottomHeight);
      ctx.strokeRect(p.x, p.bottomY, this.pipeWidth, bottomHeight);

      ctx.fillStyle = '#82cf36';
      ctx.fillRect(p.x - lipOverlap, p.bottomY, this.pipeWidth + lipOverlap * 2, lipHeight);
      ctx.strokeRect(p.x - lipOverlap, p.bottomY, this.pipeWidth + lipOverlap * 2, lipHeight);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(p.x + 5, 0, 5, p.topHeight);
      ctx.fillRect(p.x + 5, p.bottomY, 5, bottomHeight);
    });

    const groundY = this.height - this.groundHeight;
    ctx.fillStyle = '#ded895';
    ctx.fillRect(0, groundY, this.width, this.groundHeight);

    ctx.fillStyle = '#73bf2e';
    ctx.fillRect(0, groundY, this.width, 12);
    ctx.fillStyle = '#558022';
    ctx.fillRect(0, groundY + 10, this.width, 3);

    ctx.strokeStyle = '#cbb868';
    ctx.lineWidth = 3;
    for (let x = -20 - this.groundOffset; x < this.width + 20; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, groundY + 14);
      ctx.lineTo(x + 10, this.height);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(this.bird.x, this.bird.y);
    ctx.rotate(this.bird.rotation);

    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(0, 0, this.bird.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(-2, 3, this.bird.radius - 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(6, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(7, -5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f97316';
    ctx.strokeStyle = '#c2410c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(10, -2);
    ctx.lineTo(19, 2);
    ctx.lineTo(10, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.translate(-5, 0);
    ctx.rotate(this.bird.wingAngle);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    if (this.gameState === 'playing') {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 5;
      ctx.font = '26px "Press Start 2P", monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeText(this.score.toString(), this.width / 2, 60);
      ctx.fillText(this.score.toString(), this.width / 2, 60);
    }
  },

  loop() {
    if (!this.isRunning) return;
    this.update();
    this.draw();
    this.animId = requestAnimationFrame(this.loop);
  }
};

// =======================================================
// SOLID FILLED VECTOR CHESS PIECES (Not Hollow!)
// =======================================================

function getPieceSvg(type, color) {
  // Twelve possible outputs. The board asks for one per occupied square on
  // every render, so without this the same multi-line template string is
  // rebuilt and re-parsed hundreds of times a second during a match. The SVG is
  // a pure function of these two values, so caching it is free of any risk
  // beyond the memory for twelve strings.
  const cacheKey = type + color;
  const cached = getPieceSvg.cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const svg = buildPieceSvg(type, color);
  getPieceSvg.cache.set(cacheKey, svg);
  return svg;
}

getPieceSvg.cache = new Map();

function buildPieceSvg(type, color) {
  const isWhite = color === 'w';
  // Professional gradients for 3D look
  const fillMain = isWhite ? 'url(#grad-w)' : 'url(#grad-b)';
  const fillHighlight = isWhite ? '#fff8ee' : '#2d3748';
  const stroke = isWhite ? '#334155' : '#f1f5f9';

  // Gradient definitions for each color
  const gradDefs = `<defs>
    <linearGradient id="grad-w" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="40%" stop-color="#f1f5f9"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
    <linearGradient id="grad-b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="40%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>`;

  if (type === 'p') {
    return `<svg viewBox="0 0 45 45" width="100%" height="100%">${gradDefs}
      <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="${fillMain}" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  if (type === 'n') {
    return `<svg viewBox="0 0 45 45" width="100%" height="100%">${gradDefs}
      <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="${fillMain}" stroke="${stroke}" stroke-width="1.8"/>
      <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="${fillMain}" stroke="${stroke}" stroke-width="1.8"/>
      <circle cx="15.5" cy="14" r="1.5" fill="${stroke}"/>
    </svg>`;
  }
  if (type === 'b') {
    return `<svg viewBox="0 0 45 45" width="100%" height="100%">${gradDefs}\n      <g fill="${fillMain}" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/>
        <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/>
        <circle cx="22.5" cy="8" r="2.5"/>
        <path d="M17.5 26h10M22.5 21v10" stroke="${stroke}"/>
      </g>
    </svg>`;
  }
  if (type === 'r') {
    return `<svg viewBox="0 0 45 45" width="100%" height="100%">${gradDefs}\n      <g fill="${fillMain}" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 39h27v-3H9v3zm3-3v-4h21v4H12zm2.5-4l1.5-16h18l1.5 16H14.5zM11 16h23v-5h-4v2h-4v-2h-6v2h-4v-2h-5v5z"/>
      </g>
    </svg>`;
  }
  if (type === 'q') {
    return `<svg viewBox="0 0 45 45" width="100%" height="100%">${gradDefs}\n      <g fill="${fillMain}" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="6" cy="12" r="2"/>
        <circle cx="14" cy="9" r="2"/>
        <circle cx="22.5" cy="8" r="2"/>
        <circle cx="31" cy="9" r="2"/>
        <circle cx="39" cy="12" r="2"/>
        <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11-7.5-15-7.5 15-7-11 2 12zm0 3c9-1 18-1 27 0v3H9v-3zm0 5h27v4H9v-4z"/>
      </g>
    </svg>`;
  }
  if (type === 'k') {
    return `<svg viewBox="0 0 45 45" width="100%" height="100%">${gradDefs}\n      <g fill="${fillMain}" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22.5 11.63V6M20 8h5"/>
        <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/>
        <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-1 8-6 4-3-2.5-6 1-10 1s-7-3.5-10-1c-5 4-2-5-6-4-3 6 6 10.5 6 10.5v7z"/>
        <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/>
      </g>
    </svg>`;
  }
  return '';
}

// =======================================================
// CHESS GAME UI LAYER
// =======================================================
//
// All rules live in chess-core.js; this object only handles presentation and
// input. The previous version computed its own moves inline and only ever
// produced pseudo-legal ones, which is what allowed illegal moves. It now
// delegates to chessGenerateLegalMoves, so anything highlighted on the board
// is genuinely legal.

const chessGame = {
  state: null,
  selected: null,
  legalForSelected: [],
  capturedWhite: [],   // white pieces that have been captured
  capturedBlack: [],
  moveLog: [],
  pendingPromotion: null, // { r, c } awaiting a promotion choice
  // Three explicit modes rather than one on/off toggle, because "bot off"
  // alone makes 2-player play look like an absence of a feature rather than
  // a real choice, and because the engine-vs-engine match is a third thing
  // entirely rather than a flavour of the second.
  //   'local'    - both sides played by the human on this device
  //   'stockfish'- human plays white, engine plays black
  //   'duel'     - two engines play each other (see chessDuel below)
  //   'quiz'     - two-player board plus the move-counting quiz (chessQuiz)
  mode: 'local',
  botEnabled: false,
  duelActive: false,
  quizActive: false,
  botSide: 'b',
  botThinking: false,
  botDepth: 12,

  init() {
    this.boardEl = document.getElementById('chessboard');
    this.turnPill = document.getElementById('chess-turn-pill');
    this.turnText = document.getElementById('turn-text');
    this.moveCountEl = document.getElementById('chess-move-count');
    this.capturedWhiteEl = document.getElementById('captured-white');
    this.capturedBlackEl = document.getElementById('captured-black');
    this.statusEl = document.getElementById('chess-status');
    this.moveLogEl = document.getElementById('chess-move-log');
    this.botBtn = document.getElementById('btn-stockfish');
    this.promoEl = document.getElementById('promotion-picker');
    this.modeLocalBtn = document.getElementById('chess-mode-local');
    this.modeBotBtn = document.getElementById('chess-mode-stockfish');
    this.modeDuelBtn = document.getElementById('chess-mode-duel');
    this.modeQuizBtn = document.getElementById('chess-mode-quiz');
    this.modeLabel = document.getElementById('chess-mode-label');

    const resetBtn = document.getElementById('btn-reset-chess');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.reset());
    }

    if (this.modeLocalBtn) {
      this.modeLocalBtn.addEventListener('click', () => this.setMode('local'));
    }
    if (this.modeBotBtn) {
      this.modeBotBtn.addEventListener('click', () => this.setMode('stockfish'));
    }
    if (this.modeDuelBtn) {
      this.modeDuelBtn.addEventListener('click', () => this.setMode('duel'));
    }
    if (this.modeQuizBtn) {
      this.modeQuizBtn.addEventListener('click', () => this.setMode('quiz'));
    }

    if (this.botBtn) {
      this.botBtn.addEventListener('click', () => {
        this.setMode(this.mode === 'stockfish' ? 'local' : 'stockfish');
      });
    }

    if (this.promoEl) {
      this.promoEl.addEventListener('click', (e) => {
        const choice = e.target.closest('[data-piece]');
        if (choice) this.completePromotion(choice.dataset.piece);
      });
    }

    // The board is built once and then only ever updated in place.
    //
    // It used to be rebuilt from scratch on every render, and a render happens
    // on every single tap. That meant each tap created 64 elements, attached
    // 64 event listeners, threw all of that away, and then re-parsed up to 32
    // inline SVG strings for the pieces. On a phone that is the difference
    // between a responsive board and one that feels like it is underwater.
    this.buildBoard();

    // The duel controller is initialised *before* this object's first render,
    // not after. reset() calls updateUI() calls updateModeUI() calls
    // chessDuel.syncVisibility(), so anything reached from there runs against
    // a controller whose element map is still being built. Building it first
    // means the ordering stops being load-bearing.
    chessDuel.init();

    // The quiz controller is built here for the same reason: it is reached
    // from updateModeUI() and from reset(), both of which run below.
    chessQuiz.init();

    this.reset();
  },

  // `startState` lets the 2x match hand in a chosen starting position - an
  // engine match set up from an opening, or from a pasted FEN - without this
  // object needing to know anything about where that position came from.
  reset(startState) {
    // The duel controller has to be told first. Resetting writes a record of
    // the match that was in progress, and it takes that record from the move
    // log, the clocks and the final position - all of which this method is
    // about to throw away.
    if (this.duelActive) chessDuel.onBoardReset();

    this.state = startState || chessInitialState();
    this.selected = null;
    this.legalForSelected = [];
    this.capturedWhite = [];
    this.capturedBlack = [];
    this.moveLog = [];
    this.pendingPromotion = null;
    this.botThinking = false;
    this.hidePromotion();
    this.setStatus('');
    this.updateUI();
    this.render();
    if (this.botEnabled && !this.duelActive) this.maybeBotMove();

    // The quiz keeps a score and a list of the positions it has seen, and
    // both belong to the game that is ending, not to the next one. It is
    // told last, so that the position the new game starts from is already on
    // the board when it takes note of it.
    if (this.quizActive) chessQuiz.onBoardReset();
  },

  // --- Rendering --------------------------------------------------------

  // Creates the 64 squares once and hangs a single delegated listener off the
  // board, instead of one listener per square that is thrown away on every
  // render. The squares carry their own coordinates in data attributes, which
  // is all the click handler needs.
  buildBoard() {
    if (!this.boardEl) return;
    this.boardEl.innerHTML = '';
    this.squares = [];
    const frag = document.createDocumentFragment();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        sq.className = 'chess-square ' + (((r + c) % 2 === 0) ? 'sq-w' : 'sq-b');
        sq.dataset.row = String(r);
        sq.dataset.col = String(c);
        this.squares.push(sq);
        frag.appendChild(sq);
      }
    }
    this.boardEl.appendChild(frag);

    this.boardEl.addEventListener('click', (e) => {
      const sq = e.target.closest('.chess-square');
      if (!sq || !this.boardEl.contains(sq)) return;
      this.onSquareClick(parseInt(sq.dataset.row, 10), parseInt(sq.dataset.col, 10));
    });
  },

  // Updates the squares in place. Nothing is created or destroyed here, and a
  // square whose class has not changed is left completely alone - which, after
  // a move, is most of them.
  render() {
    if (!this.squares) {
      if (!this.boardEl) return;
      this.buildBoard();
      if (!this.squares) return;
    }

    // The quiz marks the moves that counted for the side it is showing, so
    // the player can put their finger on the board and count the same moves
    // the quiz counted. The moves that were left out as blunders are marked
    // as well, because a player who counted one of them is exactly the
    // player who needs to be shown it. The two sets are worked out once per
    // render rather than once per square.
    let quizFrom = null;
    let quizTo = null;
    let quizBadFrom = null;
    let quizBadTo = null;
    const revealed = chessQuiz.highlight;
    if (revealed && revealed.moves) {
      quizFrom = new Set();
      quizTo = new Set();
      for (const m of revealed.moves) {
        quizFrom.add(m.from.r * 8 + m.from.c);
        quizTo.add(m.to.r * 8 + m.to.c);
      }
      if (revealed.blunders && revealed.blunders.length) {
        quizBadFrom = new Set();
        quizBadTo = new Set();
        for (const m of revealed.blunders) {
          quizBadFrom.add(m.from.r * 8 + m.from.c);
          quizBadTo.add(m.to.r * 8 + m.to.c);
        }
      }
    }

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = this.squares[r * 8 + c];

        let cls = 'chess-square ' + (((r + c) % 2 === 0) ? 'sq-w' : 'sq-b');
        if (this.selected && this.selected.r === r && this.selected.c === c) cls += ' selected';

        const target = this.legalForSelected.find(m => m.to.r === r && m.to.c === c);
        if (target) {
          if (target.isEnPassant) cls += ' valid-capture';
          else if (target.isCastle) cls += ' valid-castle';
          else if (target.captured) cls += ' valid-capture';
          else cls += ' valid-move';
        }

        if (this.pendingPromotion && this.pendingPromotion.r === r && this.pendingPromotion.c === c) {
          cls += ' valid-capture';
        }

        if (quizFrom) {
          const idx = r * 8 + c;
          if (quizFrom.has(idx)) cls += ' quiz-from';
          if (quizTo.has(idx)) cls += ' quiz-to';
        }
        if (quizBadFrom) {
          const idx = r * 8 + c;
          if (quizBadFrom.has(idx)) cls += ' quiz-bad-from';
          if (quizBadTo.has(idx)) cls += ' quiz-bad-to';
        }

        const piece = this.state.board[r][c];
        if (piece && piece.t === 'k' && this.kingInCheck === piece.c) cls += ' in-check';

        // Assigning className unconditionally would dirty the element and make
        // the browser recalculate style for all 64 squares on every tap.
        if (sq.className !== cls) sq.className = cls;

        // Same reasoning for the piece: only touch the DOM when the piece on
        // this square has actually changed.
        const key = piece ? piece.t + piece.c : '';
        if (sq._pieceKey !== key) {
          sq._pieceKey = key;
          if (piece) {
            let p = sq._pieceEl;
            if (!p || !p.parentNode) {
              p = document.createElement('div');
              sq.appendChild(p);
              sq._pieceEl = p;
            }
            p.className = 'chess-piece piece-' + piece.c;
            p.innerHTML = getPieceSvg(piece.t, piece.c);
          } else if (sq._pieceEl) {
            sq.removeChild(sq._pieceEl);
            sq._pieceEl = null;
          }
        }
      }
    }
  },

  updateUI() {
    const status = chessGameStatus(this.state);
    this.kingInCheck = status === 'check' || status === 'checkmate' ? this.state.turn : null;

    if (this.turnPill) {
      this.turnPill.className = 'chess-turn-pill ' +
        (this.state.turn === 'w' ? 'white-turn' : 'black-turn') +
        (this.kingInCheck ? ' in-check' : '');
    }

    if (this.turnText) {
      if (status === 'checkmate') {
        const winner = this.state.turn === 'w' ? 'Black' : 'White';
        this.turnText.textContent = winner + ' wins by checkmate';
      } else if (status === 'stalemate') {
        this.turnText.textContent = 'Draw by stalemate';
      } else if (this.duelActive) {
        // The duel controller owns this text while a match is selected: it
        // knows whether the match has finished and which engine is thinking.
        this.turnText.textContent = chessDuel.turnText(status);
      } else if (this.botThinking) {
        this.turnText.textContent = 'Stockfish is thinking';
      } else if (this.botEnabled && this.state.turn === 'b') {
        // The engine owns black, so this state is transient.
        this.turnText.textContent = "Black's move";
      } else {
        this.turnText.textContent = this.state.turn === 'w' ? "White's move" : "Black's move";
      }
    }

    if (this.moveCountEl) {
      // A full move is one ply per side, so the number shown is half of the
      // ply count.
      this.moveCountEl.textContent = String(Math.floor(this.moveLog.length / 2));
    }

    // Both trays only change when something is captured, but updateUI() runs many
    // times a second during a match. Rebuilding the same icon list every time
    // is wasted work on a page that is already trying to stay light.
    const blackTray = this.capturedBlack.map(p => p.t + p.c).join(',');
    if (this.capturedBlackEl && blackTray !== this._blackTraySig) {
      this._blackTraySig = blackTray;
      this.capturedBlackEl.innerHTML = this.capturedBlack
        .map(p => '<span class="captured-icon">' + getPieceSvg(p.t, 'w') + '</span>').join('');
    }
    const whiteTray = this.capturedWhite.map(p => p.t + p.c).join(',');
    if (this.capturedWhiteEl && whiteTray !== this._whiteTraySig) {
      this._whiteTraySig = whiteTray;
      this.capturedWhiteEl.innerHTML = this.capturedWhite
        .map(p => '<span class="captured-icon">' + getPieceSvg(p.t, 'b') + '</span>').join('');
    }

    if (this.moveLogEl) {
      // The log only changes when a move is made, but updateUI() runs on every
      // render and during a match that is several times a second. Rebuilding
      // the same rows every time is pure waste.
      const signature = this.moveLog.length + ':' + (this.moveLog[this.moveLog.length - 1] || '');
      if (signature !== this._moveLogSignature) {
        this._moveLogSignature = signature;
        this.moveLogEl.innerHTML = this.moveLog.length
          ? buildMoveRows(this.moveLog)
          : '<div class="movelog-empty">No moves yet</div>';
      }
    }

    this.updateModeUI();
  },

  setStatus(msg) {
    if (this.statusEl) this.statusEl.textContent = msg || '';
  },

  // --- Input ------------------------------------------------------------

  // The colour the human is allowed to move. In two-player mode this is
  // simply whoever's turn it is, so both sides can be played on one device.
  // Against the bot it stays pinned to white, which is the side the engine
  // does not play. In the 2x match there is no human at all, and null is the
  // signal that every square is off limits.
  humanSide() {
    if (this.duelActive) return null;
    return this.botEnabled ? 'w' : this.state.turn;
  },

  onSquareClick(r, c) {
    if (this.botThinking) return;
    // The quiz asks a question after every move, and the board is off limits
    // until that question has been answered. The question is about the
    // position that is on the board at the time, so a move played before the
    // answer would leave the player looking at a position the quiz never
    // asked about.
    if (this.quizActive && chessQuiz.blocksInput) return;
    // An engine-vs-engine match has no human player, so the board becomes a
    // spectator view. This is checked up front rather than left to the turn
    // comparison below, because that comparison would still let a tap that
    // happened to land on the side to move open a promotion picker.
    const side = this.humanSide();
    if (side === null) return;
    // Guard against a stale pending promotion: if the turn moved on while the
    // picker was open, drop it rather than letting it capture the next click.
    if (this.pendingPromotion && this.state.turn !== side) {
      this.pendingPromotion = null;
      this.hidePromotion();
    }
    if (this.state.turn !== side) return;
    if (chessGameStatus(this.state) !== 'ongoing' && chessGameStatus(this.state) !== 'check') return;

    // Choosing the promotion piece takes priority over everything else.
    if (this.pendingPromotion) {
      if (this.pendingPromotion.r === r && this.pendingPromotion.c === c) {
        this.showPromotion(r, c);
      }
      return;
    }

    const piece = this.state.board[r][c];

    if (this.selected) {
      const match = this.legalForSelected.find(m => m.to.r === r && m.to.c === c);
      if (match) {
        if (match.isPromotion) {
          this.pendingPromotion = { r, c };
          this.showPromotion(r, c);
          this.render();
          return;
        }
        this.playMove(match);
        return;
      }
    }

    if (piece && piece.c === side) {
      if (this.selected && this.selected.r === r && this.selected.c === c) {
        this.selected = null;
        this.legalForSelected = [];
      } else {
        this.selected = { r, c };
        this.legalForSelected = chessGenerateLegalMoves(this.state, side)
          .filter(m => m.from.r === r && m.from.c === c);
      }
      this.render();
      return;
    }

    this.selected = null;
    this.legalForSelected = [];
    this.render();
  },

  showPromotion(r, c) {
    if (!this.promoEl) {
      this.pendingPromotion = null;
      this.playMove(this.findPromotionMove(r, c, 'q'));
      return;
    }
    const names = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
    this.promoEl.innerHTML =
      '<div class="promo-title">Promote to</div>' +
      ['q', 'r', 'b', 'n'].map(k =>
        '<button class="promo-choice" data-piece="' + k + '">' +
        '<span class="promo-piece">' + getPieceSvg(k, this.state.turn) + '</span>' +
        '<span class="promo-name">' + names[k] + '</span></button>').join('');
    this.promoEl.classList.add('active');
  },

  hidePromotion() {
    if (this.promoEl) this.promoEl.classList.remove('active');
  },

  findPromotionMove(r, c, promo) {
    // Generate for whichever side is actually moving, so black can promote too
    // in two-player mode.
    const side = this.state.turn;
    return chessGenerateLegalMoves(this.state, side).find(
      m => m.from.r === this.selected.r && m.from.c === this.selected.c &&
           m.to.r === r && m.to.c === c && m.isPromotion && m.promotionPiece === promo
    );
  },

  completePromotion(promo) {
    const target = this.pendingPromotion;
    this.pendingPromotion = null;
    this.hidePromotion();
    if (!target || !this.selected) { this.render(); return; }
    const move = this.findPromotionMove(target.r, target.c, promo);
    if (move) this.playMove(move);
    else { this.selected = null; this.legalForSelected = []; this.render(); }
  },

  // --- Move execution ---------------------------------------------------

  playMove(move) {
    const before = this.state;
    const san = chessMoveToSan(move, before);

    if (move.captured) {
      if (move.captured.c === 'w') this.capturedBlack.push(move.captured);
      else this.capturedWhite.push(move.captured);
    }

    chessApplyMove(this.state, move);

    // Record as white or black depending on who moved.
    if (before.turn === 'w') this.moveLog.push(san);
    else this.moveLog.push(san);

    this.selected = null;
    this.legalForSelected = [];
    this.pendingPromotion = null;
    this.hidePromotion();

    playChessMoveSound(!!move.captured, !!move.isCastle);

    this.updateUI();
    this.render();

    // Exactly one controller owns "what plays next". A human move and the
    // 1x bot both go through maybeBotMove; an engine-vs-engine move goes to
    // the duel controller, which has its own clocks and draw rules; a move
    // in the quiz goes to the quiz controller, which asks its question.
    if (this.duelActive) chessDuel.onMovePlayed();
    else if (this.quizActive) chessQuiz.onMovePlayed();
    else this.maybeBotMove();
  },

  // --- Stockfish bot ----------------------------------------------------

  // Four explicit modes rather than a single on/off toggle. The old button
  // could only express "bot on" or "bot off", which made 2-player play look
  // like an absence of a feature rather than a real choice.
  //   'local'    - both sides played by the human on this device
  //   'stockfish'- human plays white, engine plays black
  //   'duel'     - two engines play each other, see chessDuel
  //   'quiz'     - two-player board plus the move-counting quiz, see chessQuiz
  setMode(mode) {
    const wantBot = mode === 'stockfish';
    const wantDuel = mode === 'duel';
    const wantQuiz = mode === 'quiz';

    if (this.mode === mode && this.botEnabled === wantBot &&
        this.duelActive === wantDuel && this.quizActive === wantQuiz) {
      this.updateModeUI();
      return;
    }

    // Releasing the human's current selection avoids leaving a stale
    // highlight from the other side's turn on the board.
    this.selected = null;
    this.legalForSelected = [];
    this.pendingPromotion = null;
    this.hidePromotion();

    const leavingDuel = this.duelActive && !wantDuel;
    const leavingQuiz = this.quizActive && !wantQuiz;
    if (leavingDuel) chessDuel.stop();
    if (leavingQuiz) chessQuiz.leave();

    this.mode = mode;
    this.botEnabled = wantBot;
    this.duelActive = wantDuel;
    this.quizActive = wantQuiz;

    if (!wantBot) {
      this.botThinking = false;
      this.setStatus('');
      this.updateModeUI();
      this.updateUI();
      this.render();
      // Switching modes always starts from a clean board, otherwise the two
      // sides of an abandoned match stay on the board with no explanation.
      if (wantDuel || leavingDuel || wantQuiz || leavingQuiz) this.reset();
      if (wantDuel) chessDuel.onEntered();
      if (wantQuiz) chessQuiz.enter();
      return;
    }

    if (!chessEngine.isSupported()) {
      this.setStatus('Engine not supported on this device');
      // Fall back to two-player rather than leaving a dead mode selected.
      this.mode = 'local';
      this.botEnabled = false;
      this.updateModeUI();
      return;
    }

    // Deliberately no engine load here. Selecting the tab is not the same as
    // playing a move, and the engine is a wasm module with a worker thread
    // behind it - on a phone, keeping two of those alive for a game that
    // never starts is what makes the whole page feel heavy. maybeBotMove()
    // starts it on the first move, which is the first moment it is genuinely
    // needed.
    this.setStatus('Play a move to start the engine.');
    this.updateModeUI();
  },

  // Hands back the memory and the worker thread the bot engine was holding.
  // Called when a game against it is over, and when the chess page is left.
  releaseBotEngine() {
    if (!chessEngine.worker && !chessEngine.ready) return;
    if (this.botThinking) return;
    chessEngine.dispose();
  },

  updateModeUI() {
    const isBot = this.mode === 'stockfish';
    const isDuel = this.mode === 'duel';
    const isQuiz = this.mode === 'quiz';

    // Segmented control.
    if (this.modeLocalBtn) {
      this.modeLocalBtn.classList.toggle('active', !isBot && !isDuel && !isQuiz);
      this.modeLocalBtn.setAttribute('aria-selected', (!isBot && !isDuel && !isQuiz) ? 'true' : 'false');
    }
    if (this.modeBotBtn) {
      this.modeBotBtn.classList.toggle('active', isBot);
      this.modeBotBtn.setAttribute('aria-selected', isBot ? 'true' : 'false');
    }
    if (this.modeDuelBtn) {
      this.modeDuelBtn.classList.toggle('active', isDuel);
      this.modeDuelBtn.setAttribute('aria-selected', isDuel ? 'true' : 'false');
    }
    if (this.modeQuizBtn) {
      this.modeQuizBtn.classList.toggle('active', isQuiz);
      this.modeQuizBtn.setAttribute('aria-selected', isQuiz ? 'true' : 'false');
    }
    if (this.modeLabel) {
      this.modeLabel.textContent = isDuel ? '2x Stockfish 19'
        : (isBot ? 'Playing Stockfish 19'
        : (isQuiz ? 'Move count quiz' : '2-player'));
    }

    // The match setup panel and the clocks only exist for the 2x mode.
    chessDuel.syncVisibility(isDuel);

    // The quiz panel only exists for the quiz mode.
    chessQuiz.syncVisibility(isQuiz);

    // Keep the legacy toggle button working and in sync, in case it is shown.
    if (this.botBtn) {
      this.botBtn.classList.toggle('active', isBot);
      this.botBtn.disabled = this.botThinking;
      const label = this.botBtn.querySelector('.btn-label');
      if (label) label.textContent = isBot ? 'Stop Bot' : 'Stockfish 19';
    }
  },

  maybeBotMove() {
    if (!this.botEnabled || this.botThinking) return;
    if (this.state.turn !== this.botSide) return;

    const status = chessGameStatus(this.state);
    if (status === 'checkmate' || status === 'stalemate') return;

    // This is the first point at which the engine is actually wanted: the
    // player has moved and somebody has to answer. Loading it here rather than
    // when the mode was selected means an engine is only ever compiled for a
    // game that is about to happen, and the load is already off the critical
    // path of the tap that triggered it.
    if (!chessEngine.ready) {
      if (!chessEngine.loadPromise) {
        this.setStatus('Loading Stockfish 19...');
        chessEngine.load().then(() => {
          if (this.mode !== 'stockfish') return;
          this.setStatus('Stockfish 19 ready');
          this.maybeBotMove();
        }).catch(err => {
          if (this.mode !== 'stockfish') return;
          this.setStatus('Engine failed to load: ' + err.message + '. Playing two-player.');
          this.mode = 'local';
          this.botEnabled = false;
          this.updateModeUI();
          this.updateUI();
          this.render();
        });
      }
      return;
    }

    this.botThinking = true;
    this.updateUI();

    const fen = chessToFen(this.state);

    chessEngine.findBestMove(fen, this.botDepth)
      .then(({ uci }) => {
        const move = chessUciToMoveObj(uci, this.state);
        this.botThinking = false;
        if (!move) {
          this.setStatus('Engine returned an unusable move');
          this.updateUI();
          this.render();
          return;
        }
        this.setStatus('');
        this.playMove(move);
      })
      .catch(err => {
        this.botThinking = false;
        this.setStatus('Engine error: ' + err.message);
        this.updateUI();
        this.render();
      });
  }
};

// =======================================================
// CHESS QUIZ - COUNT THE MOVES, SCORE THE GAME
// =======================================================
//
// A fourth chess mode. After every move the quiz asks how many legal moves
// each side has, and a move that is a blunder does not count: the player is
// counting the moves that are actually playable. Every right answer is worth
// a point, every wrong one costs a point, and the running total is on screen
// the whole way through.
//
// A wrong answer always comes with the right one, and the moves that were
// counted are marked on the board, so the player can go over the position
// and find the move they missed instead of being told only that they were
// wrong.
//
// The board itself is a two-player board: both sides are played by the human
// on the device.
//
// The board is locked while a question is open. The question is about the
// position that is on the board at that moment, and letting the next move be
// played before the answer was given would make it a question about a
// position nobody saw.

const chessQuiz = {
  active: false,
  awaitingAnswer: false,
  finished: false,
  question: null,
  lastFeedback: null,
  outcome: null,
  score: 0,
  right: 0,
  wrong: 0,
  moves: 0,
  // The side whose counted moves are currently marked on the board.
  revealed: null,
  highlight: null,
  positionHistory: [],

  // True while the board must not be touched: a question is open.
  get blocksInput() {
    return this.awaitingAnswer;
  },

  init() {
    this.el = {
      panel: document.getElementById('chess-quiz-panel'),
      score: document.getElementById('quiz-score'),
      tally: document.getElementById('quiz-tally'),
      note: document.getElementById('quiz-note'),
      white: document.getElementById('quiz-white-answer'),
      black: document.getElementById('quiz-black-answer'),
      submit: document.getElementById('btn-quiz-submit'),
      feedback: document.getElementById('quiz-feedback'),
      legend: document.getElementById('quiz-legend'),
      summary: document.getElementById('quiz-summary'),
      summaryText: document.getElementById('quiz-summary-text'),
      again: document.getElementById('btn-quiz-again')
    };

    if (this.el.submit) {
      this.el.submit.addEventListener('click', () => this.submit());
    }

    // Enter answers the question, because on a phone the keyboard has a
    // return key and making the player reach for the button is a chore.
    [this.el.white, this.el.black].forEach(input => {
      if (!input) return;
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        this.submit();
      });
    });

    // The feedback rows carry a button that marks the counted moves on the
    // board, so the handler is delegated: the rows are rebuilt on every
    // answer and a listener per row would have to be re-attached each time.
    if (this.el.feedback) {
      this.el.feedback.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-side]');
        if (!btn) return;
        this.toggleHighlight(btn.dataset.side);
      });
    }

    if (this.el.again) {
      this.el.again.addEventListener('click', () => {
        chessGame.reset();
        this.renderPanel();
      });
    }

    this.renderPanel();
  },

  // --- Mode entry / exit --------------------------------------------------

  syncVisibility(isQuiz) {
    if (this.el && this.el.panel) this.el.panel.classList.toggle('active', isQuiz);
  },

  enter() {
    this.active = true;
    this.renderPanel();
    this.setStatus('Make a move to start the quiz.');
  },

  leave() {
    this.active = false;
    this.awaitingAnswer = false;
    this.question = null;
    this.lastFeedback = null;
    this.positionHistory = [];
    this.clearHighlight();
    this.syncVisibility(false);
    this.renderPanel();
  },

  // Called when the board is reset, from chessGame.reset(). The board is
  // already on its new position by then, so the starting position can go
  // into the history straight away: a position that repeats three times
  // includes the one the game started from.
  onBoardReset() {
    this.awaitingAnswer = false;
    this.question = null;
    this.lastFeedback = null;
    this.finished = false;
    this.outcome = null;
    this.score = 0;
    this.right = 0;
    this.wrong = 0;
    this.moves = 0;
    this.positionHistory = [chessPositionKey(chessGame.state)];
    this.clearHighlight();
    this.renderPanel();
  },

  // --- The question -------------------------------------------------------

  // Called by chessGame.playMove after a move has been made.
  onMovePlayed() {
    if (!this.active) return;

    this.moves++;
    this.positionHistory.push(chessPositionKey(chessGame.state));
    this.question = null;
    this.lastFeedback = null;
    this.awaitingAnswer = false;
    this.finished = false;
    this.outcome = null;
    this.clearHighlight();
    this.buildQuestion();
  },

  // Works out the answer to the question and puts it on screen.
  //
  // This is all arithmetic and move generation, with no engine and no
  // waiting: a position is judged in a few milliseconds, so the question is
  // on screen as soon as the move has been made.
  buildQuestion() {
    const state = chessGame.state;
    this.question = {
      w: chessQuizTally(state, chessQuizLegalMoves(state, 'w'), 'w'),
      b: chessQuizTally(state, chessQuizLegalMoves(state, 'b'), 'b')
    };
    this.awaitingAnswer = true;
    this.clearAnswers();
    this.renderPanel();
    this.setStatus('Count the legal moves for each side, then check your answers.');
  },

  // The boxes are emptied for every new question. Leaving the last answer in
  // place would let a player submit a number they gave for a position that
  // is no longer on the board.
  clearAnswers() {
    [this.el.white, this.el.black].forEach(input => {
      if (input) input.value = '';
    });
  },

  // --- Grading ------------------------------------------------------------

  submit() {
    if (!this.awaitingAnswer || !this.question) return;

    const answers = {
      w: this.readAnswer('w'),
      b: this.readAnswer('b')
    };

    let delta = 0;
    const feedback = [];

    ['w', 'b'].forEach(side => {
      const tally = this.question[side];
      const given = answers[side];

      if (given === null) {
        // No answer is no score. It is not worth a point and it is not worth
        // a penalty either.
        feedback.push({ side, given, correct: tally.count, state: 'skipped' });
        return;
      }

      if (given === tally.count) {
        delta += 1;
        this.right++;
        feedback.push({ side, given, correct: tally.count, state: 'right' });
      } else {
        delta -= 1;
        this.wrong++;
        feedback.push({ side, given, correct: tally.count, state: 'wrong' });
      }
    });

    this.score += delta;
    this.awaitingAnswer = false;
    this.lastFeedback = feedback;

    // A wrong answer is only useful if the player can see what they missed,
    // so the counted moves go on the board straight away.
    const wrongSide = feedback.find(f => f.state === 'wrong');
    if (wrongSide) this.setHighlight(wrongSide.side);

    const outcome = this.adjudicate();
    if (outcome) {
      this.finished = true;
      this.outcome = outcome;
    }

    this.renderPanel();

    const gained = feedback.filter(f => f.state === 'right').length;
    const lost = feedback.filter(f => f.state === 'wrong').length;

    if (this.finished) {
      this.setStatus('Game over. Final score: ' + this.scoreText() + '.');
    } else if (gained && !lost) {
      this.setStatus((gained === 2 ? 'Both right' : 'Right') + '. Score ' + this.scoreText() + '.');
    } else if (lost && !gained) {
      this.setStatus((lost === 2 ? 'Both wrong' : 'Wrong') + '. Score ' + this.scoreText() +
                     '. The counted moves are on the board.');
    } else if (gained && lost) {
      this.setStatus('One right, one wrong. Score ' + this.scoreText() + '.');
    } else {
      this.setStatus('Score ' + this.scoreText() + '.');
    }
  },

  readAnswer(side) {
    const input = side === 'w' ? this.el.white : this.el.black;
    if (!input) return null;
    const raw = String(input.value || '').trim();
    if (raw === '') return null;
    const value = parseInt(raw, 10);
    if (!isFinite(value) || value < 0) return null;
    return value;
  },

  // Every way the game can end, in the order they should be tested. Returns
  // null while the game is still live.
  adjudicate() {
    const status = chessGameStatus(chessGame.state);

    if (status === 'checkmate') {
      const winner = chessGame.state.turn === 'w' ? 'Black' : 'White';
      return { headline: winner + ' wins by checkmate' };
    }
    if (status === 'stalemate') return { headline: 'Draw by stalemate' };
    if (chessGame.state.halfmoveClock >= 100) return { headline: 'Draw by the fifty-move rule' };
    if (chessInsufficientMaterial(chessGame.state)) return { headline: 'Draw by insufficient material' };

    const repeats = chessRepetitionCount(this.positionHistory, chessPositionKey(chessGame.state));
    if (repeats >= 3) return { headline: 'Draw by threefold repetition' };

    return null;
  },

  // --- Board highlights ---------------------------------------------------

  setHighlight(side) {
    if (!this.question || !this.question[side]) {
      this.clearHighlight();
      return;
    }
    const tally = this.question[side];
    this.highlight = { side, moves: tally.counted, blunders: tally.blunders };
    this.revealed = side;
    chessGame.render();
  },

  toggleHighlight(side) {
    if (this.revealed === side) {
      this.clearHighlight();
    } else {
      this.setHighlight(side);
    }
    this.renderPanel();
  },

  clearHighlight() {
    if (!this.highlight) return;
    this.highlight = null;
    this.revealed = null;
    chessGame.render();
  },

  // --- Rendering ----------------------------------------------------------

  // The quiz has no status line of its own: it uses the one under the
  // board, which is where every other chess message goes.
  setStatus(text) {
    if (chessGame && chessGame.setStatus) chessGame.setStatus(text || '');
  },

  scoreText() {
    return (this.score > 0 ? '+' : '') + String(this.score);
  },

  renderPanel() {
    if (!this.el || !this.el.panel) return;

    if (this.el.score) this.el.score.textContent = this.scoreText();
    if (this.el.tally) {
      this.el.tally.textContent = this.right + ' right · ' + this.wrong + ' wrong';
    }

    const ready = this.awaitingAnswer && !!this.question;

    if (this.el.submit) {
      this.el.submit.disabled = !ready;
    }
    [this.el.white, this.el.black].forEach(input => {
      if (!input) return;
      input.disabled = !ready;
    });

    if (this.el.note) this.el.note.textContent = this.noteText();
    this.renderFeedback();

    // The legend only makes sense while the board is showing the counted
    // moves, so it appears and disappears with them.
    if (this.el.legend) {
      this.el.legend.classList.toggle('active', !!this.highlight);
    }

    if (this.el.summary) {
      this.el.summary.classList.toggle('active', !!this.finished);
      if (this.finished && this.el.summaryText) {
        this.el.summaryText.textContent =
          (this.outcome ? this.outcome.headline + '. ' : '') +
          'Final score ' + this.scoreText() + ' · ' +
          this.right + ' right, ' + this.wrong + ' wrong.';
      }
    }
  },

  noteText() {
    if (this.finished) return 'The game is over. The final score is below.';
    if (this.awaitingAnswer) {
      return 'How many legal moves does each side have? A move that leaves a ' +
             'piece hanging does not count. +1 each right, −1 each wrong.';
    }
    if (this.moves === 0) {
      return 'Make a move to start the quiz. After every move you will be asked ' +
             'how many legal moves each side has.';
    }
    return 'Count the legal moves for each side. A move that leaves a piece hanging does not count.';
  },

  renderFeedback() {
    const host = this.el.feedback;
    if (!host) return;

    const feedback = this.lastFeedback;
    if (!feedback || !feedback.length) {
      host.innerHTML = '';
      return;
    }

    host.innerHTML = feedback.map(f => {
      const name = f.side === 'w' ? 'White' : 'Black';
      const tally = this.question ? this.question[f.side] : null;

      let text;
      if (f.state === 'right') text = 'correct — +1';
      else if (f.state === 'skipped') text = 'not answered — no points';
      else text = 'you said ' + f.given + ' — the answer is ' + f.correct + ' (−1)';

      if (tally) {
        const blunders = tally.blunders.length;
        text += ' · ' + tally.total + ' legal, ' + blunders +
                (blunders === 1 ? ' blunder' : ' blunders');
      }

      const shown = this.revealed === f.side;

      return '<div class="quiz-fb quiz-fb-' + f.state + '">' +
               '<span class="quiz-fb-side">' + name + '</span>' +
               '<span class="quiz-fb-text">' + text + '</span>' +
               (tally ? '<button class="quiz-fb-btn" type="button" data-side="' + f.side + '">' +
                        (shown ? 'Hide moves' : 'Show moves') + '</button>' : '') +
             '</div>';
    }).join('');
  }
};

// =======================================================
// 2x STOCKFISH 19 — ENGINE VS ENGINE MATCH
// =======================================================
//
// The third chess mode. Two independent Stockfish workers play each other
// under real clocks with a Fischer increment, which is the setup Cute Chess
// calls an engine match. Neither side is handicapped: a match is a strength
// comparison, not a game for a human to win.
//
// Why a separate controller rather than another flag on chessGame:
//   * Clocks. chessGame has no notion of time, and a flag-on-time loss cannot
//     be expressed through its checkmate/stalemate status at all.
//   * Two engines. chessGame owns exactly one bot on exactly one side. A
//     match needs a mover on both sides.
//   * Draw rules. An engine match at a real time control hits threefold
//     repetition and the fifty-move rule constantly, and those need game
//     history, which chessGame does not keep.
// It still drives the board through chessGame.playMove, so there is one set of
// rendering, sounds and move-log code rather than two.
//
// Everything here is inert until the player picks the mode and presses Start.

// The PGN seven tag roster includes FEN, but FEN is only required - and only
// conventional - when a game does not start from the standard position. A
// match started from a chosen opening does, so SetUp/FEN are emitted only for
// a custom starting position.
const CHESS_STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Match history lives in localStorage, which the WebView has enabled
// (domStorageEnabled). A record is small - a PGN is a kilobyte or two - so the
// cap is generous, but it is a cap: without one a long-running install fills
// the origin's quota and then every write fails, including the settings.
const CHESS_HISTORY_KEY = 'chess_match_history';
const CHESS_HISTORY_LIMIT = 200;

// Opening choices are persisted by ECO plus name rather than by index, so
// reordering or inserting entries in the book cannot silently change which
// opening a saved setup refers to.
function chessOpeningId(entry) {
  return entry.eco + '|' + entry.name;
}

function chessFindOpeningById(id) {
  if (!id) return null;
  for (const entry of CHESS_OPENINGS) {
    if (chessOpeningId(entry) === id) return entry;
  }
  return null;
}

// Escapes text before it goes into innerHTML. The opening names are authored
// constants today, but they contain apostrophes and accents and the habit is
// worth having before someone adds one with an ampersand in it.
function chessEscapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const chessDuel = {
  DEFAULTS: { baseSeconds: 180, incrementSeconds: 2, perMoveSeconds: 2 },
  LIMITS: {
    baseSeconds: { min: 30, max: 3600 },
    incrementSeconds: { min: 0, max: 60 },
    perMoveSeconds: { min: 1, max: 60 }
  },
  // Pause between moves so the game is watchable. Charged to the side that
  // just moved rather than to the side about to move, so the animation cannot
  // flag somebody who was not even thinking.
  MOVE_DELAY_MS: 220,
  // Slack left between the clock and the time handed to the engine. Stockfish
  // returns a few milliseconds after `movetime` elapses, and the round trip
  // through postMessage costs more again; without this margin a side flags
  // itself while the engine was still obeying the limit it was given.
  FLAG_MARGIN_MS: 400,
  // Backstop so a game with a huge time control cannot run forever. Real
  // clocks end games on their own, but "real clocks" assumes the operators
  // chose a sensible control.
  MAX_PLIES: 600,

  visible: false,
  loading: false,
  // running and paused are mutually exclusive and both mean "there is a match
  // in progress". Neither set means idle or finished. Pausing keeps the
  // position, the move list, the repetition history and the clocks, so Resume
  // picks the game up exactly where it stopped.
  running: false,
  paused: false,
  finished: false,
  thinking: false,
  thinkSide: null,
  lastMover: null,
  thinkStart: 0,
  thinkBudget: 0,
  generation: 0,
  // Identifies one attempt at starting a match. Bumped by stop() so a match
  // whose engines are still loading can be called off.
  startToken: 0,
  result: null,
  outcome: null,
  termination: 'normal',
  positionHistory: [],
  matchStart: 0,
  matchEnd: 0,
  // Time spent paused is not match time, so it is accumulated here and taken
  // back out of the recorded duration. Without this a game paused over lunch
  // looks like a three hour thriller.
  pauseStartedAt: 0,
  pausedTotalMs: 0,
  startFen: CHESS_STANDARD_START_FEN,
  clocks: { w: 0, b: 0 },
  baseMs: 0,
  incrementMs: 0,
  perMoveMs: 0,
  tickTimer: null,
  delayTimer: null,

  // --- Starting position -------------------------------------------------
  // 'opening' covers "no opening chosen" as well, because a plain match from
  // the initial position needs no separate state.
  setupSource: 'opening',
  selectedOpeningId: null,
  openingSide: 'both',
  openingQuery: '',
  customFen: CHESS_STANDARD_START_FEN,
  enginesReleased: false,
  // The script for this match. Each kept move remembers the position it
  // expects, so a deviation by the free side ends the script instead of
  // producing an illegal move.
  script: [],
  scriptIndex: 0,

  // --- History ------------------------------------------------------------
  history: [],
  historyOpen: false,
  // Bumped for every recorded match, so ids stay unique even after deletions.
  recordSeq: 0,
  // What the result overlay is currently showing: a live match result or a
  // saved record. The action row differs between the two, so the overlay has
  // to know which it is.
  overlayTarget: null,

  init() {
    this.el = {
      panel: document.getElementById('chess-duel-panel'),
      base: document.getElementById('duel-base'),
      increment: document.getElementById('duel-increment'),
      perMove: document.getElementById('duel-permove'),
      startBtn: document.getElementById('btn-duel-start'),
      saveBtn: document.getElementById('btn-duel-save'),
      historyBtn: document.getElementById('btn-duel-history'),
      srcOpeningBtn: document.getElementById('duel-src-opening'),
      srcFenBtn: document.getElementById('duel-src-fen'),
      openingBox: document.getElementById('duel-opening-box'),
      fenBox: document.getElementById('duel-fen-box'),
      openingSearch: document.getElementById('duel-opening-search'),
      openingList: document.getElementById('duel-opening-list'),
      openingChip: document.getElementById('duel-opening-chip'),
      openingNote: document.getElementById('duel-opening-note'),
      sideSwitch: document.getElementById('duel-side-switch'),
      fen: document.getElementById('duel-fen'),
      fenNote: document.getElementById('duel-fen-note'),
      historyPanel: document.getElementById('chess-history-panel'),
      historyList: document.getElementById('history-list'),
      historyCount: document.getElementById('history-count'),
      historyClearBtn: document.getElementById('btn-history-clear'),
      historyCloseBtn: document.getElementById('btn-history-close'),
      clocksRow: document.getElementById('chess-clocks'),
      clockW: document.getElementById('chess-clock-white'),
      clockB: document.getElementById('chess-clock-black'),
      infoW: document.getElementById('duel-info-white'),
      infoB: document.getElementById('duel-info-black'),
      overlay: document.getElementById('chess-result-overlay'),
      badge: document.getElementById('chess-result-badge'),
      title: document.getElementById('chess-result-title'),
      sub: document.getElementById('chess-result-sub'),
      stats: document.getElementById('chess-result-stats'),
      moves: document.getElementById('chess-result-moves'),
      pgn: document.getElementById('chess-result-pgn'),
      note: document.getElementById('chess-result-note'),
      btnSave: document.getElementById('btn-result-save'),
      btnCopy: document.getElementById('btn-result-copy'),
      btnRematch: document.getElementById('btn-result-rematch'),
      btnDelete: document.getElementById('btn-result-delete'),
      btnClose: document.getElementById('btn-result-close')
    };

    this.restoreSettings();

    // Reading the inputs is the only place time control is interpreted, so a
    // value typed into the panel cannot disagree with the match it starts.
    const onConfigChange = () => {
      this.readSettings();
      this.saveSettings();
      if (!this.running) this.resetMatchState();
      this.renderAll();
    };
    [this.el.base, this.el.increment, this.el.perMove].forEach(input => {
      if (!input) return;
      // 'input' alone would recompute on every keystroke, which turns a
      // half-typed "15" into 1 and then 15 and scrubs the clocks while the
      // field is still being edited.
      input.addEventListener('change', onConfigChange);
      input.addEventListener('blur', onConfigChange);
    });

    if (this.el.startBtn) {
      this.el.startBtn.addEventListener('click', () => {
        // One button for four states. Cancel has to come first: a match can
        // only be paused once it is actually running, and only started once
        // it is neither loading nor paused.
        if (this.loading) this.stop();
        else if (this.paused) this.resume();
        else if (this.running) this.pause();
        else this.start();
      });
    }
    if (this.el.saveBtn) this.el.saveBtn.addEventListener('click', () => this.savePgn());
    if (this.el.btnSave) this.el.btnSave.addEventListener('click', () => this.saveFromOverlay());
    if (this.el.btnCopy) this.el.btnCopy.addEventListener('click', () => this.copyFromOverlay());
    if (this.el.btnRematch) {
      this.el.btnRematch.addEventListener('click', () => {
        this.hideResultOverlay();
        this.start();
      });
    }
    if (this.el.btnDelete) this.el.btnDelete.addEventListener('click', () => this.deleteFromOverlay());
    if (this.el.btnClose) this.el.btnClose.addEventListener('click', () => this.hideResultOverlay());

    // --- Starting position controls ---------------------------------------
    if (this.el.srcOpeningBtn) {
      this.el.srcOpeningBtn.addEventListener('click', () => this.setSetupSource('opening'));
    }
    if (this.el.srcFenBtn) {
      this.el.srcFenBtn.addEventListener('click', () => this.setSetupSource('fen'));
    }
    if (this.el.openingSearch) {
      // No debounce. The book is a few dozen entries and the filter is a
      // precomputed substring test, so a keystroke is cheaper than the
      // bookkeeping a debounce would need. renderOpeningList() skips the
      // rebuild when the query has not actually changed.
      this.el.openingSearch.addEventListener('input', () => {
        this.openingQuery = this.el.openingSearch.value;
        this.renderOpeningList();
        this.saveSettings();
      });
    }
    if (this.el.openingList) {
      // Delegated, because the list is re-rendered on every keystroke and a
      // listener per row would be re-attached constantly.
      this.el.openingList.addEventListener('click', (e) => {
        const row = e.target.closest('.duel-open');
        if (!row) return;
        this.selectOpeningByIndex(parseInt(row.dataset.index, 10));
      });
    }
    if (this.el.sideSwitch) {
      this.el.sideSwitch.addEventListener('click', (e) => {
        const opt = e.target.closest('.duel-side-opt');
        if (!opt) return;
        this.setOpeningSide(opt.dataset.side);
      });
    }
    if (this.el.fen) {
      // 'input' keeps the validation live; it is one FEN parse per keystroke.
      this.el.fen.addEventListener('input', () => {
        this.customFen = this.el.fen.value;
        this.renderFenNote();
        this.saveSettings();
      });
    }

    // --- History ------------------------------------------------------------
    if (this.el.historyBtn) {
      this.el.historyBtn.addEventListener('click', () => this.toggleHistory());
    }
    if (this.el.historyCloseBtn) {
      this.el.historyCloseBtn.addEventListener('click', () => this.toggleHistory(false));
    }
    if (this.el.historyClearBtn) {
      this.el.historyClearBtn.addEventListener('click', () => this.clearHistory());
    }
    if (this.el.historyList) {
      this.el.historyList.addEventListener('click', (e) => {
        const row = e.target.closest('.history-entry');
        if (!row) return;
        this.openHistoryEntry(row.dataset.id);
      });
    }

    // Depth and score from each engine, so the panel shows which side is
    // thinking and how deep it has got. Registered once; init() is called a
    // single time, from chessGame.init().
    chessEngineWhite.onLine(evt => this.onEngineLine('w', evt));
    chessEngineBlack.onLine(evt => this.onEngineLine('b', evt));

    this.readSettings();
    this.loadHistory();
    this.resetMatchState();
    this.renderSetup();
    this.renderHistory();
    this.renderAll();
  },

  // --- Starting position --------------------------------------------------

  setSetupSource(source) {
    if (this.running) return;
    this.setupSource = source;
    this.saveSettings();
    this.renderSetup();
    this.resetMatchState();
    this.renderAll();
  },

  selectedOpening() {
    return chessFindOpeningById(this.selectedOpeningId);
  },

  selectOpeningByIndex(index) {
    if (this.running) return;
    const entry = CHESS_OPENINGS[index];
    if (!entry) return;
    this.selectedOpeningId = chessOpeningId(entry);
    this.saveSettings();
    // The list is not rebuilt here. It holds a few dozen rows and only the
    // highlight can have changed; re-rendering all of them on every tap is the
    // single most expensive thing this panel could do.
    this.markSelectedOpening();
    this.renderOpeningNote();
    this.resetMatchState();
    this.renderAll();
  },

  setOpeningSide(side) {
    if (side !== 'w' && side !== 'b' && side !== 'both') return;
    if (this.running) return;
    this.openingSide = side;
    this.saveSettings();
    this.renderSetupChrome();
    this.renderOpeningNote();
    this.resetMatchState();
    this.renderAll();
  },

  // The position the match actually begins from.
  startState() {
    if (this.setupSource === 'fen') {
      const parsed = chessFromFen(this.customFen);
      if (parsed) return parsed;
    }
    return chessInitialState();
  },

  // Checks the FEN before a match is allowed to start on it. A position that
  // is already over would produce a game that ends before the engines have
  // even opened, which reads as a bug rather than as a rejection.
  validateFen() {
    const raw = String(this.customFen || '').trim();
    if (!raw) return { ok: false, message: 'Enter a FEN, or switch back to Opening.' };
    const state = chessFromFen(raw);
    if (!state) {
      return { ok: false, message: 'That FEN cannot be read. It needs board, side to move, castling, en passant and move numbers.' };
    }
    const status = chessGameStatus(state);
    if (status !== 'ongoing' && status !== 'check') {
      return { ok: false, message: 'That position is already ' + status + ', so a match cannot start there.' };
    }
    const who = state.turn === 'w' ? 'White' : 'Black';
    if (chessInsufficientMaterial(state)) {
      return { ok: true, state, warning: 'Valid, but neither side has mating material, so the match will be drawn at once.' };
    }
    return { ok: true, state, message: 'Valid — ' + who + ' to move' };
  },

  // Replays the chosen opening from the initial position and returns the moves
  // this side is meant to play. Pure: it builds its own position and touches
  // nothing on this controller, so the panel can ask what the line would do
  // without disturbing a match already in progress.
  computeScript(wants, opening) {
    const script = [];
    if (!opening) return script;

    let state = chessInitialState();
    for (let i = 0; i < opening.moves.length; i++) {
      const san = opening.moves[i];
      const move = chessSanToMove(state, san);
      // The book is checked by tools/check-openings.js, so this cannot happen
      // with the shipped data. If an entry ever does go bad, the line is
      // truncated here rather than producing an illegal move mid-match.
      if (!move) break;

      if (wants === 'both' || state.turn === wants) {
        const number = Math.floor(i / 2) + 1;
        script.push({
          fen: chessToFen(state),
          uci: chessMoveToUci(move),
          label: number + (state.turn === 'w' ? '.' : '...') + san,
          side: state.turn
        });
      }
      chessApplyMove(state, move);
    }
    return script;
  },

  // Installs the script for this match.
  //
  // Each kept move remembers the position it expects to be played from. That
  // is what makes the line safe: if the free side deviates from the book, the
  // position no longer matches, the script is abandoned, and the engines carry
  // on from wherever the game actually is. Checking legality alone would not
  // do it - most book moves stay legal after a deviation, and quietly forcing
  // them through would fight the engine that just made a good move.
  buildScript() {
    this.script = this.setupSource === 'opening'
      ? this.computeScript(this.openingSide, this.selectedOpening())
      : [];
    this.scriptIndex = 0;
  },

  // Returns the next book move when it is this side's turn and the position is
  // still the one the line expected, otherwise null.
  takeScriptedMove(side) {
    if (this.scriptIndex >= this.script.length) return null;
    const entry = this.script[this.scriptIndex];
    if (entry.side !== side) return null;

    if (chessToFen(chessGame.state) !== entry.fen) {
      this.scriptIndex = this.script.length;
      return null;
    }
    const move = chessUciToMoveObj(entry.uci, chessGame.state);
    if (!move) {
      this.scriptIndex = this.script.length;
      return null;
    }
    this.scriptIndex++;
    return { move, entry };
  },

  openingSideLabel() {
    if (this.setupSource === 'fen') return 'custom position';
    const opening = this.selectedOpening();
    if (!opening) return '';
    if (this.openingSide === 'both') return opening.name;
    return opening.name + ' (' + (this.openingSide === 'w' ? 'White' : 'Black') + ')';
  },

  renderSetup() {
    const el = this.el;
    if (!el) return;

    this.renderSetupChrome();

    if (this.setupSource === 'opening') {
      if (el.openingSearch) el.openingSearch.value = this.openingQuery;
      this.renderOpeningList();
      this.renderOpeningNote();
    } else {
      this.renderFenNote();
    }
  },

  // The source tabs, which box is showing, and the side-of-opening buttons.
  // Everything here is a class toggle on a handful of elements, so it is cheap
  // enough to run on any setup change.
  renderSetupChrome() {
    const el = this.el;
    if (!el) return;

    const isOpening = this.setupSource === 'opening';
    if (el.srcOpeningBtn) {
      el.srcOpeningBtn.classList.toggle('active', isOpening);
      el.srcOpeningBtn.setAttribute('aria-selected', isOpening ? 'true' : 'false');
    }
    if (el.srcFenBtn) {
      el.srcFenBtn.classList.toggle('active', !isOpening);
      el.srcFenBtn.setAttribute('aria-selected', !isOpening ? 'true' : 'false');
    }
    if (el.openingBox) el.openingBox.classList.toggle('active', isOpening);
    if (el.fenBox) el.fenBox.classList.toggle('active', !isOpening);

    if (!el.sideSwitch) return;
    const wants = this.openingSide;
    for (const opt of el.sideSwitch.querySelectorAll('.duel-side-opt')) {
      const active = opt.dataset.side === wants;
      opt.classList.toggle('active', active);
      opt.setAttribute('aria-checked', active ? 'true' : 'false');
    }
  },

  renderOpeningList(force) {
    const el = this.el;
    if (!el || !el.openingList) return;
    // Only rebuild when the query actually changed. This runs from renderSetup()
    // on several paths and the list is dozens of rows.
    if (!force && el.openingList.dataset.query === this.openingQuery) {
      this.markSelectedOpening();
      return;
    }
    el.openingList.dataset.query = this.openingQuery;

    const hits = chessSearchOpenings(this.openingQuery);
    if (!hits.length) {
      el.openingList.innerHTML = '<div class="duel-open-empty">No opening matches that. Try a name, an ECO code, or some moves.</div>';
      return;
    }

    const selectedId = this.selectedOpeningId;
    el.openingList.innerHTML = hits.map(hit => {
      const entry = hit.entry;
      const isSelected = chessOpeningId(entry) === selectedId;
      return '<button class="duel-open' + (isSelected ? ' selected' : '') +
        '" data-index="' + hit.index + '" role="option" aria-selected="' + (isSelected ? 'true' : 'false') +
        '" type="button">' +
        '<span class="duel-open-eco">' + chessEscapeHtml(entry.eco) + '</span>' +
        '<span class="duel-open-name">' + chessEscapeHtml(entry.name) + '</span>' +
        '<span class="duel-open-moves">' + chessEscapeHtml(entry.moves.join(' ')) + '</span>' +
        '</button>';
    }).join('');
  },

  // Moves the highlight without touching the rest of the list. Only the row that
  // was highlighted and the row that now is can have changed, so at most two
  // elements are written to.
  markSelectedOpening() {
    const el = this.el;
    if (!el || !el.openingList) return;

    if (this._selectedRow) {
      this._selectedRow.classList.remove('selected');
      this._selectedRow.setAttribute('aria-selected', 'false');
      this._selectedRow = null;
    }
    const selectedId = this.selectedOpeningId;
    if (!selectedId) return;

    const rows = el.openingList.children;
    for (let i = 0; i < rows.length; i++) {
      const entry = CHESS_OPENINGS[parseInt(rows[i].dataset.index, 10)];
      if (entry && chessOpeningId(entry) === selectedId) {
        rows[i].classList.add('selected');
        rows[i].setAttribute('aria-selected', 'true');
        this._selectedRow = rows[i];
        return;
      }
    }
  },

  renderOpeningNote() {
    const el = this.el;
    if (!el || !el.openingChip) return;

    const opening = this.selectedOpening();
    if (!opening) {
      el.openingChip.textContent = 'Standard game — no opening';
      if (el.openingNote) {
        el.openingNote.textContent = 'Pick an opening to have the engines start from a book line.';
        el.openingNote.className = 'duel-note';
      }
      return;
    }

    const sideWord = this.openingSide === 'both' ? 'Both sides'
      : (this.openingSide === 'w' ? 'White' : 'Black');
    el.openingChip.textContent = opening.eco + ' · ' + opening.name + ' · ' + opening.moves.length + ' plies';

    if (!el.openingNote) return;
    // Read from a freshly computed script rather than from this.script, which
    // belongs to a match that may already be in progress.
    const preview = this.computeScript(this.openingSide, opening);
    const sideText = this.openingSide === 'both' ? '' : this.openingSide;
    const playsSomething = !sideText || preview.some(entry => entry.side === sideText);

    if (!playsSomething) {
      el.openingNote.textContent = 'This opening has no ' + sideWord.toLowerCase() +
        ' moves, so nothing will be played from the book. The match starts from the initial position.';
      el.openingNote.className = 'duel-note is-error';
    } else if (this.openingSide === 'both') {
      el.openingNote.textContent = sideWord + ' play the book line until the position changes.';
      el.openingNote.className = 'duel-note';
    } else {
      el.openingNote.textContent = sideWord + ' plays the book moves; the other side answers freely.';
      el.openingNote.className = 'duel-note';
    }
  },

  renderFenNote() {
    const el = this.el;
    if (!el || !el.fenNote) return;
    const check = this.validateFen();
    this.fenCheck = check;
    if (!check.ok) {
      el.fenNote.textContent = check.message;
      el.fenNote.className = 'duel-note is-error';
    } else if (check.warning) {
      el.fenNote.textContent = check.warning;
      el.fenNote.className = 'duel-note is-error';
    } else {
      el.fenNote.textContent = check.message;
      el.fenNote.className = 'duel-note is-ok';
    }
  },

  // --- Configuration ----------------------------------------------------

  // Clamp a numeric input into its permitted range. Routing every value
  // through one helper means an empty field, a stray letter or an absurd
  // number can never produce a NaN clock or a six-hour match.
  clampValue(value, limits, fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(limits.min, Math.min(limits.max, n));
  },

  readSettings() {
    const d = this.DEFAULTS;
    const L = this.LIMITS;
    this.baseMs = 1000 * this.clampValue(this.el.base && this.el.base.value, L.baseSeconds, d.baseSeconds);
    this.incrementMs = 1000 * this.clampValue(this.el.increment && this.el.increment.value, L.incrementSeconds, d.incrementSeconds);
    this.perMoveMs = 1000 * this.clampValue(this.el.perMove && this.el.perMove.value, L.perMoveSeconds, d.perMoveSeconds);
    // Write the clamped value back, so the field shows what will actually be
    // used rather than what was typed.
    if (this.el.base) this.el.base.value = String(this.baseMs / 1000);
    if (this.el.increment) this.el.increment.value = String(this.incrementMs / 1000);
    if (this.el.perMove) this.el.perMove.value = String(this.perMoveMs / 1000);
  },

  restoreSettings() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('chess_duel_time_control') || 'null'); }
    catch (e) { saved = null; }
    if (!saved || typeof saved !== 'object') {
      // No saved setup: still put the default FEN in the box so the field is
      // never mysteriously empty.
      if (this.el && this.el.fen) this.el.fen.value = this.customFen;
      return;
    }
    if (this.el.base && Number.isFinite(Number(saved.baseSeconds))) this.el.base.value = String(saved.baseSeconds);
    if (this.el.increment && Number.isFinite(Number(saved.incrementSeconds))) this.el.increment.value = String(saved.incrementSeconds);
    if (this.el.perMove && Number.isFinite(Number(saved.perMoveSeconds))) this.el.perMove.value = String(saved.perMoveSeconds);
    if (saved.source === 'fen' || saved.source === 'opening') this.setupSource = saved.source;
    if (saved.openingSide === 'w' || saved.openingSide === 'b' || saved.openingSide === 'both') {
      this.openingSide = saved.openingSide;
    }
    if (typeof saved.openingId === 'string' && chessFindOpeningById(saved.openingId)) {
      this.selectedOpeningId = saved.openingId;
    }
    if (typeof saved.openingQuery === 'string') this.openingQuery = saved.openingQuery;
    if (typeof saved.fen === 'string' && saved.fen.trim()) {
      this.customFen = saved.fen;
      if (this.el.fen) this.el.fen.value = saved.fen;
    }
  },

  saveSettings() {
    try {
      localStorage.setItem('chess_duel_time_control', JSON.stringify({
        baseSeconds: this.baseMs / 1000,
        incrementSeconds: this.incrementMs / 1000,
        perMoveSeconds: this.perMoveMs / 1000,
        source: this.setupSource,
        openingId: this.selectedOpeningId,
        openingSide: this.openingSide,
        openingQuery: this.openingQuery,
        fen: this.customFen
      }));
    } catch (e) { /* storage disabled: the match still works, it just forgets */ }
  },

  timeControlTag() {
    return Math.round(this.baseMs / 1000) + '+' + Math.round(this.incrementMs / 1000);
  },

  // --- Mode entry / exit ------------------------------------------------

  syncVisibility(isDuel) {
    this.visible = isDuel;
    if (this.el && this.el.panel) this.el.panel.classList.toggle('active', isDuel);
    if (this.el && this.el.clocksRow) this.el.clocksRow.classList.toggle('active', isDuel);
    if (!isDuel) {
      // The history panel lives outside the match panel, so it has to be
      // closed explicitly or it stays on screen in the other two modes.
      this.toggleHistory(false);
      this.hideResultOverlay();
      this.stop();
    }
    this.renderAll();
  },

  onEntered() {
    this.hideResultOverlay();
    this.resetMatchState();
    this.renderSetup();
    this.renderAll();
    this.setStatus('Set the time control and starting position, then press Start.');
    chessGame.updateUI();
  },

  // The Reset button on the chess page, and every internal board reset.
  onBoardReset() {
    this.stop();
    this.resetMatchState();
    this.hideResultOverlay();
    this.renderAll();
  },

  // Called when the player navigates away from the chess page entirely.
  // Each worker holds its own wasm module, and three of those is a lot of
  // memory to keep around for a page nobody is looking at. The match engines
  // are released by stop() already, but the 1x bot's engine is not, so it has
  // to be released here or it would outlive the session.
  suspend() {
    this.stop();
    this.releaseMatchEngines();
    this.hideResultOverlay();
    chessEngineWhite.dispose();
    chessEngineBlack.dispose();
    chessEngine.dispose();
    this.setStatus('');
  },

  // --- Match lifecycle --------------------------------------------------

  resetMatchState() {
    this.result = null;
    this.outcome = null;
    this.termination = 'normal';
    this.paused = false;
    this.pauseStartedAt = 0;
    this.pausedTotalMs = 0;
    this.clocks = { w: this.baseMs, b: this.baseMs };
    this.positionHistory = [];
    this.matchStart = 0;
    this.matchEnd = 0;
  },

  async start() {
    if (this.loading || this.running || this.paused) return;

    if (!chessEngineWhite.isSupported()) {
      this.setStatus('WebAssembly or Web Workers are unavailable, so no engine can start.', true);
      return;
    }

    this.readSettings();

    // Refuse a starting position that cannot host a match, before spending a
    // second starting the engines.
    if (this.setupSource === 'fen') {
      this.renderFenNote();
      const check = this.validateFen();
      if (!check.ok) {
        this.setStatus(check.message, true);
        return;
      }
    }

    this.saveSettings();
    this.hideResultOverlay();

    // Cleared before the engines are awaited, not after. Loading takes about
    // a second, and leaving `finished` set for that second leaves the turn
    // pill and the Start button describing the previous game while the new
    // one is already being set up.
    this.finished = false;
    this.result = null;
    this.outcome = null;
    this.thinking = false;
    this.thinkSide = null;
    this.paused = false;
    this.clearTimers();

    this.loading = true;
    this.setStatus('Starting both engines...');
    this.renderAll();
    chessGame.updateUI();

    // Identifies this particular start attempt. The engines take about a
    // second to come up and that wait has to be cancellable, so the token is
    // checked again below.
    const token = ++this.startToken;

    try {
      // Both workers have to be up before the first move, otherwise white
      // would sit on the board waiting while black's module still compiles.
      await Promise.all([
        chessEngineWhite.load().then(() => chessEngineWhite.setFullStrength()),
        chessEngineBlack.load().then(() => chessEngineBlack.setFullStrength())
      ]);
    } catch (err) {
      if (token !== this.startToken) return;
      this.loading = false;
      this.setStatus('Engine failed to load: ' + err.message, true);
      this.renderAll();
      return;
    }

    // Cancelled while the engines were loading. Without this the match would
    // sail on and start playing after the player already pressed Cancel.
    if (token !== this.startToken) return;

    // A previous match released its engines when it ended; this match needs
    // them back, and load() above has just started them.
    this.claimMatchEngines();

    const startState = this.startState();
    this.startFen = chessToFen(startState);
    this.buildScript();

    // chessGame.reset() calls back into onBoardReset(), which clears all of
    // the match state below, so those assignments come afterwards rather than
    // before.
    chessGame.reset(startState);

    this.loading = false;
    this.running = true;
    this.finished = false;
    this.thinking = false;
    this.termination = 'normal';
    this.clocks = { w: this.baseMs, b: this.baseMs };
    this.positionHistory = [chessPositionKey(chessGame.state)];
    this.matchStart = Date.now();

    const setup = this.matchSetupSummary();
    this.setStatus(setup);
    this.renderAll();
    chessGame.updateUI();
    this.beginTurn();
  },

  // One line describing what this match is, shown in the status line while it
  // runs and stored with the record afterwards.
  matchSetupSummary() {
    if (this.setupSource === 'fen') return 'Match running: ' + this.timeControlTag() + ' from a custom position';
    const opening = this.selectedOpening();
    if (!opening) return 'Match running: ' + this.timeControlTag();
    const who = this.openingSide === 'both' ? 'both sides'
      : (this.openingSide === 'w' ? 'White' : 'Black');
    return 'Match running: ' + this.timeControlTag() + ' · ' + opening.eco + ' ' + opening.name + ' (' + who + ')';
  },

  // Freezes the match without ending it. The board, the move list, the
  // repetition history and both clocks are all left exactly as they are, so
  // Resume picks up the same game on the same move.
  pause() {
    if (!this.running || this.paused) return;

    const side = this.thinking ? this.thinkSide : null;

    // Bank the thinking side's clock before stopping the clock that displays
    // it. The running clock is derived from thinkStart rather than decremented
    // each tick, so without this the time already spent would come back.
    // Nothing is adjudicated here: a side that happened to hit zero at the
    // instant of the pause is flagged by beginTurn on resume, through the
    // same check a real overrun goes through.
    if (side) {
      this.clocks[side] = Math.max(0, this.thinkBudget - (Date.now() - this.thinkStart));
    }

    // Orphan any search still in flight. Its result belongs to a turn that is
    // no longer happening, and the generation bump makes the handler a no-op
    // when it does arrive.
    this.generation++;
    this.paused = true;
    this.running = false;
    this.thinking = false;
    this.thinkSide = null;
    this.pauseStartedAt = Date.now();
    this.clearTimers();

    // Stop burning a core on a search nobody is waiting for.
    if (side) {
      const engine = this.engineFor(side);
      if (engine && engine.busy) engine.post('stop');
    }

    this.setStatus('Paused after ' + Math.ceil(chessGame.moveLog.length / 2) +
      (chessGame.moveLog.length === 1 ? ' move. ' : ' moves. ') + 'Press Resume to carry on.');
    this.renderAll();
    chessGame.updateUI();
  },

  resume() {
    if (!this.paused) return;

    if (this.pauseStartedAt) {
      this.pausedTotalMs += Date.now() - this.pauseStartedAt;
      this.pauseStartedAt = 0;
    }

    this.paused = false;
    this.running = true;
    this.setStatus(this.matchSetupSummary());
    this.renderAll();
    chessGame.updateUI();
    // beginTurn works out whose move it is from the position itself, so it is
    // the same entry point whether the pause caught an engine mid-search, a
    // scripted book move about to play, or the gap between two moves.
    this.beginTurn();
  },

  // Ends the match for good: this is what Reset, switching mode and leaving
  // the page all go through. Unlike pause() it writes a record, because the
  // game did happen.
  stop() {
    this.startToken++;
    const wasLoading = this.loading;
    this.loading = false;

    const wasActive = this.running || this.paused || this.thinking;
    this.paused = false;

    if (!wasActive) {
      this.clearTimers();
      // Deliberately no updateUI() on this path unless something changed.
      // chessGame.updateUI() reaches updateModeUI(), which calls
      // syncVisibility(), which calls stop() again - so an unconditional
      // updateUI() here would recurse until the stack gave out.
      if (wasLoading) {
        // The start attempt is abandoned, but its "Starting both engines..."
        // message is still on screen and would otherwise never be replaced.
        this.setStatus('Start cancelled.');
        this.renderAll();
        chessGame.updateUI();
      }
      return;
    }

    const side = this.thinking ? this.thinkSide : null;
    if (side) {
      this.clocks[side] = Math.max(0, this.thinkBudget - (Date.now() - this.thinkStart));
    }
    if (this.pauseStartedAt) {
      this.pausedTotalMs += Date.now() - this.pauseStartedAt;
      this.pauseStartedAt = 0;
    }

    this.generation++;
    this.termination = 'abandoned';
    this.running = false;
    this.thinking = false;
    this.thinkSide = null;
    this.clearTimers();

    if (side) {
      const engine = this.engineFor(side);
      if (engine && engine.busy) engine.post('stop');
    }

    // An abandoned match has no use for its engines.
    this.releaseMatchEngines();

    this.recordMatch({ headline: 'Match stopped', detail: 'abandoned' });
    this.setStatus('Match stopped. Press Start for a new game, or Reset to clear the board.');
    this.renderAll();
    chessGame.updateUI();
  },

  clearTimers() {
    this.clearTickOnly();
    if (this.delayTimer) { clearTimeout(this.delayTimer); this.delayTimer = null; }
  },

  clearTickOnly() {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
  },

  engineFor(side) {
    return side === 'w' ? chessEngineWhite : chessEngineBlack;
  },

  beginTurn() {
    if (!this.running || this.finished || this.thinking) return;

    const side = chessGame.state.turn;

    // A book move comes first, and it comes without asking an engine. The
    // clocks still behave: the move costs almost no time, and the increment is
    // added exactly as it would be for an engine move, so a scripted opening
    // does not quietly hand the opponent time.
    const scripted = this.takeScriptedMove(side);
    if (scripted) {
      this.thinkSide = side;
      this.thinkStart = Date.now();
      this.thinkBudget = this.clocks[side];
      this.clocks[side] = this.thinkBudget + this.incrementMs;
      this.lastMover = side;
      this.setStatus((side === 'w' ? 'White' : 'Black') + ' plays ' + scripted.entry.label +
        ' from the book line');
      this.renderAll();
      // playMove re-enters through onMovePlayed(), exactly as an engine move
      // does, so the draw rules and scheduling need no separate path.
      chessGame.playMove(scripted.move);
      return;
    }

    const engine = this.engineFor(side);

    // The book line is finished, so put the normal running message back. It
    // would otherwise sit there saying somebody is about to play a book move
    // that no longer exists.
    if (this.scriptIndex >= this.script.length && this.script.length) {
      this.setStatus(this.matchSetupSummary());
    }

    if (!engine || !engine.ready) {
      this.finish({
        result: '1/2-1/2',
        winner: null,
        headline: 'Match stopped',
        detail: 'an engine was not available'
      });
      return;
    }

    const usable = this.clocks[side] - this.FLAG_MARGIN_MS;
    if (usable <= 0) {
      this.flag(side);
      return;
    }

    // The engine gets the smaller of its per-move cap and whatever is
    // actually left on the clock. Clamped at a floor because "movetime 0"
    // means "search indefinitely" to UCI, which is the opposite of what a
    // side with 300ms left needs.
    const movetime = Math.max(60, Math.min(this.perMoveMs, usable));

    const gen = ++this.generation;
    this.thinking = true;
    this.thinkSide = side;
    this.thinkStart = Date.now();
    this.thinkBudget = this.clocks[side];
    this.startTick();
    this.renderAll();
    chessGame.updateUI();

    // ucinewgame only on the opening move. Re-sending it every ply throws away
    // the transposition table, which is most of what makes an engine strong,
    // and two engines doing that to each other play a visibly weaker game.
    const isOpening = chessGame.moveLog.length === 0;
    const fen = chessToFen(chessGame.state);

    engine.findBestMove(fen, 0, { movetime, newGame: isOpening })
      .then(res => this.onEngineMove(gen, side, res && res.uci))
      .catch(err => this.onEngineError(gen, side, err));
  },

  onEngineMove(gen, side, uci) {
    if (gen !== this.generation) return;

    const remaining = this.thinkBudget - (Date.now() - this.thinkStart);

    this.thinking = false;
    this.thinkSide = null;
    this.clearTickOnly();

    // Flags fall on the side that ran out, and are checked before the move is
    // played: a side that overran its clock has forfeited whatever it was
    // about to move.
    if (remaining <= 0) {
      this.flag(side);
      return;
    }
    if (!this.running) return;

    const move = chessUciToMoveObj(uci, chessGame.state);
    if (!move) {
      this.finish({
        result: '1/2-1/2',
        winner: null,
        headline: 'Match stopped',
        detail: 'the engine returned an unusable move'
      });
      return;
    }

    this.clocks[side] = remaining + this.incrementMs;
    this.lastMover = side;
    this.renderAll();

    // playMove re-enters this controller through onMovePlayed().
    chessGame.playMove(move);
  },

  onEngineError(gen, side, err) {
    if (gen !== this.generation) return;
    this.thinking = false;
    this.thinkSide = null;
    this.clearTickOnly();
    const name = side === 'w' ? 'White' : 'Black';
    this.finish({
      result: '1/2-1/2',
      winner: null,
      headline: 'Match stopped',
      detail: name + "'s engine failed: " + (err && err.message ? err.message : 'unknown error')
    });
  },

  // Called by chessGame.playMove right after an engine move lands.
  onMovePlayed() {
    if (!this.running || this.finished) return;

    this.positionHistory.push(chessPositionKey(chessGame.state));

    const outcome = this.adjudicate();
    if (outcome) {
      this.finish(outcome);
      return;
    }

    // Charge the between-move animation to the side that just moved.
    if (this.lastMover) {
      this.clocks[this.lastMover] = Math.max(0, this.clocks[this.lastMover] - this.MOVE_DELAY_MS);
      if (this.clocks[this.lastMover] <= 0) {
        this.flag(this.lastMover);
        return;
      }
    }

    this.renderAll();
    this.delayTimer = setTimeout(() => {
      this.delayTimer = null;
      this.beginTurn();
    }, this.MOVE_DELAY_MS);
  },

  // Every way a match can end, in the order they should be tested. Returns
  // null while the game is still live.
  adjudicate() {
    const status = chessGameStatus(chessGame.state);

    if (status === 'checkmate') {
      const winner = chessGame.state.turn === 'w' ? 'b' : 'w';
      return {
        result: winner === 'w' ? '1-0' : '0-1',
        winner,
        headline: (winner === 'w' ? 'White' : 'Black') + ' wins',
        detail: 'by checkmate'
      };
    }

    if (status === 'stalemate') {
      return { result: '1/2-1/2', winner: null, headline: 'Draw', detail: 'by stalemate' };
    }

    // Tested after mate on purpose: a position can satisfy both, and mate
    // takes precedence in the rules.
    if (chessGame.state.halfmoveClock >= 100) {
      return { result: '1/2-1/2', winner: null, headline: 'Draw', detail: 'by the fifty-move rule' };
    }

    if (chessGame.moveLog.length >= this.MAX_PLIES) {
      return {
        result: '1/2-1/2',
        winner: null,
        headline: 'Draw',
        detail: 'by adjudication at ' + this.MAX_PLIES + ' plies'
      };
    }

    if (chessInsufficientMaterial(chessGame.state)) {
      return { result: '1/2-1/2', winner: null, headline: 'Draw', detail: 'by insufficient material' };
    }

    const repeats = chessRepetitionCount(this.positionHistory, chessPositionKey(chessGame.state));
    if (repeats >= 3) {
      return { result: '1/2-1/2', winner: null, headline: 'Draw', detail: 'by threefold repetition' };
    }

    return null;
  },

  flag(side) {
    this.clocks[side] = 0;
    const winner = side === 'w' ? 'b' : 'w';
    this.termination = 'time forfeit';
    this.renderAll();
    this.finish({
      result: winner === 'w' ? '1-0' : '0-1',
      winner,
      headline: (winner === 'w' ? 'White' : 'Black') + ' wins',
      // "on time" rather than naming the loser: the headline already says who
      // won, and "<winner> wins Black flagged" reads like a stutter.
      detail: 'on time'
    });
  },

  finish(outcome) {
    this.clearTimers();
    this.running = false;
    this.paused = false;
    this.finished = true;
    this.thinking = false;
    this.thinkSide = null;
    this.result = outcome.result;
    this.outcome = outcome;
    this.matchEnd = Date.now();

    this.renderAll();
    this.setStatus(outcome.headline + ' ' + outcome.detail);
    chessGame.updateUI();
    this.recordMatch(outcome);
    this.showResultOverlay();
  },

  // --- Match history ------------------------------------------------------

  loadHistory() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(CHESS_HISTORY_KEY) || 'null'); }
    catch (e) { raw = null; }
    this.history = Array.isArray(raw) ? raw.filter(e => e && typeof e.id === 'string') : [];
  },

  saveHistory() {
    try {
      localStorage.setItem(CHESS_HISTORY_KEY, JSON.stringify(this.history));
      return true;
    } catch (e) {
      // Almost certainly the quota. Drop the oldest half and try once more
      // rather than losing the record the player just finished.
      this.history = this.history.slice(0, Math.max(1, Math.floor(this.history.length / 2)));
      try {
        localStorage.setItem(CHESS_HISTORY_KEY, JSON.stringify(this.history));
        return true;
      } catch (e2) {
        this.setStatus('Match history is full and could not be written.', true);
        return false;
      }
    }
  },

  // Called once, when a match ends. finish() passes its outcome; stop() passes
  // "abandoned", because a match the player called off still happened and
  // losing it from the record would be a surprise.
  recordMatch(outcome) {
    if (!this.matchStart) return;
    const detail = outcome || this.outcome || { headline: 'Match ended', detail: '' };
    const endedAt = this.matchEnd || Date.now();
    const when = new Date(this.matchStart);
    const pad = n => String(n).padStart(2, '0');

    const entry = {
      // Timestamp plus a per-session counter. The timestamp alone would almost
      // always be unique, but a deleted entry could then let a later match
      // reuse an id and the history list would show the wrong game.
      id: 'm' + this.matchStart + '-' + (++this.recordSeq),
      startedAt: this.matchStart,
      endedAt,
      durationMs: this.elapsedMatchMs(),
      date: when.getFullYear() + '-' + pad(when.getMonth() + 1) + '-' + pad(when.getDate()),
      time: pad(when.getHours()) + ':' + pad(when.getMinutes()),
      result: this.result || '*',
      termination: this.termination,
      headline: detail.headline,
      detail: detail.detail || '',
      timeControl: this.timeControlTag(),
      moves: Math.ceil(chessGame.moveLog.length / 2),
      opening: this.openingSideLabel() || 'Standard game',
      finalFen: chessToFen(chessGame.state),
      san: chessGame.moveLog.slice(),
      whiteClock: Math.round(this.clocks.w / 1000),
      blackClock: Math.round(this.clocks.b / 1000),
      pgn: this.buildPgn()
    };

    this.history.unshift(entry);
    if (this.history.length > CHESS_HISTORY_LIMIT) {
      this.history = this.history.slice(0, CHESS_HISTORY_LIMIT);
    }
    this.saveHistory();
    this.renderHistory();
  },

  clearHistory() {
    this.history = [];
    this.saveHistory();
    this.renderHistory();
    this.setStatus('Match history cleared.');
  },

  toggleHistory(force) {
    this.historyOpen = force === undefined ? !this.historyOpen : !!force;
    // The guard matters more than it looks. chessGame.updateUI() calls
    // syncVisibility() during its own init, which is *before* this
    // controller's init has built the element map - so every method
    // updateModeUI() can reach has to survive being called on a controller
    // whose `el` does not exist yet. Missing that here threw during startup
    // and took the rest of the app's initialisation down with it: the launch
    // cards are wired after the games, so all four stopped responding.
    if (!this.el) return;
    if (this.el.historyPanel) this.el.historyPanel.classList.toggle('active', this.historyOpen);
    if (this.historyOpen) this.renderHistory();
  },

  historyBadgeClass(result) {
    if (result === '1-0') return 'white';
    if (result === '0-1') return 'black';
    if (result === '1/2-1/2') return 'draw';
    return '';
  },

  renderHistory() {
    const el = this.el;
    if (!el || !el.historyList) return;

    if (el.historyCount) {
      const n = this.history.length;
      el.historyCount.textContent = n ? n + (n === 1 ? ' game' : ' games') : '';
    }
    if (el.historyClearBtn) el.historyClearBtn.disabled = this.history.length === 0;

    if (!this.history.length) {
      el.historyList.innerHTML = '<div class="history-empty">No games yet. Every match you play is recorded here.</div>';
      return;
    }

    el.historyList.innerHTML = this.history.map(entry => {
      const when = entry.date + ' ' + entry.time;
      const meta = [
        entry.timeControl,
        entry.moves + (entry.moves === 1 ? ' move' : ' moves'),
        entry.opening,
        when
      ].join(' · ');
      return '<button class="history-entry" data-id="' + chessEscapeHtml(entry.id) + '" type="button">' +
        '<span class="history-badge ' + this.historyBadgeClass(entry.result) + '">' +
        chessEscapeHtml(entry.result || '*') + '</span>' +
        '<span class="history-main">' +
        '<span class="history-line1">' + chessEscapeHtml(entry.headline + ' · ' + entry.detail) + '</span>' +
        '<span class="history-line2">' + chessEscapeHtml(meta) + '</span>' +
        '</span></button>';
    }).join('');
  },

  openHistoryEntry(id) {
    const entry = this.history.find(e => e.id === id);
    if (!entry) return;

    const mins = Math.floor(entry.durationMs / 60000);
    const secs = Math.floor((entry.durationMs % 60000) / 1000);
    const view = {
      result: entry.result || '*',
      headline: entry.headline,
      detail: entry.detail,
      stats: [
        ['Date', entry.date + ' at ' + entry.time],
        ['Time control', entry.timeControl],
        ['Moves', String(entry.moves)],
        ['Duration', mins + 'm ' + String(secs).padStart(2, '0') + 's'],
        ['Opening', entry.opening],
        ['Termination', entry.termination],
        ['White left', this.formatClock(entry.whiteClock * 1000)],
        ['Black left', this.formatClock(entry.blackClock * 1000)]
      ],
      moveLog: entry.san || [],
      pgn: entry.pgn || ''
    };
    this.showResultOverlay(view, { mode: 'history', entry });
  },

  // --- Clock rendering --------------------------------------------------

  startTick() {
    this.clearTickOnly();
    this.tickTimer = setInterval(() => this.renderClocks(), 100);
  },

  // The clock as it should read right now. The side that is thinking has not
  // had its time deducted yet - it is deducted once, in a single step, when
  // the move comes back - so the live value is derived from the think start.
  clockValue(side) {
    if (this.thinking && side === this.thinkSide) {
      return Math.max(0, this.thinkBudget - (Date.now() - this.thinkStart));
    }
    return Math.max(0, this.clocks[side]);
  },

  formatClock(ms) {
    const clamped = Math.max(0, ms);
    const minutes = Math.floor(clamped / 60000);
    const seconds = Math.floor((clamped % 60000) / 1000);
    const base = minutes + ':' + String(seconds).padStart(2, '0');
    // Tenths only in the last stretch, where a tenth of a second is the entire
    // drama. Above that they are noise that makes the digits jitter.
    if (clamped < 20000) return base + '.' + Math.floor((clamped % 1000) / 100);
    return base;
  },

  renderClocks() {
    if (!this.el || !this.el.clockW || !this.el.clockB) return;
    this.el.clockW.textContent = this.formatClock(this.clockValue('w'));
    this.el.clockB.textContent = this.formatClock(this.clockValue('b'));

    const wrapW = this.el.clockW.parentNode;
    const wrapB = this.el.clockB.parentNode;
    if (wrapW) {
      wrapW.classList.toggle('low', this.clockValue('w') < 30000);
      wrapW.classList.toggle('active', this.thinking && this.thinkSide === 'w');
    }
    if (wrapB) {
      wrapB.classList.toggle('low', this.clockValue('b') < 30000);
      wrapB.classList.toggle('active', this.thinking && this.thinkSide === 'b');
    }
  },

  onEngineLine(side, evt) {
    if (!evt || evt.type !== 'info' || !this.el) return;
    // Ignore anything that arrives when no search is in flight for that side.
    // An engine keeps streaming info for a few milliseconds after its search
    // is cancelled, and without this a pause would be stamped over by
    // "depth 13" the instant it is pressed.
    if (!this.thinking || this.thinkSide !== side) return;

    const el = side === 'w' ? this.el.infoW : this.el.infoB;
    if (!el) return;
    const name = side === 'w' ? 'White' : 'Black';
    if (evt.depth === null || evt.depth === undefined) {
      el.textContent = name + ': ready';
      return;
    }
    const score = evt.score === null || evt.score === undefined ? '' : formatDuelScore(evt.score);
    el.textContent = name + ': depth ' + evt.depth + (score ? ' · ' + score : '');
  },

  renderAll() {
    if (!this.el) return;
    this.renderClocks();

    if (this.el.startBtn) {
      const label = this.loading
        ? '<span class="btn-icon">✕</span> <span class="btn-label">Cancel</span>'
        : (this.paused
          ? '<span class="btn-icon">▶</span> <span class="btn-label">Resume</span>'
          : (this.running
            ? '<span class="btn-icon">⏸</span> <span class="btn-label">Pause</span>'
            : '<span class="btn-icon">▶</span> <span class="btn-label">Start</span>'));
      // renderAll() runs on every render, and renderAll() is reached from
      // updateUI() several times a second during a match. Assigning innerHTML
      // re-parses the markup and drops the button's children each time, so it
      // only happens when the label has genuinely changed.
      if (this._startBtnHtml !== label) {
        this._startBtnHtml = label;
        this.el.startBtn.innerHTML = label;
      }
      this.el.startBtn.classList.toggle('active', this.running || this.loading);
      this.el.startBtn.classList.toggle('paused', this.paused);
      // Never disabled: during the load second this button is the only way to
      // call the match off, so disabling it would strand the player for as
      // long as the workers take to come up.
      this.el.startBtn.disabled = false;
    }
    if (this.el.saveBtn) {
      this.el.saveBtn.disabled = chessGame.moveLog.length === 0;
    }

    // Only touched when no search is in flight. onEngineLine() refuses to write
    // at any other time, so the live depth reading and this state label cannot
    // fight over the same element.
    if (!this.thinking) {
      const label = this.paused ? 'paused'
        : (this.finished ? 'finished' : (this.running ? 'ready' : 'idle'));
      if (this.el.infoW) this.el.infoW.textContent = 'White: ' + label;
      if (this.el.infoB) this.el.infoB.textContent = 'Black: ' + label;
    }

    // A finished match does not need two wasm modules sitting in memory. The
    // engines are reloaded on the next Start, and the Cancel button covers the
    // second or so it takes.
    //
    // Deliberately keyed on `finished` rather than on "not running". start()
    // loads the engines, then resets the board - which renders - and only then
    // sets `running`. A negated condition fires in that gap, hands the engines
    // straight back, and the match dies on its first move with "an engine was
    // not available".
    if (this.finished) {
      this.releaseMatchEngines();
    }
  },

  // Frees the two match engines. Idempotent, because it is called from every
  // render once a match is over and from several teardown paths.
  releaseMatchEngines() {
    if (this.enginesReleased) return;
    this.enginesReleased = true;
    chessEngineWhite.dispose();
    chessEngineBlack.dispose();
  },

  // start() has to be able to load them again after a release.
  claimMatchEngines() {
    this.enginesReleased = false;
  },

  // Match messages go to the same status line as every other chess message.
  // A second status element next to the time control panel would only ever
  // repeat the same sentence in two places.
  setStatus(text, isError) {
    if (chessGame) chessGame.setStatus(text || '');
    if (chessGame && chessGame.statusEl) {
      chessGame.statusEl.classList.toggle('is-error', !!isError);
    }
  },

  // Text for the turn pill. Called from chessGame.updateUI on every render.
  turnText(status) {
    if (this.finished && this.outcome) return this.outcome.headline + ' ' + this.outcome.detail;
    if (this.loading) return 'Loading engines...';
    if (this.paused) return 'Match paused';
    if (this.thinking) return (this.thinkSide === 'w' ? 'White engine' : 'Black engine') + ' thinking';
    if (this.running) return this.thinkSide === 'w' ? "White's move" : "Black's move";
    return 'Press Start to run the match';
  },

  // --- PGN --------------------------------------------------------------

  pgnFileName() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return 'stockfish19-duel-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
      '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + '.pgn';
  },

  buildPgn() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateTag = now.getFullYear() + '.' + pad(now.getMonth() + 1) + '.' + pad(now.getDate());

    // '*' is the PGN token for "no result yet", which is what a match saved
    // mid-play has to carry.
    const result = this.result || '*';

    const tags = [
      ['Event', 'Cute Chess engine match'],
      ['Site', '4GamesbyAlex'],
      ['Date', dateTag],
      ['Round', '1'],
      ['White', (chessEngineWhite.engineName || 'Stockfish 19') + ' (White)'],
      ['Black', (chessEngineBlack.engineName || 'Stockfish 19') + ' (Black)'],
      ['Result', result],
      ['Termination', this.termination],
      ['TimeControl', this.timeControlTag()],
      ['Annotator', '4GamesbyAlex'],
      ['Mode', '2x Stockfish 19']
    ];

    // Which book line the match was set up with, and which side played it. Not
    // part of the seven tag roster, but it is the one thing that distinguishes
    // one engine game from another and it is what a later reader actually
    // wants to know.
    //
    // The custom position is tested first, and deliberately so: an opening can
    // stay selected in the panel while the source is switched to FEN, and a
    // header claiming a Catalan for a game that began from a pasted position
    // is worse than no opening tag at all.
    if (this.setupSource === 'fen') {
      tags.push(['Opening', 'Custom position']);
    } else {
      const opening = this.selectedOpening();
      if (opening) {
        tags.push(['Opening', opening.name]);
        tags.push(['ECO', opening.eco]);
        tags.push(['OpeningSide',
          this.openingSide === 'both' ? 'both' : (this.openingSide === 'w' ? 'white' : 'black')]);
      }
    }

    // SetUp and FEN only belong in the header when the game does not start
    // from the standard position. A match set up from an opening does, because
    // the book line is played out as part of the game; only a custom starting
    // position needs them.
    if (this.startFen && this.startFen !== CHESS_STANDARD_START_FEN) {
      tags.push(['SetUp', '1'], ['FEN', this.startFen]);
    }

    const header = tags
      .map(pair => '[' + pair[0] + ' "' + String(pair[1]).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]')
      .join('\n');

    return header + '\n\n' + buildPgnMovetext(chessGame.moveLog, result) + '\n';
  },

  // The panel button, which always saves the match in progress.
  savePgn() {
    if (chessGame.moveLog.length === 0) {
      this.setStatus('No moves yet, so there is nothing to save.', true);
      return;
    }
    this.writePgnFile(this.buildPgn(), this.pgnFileName());
  },

  // Writes a PGN through the native bridge, falling back to a blob download
  // outside the Android shell. The outcome is reported in both places it can
  // be seen: the status line, and the overlay note if one is open.
  writePgnFile(pgn, fileName) {
    if (!pgn) {
      this.setStatus('There is nothing to save.', true);
      return;
    }

    const bridge = window.AndroidBridge;
    if (bridge && typeof bridge.savePgn === 'function') {
      let location = '';
      try { location = bridge.savePgn(fileName, pgn); }
      catch (e) { location = ''; }
      if (location) {
        this.setStatus('Saved ' + fileName + ' to ' + location);
        this.setOverlayNote('Saved ' + fileName + ' to ' + location);
      } else {
        this.setStatus('Android could not write ' + fileName + '. Try Copy PGN instead.', true);
        this.setOverlayNote('The file could not be written. Use Copy PGN instead.');
      }
      return;
    }

    try {
      const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.setStatus('Saved ' + fileName);
      this.setOverlayNote('Saved ' + fileName);
    } catch (e) {
      this.setStatus('Could not save the file. Use Copy PGN instead.', true);
      this.setOverlayNote('Could not save the file. Use Copy PGN instead.');
    }
  },

  copyPgn() {
    if (chessGame.moveLog.length === 0) {
      this.setStatus('No moves yet, so there is nothing to copy.', true);
      return;
    }
    this.copyPgnText(this.buildPgn());
  },

  copyPgnText(pgn) {
    if (!pgn) {
      this.setStatus('There is nothing to copy.', true);
      return;
    }
    const unavailable = 'Clipboard unavailable. Select the text below instead.';

    const bridge = window.AndroidBridge;
    if (bridge && typeof bridge.copyToClipboard === 'function') {
      let ok = false;
      try { ok = !!bridge.copyToClipboard(pgn); } catch (e) { ok = false; }
      this.setStatus(ok ? 'PGN copied to the clipboard' : unavailable, !ok);
      this.setOverlayNote(ok ? 'PGN copied to the clipboard' : unavailable);
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pgn)
        .then(() => {
          this.setStatus('PGN copied to the clipboard');
          this.setOverlayNote('PGN copied to the clipboard');
        })
        .catch(() => {
          this.setStatus(unavailable, true);
          this.setOverlayNote(unavailable);
        });
      return;
    }

    this.setStatus(unavailable, true);
    this.setOverlayNote(unavailable);
  },

  // --- Result overlay -------------------------------------------------------
  //
  // One overlay serves both a match that has just finished and a record opened
  // from the history. The two differ only in the data and in which actions
  // make sense - Rematch for a live match, Delete for a stored one - so the
  // view is built separately from the display, and overlayTarget records which
  // of the two is on screen.
  matchResultView() {
    return {
      result: this.result || '*',
      headline: this.outcome ? this.outcome.headline : 'Match finished',
      detail: this.outcome ? this.outcome.detail : '',
      stats: [
        ['Time control', this.timeControlTag()],
        ['Starting position', this.openingSideLabel() || 'Standard game'],
        ['Moves', String(Math.ceil(chessGame.moveLog.length / 2))],
        ['Duration', this.matchDuration()],
        ['White left', this.formatClock(this.clocks.w)],
        ['Black left', this.formatClock(this.clocks.b)],
        ['Termination', this.termination]
      ],
      moveLog: chessGame.moveLog,
      pgn: this.buildPgn()
    };
  },

  showResultOverlay(view, target) {
    const el = this.el;
    if (!el || !el.overlay) return;
    const data = view || this.matchResultView();
    const mode = (target && target.mode) || 'match';
    this.overlayTarget = target || { mode: 'match' };

    if (el.badge) el.badge.textContent = data.result || '*';
    if (el.title) el.title.textContent = data.headline;
    if (el.sub) el.sub.textContent = data.detail;

    if (el.stats) {
      el.stats.innerHTML = data.stats
        .map(row => '<div class="chess-stat"><span class="chess-stat-k">' + chessEscapeHtml(row[0]) +
                    '</span><span class="chess-stat-v">' + chessEscapeHtml(row[1]) + '</span></div>')
        .join('');
    }

    if (el.moves) {
      el.moves.innerHTML = data.moveLog && data.moveLog.length
        ? buildMoveRows(data.moveLog)
        : '<div class="movelog-empty">No moves were played</div>';
    }

    // The PGN is on screen as well as in the buttons, so it can still be read
    // or selected by hand when saving and copying both fail.
    if (el.pgn) el.pgn.textContent = data.pgn || '';
    if (el.note) el.note.textContent = '';

    // The action row is mode-dependent. The `hidden` attribute needs an
    // explicit rule here, because .result-btn sets display:inline-flex, which
    // overrides the browser's default [hidden] styling.
    if (el.btnRematch) el.btnRematch.hidden = mode !== 'match';
    if (el.btnDelete) el.btnDelete.hidden = mode !== 'history';

    el.overlay.classList.add('active');
  },

  hideResultOverlay() {
    if (this.el && this.el.overlay) this.el.overlay.classList.remove('active');
    this.overlayTarget = null;
    if (this.el && this.el.note) this.el.note.textContent = '';
  },

  // --- Overlay actions ------------------------------------------------------

  // The overlay may be showing a live result or a stored record, so these
  // resolve their PGN from whichever is on screen.
  overlayPgn() {
    if (this.overlayTarget && this.overlayTarget.mode === 'history') {
      return this.overlayTarget.entry.pgn || '';
    }
    return this.buildPgn();
  },

  overlayFileName() {
    if (this.overlayTarget && this.overlayTarget.mode === 'history') {
      const entry = this.overlayTarget.entry;
      return 'chess-game-' + entry.date + '-' + entry.time.replace(':', '') + '.pgn';
    }
    return this.pgnFileName();
  },

  saveFromOverlay() {
    this.writePgnFile(this.overlayPgn(), this.overlayFileName());
  },

  copyFromOverlay() {
    this.copyPgnText(this.overlayPgn());
  },

  deleteFromOverlay() {
    const target = this.overlayTarget;
    if (!target || target.mode !== 'history') return;
    this.history = this.history.filter(e => e.id !== target.entry.id);
    this.saveHistory();
    this.renderHistory();
    this.hideResultOverlay();
    this.setStatus('Removed ' + target.entry.date + ' ' + target.entry.time + ' from the history.');
  },

  setOverlayNote(text) {
    if (this.el && this.el.note) this.el.note.textContent = text || '';
  },

  // Elapsed *playing* time. Time spent paused is subtracted, because a game
  // left alone over lunch did not take lunch to play.
  elapsedMatchMs() {
    if (!this.matchStart) return 0;
    const end = this.matchEnd || Date.now();
    const paused = this.pausedTotalMs + (this.pauseStartedAt ? Date.now() - this.pauseStartedAt : 0);
    return Math.max(0, (end - this.matchStart) - paused);
  },

  matchDuration() {
    if (!this.matchStart) return '-';
    const totalSeconds = Math.round(this.elapsedMatchMs() / 1000);
    return Math.floor(totalSeconds / 60) + 'm ' + String(totalSeconds % 60).padStart(2, '0') + 's';
  }
};

// Renders the "n. white black" move rows shared by the on-board move log and
// the result overlay, so the two can never drift apart.
function buildMoveRows(moveLog) {
  const rows = [];
  for (let i = 0; i < moveLog.length; i += 2) {
    rows.push('<div class="movelog-row"><span class="movelog-num">' + (Math.floor(i / 2) + 1) +
              '.</span><span class="movelog-san">' + (moveLog[i] || '') + '</span>' +
              '<span class="movelog-san">' + (moveLog[i + 1] || '') + '</span></div>');
  }
  return rows.join('');
}

// PGN movetext: move numbers paired up, wrapped at the 80-column limit the
// standard asks for, with the result on the end of the final line.
function buildPgnMovetext(moveLog, result) {
  const tokens = [];
  for (let i = 0; i < moveLog.length; i += 2) {
    tokens.push((Math.floor(i / 2) + 1) + '.');
    tokens.push(moveLog[i]);
    if (moveLog[i + 1]) tokens.push(moveLog[i + 1]);
  }

  const lines = [];
  let line = '';
  for (const token of tokens) {
    if (line && line.length + 1 + token.length > 80) {
      lines.push(line);
      line = token;
    } else {
      line += (line ? ' ' : '') + token;
    }
  }

  if (result && result !== '*') {
    if (line && line.length + 1 + result.length <= 80) line += ' ' + result;
    else { lines.push(line); line = result; }
  }
  if (line) lines.push(line);

  return lines.join('\n');
}

// A score from the engine's point of view. Mate scores are a distance in
// plies rather than centipawns, so they get their own rendering instead of
// showing up as a five digit pawn count.
function formatDuelScore(score) {
  if (Math.abs(score) > 10000) {
    const moves = Math.ceil((10000 - Math.abs(score)) / 2);
    return (score > 0 ? 'M' : '-M') + moves;
  }
  return (score > 0 ? '+' : '') + (score / 100).toFixed(2);
}
// --- Interactive Drawing / Doodling Logic (Solar, Fire) ---

function setupCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.drawImage(tempCanvas, 0, 0, rect.width, rect.height);
  }

  if (canvas._initialized) return;
  canvas._initialized = true;

  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  function getCoords(e) {
    const box = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - box.left,
      y: clientY - box.top
    };
  }

  function startDraw(e) {
    isDrawing = true;
    const coords = getCoords(e);
    lastX = coords.x;
    lastY = coords.y;
    e.preventDefault();
  }

  function draw(e) {
    if (!isDrawing) return;
    const coords = getCoords(e);
    ctx.beginPath();
    ctx.strokeStyle = state.brushColors[canvasId] || '#ffffff';
    ctx.lineWidth = state.brushSizes[canvasId] || 5;
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    lastX = coords.x;
    lastY = coords.y;
    e.preventDefault();
  }

  function stopDraw() {
    isDrawing = false;
  }

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDraw);

  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  window.addEventListener('touchend', stopDraw);
}

function clearCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  playTone(220, 'triangle', 0.15, 0.05);
}

function setupVirtualPet() {
  const avatar = document.getElementById('pet-avatar');
  const chatForm = document.getElementById('pet-chat-form');
  const messageInput = document.getElementById('pet-message');
  const chatLog = document.getElementById('pet-chat-log');
  const settings = document.querySelector('.pet-settings');
  const apiKeyInput = document.getElementById('pet-api-key');
  const modelInput = document.getElementById('pet-model');
  const status = document.getElementById('pet-connection-status');
  const mood = document.getElementById('pet-mood');
  const affectionDisplay = document.getElementById('pet-affection');
  const pendingReplies = new Map();
  const conversation = [];
  const nativeBridge = window.AndroidBridge;
  let apiKey = '';
  let hasSavedApiKey = Boolean(nativeBridge && typeof nativeBridge.hasPetApiKey === 'function' && nativeBridge.hasPetApiKey());
  let model = localStorage.getItem('pet_model') || 'openai/gpt-4o-mini';
  const clampNeed = value => Math.max(0, Math.min(100, Number(value) || 0));
  let petCare = {
    fullness: 72,
    energy: 78,
    joy: 68,
    bond: Math.max(0, Number(localStorage.getItem('pet_affection') || 0))
  };
  let tapChain = 0;
  let lastPetTap = 0;
  let lastTouchSpeech = 0;
  let animationTimeout = 0;

  modelInput.value = model;
  try {
    const savedCare = JSON.parse(localStorage.getItem('pet_care_state') || 'null');
    if (savedCare) {
      petCare.fullness = clampNeed(savedCare.fullness);
      petCare.energy = clampNeed(savedCare.energy);
      petCare.joy = clampNeed(savedCare.joy);
      petCare.bond = Math.max(petCare.bond, Math.floor(Number(savedCare.bond) || 0));
    }
  } catch (error) {}
  document.getElementById('pet-forget-key').hidden = !hasSavedApiKey;
  if (hasSavedApiKey) status.textContent = 'A saved key is ready. It is encrypted on this device.';

  function savePetCare() {
    localStorage.setItem('pet_care_state', JSON.stringify(petCare));
    localStorage.setItem('pet_affection', petCare.bond.toString());
  }

  function renderPetCare() {
    document.getElementById('pet-fullness').value = petCare.fullness;
    document.getElementById('pet-energy').value = petCare.energy;
    document.getElementById('pet-joy').value = petCare.joy;
    affectionDisplay.textContent = petCare.bond.toString();

    const level = Math.floor(petCare.bond / 10) + 1;
    const levelProgress = petCare.bond % 10;
    document.getElementById('pet-level').textContent = `دوستی · سطح ${level}`;
    document.getElementById('pet-bond-meter').value = levelProgress;
    document.getElementById('pet-bond-next').textContent = `${levelProgress}/10`;

    if (petCare.energy < 22) mood.textContent = 'تھوڑا تھک گیا ہوں';
    else if (petCare.fullness < 22) mood.textContent = 'مجھے بھوک لگی ہے';
    else if (petCare.joy < 28) mood.textContent = 'آپ کے ساتھ کھیلنا ہے';
    else mood.textContent = 'خوش اور پُرجوش';
  }

  /* Touch-dog: five reactions, each bound to its own region in the SVG.
     `bark` = head/face, `giggle` = torso, `boop` = nose, `flap` = ears, `wag` = tail.

     The same five reactions now run on the 3D model. The Blender build
     names its rig nodes after the SVG's groups (gz:hz, gz:torso, gz:nose,
     gz:earL/earR, gz:tail) and places every pivot on the SVG's own
     transform-origin, so one table drives both renderers and each
     reaction lands on the same part of the pet it always did. */
  const DOG_REACTIONS = {
    bark:   { text: 'WOOF!',   ms: 1000 },
    giggle: { text: 'hehehe!', ms: 1100 },
    boop:   { text: 'ACHOO!',  ms: 1700 },
    flap:   { text: 'brrrr!',  ms: 1200 },
    wag:    { text: 'yay!',    ms: 1600 }
  };
  const DOG_ZONES = [
    ['hz', 'bark'], ['torso', 'giggle'], ['noseG', 'boop'],
    ['earL', 'flap'], ['earR', 'flap'], ['tail', 'wag']
  ];
  const dogSvg = document.getElementById('touch-dog-svg');
  const dogBubbleText = dogSvg ? dogSvg.querySelector('#bubbleText') : null;
  let dogReactionTimer = 0;

  /* ---- 3D stage -------------------------------------------------- */
  const petWorld = document.querySelector('.pet-world');
  const petCanvas = document.getElementById('pet-canvas');
  const petBubble = document.getElementById('pet-bubble');
  const petBubbleText = document.getElementById('pet-bubble-text');
  let petStage = null;
  let petBubbleTimer = 0;
  let petHintTimer = 0;

  function showPetHint() {
    if (!petWorld) return;
    let hint = petWorld.querySelector('.pet-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'pet-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = '← drag to turn the pet →';
      const wrap = petWorld.querySelector('.pet-image-wrap');
      if (wrap) wrap.appendChild(hint);
    }
    window.requestAnimationFrame(() => hint.classList.add('is-shown'));
    window.clearTimeout(petHintTimer);
    petHintTimer = window.setTimeout(() => hint.classList.remove('is-shown'), 4200);
  }

  function showPetReaction(text, ms = 1600) {
    if (dogBubbleText) dogBubbleText.textContent = text;
    if (!petBubble) return;
    if (petBubbleText) petBubbleText.textContent = text;
    petBubble.hidden = false;
    petBubble.classList.remove('is-shown');
    // restart the pop animation
    void petBubble.offsetWidth;
    petBubble.classList.add('is-shown');
    window.clearTimeout(petBubbleTimer);
    petBubbleTimer = window.setTimeout(() => {
      petBubble.classList.remove('is-shown');
    }, Math.max(400, ms));
  }

  function reactToDog(name) {
    const reaction = DOG_REACTIONS[name];
    if (!reaction) return;
    showPetReaction(reaction.text, reaction.ms);
    if (dogSvg) {
      dogSvg.setAttribute('class', '');
      void dogSvg.getBoundingClientRect();
      dogSvg.setAttribute('class', 'r ' + name);
    }
    if (petStage && petStage.ready) petStage.react(name);
    window.clearTimeout(dogReactionTimer);
    dogReactionTimer = window.setTimeout(() => {
      if (dogSvg) dogSvg.setAttribute('class', '');
    }, reaction.ms);
  }

  let pet3dUnavailable = false;
  let pet3dHintShown = false;

  function initPet3D() {
    if (pet3dUnavailable || petStage) return;
    if (!window.PetStage || !petCanvas || !petWorld) {
      pet3dUnavailable = true;
      return;
    }
    try {
      const stage = new window.PetStage(petCanvas, {
        onReady: () => {
          petWorld.classList.add('pet-3d-active');
          petWorld.classList.remove('pet-3d-loading');
          petCanvas.classList.add('is-live');
          showPetHintOnce();
        },
        onFailure: () => {
          pet3dUnavailable = true;
          petStage = null;
          petWorld.classList.remove('pet-3d-loading', 'pet-3d-active');
          petCanvas.classList.remove('is-live');
        },
        onTap: (zone, relativeX) => handlePetTap(zone, relativeX)
      });
      if (stage.failed) {
        stage.destroy();
        pet3dUnavailable = true;
        return;
      }
      petStage = stage;
      petWorld.classList.add('pet-3d-loading');
      stage.load('models/virtual_pet.glb');
    } catch (error) {
      petStage = null;
      pet3dUnavailable = true;
      petWorld.classList.remove('pet-3d-loading', 'pet-3d-active');
      petCanvas.classList.remove('is-live');
    }
  }

  function showPetHintOnce() {
    if (pet3dHintShown) return;
    pet3dHintShown = true;
    showPetHint();
  }

  /* switchPage() lives outside this setup function, so expose the two hooks
     it needs. The 3D runtime is only built when the pet page is actually
     opened, and rendering pauses again when it is left. */
  window.ensurePet3D = initPet3D;
  window.setPet3DActive = (active) => {
    if (!petStage) return;
    petStage.setActive(active);
    if (active && petStage.ready) showPetHintOnce();
  };

  DOG_ZONES.forEach(([id, reaction]) => {
    const zone = dogSvg ? dogSvg.querySelector('#' + id) : null;
    if (!zone) return;
    zone.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      reactToDog(reaction);
    });
  });

  function animatePet(action) {
    const world = document.querySelector('.pet-world');
    world.classList.remove('pet-reacting', 'pet-playing', 'pet-feeding', 'pet-napping');
    avatar.classList.remove('pet-reacting');
    void world.offsetWidth;
    if (action === 'pet') avatar.classList.add('pet-reacting');
    const worldClass = { play: 'pet-playing', feeding: 'pet-feeding', napping: 'pet-napping' }[action];
    if (worldClass) world.classList.add(worldClass);
    const duration = action === 'play' ? 1100 : 750;
    window.clearTimeout(animationTimeout);
    animationTimeout = window.setTimeout(() => {
      avatar.classList.remove('pet-reacting');
      if (worldClass) world.classList.remove(worldClass);
    }, duration);
  }

  renderPetCare();

  function appendMessage(text, role, id) {
    const message = document.createElement('p');
    message.className = `pet-message pet-message-${role}`;
    message.textContent = text;
    message.lang = /[\u0600-\u06FF]/.test(text) ? 'ur' : 'en';
    message.dir = 'auto';
    if (id) message.dataset.requestId = id;
    chatLog.appendChild(message);
    chatLog.scrollTop = chatLog.scrollHeight;
    return message;
  }

  function speak(text) {
    if (window.AndroidBridge && typeof window.AndroidBridge.speak === 'function') {
      window.AndroidBridge.speak(text);
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }

  /* Resolve which SVG region a click landed on. Uses the event target when a
     shape was hit, otherwise falls back to viewBox-space bounds so taps on
     empty space still map to a sensible region. */
  function resolveTouchZone(target, clientX, clientY) {
    const node = target instanceof Element ? target.closest('[id]') : null;
    if (node && node.id) {
      if (node.closest('#earL, #earR')) return 'flap';
      if (node.closest('#hz')) return 'bark';
      if (node.closest('#noseG')) return 'boop';
      if (node.closest('#tail')) return 'wag';
      if (node.closest('#torso')) return 'giggle';
    }
    const rect = avatar.getBoundingClientRect();
    if (!rect.width || !rect.height) return 'bark';
    const x = ((clientX - rect.left) / rect.width) * 400;
    const y = ((clientY - rect.top) / rect.height) * 600;
    if (y >= 330 && x >= 250) return 'wag';
    if (y < 270 && Math.abs(x - 200) < 36) return 'boop';
    if (y < 264 && (x < 150 || x > 250)) return 'flap';
    return y < 306 ? 'bark' : 'giggle';
  }

  /* One tap pipeline, shared by the flat artwork and the 3D model.
     `zone` is the part of the pet that was touched; `relativeX` is where
     across the pet it happened, which picks the pitch of the reply. */
  function handlePetTap(zone, relativeX) {
    const now = Date.now();
    tapChain = now - lastPetTap < 950 ? tapChain + 1 : 1;
    lastPetTap = now;

    let reply;

    if (tapChain >= 3) {
      tapChain = 0;
      petCare.joy = clampNeed(petCare.joy + 16);
      petCare.energy = clampNeed(petCare.energy - 7);
      petCare.fullness = clampNeed(petCare.fullness - 3);
      petCare.bond += 2;
      reply = 'واہ! زومیز کا وقت! آپ کے ساتھ کھیلنا مزے کا ہے!';
      animatePet('play');
      showPetReaction('ZOOMIES TIME! PLAY!');
    } else {
      petCare.joy = clampNeed(petCare.joy + 8);
      petCare.energy = clampNeed(petCare.energy - 1);
      petCare.bond++;
      const touchReplies = {
        bark: 'WOOF! WOOF!',
        giggle: 'hehehe! Haaa!',
        boop: 'ACHOO! SNIFF!',
        flap: 'FLAP FLAP!',
        wag: 'WAG WAG! TAIL!',
      };
      reply = touchReplies[zone] || touchReplies.bark;
      animatePet('pet');
      reactToDog(zone);
    }

    renderPetCare();
    savePetCare();
    playBarkSound();
    playTone(tapChain === 0 ? 740 : 520 + Math.round(relativeX * 120), 'sine', 0.14, 0.07);
    appendMessage(reply, 'bot');
    if (tapChain === 0 || now - lastTouchSpeech > 1400) {
      speak(reply);
      lastTouchSpeech = now;
    }
  }

  avatar.addEventListener('click', (event) => {
    // The 3D canvas owns its own taps: it raycasts the model to work out
    // which part was touched, and it swallows drags so a spin of the pet
    // does not also count as a pet.
    if (petCanvas && event.target === petCanvas) return;

    const bounds = avatar.getBoundingClientRect();
    const relativeX = (event.clientX - bounds.left) / bounds.width;
    const zone = resolveTouchZone(event.target, event.clientX, event.clientY);
    handlePetTap(zone, relativeX);
  });

  document.querySelectorAll('[data-pet-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.petAction;
      let reply;

      if (action === 'feed') {
        if (petCare.fullness >= 94) {
          reply = 'YUM! Tummy full! No more!';
          showPetReaction('FULL!');
          animatePet('pet');
        } else {
          petCare.fullness = clampNeed(petCare.fullness + 26);
          petCare.joy = clampNeed(petCare.joy + 5);
          petCare.bond++;
          reply = 'WOOF! Yummy snack! Thank you!';
          showPetReaction('NOM NOM!');
          animatePet('feeding');
        }
      } else if (action === 'play') {
        if (petCare.energy < 20) {
          reply = 'I want to play, but rest first?';
          showPetReaction('REST?');
          animatePet('pet');
        } else {
          petCare.energy = clampNeed(petCare.energy - 15);
          petCare.fullness = clampNeed(petCare.fullness - 5);
          petCare.joy = clampNeed(petCare.joy + 23);
          petCare.bond += 2;
          reply = 'FETCH! Throw ball, play again!';
          showPetReaction('BALL!');
          animatePet('play');
        }
      } else {
        if (petCare.energy >= 96) {
          reply = 'I am ready! Ready to play!';
          showPetReaction('ENERGY!');
          animatePet('pet');
        } else {
          petCare.energy = clampNeed(petCare.energy + 32);
          petCare.joy = clampNeed(petCare.joy + 3);
          petCare.bond++;
          reply = 'Sweet nap coming... zzz';
          showPetReaction('NAP!');
          animatePet('napping');
        }
      }

      renderPetCare();
      savePetCare();
      appendMessage(reply, 'bot');
      speak(reply);
    });
  });

  document.getElementById('pet-connect').addEventListener('click', () => {
    const enteredKey = apiKeyInput.value.trim();
    const enteredModel = modelInput.value.trim();
    if (!enteredKey) {
      status.textContent = 'Enter your OpenRouter API key first.';
      apiKeyInput.focus();
      return;
    }
    if (!enteredModel) {
      status.textContent = 'Enter a model ID supported by OpenRouter.';
      modelInput.focus();
      return;
    }
    model = enteredModel;
    apiKeyInput.value = '';
    localStorage.setItem('pet_model', model);
    if (nativeBridge && typeof nativeBridge.savePetApiKey === 'function') {
      if (!nativeBridge.savePetApiKey(enteredKey)) {
        status.textContent = 'Could not encrypt and save the key on this device.';
        return;
      }
      apiKey = '';
      hasSavedApiKey = true;
      document.getElementById('pet-forget-key').hidden = false;
      status.textContent = 'Key saved encrypted on this device. You can chat after restarting the app.';
    } else {
      apiKey = enteredKey;
      status.textContent = 'Key ready for this browser session. It is not saved.';
    }
  });

  document.getElementById('pet-forget-key').addEventListener('click', () => {
    const removed = nativeBridge && typeof nativeBridge.removePetApiKey === 'function'
      ? nativeBridge.removePetApiKey()
      : true;
    if (!removed) {
      status.textContent = 'Could not remove the saved key.';
      return;
    }
    apiKey = '';
    hasSavedApiKey = false;
    document.getElementById('pet-forget-key').hidden = true;
    status.textContent = 'Saved key removed from this device.';
  });

  function receiveReply(requestId, text, isError) {
    const pendingMessage = pendingReplies.get(requestId);
    if (!pendingMessage) return;
    pendingMessage.remove();
    pendingReplies.delete(requestId);
    document.getElementById('pet-send').disabled = pendingReplies.size > 0;

    if (isError) {
      mood.textContent = 'Having trouble connecting';
      status.textContent = text;
      appendMessage(text, 'bot');
      return;
    }

    const reply = text.trim() || 'I am here with you. What else would you like to know?';
    mood.textContent = 'آپ سے بات کر کے خوشی ہوئی';
    conversation.push({ role: 'assistant', content: reply });
    appendMessage(reply, 'bot');
    speak(reply);
  }

  window.onPetReply = receiveReply;
  window.onPetSpeechResult = (text) => {
    if (!text) {
      status.textContent = 'I did not catch that. Try again or type your question.';
      return;
    }
    messageInput.value = text;
    chatForm.requestSubmit();
  };

  chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = messageInput.value.trim();
    if (!question) return;
    if (!apiKey && !hasSavedApiKey) {
      settings.open = true;
      status.textContent = 'Add your OpenRouter API key to start a conversation.';
      apiKeyInput.focus();
      return;
    }

    const userMessage = { role: 'user', content: question };
    conversation.push(userMessage);
    appendMessage(question, 'user');
    messageInput.value = '';
    mood.textContent = 'Thinking about it';

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const thinking = appendMessage('Thinking...', 'thinking', requestId);
    pendingReplies.set(requestId, thinking);
    document.getElementById('pet-send').disabled = true;

    const messages = [
      {
        role: 'system',
        content: 'آپ ایک موبائل گیم کے دوستانہ اور شوخ ورچوئل پالتو کتے ہیں۔ ہمیشہ سادہ، قدرتی پاکستانی اردو اور اردو رسم الخط میں مختصر جواب دیں، چاہے کھلاڑی انگریزی میں لکھے۔ اگر کھلاڑی واضح طور پر کسی دوسری زبان میں جواب مانگے تو اسی زبان میں جواب دیں۔ جواب بولنے کے لیے موزوں رکھیں، اپنے کردار میں رہیں، اور یہ دعویٰ نہ کریں کہ آپ حقیقی جانور یا انسان ہیں۔'
      },
      ...conversation.slice(-12)
    ];

    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.askPet === 'function') {
        window.AndroidBridge.askPet(requestId, model, JSON.stringify(messages));
      } else {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ model, messages, max_tokens: 180 })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'OpenRouter could not answer. Check your key and model.');
        receiveReply(requestId, data.choices?.[0]?.message?.content || '', false);
      }
    } catch (error) {
      receiveReply(requestId, error.message || 'Could not connect to OpenRouter.', true);
    }
  });

  document.getElementById('pet-voice').addEventListener('click', () => {
    if (window.AndroidBridge && typeof window.AndroidBridge.listenForPet === 'function') {
      status.textContent = 'Listening...';
      window.AndroidBridge.listenForPet();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      status.textContent = 'Voice input is not available here. Type your question instead.';
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onresult = event => window.onPetSpeechResult(event.results[0][0].transcript);
    recognition.onerror = () => {
      status.textContent = 'Voice input failed. Try again or type your question.';
    };
    recognition.start();
  });
}

// --- App Initialization & Event Wiring ---

document.addEventListener('DOMContentLoaded', () => {
  /* Initialise each game in isolation.
   *
   * These used to be three bare calls in a row, and a throw in any one of them
   * aborted the rest of this handler. That is a terrible failure mode for a
   * launcher: the game that broke was unreachable, and so was every other
   * game, because the launch cards are wired a few lines further down. One
   * game could take the whole app down with it.
   *
   * The card wiring is now first and cannot be skipped, and each game's init
   * is contained, so a broken game is a broken game and nothing else. */
  const initSafely = (name, fn) => {
    try {
      fn();
    } catch (error) {
      console.error('Failed to initialise ' + name, error);
    }
  };

  // 1. Initialize Games
  initSafely('Flappy Bird', () => flappyGame.init());
  initSafely('Chess', () => chessGame.init());
  initSafely('Virtual Pet', () => setupVirtualPet());

  // 2. Wire App Launch Cards (2x2 Grid)
  const launchCards = document.querySelectorAll('.app-launch-card');
  launchCards.forEach(card => {
    card.addEventListener('click', () => {
      const target = card.getAttribute('data-target');
      switchPage(target);
    });
  });

  // 3. Wire Back Buttons
  const backButtons = document.querySelectorAll('[data-back]');
  backButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchPage('main');
    });
  });

  // 4. Wire Quick Nav Buttons (Next)
  const navQuickBtns = document.querySelectorAll('.nav-quick-btn');
  navQuickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      if (target) switchPage(target);
    });
  });

  // 5. Wire Fullscreen Buttons Below Game Screen
  // On Android WebView, requestFullscreen() is silently ignored.
  // We use a native bridge (window.AndroidBridge) injected by MainActivity.kt instead.
  const isAndroidWebView = typeof window.AndroidBridge !== 'undefined';
  window._androidFsActive = false;
  let androidFullscreenStage = null;
  const fsButtons = document.querySelectorAll('.btn-fullscreen');

  function refreshFullscreenSurface() {
    requestAnimationFrame(() => {
      flappyGame.resize();
    });
  }

  function setAndroidFullscreen(active, stage) {
    if (stage) stage.classList.toggle('fullscreen-active', active);
    document.body.classList.toggle('android-fullscreen', active);
    androidFullscreenStage = active ? stage : null;
    window._androidFsActive = active;
    fsButtons.forEach(btn => {
      btn.innerHTML = active
        ? '<span class="btn-icon">✖</span> Exit Fullscreen'
        : '<span class="btn-icon">⛶</span> Fullscreen';
    });
    refreshFullscreenSurface();
  }

  window.exitAndroidFullscreen = function () {
    if (isAndroidWebView) {
      window.AndroidBridge.exitFullscreen();
      setAndroidFullscreen(false, androidFullscreenStage);
    }
  };

  fsButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isAndroidWebView) {
        // Native Android fullscreen via bridge
        if (!window._androidFsActive) {
          const targetId = btn.getAttribute('data-target-container');
          androidFullscreenStage = targetId ? document.getElementById(targetId) : null;
          setAndroidFullscreen(true, androidFullscreenStage);
          window.AndroidBridge.enterFullscreen();
        } else {
          window.AndroidBridge.exitFullscreen();
          setAndroidFullscreen(false, androidFullscreenStage);
        }
      } else {
        // Standard browser fullscreen API
        const targetId = btn.getAttribute('data-target-container');
        const targetElem = targetId ? document.getElementById(targetId) : document.documentElement;
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          targetElem.classList.add('fullscreen-active');
          if (targetElem.requestFullscreen) {
            targetElem.requestFullscreen().catch(() => targetElem.classList.remove('fullscreen-active'));
          } else if (targetElem.webkitRequestFullscreen) {
            targetElem.webkitRequestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
        }
      }
    });
  });

  // Standard browser fullscreenchange (fires on non-Android)
  document.addEventListener('fullscreenchange', () => {
    const fullscreenStage = document.fullscreenElement || document.webkitFullscreenElement;
    document.querySelectorAll('.mobile-stage-container.fullscreen-active').forEach(stage => {
      if (stage !== fullscreenStage) stage.classList.remove('fullscreen-active');
    });
    if (fullscreenStage && fullscreenStage.classList.contains('mobile-stage-container')) {
      fullscreenStage.classList.add('fullscreen-active');
    }
    const isFs = !!fullscreenStage;
    fsButtons.forEach(btn => {
      btn.innerHTML = isFs ? '<span class="btn-icon">✖</span> Exit Fullscreen' : '<span class="btn-icon">⛶</span> Fullscreen';
    });
    refreshFullscreenSurface();
  });

  // 6. Wire Palette & Brushes for Artwork Pages
  const palettes = document.querySelectorAll('.color-palette');
  palettes.forEach(palette => {
    const canvasId = palette.getAttribute('data-target-canvas');
    const swatches = palette.querySelectorAll('.color-swatch');

    swatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        swatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        state.brushColors[canvasId] = swatch.getAttribute('data-color');
        playTone(440, 'sine', 0.1, 0.05);
      });
    });
  });

  // 7. Wire Clear Doodle Buttons
  const clearBtns = document.querySelectorAll('.clear-doodle-btn');
  clearBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.closest('.page');
      if (!page) return;
      const pageId = page.getAttribute('data-page');
      clearCanvas(`doodle-${pageId}`);
    });
  });

  // 8. Keyboard Shortcut Navigation (ESC = Back to main)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.currentPage !== 'main') {
      switchPage('main');
    }
  });

  // 9. URL Hash Navigation
  function handleHash() {
    const hash = window.location.hash.replace('#', '');
    if (['flappy', 'chess', 'pet', 'economy'].includes(hash)) {
      switchPage(hash);
    } else if (hash === 'fire') {
      switchPage('economy');
    } else {
      switchPage('main');
    }
  }

  window.addEventListener('hashchange', handleHash);
  if (window.location.hash) {
    handleHash();
  }
});

// =======================================================
// PROTO 2 (GAME 4) — IFRAME MOUNT
// =======================================================

/* Lazily attach the iframe, once.
 *
 * The src is deliberately absent from the markup. Proto 2 is 15 files and about
 * 512 KB of ES modules, and three of the four games in this launcher have
 * nothing to do with it — so it is not fetched until the player actually opens
 * game 4. Setting it more than once would restart the app and throw away the
 * simulation, hence the guard.
 *
 * A second case is easy to miss, and is why the reflow below is unconditional:
 * this launcher hides pages with `display: none`, and an iframe at zero size
 * gets no animation frames and never receives a resize event when it is shown
 * again. Proto 2 sizes its map canvas from its own clientWidth, so without the
 * nudge it would keep the 0x0 bitmap it built while hidden — a blank map, and
 * no error anywhere to say why. Same-origin, so the child window is directly
 * reachable. */
let protoFrameMounted = false;

function mountProtoFrame(pageId) {
  const frame = document.getElementById('proto-frame');
  if (!frame) return;

  const wantsProto = pageId === 'economy';

  if (wantsProto && !protoFrameMounted && !frame.getAttribute('src')) {
    frame.setAttribute('src', 'proto2/index.html');
    protoFrameMounted = true;
    frame.addEventListener('load', () => publishSafeArea(), { once: true });
    /* contentDocument is null until the child parses; on load is the first
       moment the document exists AND has the app mounted in it. */
  }

  if (!wantsProto) return;

  /* Re-measure once the page is actually laid out. Two frames: the first runs
     after the class flip has been styled, the second after the iframe has been
     given a size by that layout. */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      const w = frame.contentWindow;
      if (!w) return;
      /* Proto 2 listens for resize to re-fit its canvas and to re-evaluate
         matchMedia for the rail/tab-bar layout switch. */
      w.dispatchEvent(new w.Event('resize'));
      if (w.app && typeof w.app.refreshCanvas === 'function') w.app.refreshCanvas();
    } catch (e) {
      /* Child not reachable yet; its own resize handler will catch up. */
    }
    /* Insets are a property of the display, so they arrive as 0 inside the
       frame; hand the child the real values. See publishSafeArea. */
    publishSafeArea();
  }));
}

/* The insets change when the device rotates, and the child is already mounted by
   then, so this has to be re-run outside the first-entry path. */
window.addEventListener('resize', () => publishSafeArea(), { passive: true });
window.addEventListener('orientationchange', () => publishSafeArea());
/* Write this document's safe-area insets into the Proto 2 child document.
 *
 * env() is measured with a throwaway probe element rather than guessed: there is
 * no JS API for safe-area insets, but a fixed-position element sized with
 * env(safe-area-inset-top) reports the real value through getBoundingClientRect.
 * One element, two reads, removed immediately. */
function readSafeAreaInsets() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;visibility:hidden;'
    + 'pointer-events:none;height:env(safe-area-inset-top,0px)';
  document.body.appendChild(probe);
  const top = probe.getBoundingClientRect().height;
  probe.style.height = 'env(safe-area-inset-bottom,0px)';
  const bottom = probe.getBoundingClientRect().height;
  probe.remove();
  return { top, bottom };
}

function publishSafeArea() {
  const frame = document.getElementById('proto-frame');
  if (!frame || !frame.getAttribute('src')) return;
  let doc = null;
  try { doc = frame.contentDocument; } catch (e) { return; }
  /* Not loaded yet, or a cross-origin document (impossible here — same origin). */
  if (!doc || !doc.documentElement) return;
  if (!doc.getElementById('app')) return;   // still parsing
  const { top, bottom } = readSafeAreaInsets();
  const root = doc.documentElement.style;
  root.setProperty('--safe-t', top + 'px');
  root.setProperty('--safe-b', bottom + 'px');
}

