import { COLORS, FIELD, MATCH } from '../config.js';
import { clamp } from '../core/math.js';

export class Ball {
  constructor(x = FIELD.centerX, y = FIELD.centerY) {
    this.reset(x, y);
  }

  reset(x = FIELD.centerX, y = FIELD.centerY) {
    this.x = x;
    this.y = y;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.rotation = 0;
    this.owner = null;
    this.lastTouchTeam = null;
    this.intendedReceiverId = null;
    this.pickupLockPlayerId = null;
    this.pickupLockTime = 0;
    this.trail = [];
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  attach(player) {
    if (this.owner && this.owner !== player) this.owner.hasBall = false;
    this.owner = player;
    player.hasBall = true;
    this.lastTouchTeam = player.team;
    this.intendedReceiverId = null;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.z = 0;
  }

  release() {
    if (this.owner) this.owner.hasBall = false;
    this.owner = null;
  }

  kick({ vx, vy, lift = 0, team, receiverId = null }) {
    const kickerId = this.owner?.id ?? null;
    this.release();
    this.vx = vx;
    this.vy = vy;
    this.vz = lift;
    this.lastTouchTeam = team;
    this.intendedReceiverId = receiverId;
    this.pickupLockPlayerId = kickerId;
    this.pickupLockTime = 0.24;
    this.trail.length = 0;
  }

  update(dt) {
    this.pickupLockTime = Math.max(0, this.pickupLockTime - dt);
    if (this.pickupLockTime <= 0) this.pickupLockPlayerId = null;
    if (this.owner) {
      const player = this.owner;
      const movement = Math.hypot(player.vx || 0, player.vy || 0);
      const facingX = Math.cos(player.facing || 0);
      const facingY = Math.sin(player.facing || 0);
      const touchPulse = movement > 12 ? Math.max(0, Math.sin(player.gaitPhase || 0)) * 6 : 0;
      const desiredX = player.x + facingX * (22 + touchPulse);
      const desiredY = player.y + 17 + facingY * (13 + touchPulse * 0.4);
      const follow = 1 - Math.exp(-dt * 18);
      this.x += (desiredX - this.x) * follow;
      this.y += (desiredY - this.y) * follow;
      this.z = Math.max(0, Math.sin(player.gaitPhase || 0) * 2.5);
      this.rotation += movement * dt * 0.035;
      return;
    }

    if (this.speed > 75) {
      this.trail.push({ x: this.x, y: this.y, z: this.z, life: 0.14 });
      if (this.trail.length > 12) this.trail.shift();
    }
    for (const point of this.trail) point.life -= dt;
    this.trail = this.trail.filter((point) => point.life > 0);

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    this.vz -= 470 * dt;
    if (this.z <= 0) {
      this.z = 0;
      if (this.vz < -28) this.vz = -this.vz * 0.34;
      else this.vz = 0;
      const friction = Math.pow(0.984, dt * 60);
      this.vx *= friction;
      this.vy *= friction;
      if (this.speed < 7) {
        this.vx = 0;
        this.vy = 0;
      }
    } else {
      const airDrag = Math.pow(0.996, dt * 60);
      this.vx *= airDrag;
      this.vy *= airDrag;
    }
    this.rotation += this.speed * dt * 0.045;
  }

  draw(ctx) {
    for (const point of this.trail) {
      ctx.globalAlpha = clamp(point.life / 0.14, 0, 1) * 0.42;
      ctx.fillStyle = this.lastTouchTeam === 'usa' ? COLORS.brightBlue : COLORS.gold;
      ctx.beginPath();
      ctx.arc(point.x, point.y - point.z, MATCH.ballRadius * (point.life / 0.14), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const shadowScale = clamp(1 - this.z / 170, 0.45, 1);
    ctx.fillStyle = `rgba(3, 24, 25, ${0.25 * shadowScale})`;
    ctx.beginPath();
    ctx.ellipse(this.x + 3, this.y + 9, 13 * shadowScale, 5 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(this.x, this.y - this.z);
    ctx.rotate(this.rotation);
    ctx.fillStyle = '#fffdf3';
    ctx.strokeStyle = '#12213c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, MATCH.ballRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.navy;
    ctx.beginPath();
    ctx.moveTo(0, -5.8);
    ctx.lineTo(5.5, -1.8);
    ctx.lineTo(3.5, 5);
    ctx.lineTo(-3.5, 5);
    ctx.lineTo(-5.5, -1.8);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 5; i += 1) {
      const angle = i * Math.PI * 0.4 - Math.PI / 2;
      ctx.strokeStyle = '#526078';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 6, Math.sin(angle) * 6);
      ctx.lineTo(Math.cos(angle) * 10.5, Math.sin(angle) * 10.5);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.beginPath();
    ctx.arc(-4, -5, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
