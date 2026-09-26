// =======================================================
// 4 Games by Alex - Logic & Mobile Interactions
// Fast, lightweight, solid filled chess pieces & castling
// =======================================================

// --- State Management ---
const state = {
  currentPage: 'main',
  soundEnabled: true,
  brushColors: {
    'doodle-solar': '#818cf8',
    'doodle-fire': '#ff5722'
  },
  brushSizes: {
    'doodle-solar': 5,
    'doodle-fire': 5
  }
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
    solar: [220.00, 293.66, 440.00],
    fire: [196.00, 246.94, 293.66]
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

  if (targetPageId === 'flappy') {
    flappyGame.resume();
    requestAnimationFrame(() => flappyGame.resize());
  } else {
    flappyGame.pause();
  }

  if (['solar', 'fire'].includes(targetPageId)) {
    setTimeout(() => {
      setupCanvas(`doodle-${targetPageId}`);
    }, 50);
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

    this.showOverlay('flappy-start-screen');
    this.hideOverlay('flappy-gameover-screen');
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
    const maxHeight = this.height - this.groundHeight - this.pipeGap - minHeight;
    const topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
    const bottomY = topHeight + this.pipeGap;

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
// CHESS GAME ENGINE WITH CASTLING SUPPORT
// =======================================================

const chessGame = {
  board: [],
  currentTurn: 'w',
  selectedSquare: null,
  validMoves: [],
  capturedWhite: [],
  capturedBlack: [],
  moveCount: 0,
  lastMove: null,

  init() {
    this.boardEl = document.getElementById('chessboard');
    this.turnPill = document.getElementById('chess-turn-pill');
    this.turnText = document.getElementById('turn-text');
    this.moveCountEl = document.getElementById('chess-move-count');
    this.capturedWhiteEl = document.getElementById('captured-white');
    this.capturedBlackEl = document.getElementById('captured-black');

    const resetBtn = document.getElementById('btn-reset-chess');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.reset();
        playChessMoveSound(false);
      });
    }

    this.reset();
  },

  reset() {
    // Initial 8x8 setup with hasMoved: false for castling tracking
    this.board = [
      [ {t:'r',c:'b',hasMoved:false}, {t:'n',c:'b',hasMoved:false}, {t:'b',c:'b',hasMoved:false}, {t:'q',c:'b',hasMoved:false}, {t:'k',c:'b',hasMoved:false}, {t:'b',c:'b',hasMoved:false}, {t:'n',c:'b',hasMoved:false}, {t:'r',c:'b',hasMoved:false} ],
      [ {t:'p',c:'b',hasMoved:false}, {t:'p',c:'b',hasMoved:false}, {t:'p',c:'b',hasMoved:false}, {t:'p',c:'b',hasMoved:false}, {t:'p',c:'b',hasMoved:false}, {t:'p',c:'b',hasMoved:false}, {t:'p',c:'b',hasMoved:false}, {t:'p',c:'b',hasMoved:false} ],
      [ null, null, null, null, null, null, null, null ],
      [ null, null, null, null, null, null, null, null ],
      [ null, null, null, null, null, null, null, null ],
      [ null, null, null, null, null, null, null, null ],
      [ {t:'p',c:'w',hasMoved:false}, {t:'p',c:'w',hasMoved:false}, {t:'p',c:'w',hasMoved:false}, {t:'p',c:'w',hasMoved:false}, {t:'p',c:'w',hasMoved:false}, {t:'p',c:'w',hasMoved:false}, {t:'p',c:'w',hasMoved:false}, {t:'p',c:'w',hasMoved:false} ],
      [ {t:'r',c:'w',hasMoved:false}, {t:'n',c:'w',hasMoved:false}, {t:'b',c:'w',hasMoved:false}, {t:'q',c:'w',hasMoved:false}, {t:'k',c:'w',hasMoved:false}, {t:'b',c:'w',hasMoved:false}, {t:'n',c:'w',hasMoved:false}, {t:'r',c:'w',hasMoved:false} ]
    ];

    this.currentTurn = 'w';
    this.selectedSquare = null;
    this.validMoves = [];
    this.capturedWhite = [];
    this.capturedBlack = [];
    this.moveCount = 0;
    this.lastMove = null;

    this.updateUI();
    this.render();
  },

  updateUI() {
    if (this.turnPill) {
      this.turnPill.className = `chess-turn-pill ${this.currentTurn === 'w' ? 'white-turn' : 'black-turn'}`;
    }
    if (this.turnText) {
      this.turnText.textContent = this.currentTurn === 'w' ? "White's move" : "Black's move";
    }
    if (this.moveCountEl) {
      this.moveCountEl.textContent = this.moveCount.toString();
    }

    if (this.capturedWhiteEl) {
      this.capturedWhiteEl.innerHTML = this.capturedWhite
        .map(p => `<span class="captured-icon">${getPieceSvg(p.t, 'w')}</span>`).join('');
    }
    if (this.capturedBlackEl) {
      this.capturedBlackEl.innerHTML = this.capturedBlack
        .map(p => `<span class="captured-icon">${getPieceSvg(p.t, 'b')}</span>`).join('');
    }
  },

  render() {
    if (!this.boardEl) return;
    this.boardEl.innerHTML = '';

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        const isLight = (r + c) % 2 === 0;
        sq.className = `chess-square ${isLight ? 'sq-w' : 'sq-b'}`;
        sq.dataset.row = r;
        sq.dataset.col = c;

        if (this.selectedSquare && this.selectedSquare.r === r && this.selectedSquare.c === c) {
          sq.classList.add('selected');
        }

        if (this.lastMove && ((this.lastMove.from.r === r && this.lastMove.from.c === c) ||
                              (this.lastMove.to.r === r && this.lastMove.to.c === c))) {
          sq.classList.add('last-move');
        }

        const moveTarget = this.validMoves.find(m => m.r === r && m.c === c);
        if (moveTarget) {
          sq.classList.add(moveTarget.isCapture ? 'valid-capture' : 'valid-move');
        }

        const piece = this.board[r][c];
        if (piece) {
          const pDiv = document.createElement('div');
          pDiv.className = `chess-piece piece-${piece.c}`;
          pDiv.innerHTML = getPieceSvg(piece.t, piece.c);
          sq.appendChild(pDiv);
        }

        sq.addEventListener('click', () => this.handleSquareClick(r, c));
        this.boardEl.appendChild(sq);
      }
    }
  },

  handleSquareClick(r, c) {
    const piece = this.board[r][c];

    if (this.selectedSquare) {
      const targetMove = this.validMoves.find(m => m.r === r && m.c === c);
      if (targetMove) {
        this.makeMove(this.selectedSquare, { r, c }, targetMove);
        return;
      }
    }

    if (piece && piece.c === this.currentTurn) {
      if (this.selectedSquare && this.selectedSquare.r === r && this.selectedSquare.c === c) {
        this.selectedSquare = null;
        this.validMoves = [];
      } else {
        this.selectedSquare = { r, c };
        this.validMoves = this.calculateValidMoves(r, c, piece);
      }
      this.render();
      return;
    }

    this.selectedSquare = null;
    this.validMoves = [];
    this.render();
  },

  calculateValidMoves(r, c, piece) {
    const moves = [];
    const color = piece.c;
    const enemy = color === 'w' ? 'b' : 'w';

    const addMoveIfValid = (nr, nc) => {
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) return false;
      const dest = this.board[nr][nc];
      if (!dest) {
        moves.push({ r: nr, c: nc, isCapture: false });
        return true;
      } else if (dest.c === enemy) {
        moves.push({ r: nr, c: nc, isCapture: true });
        return false;
      }
      return false;
    };

    // 1. Pawn
    if (piece.t === 'p') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;

      if (r + dir >= 0 && r + dir < 8 && !this.board[r + dir][c]) {
        moves.push({ r: r + dir, c: c, isCapture: false });
        if (r === startRow && !this.board[r + 2 * dir][c]) {
          moves.push({ r: r + 2 * dir, c: c, isCapture: false });
        }
      }

      [-1, 1].forEach(dc => {
        const nr = r + dir;
        const nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const target = this.board[nr][nc];
          if (target && target.c === enemy) {
            moves.push({ r: nr, c: nc, isCapture: true });
          }
        }
      });
    }

    // 2. Knight
    if (piece.t === 'n') {
      const offsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      offsets.forEach(([dr, dc]) => addMoveIfValid(r + dr, c + dc));
    }

    // 3. Bishop
    if (piece.t === 'b' || piece.t === 'q') {
      const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      dirs.forEach(([dr, dc]) => {
        let nr = r + dr;
        let nc = c + dc;
        while (addMoveIfValid(nr, nc)) {
          nr += dr;
          nc += dc;
        }
      });
    }

    // 4. Rook
    if (piece.t === 'r' || piece.t === 'q') {
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      dirs.forEach(([dr, dc]) => {
        let nr = r + dr;
        let nc = c + dc;
        while (addMoveIfValid(nr, nc)) {
          nr += dr;
          nc += dc;
        }
      });
    }

    // 5. King (Includes Castling)
    if (piece.t === 'k') {
      const offsets = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
      ];
      offsets.forEach(([dr, dc]) => addMoveIfValid(r + dr, c + dc));

      // --- CASTLING RULES ---
      if (!piece.hasMoved) {
        // Kingside Castling (O-O) -> King moves 2 squares right to column 6
        if (!this.board[r][5] && !this.board[r][6]) {
          const rookK = this.board[r][7];
          if (rookK && rookK.t === 'r' && rookK.c === color && !rookK.hasMoved) {
            moves.push({ r, c: 6, isCapture: false, isCastle: 'kingside' });
          }
        }

        // Queenside Castling (O-O-O) -> King moves 2 squares left to column 2
        if (!this.board[r][1] && !this.board[r][2] && !this.board[r][3]) {
          const rookQ = this.board[r][0];
          if (rookQ && rookQ.t === 'r' && rookQ.c === color && !rookQ.hasMoved) {
            moves.push({ r, c: 2, isCapture: false, isCastle: 'queenside' });
          }
        }
      }
    }

    return moves;
  },

  makeMove(from, to, moveInfo) {
    const piece = this.board[from.r][from.c];
    const target = this.board[to.r][to.c];
    const isCapture = !!target;
    let isCastle = false;

    // Handle captures
    if (target) {
      if (target.c === 'w') {
        this.capturedBlack.push(target);
      } else {
        this.capturedWhite.push(target);
      }
    }

    // Handle Castling
    if (piece.t === 'k' && (moveInfo?.isCastle || Math.abs(to.c - from.c) === 2)) {
      isCastle = true;
      if (to.c === 6) {
        // Kingside: Move Rook from 7 to 5
        const rook = this.board[from.r][7];
        this.board[from.r][5] = rook;
        this.board[from.r][7] = null;
        if (rook) rook.hasMoved = true;
      } else if (to.c === 2) {
        // Queenside: Move Rook from 0 to 3
        const rook = this.board[from.r][0];
        this.board[from.r][3] = rook;
        this.board[from.r][0] = null;
        if (rook) rook.hasMoved = true;
      }
    }

    // Pawn auto-promotion to Queen
    if (piece.t === 'p' && (to.r === 0 || to.r === 7)) {
      piece.t = 'q';
    }

    // Move King / Piece
    piece.hasMoved = true;
    this.board[to.r][to.c] = piece;
    this.board[from.r][from.c] = null;

    this.lastMove = { from, to };
    this.moveCount++;
    this.currentTurn = this.currentTurn === 'w' ? 'b' : 'w';

    this.selectedSquare = null;
    this.validMoves = [];

    // Audio feedback
    playChessMoveSound(isCapture, isCastle);

    this.updateUI();
    this.render();
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

// --- App Initialization & Event Wiring ---

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Games
  flappyGame.init();
  chessGame.init();

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
      if (state.currentPage === 'solar' || state.currentPage === 'fire') {
        setupCanvas(`doodle-${state.currentPage}`);
      }
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

  // 8. Sound FX Toggle
  const soundToggle = document.getElementById('sound-toggle');
  if (soundToggle) {
    soundToggle.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      soundToggle.querySelector('.sound-icon').textContent = state.soundEnabled ? '🔊' : '🔇';
      soundToggle.style.opacity = state.soundEnabled ? '1' : '0.6';
      if (state.soundEnabled) playTone(440, 'sine', 0.15, 0.1);
    });
  }

  // 9. Keyboard Shortcut Navigation (ESC = Back to main)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.currentPage !== 'main') {
      switchPage('main');
    }
  });

  // 10. URL Hash Navigation
  function handleHash() {
    const hash = window.location.hash.replace('#', '');
    if (['flappy', 'chess', 'solar', 'fire'].includes(hash)) {
      switchPage(hash);
    } else {
      switchPage('main');
    }
  }

  window.addEventListener('hashchange', handleHash);
  if (window.location.hash) {
    handleHash();
  }
});
