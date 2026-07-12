import { COLORS, FIELD, OPPONENTS, WORLD } from './config.js';
import { clamp, distance, easeOutBack } from './core/math.js';
import { SoundEngine } from './core/SoundEngine.js';
import { Match } from './match/Match.js';

const STORAGE_OPPONENT = 'violet_soccer_opponent';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.viewport = { width: 0, height: 0, scale: 1, offsetX: 0, offsetY: 0 };
    this.time = 0;
    this.lastTime = 0;
    this.running = false;
    this.screen = 'splash';
    this.match = null;
    const storedOpponent = Number(localStorage.getItem(STORAGE_OPPONENT) ?? 0);
    this.selectedOpponent = Number.isFinite(storedOpponent) ? clamp(storedOpponent, 0, OPPONENTS.length - 1) : 0;
    this.pointer = null;
    this.targetMarker = null;
    this.aimPoint = null;
    this.highlightPlayerId = null;
    this.particles = [];
    this.camera = { shake: 0, zoom: 1, focusX: WORLD.width / 2, focusY: WORLD.height / 2 };
    this.netRipple = null;
    this.introTimer = 0;
    this.result = null;
    this.sound = new SoundEngine();
    this.stadiumImage = new Image();
    this.stadiumImage.src = `${import.meta.env.BASE_URL}assets/images/stadium-panorama.webp`;
    this.tutorial = { step: 'move', completed: new Set(), voiced: new Set(), lastCueAt: 0 };
    this.lastPraiseAt = -Infinity;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    this.boundResize = () => this.resize();
    this.boundPointerDown = (event) => this.onPointerDown(event);
    this.boundPointerMove = (event) => this.onPointerMove(event);
    this.boundPointerUp = (event) => this.onPointerUp(event);
    this.boundPointerCancel = (event) => this.onPointerCancel(event);
    this.boundContextMenu = (event) => event.preventDefault();
    this.boundVisibility = () => {
      this.lastTime = performance.now();
    };

    window.addEventListener('resize', this.boundResize);
    document.addEventListener('visibilitychange', this.boundVisibility);
    this.canvas.addEventListener('pointerdown', this.boundPointerDown);
    this.canvas.addEventListener('pointermove', this.boundPointerMove);
    this.canvas.addEventListener('pointerup', this.boundPointerUp);
    this.canvas.addEventListener('pointercancel', this.boundPointerCancel);
    this.canvas.addEventListener('contextmenu', this.boundContextMenu);
    this.resize();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.boundResize);
    document.removeEventListener('visibilitychange', this.boundVisibility);
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    this.canvas.removeEventListener('pointermove', this.boundPointerMove);
    this.canvas.removeEventListener('pointerup', this.boundPointerUp);
    this.canvas.removeEventListener('pointercancel', this.boundPointerCancel);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
    this.sound.stopMatchAmbience();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.pixelRatio));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.pixelRatio));
    const scale = Math.min(rect.width / WORLD.width, rect.height / WORLD.height);
    this.viewport = {
      width: rect.width,
      height: rect.height,
      scale,
      offsetX: (rect.width - WORLD.width * scale) / 2,
      offsetY: (rect.height - WORLD.height * scale) / 2,
    };
  }

  toWorld(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - this.viewport.offsetX) / this.viewport.scale,
      y: (event.clientY - rect.top - this.viewport.offsetY) / this.viewport.scale,
    };
  }

  toCssDistance(worldDistance) {
    return worldDistance * this.viewport.scale;
  }

  onPointerDown(event) {
    event.preventDefault();
    if (this.pointer) return;
    this.sound.unlock();
    const point = this.toWorld(event);
    this.pointer = { id: event.pointerId, start: point, current: point, mode: 'none', targetId: null };
    this.canvas.setPointerCapture?.(event.pointerId);

    if (this.hitMute(point)) {
      this.pointer.mode = 'mute';
      return;
    }
    if (this.screen === 'splash') {
      this.handleSplashDown(point);
      return;
    }
    if (this.screen === 'result') {
      this.handleResultDown(point);
      return;
    }
    if (this.screen === 'match') this.handleMatchDown(point);
  }

  onPointerMove(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    event.preventDefault();
    const point = this.toWorld(event);
    this.pointer.current = point;
    if (this.pointer.mode === 'move' && this.match?.isLive) {
      this.match.setMoveTarget(point.x, point.y, { tracking: null });
      this.targetMarker = { x: point.x, y: point.y, life: 0.5 };
    } else if (this.pointer.mode === 'aim') {
      this.aimPoint = point;
    }
  }

  onPointerUp(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    event.preventDefault();
    const point = this.toWorld(event);
    const pointer = this.pointer;
    if (pointer.mode === 'mute') {
      if (this.hitMute(point)) this.sound.toggleMuted();
    } else if (pointer.mode === 'pass' && this.screen === 'match') {
      if (this.match.passTo(pointer.targetId)) {
        this.completeTutorialStep('pass');
      }
    } else if (pointer.mode === 'goal-shot' && this.screen === 'match') {
      if (this.match.shootAt(point.y, 0.92)) {
        this.completeTutorialStep('shoot');
      }
    } else if (pointer.mode === 'aim' && this.screen === 'match') {
      const dx = point.x - pointer.start.x;
      const dy = point.y - pointer.start.y;
      const dragCss = Math.hypot(dx, dy) * this.viewport.scale;
      if (dragCss >= 28 && dx > 4) {
        const ball = this.match.ball;
        const travelX = Math.max(1, FIELD.right - ball.x);
        const targetY = ball.y + (dy / dx) * travelX;
        const strength = clamp(dragCss / 130, 0.78, 1.08);
        if (this.match.shootAt(targetY, strength)) {
          this.completeTutorialStep('shoot');
        }
      }
    } else if (pointer.mode === 'splash-play' && this.screen === 'splash') {
      if (this.hitPlayButton(point)) this.beginMatch();
    } else if (pointer.mode === 'opponent' && this.screen === 'splash') {
      const index = this.hitOpponentCard(point);
      if (index === pointer.targetId) this.selectOpponent(index);
    } else if (pointer.mode === 'rematch' && this.screen === 'result') {
      if (this.hitRematch(point)) this.beginMatch();
    } else if (pointer.mode === 'home' && this.screen === 'result') {
      if (this.hitHome(point)) this.showSplash();
    }
    this.clearPointer();
  }

  onPointerCancel(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    this.clearPointer();
  }

  clearPointer() {
    this.pointer = null;
    this.aimPoint = null;
    this.highlightPlayerId = null;
  }

  handleSplashDown(point) {
    const opponentIndex = this.hitOpponentCard(point);
    if (opponentIndex !== -1) {
      this.pointer.mode = 'opponent';
      this.pointer.targetId = opponentIndex;
      this.selectOpponent(opponentIndex);
      return;
    }
    if (this.hitPlayButton(point)) {
      this.pointer.mode = 'splash-play';
      this.sound.play('ui');
    }
  }

  handleResultDown(point) {
    if (this.hitRematch(point)) {
      this.pointer.mode = 'rematch';
      this.sound.play('ui');
    } else if (this.hitHome(point)) {
      this.pointer.mode = 'home';
      this.sound.play('ui');
    }
  }

  handleMatchDown(point) {
    if (!this.match || this.introTimer > 0) return;
    if (this.match.state === 'goal') {
      if (this.match.celebrationTimer < (this.match.lastScoringTeam === 'usa' ? 3.4 : 2)) {
        this.match.celebrationTimer = Math.min(this.match.celebrationTimer, 0.2);
      }
      return;
    }
    if (!this.match.isLive) return;

    const active = this.match.activePlayer;
    const ball = this.match.ball;
    const ballOwner = ball.owner;
    const worldHitRadius = Math.max(42, 48 / Math.max(0.5, this.viewport.scale));

    if (ballOwner?.team === 'usa' && ballOwner === active) {
      const teammate = this.findTouchedTeammate(point, worldHitRadius);
      if (teammate) {
        this.pointer.mode = 'pass';
        this.pointer.targetId = teammate.id;
        this.highlightPlayerId = teammate.id;
        this.spawnRing(teammate.x, teammate.y, COLORS.gold, 0.45);
        return;
      }
      if (this.hitOpponentGoal(point)) {
        this.pointer.mode = 'goal-shot';
        this.aimPoint = point;
        return;
      }
      if (distance(point, ball) <= worldHitRadius) {
        this.pointer.mode = 'aim';
        this.aimPoint = point;
        return;
      }
    }

    let tracking = null;
    if (ballOwner?.team === 'opponent' && distance(point, ballOwner) <= worldHitRadius * 1.15) tracking = ballOwner.id;
    else if (!ballOwner && distance(point, ball) <= worldHitRadius * 1.2) tracking = 'ball';
    this.pointer.mode = 'move';
    this.match.setMoveTarget(point.x, point.y, { tracking });
    this.targetMarker = { x: point.x, y: point.y, life: 0.62 };
    this.completeTutorialStep('move');
    this.sound.play('ui');
  }

  findTouchedTeammate(point, radius) {
    const active = this.match.activePlayer;
    return this.match.usaPlayers
      .filter((player) => player.role === 'field' && player !== active)
      .map((player) => ({ player, distance: distance(player, point) }))
      .filter((entry) => entry.distance <= radius)
      .sort((a, b) => a.distance - b.distance)[0]?.player ?? null;
  }

  beginMatch() {
    const params = new URLSearchParams(window.location.search);
    const duration = clamp(Number(params.get('duration') ?? 300), 15, 300);
    const seed = Number(params.get('seed') ?? Date.now());
    this.match = new Match({ duration, seed, opponentIndex: this.selectedOpponent });
    this.match.start();
    this.screen = 'match';
    this.result = null;
    this.introTimer = this.reducedMotion ? 0.6 : 1.25;
    this.tutorial = { step: 'move', completed: new Set(), voiced: new Set(), lastCueAt: this.time };
    this.lastPraiseAt = -Infinity;
    this.particles.length = 0;
    this.camera = { shake: 0, zoom: 1, focusX: WORLD.width / 2, focusY: WORLD.height / 2 };
    this.sound.startMatchAmbience();
    this.sound.speak('letsGoUsa');
  }

  showSplash() {
    this.screen = 'splash';
    this.match = null;
    this.result = null;
    this.particles.length = 0;
    this.clearPointer();
    this.sound.stopMatchAmbience();
  }

  selectOpponent(index) {
    this.selectedOpponent = index;
    localStorage.setItem(STORAGE_OPPONENT, String(index));
    this.sound.play('ui');
  }

  completeTutorialStep(step) {
    this.tutorial.completed.add(step);
    if (step === 'move' && this.tutorial.step === 'move') this.tutorial.step = 'pass';
    if (step === 'pass' && this.tutorial.step === 'pass') this.tutorial.step = 'shoot';
    if (step === 'shoot') this.tutorial.step = 'done';
    this.tutorial.lastCueAt = this.time;
  }

  hitMute(point) {
    return point.x >= 1192 && point.y <= 83;
  }

  hitPlayButton(point) {
    return Math.hypot(point.x - 640, point.y - 505) <= 72;
  }

  opponentCardRect(index) {
    const width = 172;
    const gap = 22;
    const total = OPPONENTS.length * width + (OPPONENTS.length - 1) * gap;
    return { x: (WORLD.width - total) / 2 + index * (width + gap), y: 582, width, height: 94 };
  }

  hitOpponentCard(point) {
    for (let index = 0; index < OPPONENTS.length; index += 1) {
      const rect = this.opponentCardRect(index);
      if (point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height) return index;
    }
    return -1;
  }

  hitOpponentGoal(point) {
    return point.x >= FIELD.right - 35 && point.y >= FIELD.centerY - FIELD.goalWidth / 2 - 30 && point.y <= FIELD.centerY + FIELD.goalWidth / 2 + 30;
  }

  hitRematch(point) {
    return Math.hypot(point.x - 640, point.y - 510) <= 74;
  }

  hitHome(point) {
    return Math.hypot(point.x - 770, point.y - 525) <= 48;
  }

  tick(now) {
    if (!this.running) return;
    const dt = document.hidden ? 0 : clamp((now - this.lastTime) / 1000, 0, 1 / 20);
    this.lastTime = now;
    this.time += dt;
    this.update(dt);
    this.draw();
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  update(dt) {
    if (this.screen === 'match' && this.match) {
      this.introTimer = Math.max(0, this.introTimer - dt);
      if (this.introTimer <= 0) this.match.update(dt);
      for (const event of this.match.drainEvents()) this.handleMatchEvent(event);
      this.updateTutorialAudio();
    }
    if (this.targetMarker) {
      this.targetMarker.life -= dt;
      if (this.targetMarker.life <= 0) this.targetMarker = null;
    }
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.rotation += particle.spin * dt;
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    this.camera.shake = Math.max(0, this.camera.shake - dt * 2.4);
    this.camera.zoom += (1 - this.camera.zoom) * Math.min(1, dt * 2.5);
    if (this.netRipple) {
      this.netRipple.life -= dt;
      if (this.netRipple.life <= 0) this.netRipple = null;
    }
  }

  handleMatchEvent(event) {
    if (event.type === 'kick') {
      this.sound.play(event.kind === 'pass' ? 'pass' : 'kick');
      const ball = this.match.ball;
      this.spawnTurf(ball.x, ball.y, event.team === 'usa' ? COLORS.brightBlue : COLORS.gold);
      if (event.kind === 'shot' && !this.reducedMotion) this.camera.shake = 0.18;
      if (event.kind === 'pass' && event.team === 'usa' && this.time - this.lastPraiseAt > 8) {
        this.sound.speak('greatPass');
        this.lastPraiseAt = this.time;
      }
    } else if (event.type === 'save') {
      this.sound.play('save');
      this.spawnStars(this.match.ball.x, this.match.ball.y, event.team === 'usa' ? COLORS.brightBlue : COLORS.gold, 8);
      if (event.team === 'usa' && this.time - this.lastPraiseAt > 7) {
        this.sound.speak('greatSave');
        this.lastPraiseAt = this.time;
      }
    } else if (event.type === 'whistle') {
      this.sound.play('whistle');
    } else if (event.type === 'goal') {
      this.sound.play('goal');
      this.netRipple = { side: event.team === 'usa' ? 'right' : 'left', life: 1.15, maxLife: 1.15 };
      if (event.team === 'usa') {
        this.sound.speak('goalUsa');
        this.spawnConfetti(110);
        if (!this.reducedMotion) {
          this.camera.shake = 0.8;
          this.camera.zoom = 1.1;
          const scorer = this.match.findPlayer(event.scorerId) ?? this.match.activePlayer;
          if (scorer) {
            this.camera.focusX = scorer.x;
            this.camera.focusY = scorer.y;
          }
        }
      } else {
        this.spawnConfetti(24, this.match.opponent.kit.shirt);
      }
    } else if (event.type === 'match-finished') {
      this.result = event;
      this.sound.speak(event.result === 'win' ? 'usaWins' : 'greatPlaying');
      window.setTimeout(() => {
        if (this.screen === 'match' && this.match?.state === 'finished') {
          this.screen = 'result';
          this.spawnConfetti(event.result === 'win' ? 160 : 55);
        }
      }, this.reducedMotion ? 200 : 850);
    }
  }

  updateTutorialAudio() {
    if (!this.match?.isLive || this.introTimer > 0 || this.tutorial.step === 'done') return;
    if (this.time - this.tutorial.lastCueAt < 0.85 || this.tutorial.voiced.has(this.tutorial.step)) return;
    const keys = { move: 'tapGrass', pass: 'tapTeammate', shoot: 'tapGoal' };
    const key = keys[this.tutorial.step];
    if (!key) return;
    if (this.tutorial.step === 'pass' && this.match.ball.owner?.team !== 'usa') return;
    if (this.tutorial.step === 'shoot' && (this.match.ball.owner?.team !== 'usa' || this.match.ball.x < FIELD.centerX - 80)) return;
    this.sound.speak(key);
    this.tutorial.voiced.add(this.tutorial.step);
  }

  spawnRing(x, y, color, life = 0.6) {
    this.particles.push({ kind: 'ring', x, y, vx: 0, vy: 0, gravity: 0, life, maxLife: life, color, rotation: 0, spin: 0 });
  }

  spawnTurf(x, y, color) {
    for (let i = 0; i < 7; i += 1) {
      const angle = Math.PI + (Math.random() - 0.5) * 1.2;
      const speed = 45 + Math.random() * 90;
      this.particles.push({
        kind: 'spark', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 15,
        gravity: 170, life: 0.32 + Math.random() * 0.22, maxLife: 0.55, color,
        rotation: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 9,
      });
    }
  }

  spawnStars(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 55 + Math.random() * 80;
      this.particles.push({
        kind: 'star', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        gravity: 80, life: 0.65, maxLife: 0.65, color,
        rotation: angle, spin: 5,
      });
    }
  }

  spawnConfetti(count, forcedColor = null) {
    const palette = forcedColor ? [forcedColor, '#ffffff'] : [COLORS.red, COLORS.white, COLORS.brightBlue, COLORS.gold, COLORS.violet];
    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        kind: 'confetti', x: 80 + Math.random() * 1120, y: -20 - Math.random() * 150,
        vx: (Math.random() - 0.5) * 95, vy: 95 + Math.random() * 150,
        gravity: 85, life: 2.5 + Math.random() * 2, maxLife: 4.5,
        color: palette[i % palette.length], rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 10,
      });
    }
  }

  beginDraw() {
    const { ctx, pixelRatio, viewport } = this;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.fillStyle = '#06182f';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    if (this.stadiumImage.complete && this.stadiumImage.naturalWidth > 0) {
      const imageScale = Math.max(
        viewport.width / this.stadiumImage.naturalWidth,
        viewport.height / this.stadiumImage.naturalHeight,
      );
      const drawWidth = this.stadiumImage.naturalWidth * imageScale;
      const drawHeight = this.stadiumImage.naturalHeight * imageScale;
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.drawImage(
        this.stadiumImage,
        (viewport.width - drawWidth) / 2,
        (viewport.height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
      ctx.fillStyle = 'rgba(3, 20, 48, 0.44)';
      ctx.fillRect(0, 0, viewport.width, viewport.height);
      ctx.restore();
    }
    ctx.translate(viewport.offsetX, viewport.offsetY);
    ctx.scale(viewport.scale, viewport.scale);
  }

  applyCamera() {
    const { ctx, camera } = this;
    const shakeAmount = this.reducedMotion ? 0 : camera.shake * 8;
    const shakeX = (Math.random() - 0.5) * shakeAmount;
    const shakeY = (Math.random() - 0.5) * shakeAmount;
    ctx.translate(WORLD.width / 2 + shakeX, WORLD.height / 2 + shakeY);
    ctx.scale(camera.zoom, camera.zoom);
    const focusWeight = clamp((camera.zoom - 1) / 0.12, 0, 1);
    ctx.translate(-WORLD.width / 2 - (camera.focusX - WORLD.width / 2) * focusWeight, -WORLD.height / 2 - (camera.focusY - WORLD.height / 2) * focusWeight);
  }

  draw() {
    this.beginDraw();
    this.ctx.save();
    this.applyCamera();
    this.drawStadium();
    this.drawPitch();
    if (this.screen === 'match' || this.screen === 'result') this.drawMatchScene();
    else this.drawSplashPlayers();
    this.drawParticles(false);
    this.ctx.restore();

    if (this.screen === 'splash') this.drawSplashOverlay();
    else if (this.screen === 'match') this.drawMatchOverlay();
    else this.drawResultOverlay();
    this.drawParticles(true);
    this.drawMuteButton();
  }

  drawStadium() {
    const { ctx } = this;
    const glow = ctx.createRadialGradient(640, 310, 100, 640, 355, 720);
    glow.addColorStop(0, '#4a91c6');
    glow.addColorStop(0.55, '#173f72');
    glow.addColorStop(1, '#06162c');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    if (this.stadiumImage.complete && this.stadiumImage.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.stadiumImage, 0, 0, this.stadiumImage.naturalWidth, this.stadiumImage.naturalHeight, 0, 0, WORLD.width, WORLD.height);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(4, 25, 59, 0.32)';
    ctx.beginPath();
    ctx.roundRect(24, 20, 1232, 680, 58);
    ctx.fill();

    for (let row = 0; row < 4; row += 1) {
      for (let x = 42; x < 1240; x += 17) {
        const wave = Math.sin(x * 0.07 + row * 2.1 + this.time * 2.2);
        const palette = [COLORS.white, COLORS.red, COLORS.brightBlue, COLORS.gold];
        ctx.fillStyle = palette[(Math.floor(x / 17) + row) % palette.length];
        ctx.globalAlpha = 0.28 + (wave + 1) * 0.15;
        ctx.beginPath();
        ctx.arc(x, 40 + row * 13, 3.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, 660 + row * 12, 3.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#15355f';
    ctx.fillRect(44, 72, 1192, 17);
    for (let x = 50; x < 1230; x += 70) {
      ctx.fillStyle = Math.floor(x / 70) % 3 === 0 ? COLORS.red : Math.floor(x / 70) % 3 === 1 ? COLORS.white : COLORS.brightBlue;
      ctx.fillRect(x, 76, 52, 8);
    }
  }

  drawPitch() {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.42)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = COLORS.grassA;
    ctx.beginPath();
    ctx.roundRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top, 16);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.clip();
    const stripeWidth = (FIELD.right - FIELD.left) / 10;
    for (let i = 0; i < 10; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? COLORS.grassA : COLORS.grassB;
      ctx.fillRect(FIELD.left + stripeWidth * i, FIELD.top, stripeWidth + 1, FIELD.bottom - FIELD.top);
    }
    const fieldGlow = ctx.createLinearGradient(0, FIELD.top, 0, FIELD.bottom);
    fieldGlow.addColorStop(0, 'rgba(255,255,255,0.1)');
    fieldGlow.addColorStop(0.5, 'rgba(255,255,255,0)');
    fieldGlow.addColorStop(1, 'rgba(0,38,20,0.18)');
    ctx.fillStyle = fieldGlow;
    ctx.fillRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);
    ctx.restore();

    ctx.strokeStyle = COLORS.chalk;
    ctx.lineWidth = 4;
    ctx.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);
    ctx.beginPath();
    ctx.moveTo(FIELD.centerX, FIELD.top);
    ctx.lineTo(FIELD.centerX, FIELD.bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(FIELD.centerX, FIELD.centerY, 75, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.chalk;
    ctx.beginPath();
    ctx.arc(FIELD.centerX, FIELD.centerY, 5, 0, Math.PI * 2);
    ctx.fill();
    this.drawPenaltyArea(FIELD.left, 1);
    this.drawPenaltyArea(FIELD.right, -1);
    this.drawGoal(FIELD.left, 1, false);
    this.drawGoal(FIELD.right, -1, false);
  }

  drawPenaltyArea(goalX, direction) {
    const { ctx } = this;
    const width = 178;
    const height = 300;
    ctx.strokeStyle = COLORS.chalk;
    ctx.lineWidth = 4;
    ctx.strokeRect(direction > 0 ? goalX : goalX - width, FIELD.centerY - height / 2, width, height);
    const smallWidth = 68;
    const smallHeight = 178;
    ctx.strokeRect(direction > 0 ? goalX : goalX - smallWidth, FIELD.centerY - smallHeight / 2, smallWidth, smallHeight);
  }

  drawGoal(goalX, direction, front) {
    const { ctx } = this;
    const top = FIELD.centerY - FIELD.goalWidth / 2;
    const x = direction > 0 ? goalX - FIELD.goalDepth : goalX;
    const side = direction > 0 ? 'left' : 'right';
    const rippleStrength = this.netRipple?.side === side ? this.netRipple.life / this.netRipple.maxLife : 0;
    if (!front) {
      ctx.save();
      if (rippleStrength > 0) {
        const outward = side === 'left' ? -1 : 1;
        ctx.translate(outward * Math.sin(this.time * 24) * rippleStrength * 7, Math.sin(this.time * 18) * rippleStrength * 2.5);
      }
      ctx.fillStyle = 'rgba(235,247,255,0.18)';
      ctx.fillRect(x, top, FIELD.goalDepth, FIELD.goalWidth);
      ctx.strokeStyle = 'rgba(238,247,255,0.58)';
      ctx.lineWidth = 1.4;
      for (let y = top + 15; y < top + FIELD.goalWidth; y += 15) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + FIELD.goalDepth, y);
        ctx.stroke();
      }
      for (let gx = x + 13; gx < x + FIELD.goalDepth; gx += 13) {
        ctx.beginPath();
        ctx.moveTo(gx, top);
        ctx.lineTo(gx, top + FIELD.goalWidth);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      ctx.strokeStyle = '#f7fbff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(goalX, top);
      ctx.lineTo(goalX, top + FIELD.goalWidth);
      ctx.moveTo(x, top);
      ctx.lineTo(x + FIELD.goalDepth, top);
      ctx.moveTo(x, top + FIELD.goalWidth);
      ctx.lineTo(x + FIELD.goalDepth, top + FIELD.goalWidth);
      ctx.stroke();
    }
  }

  drawMatchScene() {
    if (!this.match) return;
    const { ctx } = this;
    if (this.hitOpponentGoal(this.pointer?.current ?? { x: -1, y: -1 }) && this.match.ball.owner?.team === 'usa') {
      ctx.fillStyle = `rgba(255,215,90,${0.12 + Math.sin(this.time * 5) * 0.04})`;
      ctx.fillRect(FIELD.right - 24, FIELD.centerY - FIELD.goalWidth / 2 - 20, FIELD.goalDepth + 48, FIELD.goalWidth + 40);
    }
    const sorted = [...this.match.players].sort((a, b) => a.y - b.y);
    for (const player of sorted) {
      if (player.id === this.highlightPlayerId) {
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 5;
        ctx.globalAlpha = 0.65 + Math.sin(this.time * 8) * 0.2;
        ctx.beginPath();
        ctx.arc(player.x, player.y + 8, 38, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      player.draw(ctx, this.time, 0.94 + ((player.y - FIELD.top) / (FIELD.bottom - FIELD.top)) * 0.12);
    }
    this.match.ball.draw(ctx);
    this.drawGoal(FIELD.left, 1, true);
    this.drawGoal(FIELD.right, -1, true);
    this.drawTargetMarker();
    this.drawAimArrow();
  }

  drawTargetMarker() {
    if (!this.targetMarker) return;
    const { ctx } = this;
    const progress = 1 - this.targetMarker.life / 0.62;
    ctx.save();
    ctx.translate(this.targetMarker.x, this.targetMarker.y);
    ctx.globalAlpha = clamp(this.targetMarker.life * 2, 0, 1);
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 12 + progress * 25, 0, Math.PI * 2);
    ctx.stroke();
    this.drawStarPath(ctx, 0, 0, 12, 6);
    ctx.fillStyle = COLORS.white;
    ctx.fill();
    ctx.restore();
  }

  drawAimArrow() {
    if (!this.pointer || !this.aimPoint || !['aim', 'goal-shot'].includes(this.pointer.mode)) return;
    const { ctx } = this;
    const start = this.match.ball;
    const end = this.pointer.mode === 'goal-shot' ? { x: FIELD.right + 8, y: this.aimPoint.y } : this.aimPoint;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 8) return;
    const nx = dx / length;
    const ny = dy / length;
    const shownLength = clamp(length, 45, 190);
    const targetX = start.x + nx * shownLength;
    const targetY = start.y + ny * shownLength;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo((start.x + targetX) / 2, (start.y + targetY) / 2 - 10, targetX, targetY);
    ctx.stroke();
    ctx.strokeStyle = COLORS.brightBlue;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = COLORS.white;
    ctx.beginPath();
    ctx.moveTo(targetX + nx * 16, targetY + ny * 16);
    ctx.lineTo(targetX - nx * 11 - ny * 13, targetY - ny * 11 + nx * 13);
    ctx.lineTo(targetX - nx * 11 + ny * 13, targetY - ny * 11 - nx * 13);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawSplashPlayers() {
    const bob = Math.sin(this.time * 2.5) * 3;
    this.drawSimplePlayer(415, 344 + bob, TEAM_PREVIEW.usa, '#e1a67c', true);
    this.drawSimplePlayer(855, 344 - bob, OPPONENTS[this.selectedOpponent].kit, '#9e6548', false);
    this.drawSimpleBall(640, 390 + Math.sin(this.time * 3) * 2, 1.25);
  }

  drawSimplePlayer(x, y, kit, skin, violet) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(3,24,25,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 36, 31, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = kit.shorts;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, 20); ctx.lineTo(-14, 43);
    ctx.moveTo(9, 20); ctx.lineTo(14, 43);
    ctx.stroke();
    ctx.strokeStyle = skin;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-18, -5); ctx.lineTo(-31, 12);
    ctx.moveTo(18, -5); ctx.lineTo(31, 11);
    ctx.stroke();
    ctx.fillStyle = kit.shirt;
    ctx.strokeStyle = kit.outline;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-25, -25, 50, 51, 14);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = kit.shoulder;
    ctx.fillRect(-21, -14, 42, 9);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -42, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = violet ? '#5a3427' : '#30211a';
    ctx.beginPath();
    ctx.arc(0, -47, 18, Math.PI, Math.PI * 2);
    ctx.fill();
    if (violet) {
      ctx.fillStyle = COLORS.violet;
      ctx.beginPath(); ctx.arc(17, -42, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.gold;
      ctx.font = '900 20px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('6', 0, 16);
    }
    ctx.restore();
  }

  drawSimpleBall(x, y, scale) {
    const previous = { x: this.match?.ball.x, y: this.match?.ball.y };
    const ball = this.match?.ball;
    if (ball) { ball.x = x; ball.y = y; ball.draw(this.ctx); ball.x = previous.x; ball.y = previous.y; return; }
    const { ctx } = this;
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = '#fffdf3'; ctx.strokeStyle = COLORS.navy; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.navy; this.drawStarPath(ctx, 0, 0, 6, 4); ctx.fill(); ctx.restore();
  }

  drawSplashOverlay() {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(3,16,44,0.36)';
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.36)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = COLORS.white;
    ctx.font = '900 54px "Avenir Next", system-ui, sans-serif';
    ctx.fillText("VIOLET'S", WORLD.width / 2, 145);
    ctx.fillStyle = COLORS.gold;
    ctx.font = '1000 76px "Avenir Next", system-ui, sans-serif';
    ctx.fillText('USA SOCCER', WORLD.width / 2, 218);
    ctx.shadowBlur = 0;

    this.drawUsaShield(317, 315, 0.78);
    ctx.fillStyle = COLORS.white;
    ctx.font = '1000 44px "Avenir Next", system-ui, sans-serif';
    ctx.fillText('VS', 640, 330);
    this.drawFlag(970, 315, OPPONENTS[this.selectedOpponent].flag, 100, 62);

    const pulse = 1 + Math.sin(this.time * 4) * 0.045;
    ctx.save();
    ctx.translate(640, 505); ctx.scale(pulse, pulse);
    const button = ctx.createLinearGradient(0, -60, 0, 60);
    button.addColorStop(0, '#ffef72'); button.addColorStop(1, '#ffbd32');
    ctx.fillStyle = button; ctx.strokeStyle = '#fff7bd'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.navy;
    ctx.beginPath(); ctx.moveTo(-14, -27); ctx.lineTo(34, 0); ctx.lineTo(-14, 27); ctx.closePath(); ctx.fill();
    ctx.restore();

    for (let index = 0; index < OPPONENTS.length; index += 1) this.drawOpponentCard(index);
  }

  drawOpponentCard(index) {
    const { ctx } = this;
    const opponent = OPPONENTS[index];
    const rect = this.opponentCardRect(index);
    const selected = index === this.selectedOpponent;
    ctx.save();
    if (selected) {
      ctx.shadowColor = COLORS.gold; ctx.shadowBlur = 18;
      ctx.fillStyle = '#fff6c6';
    } else ctx.fillStyle = 'rgba(5,28,66,0.82)';
    ctx.strokeStyle = selected ? COLORS.gold : 'rgba(255,255,255,0.38)';
    ctx.lineWidth = selected ? 5 : 2.5;
    ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 22); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    this.drawFlag(rect.x + 42, rect.y + 34, opponent.flag, 58, 37);
    ctx.fillStyle = selected ? COLORS.navy : COLORS.white;
    ctx.font = '900 17px "Avenir Next", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(opponent.label, rect.x + rect.width / 2, rect.y + 76);
    ctx.restore();
  }

  drawMatchOverlay() {
    if (!this.match) return;
    this.drawScoreboard();
    if (this.introTimer > 0) this.drawKickoffIntro();
    else if (this.match.state === 'goal') this.drawGoalBanner();
    else if (this.match.isLive) this.drawTutorialCue();
  }

  drawScoreboard() {
    const { ctx, match } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(4,25,60,0.94)';
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(434, 18, 412, 68, 24); ctx.fill(); ctx.stroke();
    this.drawUsaShield(478, 52, 0.34);
    this.drawFlag(802, 52, match.opponent.flag, 46, 30);
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'center';
    ctx.font = '1000 39px "Avenir Next", system-ui, sans-serif';
    ctx.fillText(`${match.score.usa}  –  ${match.score.opponent}`, 640, 64);
    const minutes = Math.floor(match.timeRemaining / 60);
    const seconds = Math.floor(match.timeRemaining % 60).toString().padStart(2, '0');
    ctx.font = '900 20px ui-monospace, monospace';
    ctx.fillStyle = match.timeRemaining < 30 ? COLORS.gold : 'rgba(255,255,255,0.88)';
    ctx.fillText(`${minutes}:${seconds}`, 640, 34);
    ctx.restore();
  }

  drawKickoffIntro() {
    const { ctx } = this;
    const progress = 1 - this.introTimer / (this.reducedMotion ? 0.6 : 1.25);
    const pop = easeOutBack(clamp(progress * 1.8, 0, 1));
    ctx.save(); ctx.translate(640, 365); ctx.scale(pop, pop);
    ctx.fillStyle = 'rgba(5,28,66,0.92)';
    ctx.beginPath(); ctx.roundRect(-190, -57, 380, 114, 34); ctx.fill();
    ctx.fillStyle = COLORS.white; ctx.font = '1000 46px "Avenir Next", system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('LET’S GO, USA!', 0, 17); ctx.restore();
  }

  drawGoalBanner() {
    const { ctx, match } = this;
    const usa = match.lastScoringTeam === 'usa';
    const elapsed = (usa ? 4.2 : 2.8) - match.celebrationTimer;
    const pop = easeOutBack(clamp(elapsed / 0.38, 0, 1));
    ctx.save(); ctx.translate(640, 170); ctx.scale(pop, pop);
    ctx.fillStyle = usa ? COLORS.gold : match.opponent.kit.shirt;
    ctx.strokeStyle = COLORS.white; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.roundRect(-190, -58, 380, 116, 34); ctx.fill(); ctx.stroke();
    ctx.fillStyle = usa ? COLORS.navy : match.opponent.kit.outline;
    ctx.font = '1000 62px "Avenir Next", system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(usa ? 'GOOOAL!' : 'NICE GOAL!', 0, 22); ctx.restore();
  }

  drawTutorialCue() {
    if (this.tutorial.step === 'done' || this.time - this.tutorial.lastCueAt < 0.7) return;
    const { ctx, match } = this;
    let label;
    let x;
    let y;
    if (this.tutorial.step === 'move') {
      label = 'TAP THE GRASS TO RUN'; x = match.activePlayer.x + 110; y = match.activePlayer.y + 40;
    } else if (this.tutorial.step === 'pass' && match.ball.owner?.team === 'usa') {
      const teammate = match.usaPlayers.find((player) => player.role === 'field' && player !== match.activePlayer);
      if (!teammate) return;
      label = 'TAP A TEAMMATE TO PASS'; x = teammate.x; y = teammate.y;
    } else if (this.tutorial.step === 'shoot' && match.ball.owner?.team === 'usa' && match.ball.x > FIELD.centerX - 80) {
      label = 'TAP THE GOAL OR SWIPE THE BALL'; x = FIELD.right - 20; y = FIELD.centerY;
    } else return;

    const bounce = Math.sin(this.time * 4.5) * 7;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(x, y, 28 + Math.sin(this.time * 5) * 5, 0, Math.PI * 2); ctx.stroke();
    ctx.translate(x + 20, y - 55 + bounce);
    ctx.fillStyle = '#e7ae84'; ctx.strokeStyle = COLORS.navy; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.roundRect(-9, -18, 18, 42, 9); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-18, 8, 32, 24, 11); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.gold; this.drawStarPath(ctx, 12, -21, 7, 3.5); ctx.fill();
    ctx.restore();

    const textY = 112;
    ctx.fillStyle = 'rgba(5,28,66,0.9)';
    ctx.beginPath(); ctx.roundRect(435, textY - 30, 410, 52, 18); ctx.fill();
    ctx.fillStyle = COLORS.white; ctx.font = '900 21px "Avenir Next", system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, 640, textY + 5);
  }

  drawResultOverlay() {
    const { ctx } = this;
    const result = this.result?.result ?? 'draw';
    ctx.fillStyle = 'rgba(3,16,44,0.72)'; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = result === 'win' ? COLORS.gold : COLORS.white;
    ctx.font = '1000 72px "Avenir Next", system-ui, sans-serif';
    ctx.fillText(result === 'win' ? 'USA WINS!' : result === 'draw' ? 'GREAT GAME!' : 'GREAT PLAYING, USA!', 640, 215);
    ctx.fillStyle = COLORS.white; ctx.font = '1000 82px "Avenir Next", system-ui, sans-serif';
    ctx.fillText(`${this.match?.score.usa ?? 0}  –  ${this.match?.score.opponent ?? 0}`, 640, 320);
    this.drawUsaShield(500, 292, 0.62);
    this.drawFlag(780, 292, OPPONENTS[this.selectedOpponent].flag, 86, 54);

    const pulse = 1 + Math.sin(this.time * 4) * 0.04;
    ctx.save(); ctx.translate(640, 510); ctx.scale(pulse, pulse);
    ctx.fillStyle = COLORS.gold; ctx.strokeStyle = COLORS.white; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(0, 0, 67, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.navy;
    ctx.beginPath(); ctx.arc(0, 0, 31, 0, Math.PI * 2); ctx.strokeStyle = COLORS.navy; ctx.lineWidth = 5; ctx.stroke();
    this.drawStarPath(ctx, 0, 0, 17, 9); ctx.fill(); ctx.restore();

    ctx.save(); ctx.translate(770, 525);
    ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.strokeStyle = COLORS.navy; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-34, -2); ctx.lineTo(0, -31); ctx.lineTo(34, -2); ctx.lineTo(27, -2); ctx.lineTo(27, 28); ctx.lineTo(-27, 28); ctx.lineTo(-27, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.red; ctx.beginPath(); ctx.roundRect(-8, 5, 16, 23, 5); ctx.fill();
    ctx.fillStyle = COLORS.brightBlue; ctx.beginPath(); ctx.roundRect(-20, -1, 12, 12, 3); ctx.fill(); ctx.restore();

    ctx.fillStyle = COLORS.white; ctx.font = '900 23px "Avenir Next", system-ui, sans-serif';
    ctx.fillText('PLAY AGAIN', 640, 607);
  }

  drawUsaShield(x, y, scale = 1) {
    const { ctx } = this;
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = COLORS.white; ctx.strokeStyle = COLORS.navy; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-42, -48); ctx.lineTo(42, -48); ctx.lineTo(36, 22); ctx.quadraticCurveTo(0, 58, -36, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.red;
    for (let i = 0; i < 3; i += 1) ctx.fillRect(-29 + i * 23, -9, 12, 49);
    ctx.fillStyle = COLORS.navy; ctx.beginPath(); ctx.roundRect(-36, -42, 72, 30, 7); ctx.fill();
    ctx.fillStyle = COLORS.gold; this.drawStarPath(ctx, 0, -27, 10, 5); ctx.fill();
    ctx.restore();
  }

  drawFlag(x, y, colors, width, height) {
    const { ctx } = this;
    ctx.save(); ctx.translate(x - width / 2, y - height / 2);
    ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.roundRect(0, 0, width, height, 7); ctx.fill(); ctx.clip(); ctx.shadowBlur = 0;
    if (colors.length === 3 && colors[0] === '#229447') {
      ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = colors[1]; ctx.beginPath(); ctx.moveTo(width / 2, 5); ctx.lineTo(width - 7, height / 2); ctx.lineTo(width / 2, height - 5); ctx.lineTo(7, height / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = colors[2]; ctx.beginPath(); ctx.arc(width / 2, height / 2, height * 0.2, 0, Math.PI * 2); ctx.fill();
    } else {
      const bandHeight = height / colors.length;
      colors.forEach((color, index) => { ctx.fillStyle = color; ctx.fillRect(0, index * bandHeight, width, bandHeight + 1); });
    }
    ctx.restore();
  }

  drawMuteButton() {
    const { ctx } = this;
    ctx.save(); ctx.translate(1229, 46);
    ctx.fillStyle = 'rgba(5,28,66,0.88)'; ctx.strokeStyle = 'rgba(255,255,255,0.48)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 33, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.white;
    ctx.beginPath(); ctx.moveTo(-17, -8); ctx.lineTo(-8, -8); ctx.lineTo(3, -18); ctx.lineTo(3, 18); ctx.lineTo(-8, 8); ctx.lineTo(-17, 8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = this.sound.muted ? COLORS.red : COLORS.white; ctx.lineWidth = 4; ctx.lineCap = 'round';
    if (this.sound.muted) {
      ctx.beginPath(); ctx.moveTo(10, -12); ctx.lineTo(25, 12); ctx.moveTo(25, -12); ctx.lineTo(10, 12); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(3, 0, 13, -0.8, 0.8); ctx.stroke();
      ctx.beginPath(); ctx.arc(3, 0, 22, -0.75, 0.75); ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles(overlayOnly) {
    const { ctx } = this;
    for (const particle of this.particles) {
      const overlay = particle.kind === 'confetti';
      if (overlay !== overlayOnly) continue;
      ctx.save(); ctx.translate(particle.x, particle.y); ctx.rotate(particle.rotation);
      ctx.globalAlpha = clamp(particle.life / Math.min(particle.maxLife, 0.45), 0, 1);
      ctx.fillStyle = particle.color; ctx.strokeStyle = particle.color;
      if (particle.kind === 'confetti') ctx.fillRect(-4, -9, 8, 18);
      else if (particle.kind === 'star') { this.drawStarPath(ctx, 0, 0, 8, 4); ctx.fill(); }
      else if (particle.kind === 'ring') {
        const progress = 1 - particle.life / particle.maxLife; ctx.lineWidth = 4; ctx.globalAlpha *= 1 - progress;
        ctx.beginPath(); ctx.arc(0, 0, 12 + progress * 42, 0, Math.PI * 2); ctx.stroke();
      } else { ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawStarPath(ctx, x, y, outer, inner) {
    ctx.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 === 0 ? outer : inner;
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (point === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
}

const TEAM_PREVIEW = {
  usa: {
    shirt: '#f8fbff', shoulder: '#163f86', accent: '#e43b50', shorts: '#17386f',
    socks: '#e43b50', outline: '#071b3a',
  },
};
