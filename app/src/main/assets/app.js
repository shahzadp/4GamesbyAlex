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
  const isWhite = color === 'w';
  // Solid, rich fills: Solid white #ffffff for white, deep charcoal black #1e293b for black
  const fill = isWhite ? '#ffffff' : '#1e293b';
  const stroke = isWhite ? '#1e293b' : '#f8fafc';
  const accent = isWhite ? '#cbd5e1' : '#475569';

  if (type === 'p') {
    return `<svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  if (type === 'n') {
    return `<svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>
      <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>
      <circle cx="15.5" cy="14" r="1.5" fill="${stroke}"/>
    </svg>`;
  }
  if (type === 'b') {
    return `<svg viewBox="0 0 45 45" width="100%" height="100%">
      <g fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/>
        <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/>
        <circle cx="22.5" cy="8" r="2.5"/>
        <path d="M17.5 26h10M22.5 21v10" stroke="${stroke}"/>
      </g>
    </svg>`;
  }
  if (type === 'r') {
    return `<svg viewBox="0 0 45 45" width="100%" height="100%">
      <g fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 39h27v-3H9v3zm3-3v-4h21v4H12zm2.5-4l1.5-16h18l1.5 16H14.5zM11 16h23v-5h-4v2h-4v-2h-6v2h-4v-2h-5v5z"/>
      </g>
    </svg>`;
  }
  if (type === 'q') {
    return `<svg viewBox="0 0 45 45" width="100%" height="100%">
      <g fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
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
    return `<svg viewBox="0 0 45 45" width="100%" height="100%">
      <g fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
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
  // 'local' = both sides played by the human, 'stockfish' = engine plays black.
  mode: 'local',
  botEnabled: false,
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

    this.reset();
  },

  reset() {
    this.state = chessInitialState();
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
    if (this.botEnabled) this.maybeBotMove();
  },

  // --- Rendering --------------------------------------------------------

  render() {
    if (!this.boardEl) return;
    const frag = document.createDocumentFragment();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        sq.className = 'chess-square ' + (((r + c) % 2 === 0) ? 'sq-w' : 'sq-b');
        sq.dataset.row = String(r);
        sq.dataset.col = String(c);

        if (this.selected && this.selected.r === r && this.selected.c === c) {
          sq.classList.add('selected');
        }

        const target = this.legalForSelected.find(m => m.to.r === r && m.to.c === c);
        if (target) {
          if (target.isEnPassant) sq.classList.add('valid-capture');
          else if (target.isCastle) sq.classList.add('valid-castle');
          else if (target.captured) sq.classList.add('valid-capture');
          else sq.classList.add('valid-move');
        }

        if (this.pendingPromotion && this.pendingPromotion.r === r && this.pendingPromotion.c === c) {
          sq.classList.add('valid-capture');
        }

        const king = this.state.board[r][c];
        if (king && king.t === 'k' && this.kingInCheck === king.c) {
          sq.classList.add('in-check');
        }

        const piece = this.state.board[r][c];
        if (piece) {
          const pDiv = document.createElement('div');
          pDiv.className = 'chess-piece piece-' + piece.c;
          pDiv.innerHTML = getPieceSvg(piece.t, piece.c);
          sq.appendChild(pDiv);
        }

        // Bound the listener's closure to this square only.
        sq.addEventListener('click', () => this.onSquareClick(r, c));
        frag.appendChild(sq);
      }
    }

    this.boardEl.innerHTML = '';
    this.boardEl.appendChild(frag);
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

    if (this.capturedWhiteEl) {
      this.capturedWhiteEl.innerHTML = this.capturedWhite
        .map(p => '<span class="captured-icon">' + getPieceSvg(p.t, 'w') + '</span>').join('');
    }
    if (this.capturedBlackEl) {
      this.capturedBlackEl.innerHTML = this.capturedBlack
        .map(p => '<span class="captured-icon">' + getPieceSvg(p.t, 'b') + '</span>').join('');
    }

    if (this.moveLogEl) {
      const rows = [];
      for (let i = 0; i < this.moveLog.length; i += 2) {
        const num = Math.floor(i / 2) + 1;
        const w = this.moveLog[i] || '';
        const b = this.moveLog[i + 1] || '';
        rows.push('<div class="movelog-row"><span class="movelog-num">' + num +
                  '.</span><span class="movelog-san">' + w + '</span>' +
                  '<span class="movelog-san">' + b + '</span></div>');
      }
      this.moveLogEl.innerHTML = rows.join('') || '<div class="movelog-empty">No moves yet</div>';
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
  // does not play.
  humanSide() {
    return this.botEnabled ? 'w' : this.state.turn;
  },

  onSquareClick(r, c) {
    if (this.botThinking) return;
    // Guard against a stale pending promotion: if the turn moved on while the
    // picker was open, drop it rather than letting it capture the next click.
    if (this.pendingPromotion && this.state.turn !== this.humanSide()) {
      this.pendingPromotion = null;
      this.hidePromotion();
    }
    if (this.state.turn !== this.humanSide()) return;
    if (chessGameStatus(this.state) !== 'ongoing' && chessGameStatus(this.state) !== 'check') return;

    const side = this.humanSide();

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
        '<span class="promo-piece">' + getPieceSvg(k, this.humanSide()) + '</span>' +
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
    this.maybeBotMove();
  },

  // --- Stockfish bot ----------------------------------------------------

  // Two explicit modes rather than a single on/off toggle. The old button
  // could only express "bot on" or "bot off", which made 2-player play look
  // like an absence of a feature rather than a real choice.
  //   'local' - both sides played by the human on this device
  //   'stockfish' - human plays white, engine plays black
  setMode(mode) {
    const wantBot = mode === 'stockfish';

    if (this.mode === mode && this.botEnabled === wantBot) {
      this.updateModeUI();
      return;
    }

    // Releasing the human's current selection avoids leaving a stale
    // highlight from the other side's turn on the board.
    this.selected = null;
    this.legalForSelected = [];
    this.pendingPromotion = null;
    this.hidePromotion();

    this.mode = mode;
    this.botEnabled = wantBot;

    if (!wantBot) {
      this.botThinking = false;
      this.setStatus('');
      this.updateModeUI();
      this.updateUI();
      this.render();
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

    this.setStatus('Loading Stockfish 19...');
    this.updateModeUI();
    chessEngine.load().then(() => {
      this.setStatus('Stockfish 19 ready');
      this.maybeBotMove();
    }).catch(err => {
      this.setStatus('Engine failed to load: ' + err.message + '. Playing two-player.');
      this.mode = 'local';
      this.botEnabled = false;
      this.updateModeUI();
      this.updateUI();
      this.render();
    });
  },

  updateModeUI() {
    const isBot = this.mode === 'stockfish';

    // Segmented control.
    if (this.modeLocalBtn) {
      this.modeLocalBtn.classList.toggle('active', !isBot);
      this.modeLocalBtn.setAttribute('aria-selected', !isBot ? 'true' : 'false');
    }
    if (this.modeBotBtn) {
      this.modeBotBtn.classList.toggle('active', isBot);
      this.modeBotBtn.setAttribute('aria-selected', isBot ? 'true' : 'false');
    }
    if (this.modeLabel) {
      this.modeLabel.textContent = isBot ? 'Playing Stockfish 19' : '2-player';
    }

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
    if (!chessEngine.ready) return;
    if (this.state.turn !== this.botSide) return;

    const status = chessGameStatus(this.state);
    if (status === 'checkmate' || status === 'stalemate') return;

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
     `bark` = head/face, `giggle` = torso, `boop` = nose, `flap` = ears, `wag` = tail. */
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

  function showPetReaction(text) {
    if (dogBubbleText) dogBubbleText.textContent = text;
  }

  function reactToDog(name) {
    const reaction = DOG_REACTIONS[name];
    if (!dogSvg || !reaction) return;
    showPetReaction(reaction.text);
    dogSvg.setAttribute('class', '');
    void dogSvg.getBoundingClientRect();
    dogSvg.setAttribute('class', 'r ' + name);
    window.clearTimeout(dogReactionTimer);
    dogReactionTimer = window.setTimeout(() => dogSvg.setAttribute('class', ''), reaction.ms);
  }

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
      utterance.lang = 'ur-PK';
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

  avatar.addEventListener('click', (event) => {
    const now = Date.now();
    tapChain = now - lastPetTap < 950 ? tapChain + 1 : 1;
    lastPetTap = now;

    const bounds = avatar.getBoundingClientRect();
    const relativeX = (event.clientX - bounds.left) / bounds.width;
    const zone = resolveTouchZone(event.target, event.clientX, event.clientY);
    let reply;

    if (tapChain >= 3) {
      tapChain = 0;
      petCare.joy = clampNeed(petCare.joy + 16);
      petCare.energy = clampNeed(petCare.energy - 7);
      petCare.fullness = clampNeed(petCare.fullness - 3);
      petCare.bond += 2;
      reply = 'واہ! زومیز کا وقت! آپ کے ساتھ کھیلنا مزے کا ہے!';
      animatePet('play');
      showPetReaction('زومیز!');
    } else {
      petCare.joy = clampNeed(petCare.joy + 8);
      petCare.energy = clampNeed(petCare.energy - 1);
      petCare.bond++;
      const touchReplies = {
        bark: 'سر پر پیار! مجھے بہت اچھا لگتا ہے۔',
        giggle: 'گدگدی ہو رہی ہے! ہاہاہا!',
        boop: 'نک پر چھو! مجھے چٹکی لگی!',
        flap: 'کان ہلاتے ہیں! بھڑ بھڑ!',
        wag: 'پیٹھ ہل رہی ہے! خوشی سے!'
      };
      reply = touchReplies[zone] || touchReplies.bark;
      animatePet('pet');
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
  });

  document.querySelectorAll('[data-pet-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.petAction;
      let reply;

      if (action === 'feed') {
        if (petCare.fullness >= 94) {
          reply = 'شکریہ! میرا پیٹ ابھی بھرا ہوا ہے۔';
          showPetReaction('پیٹ بھر گیا!');
          animatePet('pet');
        } else {
          petCare.fullness = clampNeed(petCare.fullness + 26);
          petCare.joy = clampNeed(petCare.joy + 5);
          petCare.bond++;
          reply = 'واہ، مزے دار ناشتہ! آپ کا شکریہ۔';
          showPetReaction('نَم نَم!');
          animatePet('feeding');
        }
      } else if (action === 'play') {
        if (petCare.energy < 20) {
          reply = 'میں کھیلنا چاہتا ہوں، مگر پہلے تھوڑا آرام کروں؟';
          showPetReaction('تھوڑا آرام؟');
          animatePet('pet');
        } else {
          petCare.energy = clampNeed(petCare.energy - 15);
          petCare.fullness = clampNeed(petCare.fullness - 5);
          petCare.joy = clampNeed(petCare.joy + 23);
          petCare.bond += 2;
          reply = 'پکڑو! گیند واپس پھینکیں، پھر سے کھیلتے ہیں!';
          showPetReaction('گیند پکڑو!');
          animatePet('play');
        }
      } else {
        if (petCare.energy >= 96) {
          reply = 'میں بالکل چاق و چوبند ہوں! آپ کے ساتھ کھیلنے کو تیار ہوں۔';
          showPetReaction('توانائی پوری!');
          animatePet('pet');
        } else {
          petCare.energy = clampNeed(petCare.energy + 32);
          petCare.joy = clampNeed(petCare.joy + 3);
          petCare.bond++;
          reply = 'آنکھیں بند کر کے تھوڑی سی پیاری نیند لیتا ہوں۔';
          showPetReaction('میٹھی نیند…');
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
    recognition.lang = 'ur-PK';
    recognition.onresult = event => window.onPetSpeechResult(event.results[0][0].transcript);
    recognition.onerror = () => {
      status.textContent = 'Voice input failed. Try again or type your question.';
    };
    recognition.start();
  });
}

// --- App Initialization & Event Wiring ---

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Games
  flappyGame.init();
  chessGame.init();
  setupVirtualPet();

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
