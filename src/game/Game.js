import { COLORS, FIELD, WORLD } from './config.js';
import { clamp, easeOutBack } from './core/math.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.viewport = { width: 0, height: 0, scale: 1, offsetX: 0, offsetY: 0 };
    this.time = 0;
    this.lastTime = 0;
    this.running = false;
    this.state = 'splash';
    this.hover = { x: WORLD.width / 2, y: WORLD.height / 2 };
    this.boundResize = () => this.resize();
    this.boundPointerDown = (event) => this.onPointerDown(event);
    this.boundContextMenu = (event) => event.preventDefault();

    window.addEventListener('resize', this.boundResize);
    this.canvas.addEventListener('pointerdown', this.boundPointerDown);
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
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
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

  onPointerDown(event) {
    event.preventDefault();
    this.hover = this.toWorld(event);
    if (this.state === 'splash') {
      this.state = 'preview';
    }
  }

  tick(now) {
    if (!this.running) return;
    const dt = clamp((now - this.lastTime) / 1000, 0, 1 / 20);
    this.lastTime = now;
    this.time += dt;
    this.draw();
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  beginDraw() {
    const { ctx, pixelRatio, viewport } = this;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.fillStyle = '#06182f';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    ctx.translate(viewport.offsetX, viewport.offsetY);
    ctx.scale(viewport.scale, viewport.scale);
  }

  draw() {
    this.beginDraw();
    this.drawStadium();
    this.drawPitch();
    this.drawPreviewPlayers();
    if (this.state === 'splash') this.drawSplash();
    else this.drawComingAlive();
  }

  drawStadium() {
    const { ctx } = this;
    const glow = ctx.createRadialGradient(640, 340, 120, 640, 360, 690);
    glow.addColorStop(0, '#2d78bb');
    glow.addColorStop(0.58, '#123c72');
    glow.addColorStop(1, '#07172d');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    ctx.fillStyle = '#0a2448';
    ctx.beginPath();
    ctx.roundRect(25, 24, 1230, 672, 58);
    ctx.fill();

    for (let row = 0; row < 4; row += 1) {
      for (let x = 42; x < 1240; x += 18) {
        const wave = Math.sin(x * 0.07 + row * 2.1 + this.time * 1.8);
        ctx.fillStyle = [COLORS.white, COLORS.red, COLORS.brightBlue, COLORS.gold][(Math.floor(x / 18) + row) % 4];
        ctx.globalAlpha = 0.3 + (wave + 1) * 0.16;
        ctx.beginPath();
        ctx.arc(x, 42 + row * 13, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, 664 + row * 12, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawPitch() {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top, 16);
    ctx.clip();
    const stripeWidth = (FIELD.right - FIELD.left) / 10;
    for (let i = 0; i < 10; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? COLORS.grassA : COLORS.grassB;
      ctx.fillRect(FIELD.left + stripeWidth * i, FIELD.top, stripeWidth + 1, FIELD.bottom - FIELD.top);
    }
    const fieldGlow = ctx.createLinearGradient(0, FIELD.top, 0, FIELD.bottom);
    fieldGlow.addColorStop(0, 'rgba(255,255,255,0.08)');
    fieldGlow.addColorStop(0.5, 'rgba(255,255,255,0)');
    fieldGlow.addColorStop(1, 'rgba(0,40,20,0.16)');
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
    this.drawGoal(FIELD.left, 1);
    this.drawGoal(FIELD.right, -1);
  }

  drawPenaltyArea(goalX, direction) {
    const { ctx } = this;
    const width = 178;
    const height = 300;
    const x = direction > 0 ? goalX : goalX - width;
    ctx.strokeStyle = COLORS.chalk;
    ctx.lineWidth = 4;
    ctx.strokeRect(x, FIELD.centerY - height / 2, width, height);
    const smallWidth = 68;
    const smallHeight = 178;
    const smallX = direction > 0 ? goalX : goalX - smallWidth;
    ctx.strokeRect(smallX, FIELD.centerY - smallHeight / 2, smallWidth, smallHeight);
  }

  drawGoal(goalX, direction) {
    const { ctx } = this;
    const top = FIELD.centerY - FIELD.goalWidth / 2;
    const x = direction > 0 ? goalX - FIELD.goalDepth : goalX;
    ctx.fillStyle = 'rgba(235,247,255,0.2)';
    ctx.fillRect(x, top, FIELD.goalDepth, FIELD.goalWidth);
    ctx.strokeStyle = '#eef7ff';
    ctx.lineWidth = 5;
    ctx.strokeRect(x, top, FIELD.goalDepth, FIELD.goalWidth);
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.55;
    for (let y = top + 16; y < top + FIELD.goalWidth; y += 16) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + FIELD.goalDepth, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawPreviewPlayers() {
    const bob = Math.sin(this.time * 2.4) * 3;
    this.drawPlayer(420, 365 + bob, COLORS.white, COLORS.navy, COLORS.violet, true);
    this.drawPlayer(790, 260 - bob, '#ffd84d', '#1c4d9b', '#704322', false);
    this.drawPlayer(845, 470 + bob, '#ffd84d', '#1c4d9b', '#b16d42', false);
    this.drawBall(525, 395 + Math.sin(this.time * 3.2) * 2, 1);
  }

  drawPlayer(x, y, shirt, shorts, skin, violet = false) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    const shadowScale = 1 + Math.sin(this.time * 3 + x) * 0.04;
    ctx.fillStyle = 'rgba(3,24,25,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 21, 19 * shadowScale, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = skin;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, -1);
    ctx.lineTo(-20, 8);
    ctx.moveTo(9, -1);
    ctx.lineTo(19, 10);
    ctx.stroke();

    ctx.strokeStyle = shorts;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(-6, 16);
    ctx.lineTo(-10, 31);
    ctx.moveTo(6, 16);
    ctx.lineTo(11, 31);
    ctx.stroke();

    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.roundRect(-17, -17, 34, 38, 10);
    ctx.fill();
    ctx.strokeStyle = violet ? COLORS.red : 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-13, -5);
    ctx.lineTo(13, -5);
    ctx.stroke();

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -28, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = violet ? '#4e2b1e' : '#3a241c';
    ctx.beginPath();
    ctx.arc(0, -31, 13, Math.PI, Math.PI * 2);
    ctx.fill();
    if (violet) {
      ctx.fillStyle = COLORS.violet;
      ctx.beginPath();
      ctx.arc(12, -27, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.gold;
      ctx.font = '900 15px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('6', 0, 12);
    }
    ctx.restore();
  }

  drawBall(x, y, scale = 1) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(4,22,28,0.25)';
    ctx.beginPath();
    ctx.ellipse(3, 12, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fffdf3';
    ctx.strokeStyle = '#152035';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.navy;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(6, -2);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawSplash() {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(4,18,48,0.6)';
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = COLORS.white;
    ctx.font = '900 64px "Avenir Next", system-ui, sans-serif';
    ctx.fillText("VIOLET'S", WORLD.width / 2, 190);
    ctx.fillStyle = COLORS.gold;
    ctx.font = '1000 88px "Avenir Next", system-ui, sans-serif';
    ctx.fillText('USA SOCCER', WORLD.width / 2, 275);
    ctx.shadowBlur = 0;

    const pulse = 1 + Math.sin(this.time * 4) * 0.045;
    ctx.save();
    ctx.translate(WORLD.width / 2, 438);
    ctx.scale(pulse, pulse);
    const button = ctx.createLinearGradient(0, -56, 0, 56);
    button.addColorStop(0, '#ffef72');
    button.addColorStop(1, '#ffbd32');
    ctx.fillStyle = button;
    ctx.strokeStyle = '#fff7bd';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.navy;
    ctx.beginPath();
    ctx.moveTo(-14, -27);
    ctx.lineTo(34, 0);
    ctx.lineTo(-14, 27);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = COLORS.white;
    ctx.globalAlpha = 0.88;
    ctx.font = '800 24px "Avenir Next", system-ui, sans-serif';
    ctx.fillText('TAP TO PLAY', WORLD.width / 2, 535);
    ctx.globalAlpha = 1;
  }

  drawComingAlive() {
    const { ctx } = this;
    const elapsed = Math.min(1, (this.time % 2.5) / 0.65);
    const pop = easeOutBack(elapsed);
    ctx.save();
    ctx.translate(WORLD.width / 2, 60);
    ctx.scale(pop, pop);
    ctx.fillStyle = 'rgba(5,28,66,0.92)';
    ctx.beginPath();
    ctx.roundRect(-178, -34, 356, 68, 25);
    ctx.fill();
    ctx.fillStyle = COLORS.white;
    ctx.font = '900 29px "Avenir Next", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THE MATCH IS COMING ALIVE', 0, 10);
    ctx.restore();
  }
}

