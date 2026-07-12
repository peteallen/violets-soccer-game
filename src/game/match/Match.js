import { FIELD, MATCH, OPPONENTS, TEAM_KITS } from '../config.js';
import { angleDelta, clamp, distance, distanceSquared, normalize, seededRandom } from '../core/math.js';
import { Ball } from '../entities/Ball.js';
import { Player } from '../entities/Player.js';

const USA_NAMES = ['Violet', 'Mia', 'Sofia'];
const OPPONENT_NAMES = ['Luna', 'Nora', 'Camila'];

const FIELD_MARGIN = 23;
const USA_PASS_PROTECTION_SECONDS = 0.9;
export const VIOLET_ID = 'usa-6';

export class Match {
  constructor({ duration = MATCH.durationSeconds, seed = Date.now(), opponentIndex = null } = {}) {
    this.duration = duration;
    this.random = seededRandom(seed);
    const chosen = opponentIndex ?? Math.floor(this.random() * OPPONENTS.length);
    this.opponent = OPPONENTS[chosen % OPPONENTS.length];
    this.events = [];
    this.score = { usa: 0, opponent: 0 };
    this.timeRemaining = duration;
    this.state = 'ready';
    this.celebrationTimer = 0;
    this.restartTimer = 0;
    this.lastScoringTeam = null;
    this.lastScorer = null;
    this.activePlayerId = VIOLET_ID;
    this.possessionGrace = 0;
    this.ownerPressureTime = 0;
    this.ownerPressurePairKey = null;
    this.aiDecisionTimer = 0;
    this.opponentPassCooldown = 0;
    this.usaTeammateDecisionTimer = 0;
    this.usaPassProtectionTime = 0;
    this.pressingOpponentId = null;
    this.opponentBallChaserId = null;
    this.opponentSupportRunnerIds = [];
    this.opponentShotCooldown = 1.5;
    this.usaShotCooldown = 0;
    this.lastUserActionAt = 0;
    this.elapsed = 0;
    this.ball = new Ball();
    this.players = this.createPlayers();
    this.prepareKickoff('usa', true);
  }

  createPlayers() {
    const usaKit = TEAM_KITS.usa;
    const opponentKit = this.opponent.kit;
    return [
      this.makePlayer({ id: 'usa-gk', team: 'usa', role: 'keeper', number: 1, name: 'Keeper', x: 142, y: FIELD.centerY, kit: usaKit, skinTone: '#8d583f', hairStyle: 'bun', hairColor: '#31201a' }),
      this.makePlayer({ id: 'usa-6', team: 'usa', role: 'field', number: 6, name: USA_NAMES[0], x: 390, y: FIELD.centerY, kit: usaKit, skinTone: '#e1a67c', hairStyle: 'ponytail', hairColor: '#5a3427' }),
      this.makePlayer({ id: 'usa-11', team: 'usa', role: 'field', number: 11, name: USA_NAMES[1], x: 430, y: 225, kit: usaKit, skinTone: '#74452f', hairStyle: 'puff', hairColor: '#251812' }),
      this.makePlayer({ id: 'usa-8', team: 'usa', role: 'field', number: 8, name: USA_NAMES[2], x: 430, y: 505, kit: usaKit, skinTone: '#bd7958', hairStyle: 'bob', hairColor: '#3e241c' }),
      this.makePlayer({ id: 'opp-gk', team: 'opponent', role: 'keeper', number: 1, name: 'Keeper', x: 1138, y: FIELD.centerY, kit: opponentKit, skinTone: '#9e6548', hairStyle: 'short', hairColor: '#2e211c' }),
      this.makePlayer({ id: 'opp-10', team: 'opponent', role: 'field', number: 10, name: OPPONENT_NAMES[0], x: 890, y: FIELD.centerY, kit: opponentKit, skinTone: '#d39b76', hairStyle: 'ponytail', hairColor: '#4a2c22' }),
      this.makePlayer({ id: 'opp-7', team: 'opponent', role: 'field', number: 7, name: OPPONENT_NAMES[1], x: 850, y: 225, kit: opponentKit, skinTone: '#673c2c', hairStyle: 'puff', hairColor: '#211612' }),
      this.makePlayer({ id: 'opp-9', team: 'opponent', role: 'field', number: 9, name: OPPONENT_NAMES[2], x: 850, y: 505, kit: opponentKit, skinTone: '#efb68c', hairStyle: 'bob', hairColor: '#70432d' }),
    ];
  }

  makePlayer(options) {
    const kit = options.role === 'keeper'
      ? {
          ...options.kit,
          shirt: options.kit.keeperShirt,
          shorts: options.kit.keeperShorts,
          socks: options.kit.keeperShirt,
          accent: options.kit.accent,
        }
      : options.kit;
    return new Player({
      ...options,
      kit,
      homeX: options.x,
      homeY: options.y,
      targetX: options.x,
      targetY: options.y,
    });
  }

  get usaPlayers() {
    return this.players.filter((player) => player.team === 'usa');
  }

  get opponentPlayers() {
    return this.players.filter((player) => player.team === 'opponent');
  }

  get activePlayer() {
    return this.players.find((player) => player.id === this.activePlayerId) ?? null;
  }

  get teamInPossession() {
    return this.ball.owner?.team ?? null;
  }

  get isLive() {
    return this.state === 'playing';
  }

  start() {
    if (this.state !== 'ready') return;
    this.state = 'playing';
    this.emit('whistle', { kind: 'start' });
  }

  emit(type, detail = {}) {
    this.events.push({ type, ...detail });
  }

  drainEvents() {
    return this.events.splice(0, this.events.length);
  }

  findPlayer(id) {
    return this.players.find((player) => player.id === id) ?? null;
  }

  setMoveTarget(x, y, { tracking = null } = {}) {
    if (!this.isLive) return false;
    const active = this.activePlayer;
    if (!active) return false;
    active.targetX = clamp(x, FIELD.left + FIELD_MARGIN, FIELD.right - FIELD_MARGIN);
    active.targetY = clamp(y, FIELD.top + FIELD_MARGIN, FIELD.bottom - FIELD_MARGIN);
    active.trackingId = tracking;
    active.userCommanded = true;
    this.lastUserActionAt = this.elapsed;
    this.emit('move-command', { x: active.targetX, y: active.targetY, playerId: active.id });
    return true;
  }

  passTo(receiverId) {
    if (!this.isLive) return false;
    const passer = this.ball.owner;
    const receiver = this.findPlayer(receiverId);
    if (!passer || passer.team !== 'usa' || passer.id !== this.activePlayerId) return false;
    if (!receiver || receiver.team !== 'usa' || receiver.role === 'keeper' || receiver === passer) return false;
    const leadSeconds = 0.24;
    const targetX = receiver.x + receiver.vx * leadSeconds;
    const targetY = receiver.y + receiver.vy * leadSeconds;
    const direction = normalize(targetX - this.ball.x, targetY - this.ball.y);
    if (direction.length < 1) return false;
    passer.facing = Math.atan2(direction.y, direction.x);
    passer.action = 'kick';
    passer.actionTime = 0;
    this.ball.kick({
      vx: direction.x * MATCH.passSpeed,
      vy: direction.y * MATCH.passSpeed,
      lift: 42,
      team: 'usa',
      receiverId: receiver.id,
    });
    this.usaPassProtectionTime = USA_PASS_PROTECTION_SECONDS;
    receiver.targetX = targetX;
    receiver.targetY = targetY;
    receiver.trackingId = 'ball';
    this.possessionGrace = 0;
    this.emit('kick', { kind: 'pass', team: 'usa', playerId: passer.id, receiverId });
    this.lastUserActionAt = this.elapsed;
    return true;
  }

  shootAt(targetY, strength = 1) {
    if (!this.isLive) return false;
    const shooter = this.ball.owner;
    if (!shooter || shooter.team !== 'usa' || shooter.id !== this.activePlayerId || this.usaShotCooldown > 0) return false;
    const goalTop = FIELD.centerY - FIELD.goalWidth * 0.47;
    const goalBottom = FIELD.centerY + FIELD.goalWidth * 0.47;
    const assistedY = clamp(targetY, goalTop, goalBottom);
    const direction = normalize(FIELD.right + 34 - this.ball.x, assistedY - this.ball.y);
    const speed = MATCH.shotSpeed * clamp(strength, 0.78, 1.08);
    shooter.facing = Math.atan2(direction.y, direction.x);
    shooter.action = 'kick';
    shooter.actionTime = 0;
    this.ball.kick({ vx: direction.x * speed, vy: direction.y * speed, lift: 74, team: 'usa' });
    this.usaPassProtectionTime = 0;
    this.usaShotCooldown = 0.85;
    this.emit('kick', { kind: 'shot', team: 'usa', playerId: shooter.id });
    this.lastUserActionAt = this.elapsed;
    return true;
  }

  shootAtOpenGoal() {
    const keeper = this.findPlayer('opp-gk');
    const openSide = (keeper?.y ?? FIELD.centerY) <= FIELD.centerY ? 1 : -1;
    const targetY = FIELD.centerY + openSide * FIELD.goalWidth * 0.36;
    return this.shootAt(targetY, 0.98);
  }

  prepareKickoff(team, initial = false) {
    const positions = {
      'usa-gk': [142, FIELD.centerY],
      'usa-6': [505, FIELD.centerY],
      'usa-11': [420, 225],
      'usa-8': [420, 505],
      'opp-gk': [1138, FIELD.centerY],
      'opp-10': [775, FIELD.centerY],
      'opp-7': [730, 225],
      'opp-9': [730, 505],
    };
    for (const player of this.players) {
      const [x, y] = positions[player.id];
      player.x = x;
      player.y = y;
      player.targetX = x;
      player.targetY = y;
      player.vx = 0;
      player.vy = 0;
      player.hasBall = false;
      player.controlled = false;
      player.userCommanded = false;
      player.trackingId = null;
      player.action = 'idle';
      player.actionTime = 0;
    }
    this.ball.reset(FIELD.centerX, FIELD.centerY);
    const ownerId = team === 'usa' ? 'usa-6' : 'opp-10';
    const owner = this.findPlayer(ownerId);
    owner.x = team === 'usa' ? FIELD.centerX - 28 : FIELD.centerX + 28;
    owner.y = FIELD.centerY;
    owner.targetX = owner.x;
    owner.targetY = owner.y;
    owner.facing = team === 'usa' ? 0 : Math.PI;
    this.ball.attach(owner);
    this.syncControlledPlayer();
    this.possessionGrace = initial && team === 'usa' ? 5.5 : team === 'usa' ? 1.65 : 1.45;
    this.ownerPressureTime = 0;
    this.ownerPressurePairKey = null;
    this.aiDecisionTimer = initial ? 1.2 : 0.7;
    this.usaTeammateDecisionTimer = 0;
    this.usaPassProtectionTime = 0;
  }

  syncControlledPlayer() {
    this.activePlayerId = VIOLET_ID;
    for (const player of this.usaPlayers) player.controlled = player.id === VIOLET_ID;
  }

  update(dt) {
    dt = clamp(dt, 0, 0.05);
    this.elapsed += dt;
    this.syncControlledPlayer();
    for (const player of this.players) player.updateAnimation?.(dt);

    if (this.state === 'ready' || this.state === 'finished') return;
    if (this.state === 'goal') {
      this.celebrationTimer -= dt;
      this.updateCelebration(dt);
      if (this.celebrationTimer <= 0) {
        const kickoffTeam = this.lastScoringTeam === 'usa' ? 'opponent' : 'usa';
        this.prepareKickoff(kickoffTeam);
        this.state = 'playing';
        this.emit('whistle', { kind: 'restart' });
      }
      return;
    }

    this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    if (this.timeRemaining <= 0) {
      this.finish();
      return;
    }

    this.possessionGrace = Math.max(0, this.possessionGrace - dt);
    this.aiDecisionTimer = Math.max(0, this.aiDecisionTimer - dt);
    this.opponentPassCooldown = Math.max(0, this.opponentPassCooldown - dt);
    this.usaTeammateDecisionTimer = Math.max(0, this.usaTeammateDecisionTimer - dt);
    this.usaPassProtectionTime = Math.max(0, this.usaPassProtectionTime - dt);
    this.opponentShotCooldown = Math.max(0, this.opponentShotCooldown - dt);
    this.usaShotCooldown = Math.max(0, this.usaShotCooldown - dt);
    this.updateAiTargets(dt);
    this.movePlayers(dt);
    this.separatePlayers();
    this.ball.update(dt);
    for (const keeper of this.players.filter((player) => player.role === 'keeper')) {
      this.distributeKeeperBall(keeper, dt);
    }
    this.handlePossession(dt);
    this.handleBallBounds();
  }

  updateAiTargets(dt) {
    const active = this.activePlayer;
    const usaPossession = this.ball.owner?.team === 'usa';
    const opponentPossession = this.ball.owner?.team === 'opponent';
    const opponentFieldPlayers = this.opponentPlayers.filter((player) => player.role === 'field');
    const usaFieldPlayers = this.usaPlayers.filter((player) => player.role === 'field');
    const looseBallPoint = this.predictLooseBallPoint();
    const intendedOpponent = this.ball.intendedReceiverId
      ? this.findPlayer(this.ball.intendedReceiverId)
      : null;
    const opponentBallChaser = !this.ball.owner
      ? intendedOpponent?.team === 'opponent' && intendedOpponent.role === 'field'
        ? intendedOpponent
        : opponentFieldPlayers.reduce((best, candidate) =>
            distanceSquared(candidate, looseBallPoint) < distanceSquared(best, looseBallPoint) ? candidate : best,
          )
      : null;
    const pressingOpponent = usaPossession && this.ball.owner
      ? opponentFieldPlayers.reduce((best, candidate) =>
          distanceSquared(candidate, this.ball.owner) < distanceSquared(best, this.ball.owner) ? candidate : best,
        )
      : null;
    this.pressingOpponentId = pressingOpponent?.id ?? null;
    this.opponentBallChaserId = opponentBallChaser?.id ?? null;
    this.opponentSupportRunnerIds = opponentPossession && this.ball.owner
      ? opponentFieldPlayers.filter((player) => player !== this.ball.owner).map((player) => player.id)
      : [];

    for (const player of this.players) {
      if (player.role === 'keeper') {
        const homeX = player.team === 'usa' ? 135 : 1145;
        player.targetX = homeX;
        const shotThreat = !this.ball.owner && this.ball.speed > 180 && this.ball.lastTouchTeam !== player.team &&
          (player.team === 'usa' ? this.ball.vx < 0 : this.ball.vx > 0);
        if (shotThreat) {
          if (!player.readingShot) {
            player.readingShot = true;
            player.reactionTimer = player.team === 'usa' ? 0.5 : 0.43 + this.helpFactor() * 0.18;
          }
          player.reactionTimer = Math.max(0, player.reactionTimer - dt);
          if (player.reactionTimer <= 0) {
            const goalLine = player.team === 'usa' ? FIELD.left : FIELD.right;
            const secondsToGoal = Math.max(0, (goalLine - this.ball.x) / (this.ball.vx || 1));
            const projectedY = this.ball.y + this.ball.vy * secondsToGoal;
            player.targetY = clamp(projectedY, FIELD.centerY - 82, FIELD.centerY + 82);
          }
        } else {
          player.readingShot = false;
          player.reactionTimer = 0;
          const watchY = this.ball.owner?.team === player.team ? this.ball.y : FIELD.centerY + (this.ball.y - FIELD.centerY) * 0.18;
          player.targetY = clamp(watchY, FIELD.centerY - 68, FIELD.centerY + 68);
        }
        continue;
      }
      if (player.team === 'usa' && player === this.ball.owner && player.id !== VIOLET_ID) {
        if (this.usaTeammateDecisionTimer <= 0) {
          if (this.usaTeammatePassToViolet(player)) return;
        } else {
          player.targetX = clamp(player.x + 78, FIELD.left + 140, FIELD.right - 190);
          player.targetY = clamp(player.y + Math.sin(this.elapsed * 1.4 + player.number) * 38, FIELD.top + 60, FIELD.bottom - 60);
        }
        continue;
      }
      if (player === active) {
        if (player.trackingId) {
          const target = player.trackingId === 'ball' ? this.ball : this.findPlayer(player.trackingId);
          const staleOpponentTrack = target?.team === 'opponent' && this.ball.owner !== target;
          if (staleOpponentTrack) {
            player.trackingId = null;
            player.userCommanded = false;
          } else if (target) {
            player.targetX = target.x;
            player.targetY = target.y;
          }
        }
        if (!player.trackingId && !player.userCommanded && !usaPossession) {
          player.targetX = this.ball.x;
          player.targetY = this.ball.y;
        } else if (!player.trackingId && usaPossession && this.ball.owner !== player && !player.userCommanded) {
          player.targetX = clamp(this.ball.owner.x + 115, FIELD.left + 120, FIELD.right - 175);
          player.targetY = clamp(this.ball.owner.y, FIELD.top + 55, FIELD.bottom - 55);
        } else if (!player.trackingId && usaPossession && !player.userCommanded && this.elapsed - this.lastUserActionAt > 3.5) {
          player.targetX = clamp(player.x + 135, FIELD.left + 80, FIELD.right - 190);
          player.targetY = clamp(player.y + Math.sin(this.elapsed * 0.65) * 45, FIELD.top + 55, FIELD.bottom - 55);
        }
        continue;
      }

      if (player.team === 'usa') {
        if (usaPossession && this.ball.owner) {
          const owner = this.ball.owner;
          const lane = player.id === 'usa-11' ? -1 : player.id === 'usa-8' ? 1 : 0;
          player.targetX = clamp(owner.x + 175, 260, FIELD.right - 175);
          player.targetY = clamp(owner.y + lane * 145, FIELD.top + 55, FIELD.bottom - 55);
        } else {
          const opponentIndex = player.id === 'usa-11' ? 1 : player.id === 'usa-8' ? 2 : 0;
          const mark = this.opponentPlayers.filter((candidate) => candidate.role === 'field')[opponentIndex];
          player.targetX = clamp(mark.x - 75, FIELD.left + 130, FIELD.centerX + 180);
          player.targetY = mark.y;
        }
        continue;
      }

      if (player === this.ball.owner) {
        const nearestDefender = usaFieldPlayers.reduce((best, candidate) =>
          distanceSquared(candidate, player) < distanceSquared(best, player) ? candidate : best,
        );
        const pressure = distance(nearestDefender, player);
        const inShootingRange = player.x < FIELD.left + 390 &&
          Math.abs(player.y - FIELD.centerY) < FIELD.goalWidth * 0.88;
        if (inShootingRange && this.opponentShotCooldown <= 0) {
          this.opponentShoot(player);
          continue;
        }
        const passTarget = this.findOpponentPassTarget(player, usaFieldPlayers);
        const laneBlocked = usaFieldPlayers.some((defender) =>
          defender.x < player.x && player.x - defender.x < 145 && Math.abs(defender.y - player.y) < 88,
        );
        if (this.aiDecisionTimer <= 0 && this.opponentPassCooldown <= 0 && passTarget && (pressure < 145 || laneBlocked)) {
          if (this.opponentPass(player, passTarget)) continue;
        }
        const laneOffset = player.id === 'opp-7' ? -82 : player.id === 'opp-9' ? 82 : 0;
        const defenderClose = pressure < 155 && Math.abs(nearestDefender.y - player.y) < 112;
        const dodgeDirection = player.y === nearestDefender.y
          ? (player.number % 2 === 0 ? -1 : 1)
          : Math.sign(player.y - nearestDefender.y);
        const dodgeOffset = defenderClose ? dodgeDirection * 74 : 0;
        const goalApproach = clamp((FIELD.centerX - player.x) / 250, 0, 1);
        player.targetX = FIELD.left + 205;
        player.targetY = clamp(
          FIELD.centerY + laneOffset * (1 - goalApproach * 0.55) + dodgeOffset,
          FIELD.top + 72,
          FIELD.bottom - 72,
        );
        continue;
      }

      if (usaPossession && this.ball.owner) {
        const owner = this.ball.owner;
        if (player === pressingOpponent) {
          const leadSeconds = clamp(distance(player, owner) / 420, 0.1, 0.34);
          player.targetX = clamp(
            owner.x + (owner.vx || 0) * leadSeconds + 18 + this.helpFactor() * 16,
            FIELD.left + FIELD_MARGIN,
            FIELD.right - FIELD_MARGIN,
          );
          player.targetY = clamp(
            owner.y + (owner.vy || 0) * leadSeconds,
            FIELD.top + FIELD_MARGIN,
            FIELD.bottom - FIELD_MARGIN,
          );
        } else {
          const coverPlayers = opponentFieldPlayers
            .filter((candidate) => candidate !== pressingOpponent)
            .sort((a, b) => a.y - b.y);
          const usaTargets = usaFieldPlayers
            .filter((candidate) => candidate !== owner)
            .sort((a, b) => a.y - b.y);
          const coverIndex = coverPlayers.indexOf(player);
          const mark = usaTargets[coverIndex % Math.max(1, usaTargets.length)] ?? owner;
          player.targetX = clamp(mark.x + 75, FIELD.centerX - 160, FIELD.right - 130);
          player.targetY = mark.y;
        }
      } else if (opponentPossession && this.ball.owner) {
        const owner = this.ball.owner;
        const supportPlayers = opponentFieldPlayers
          .filter((candidate) => candidate !== owner)
          .sort((a, b) => a.y - b.y);
        const supportIndex = supportPlayers.indexOf(player);
        const lane = supportIndex === 0 ? -1 : 1;
        player.targetX = clamp(owner.x - 165 - supportIndex * 18, FIELD.left + 180, FIELD.right - 200);
        player.targetY = clamp(owner.y + lane * 138, FIELD.top + 68, FIELD.bottom - 68);
      } else {
        if (player === opponentBallChaser) {
          player.targetX = looseBallPoint.x;
          player.targetY = looseBallPoint.y;
        } else {
          const recoveryLane = player.id === 'opp-7' ? -1 : player.id === 'opp-9' ? 1 : 0;
          player.targetX = clamp(this.ball.x + 135, FIELD.centerX - 120, FIELD.right - 145);
          player.targetY = clamp(this.ball.y + recoveryLane * 125, FIELD.top + 72, FIELD.bottom - 72);
        }
      }
    }
  }

  predictLooseBallPoint() {
    const lookAhead = clamp(this.ball.speed / 980, 0.08, 0.52);
    return {
      x: clamp(this.ball.x + this.ball.vx * lookAhead, FIELD.left + FIELD_MARGIN, FIELD.right - FIELD_MARGIN),
      y: clamp(this.ball.y + this.ball.vy * lookAhead, FIELD.top + FIELD_MARGIN, FIELD.bottom - FIELD_MARGIN),
    };
  }

  findOpponentPassTarget(passer, defenders = this.usaPlayers.filter((player) => player.role === 'field')) {
    const candidates = this.opponentPlayers.filter((player) => player.role === 'field' && player !== passer);
    if (candidates.length === 0) return null;
    const forwardOptions = candidates.filter((candidate) => candidate.x < passer.x - 36);
    const lateralOptions = candidates.filter((candidate) =>
      candidate.x < passer.x + 75 && Math.abs(candidate.y - passer.y) > 85,
    );
    const options = forwardOptions.length > 0 ? forwardOptions : lateralOptions;
    if (options.length === 0) return null;
    return options.reduce((best, candidate) => {
      const candidatePressure = defenders.reduce((nearest, defender) =>
        Math.min(nearest, distance(defender, candidate)), Infinity);
      const progress = passer.x - candidate.x;
      const passLength = distance(passer, candidate);
      const score = progress * 1.5 + candidatePressure * 0.65 - Math.abs(passLength - 205) * 0.22;
      if (!best || score > best.score) return { player: candidate, score };
      return best;
    }, null)?.player ?? null;
  }

  helpFactor() {
    const deficit = this.score.opponent - this.score.usa;
    const noUsaGoalYet = this.score.usa === 0 && this.elapsed > 70;
    return clamp(0.25 + deficit * 0.22 + (noUsaGoalYet ? 0.25 : 0), 0.15, 0.72);
  }

  movePlayers(dt) {
    for (const player of this.players) {
      const dx = player.targetX - player.x;
      const dy = player.targetY - player.y;
      const direction = normalize(dx, dy);
      let speed;
      if (player.role === 'keeper') speed = player.team === 'usa' ? MATCH.keeperSpeed * 0.82 : MATCH.keeperSpeed * 0.76;
      else if (player.team === 'usa') {
        speed = player.controlled ? MATCH.usaControlledSpeed : MATCH.usaAiSpeed;
        if (player.hasBall) speed *= player.controlled ? 0.82 : 0.9;
      } else {
        speed = MATCH.opponentSpeed * (1 - this.helpFactor() * 0.12);
        if (player.hasBall) speed *= 1.08;
        else if (player.id === this.pressingOpponentId) speed *= 1.2;
        else if (player.id === this.opponentBallChaserId) speed *= 1.18;
        else if (this.opponentSupportRunnerIds.includes(player.id)) speed *= 1.55;
      }
      if (direction.length < 4) speed = 0;
      player.speed = speed;
      player.vx = direction.x * speed;
      player.vy = direction.y * speed;
      const transientAction = ['kick', 'receive', 'save', 'tackle', 'stumble'].includes(player.action) && player.actionTime < 0.48;
      if (speed > 0) {
        player.facing += angleDelta(player.facing || 0, Math.atan2(direction.y, direction.x)) * Math.min(1, dt * 10);
        const amount = Math.min(direction.length, speed * dt);
        player.x += direction.x * amount;
        player.y += direction.y * amount;
        if (!transientAction) player.action = player.hasBall ? 'dribble' : 'run';
      } else if (!transientAction && player.action !== 'celebrate') {
        player.vx = 0;
        player.vy = 0;
        player.action = player.hasBall ? 'dribble' : 'idle';
        if (player.controlled && !player.trackingId) player.userCommanded = false;
      }
      player.x = clamp(player.x, FIELD.left + FIELD_MARGIN, FIELD.right - FIELD_MARGIN);
      player.y = clamp(player.y, FIELD.top + FIELD_MARGIN, FIELD.bottom - FIELD_MARGIN);
    }
  }

  separatePlayers() {
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < this.players.length; i += 1) {
        const a = this.players[i];
        for (let j = i + 1; j < this.players.length; j += 1) {
          const b = this.players[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const length = Math.hypot(dx, dy) || 0.001;
          const minimum = a.role === 'keeper' || b.role === 'keeper'
            ? 38
            : a.team === b.team ? 50 : 31;
          if (length >= minimum) continue;
          const push = (minimum - length) * 0.5;
          const nx = dx / length;
          const ny = dy / length;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
    for (const player of this.players) {
      player.x = clamp(player.x, FIELD.left + FIELD_MARGIN, FIELD.right - FIELD_MARGIN);
      player.y = clamp(player.y, FIELD.top + FIELD_MARGIN, FIELD.bottom - FIELD_MARGIN);
    }
  }

  handlePossession(dt) {
    if (this.ball.owner) {
      const owner = this.ball.owner;
      const opponents = this.players.filter((player) => player.team !== owner.team && player.role === 'field');
      const challenger = opponents.reduce((best, player) =>
        distanceSquared(player, owner) < distanceSquared(best, owner) ? player : best,
      );
      const pressurePairKey = `${owner.id}:${challenger.id}`;
      if (this.ownerPressurePairKey !== pressurePairKey) {
        this.ownerPressurePairKey = pressurePairKey;
        this.ownerPressureTime = 0;
      }
      const challengeDistance = distance(challenger, owner);
      if (challengeDistance < 35 && this.possessionGrace <= 0) {
        this.ownerPressureTime += dt;
        const needed = owner.team === 'usa'
          ? owner.id === VIOLET_ID ? 1.1 : 0.72
          : challenger.id === VIOLET_ID ? 0.26 : 0.68;
        if (this.ownerPressureTime >= needed) {
          const previousTeam = owner.team;
          owner.action = 'stumble';
          challenger.action = 'tackle';
          this.ball.attach(challenger);
          this.possessionGrace = challenger.team === 'usa' ? 1.65 : 1.4;
          if (challenger.team === 'usa' && challenger.id !== VIOLET_ID) {
            this.usaTeammateDecisionTimer = 0.62 + this.random() * 0.35;
          } else if (challenger.team === 'opponent') {
            this.aiDecisionTimer = 0.38 + this.random() * 0.28;
          }
          this.ownerPressureTime = 0;
          this.ownerPressurePairKey = null;
          this.emit('possession-change', { team: challenger.team, from: previousTeam, playerId: challenger.id });
        }
      } else {
        this.ownerPressureTime = Math.max(0, this.ownerPressureTime - dt * 2.5);
      }
      return;
    }

    this.ownerPressureTime = 0;
    this.ownerPressurePairKey = null;

    const intended = this.ball.intendedReceiverId ? this.findPlayer(this.ball.intendedReceiverId) : null;
    const ordered = [...this.players].sort((a, b) => {
      if (a === intended) return -1;
      if (b === intended) return 1;
      return distanceSquared(a, this.ball) - distanceSquared(b, this.ball);
    });
    const protectedUsaReception = this.ball.lastTouchTeam === 'usa' &&
      this.ball.intendedReceiverId && this.usaPassProtectionTime > 0;
    for (const player of ordered) {
      if (player.id === this.ball.pickupLockPlayerId && this.ball.pickupLockTime > 0) continue;
      if (this.ball.intendedReceiverId && this.ball.pickupLockTime > 0 && player.team !== this.ball.lastTouchTeam) continue;
      if (protectedUsaReception && player.team === 'opponent' && player.role === 'field') continue;
      const pickupRadius = player.role === 'keeper'
        ? player.team === 'usa' ? 21 : 36 - this.helpFactor() * 5
        : player === intended ? 44 : player.id === this.opponentBallChaserId ? 34 : 29;
      if (distance(player, this.ball) > pickupRadius) continue;
      if (this.ball.z > 38 && player.role !== 'keeper') continue;
      if (player.role === 'keeper') {
        const inOwnBox = player.team === 'usa' ? this.ball.x < FIELD.left + 190 : this.ball.x > FIELD.right - 190;
        if (!inOwnBox) continue;
        this.makeSave(player);
        return;
      }
      if (this.ball.speed > 520 && player !== intended) continue;
      this.ball.attach(player);
      this.usaPassProtectionTime = 0;
      player.action = 'receive';
      player.actionTime = 0;
      player.userCommanded = false;
      player.trackingId = null;
      this.possessionGrace = player.team === 'usa' ? 1.6 : 1.35;
      if (player.team === 'opponent') this.aiDecisionTimer = 0.42 + this.random() * 0.3;
      if (player.team === 'usa' && player.id !== VIOLET_ID) {
        this.usaTeammateDecisionTimer = 0.62 + this.random() * 0.35;
      }
      this.ownerPressureTime = 0;
      this.ownerPressurePairKey = null;
      this.emit('possession-change', { team: player.team, playerId: player.id });
      return;
    }
  }

  makeSave(keeper) {
    const attackingTeam = this.ball.lastTouchTeam;
    const isUsaKeeper = keeper.team === 'usa';
    const saveBias = isUsaKeeper ? 0.82 : 0.42 - this.helpFactor() * 0.16;
    const cleanCatch = this.ball.speed < 430 || this.random() < saveBias;
    keeper.action = 'save';
    keeper.actionTime = 0;
    if (cleanCatch) {
      this.ball.attach(keeper);
      this.usaPassProtectionTime = 0;
      this.possessionGrace = 1;
      this.emit('save', { team: keeper.team, kind: 'catch', attackingTeam });
      const receiver = keeper.team === 'usa'
        ? this.findPlayer(VIOLET_ID)
        : this.opponentPlayers
          .filter((player) => player.role === 'field')
          .sort((a, b) => distanceSquared(a, { x: 920, y: keeper.y }) - distanceSquared(b, { x: 920, y: keeper.y }))[0];
      keeper.distributeToId = receiver?.id ?? null;
      keeper.distributeTimer = 0.72;
    } else {
      this.ball.vx *= -0.58;
      this.ball.vy += (this.random() - 0.5) * 170;
      this.ball.vz = Math.max(this.ball.vz, 95);
      this.ball.intendedReceiverId = null;
      this.usaPassProtectionTime = 0;
      this.emit('save', { team: keeper.team, kind: 'deflect', attackingTeam });
    }
  }

  distributeKeeperBall(keeper, dt) {
    if (!keeper.distributeToId || this.ball.owner !== keeper) return;
    keeper.distributeTimer -= dt;
    if (keeper.distributeTimer > 0) return;
    const receiver = this.findPlayer(keeper.distributeToId) ??
      this.players.find((player) => player.team === keeper.team && player.role === 'field');
    if (!receiver) return;
    keeper.distributeToId = null;
    const leadSeconds = 0.24;
    const targetX = receiver.x + receiver.vx * leadSeconds;
    const targetY = receiver.y + receiver.vy * leadSeconds;
    const direction = normalize(targetX - keeper.x, targetY - keeper.y);
    this.ball.kick({ vx: direction.x * 390, vy: direction.y * 390, lift: 55, team: keeper.team, receiverId: receiver.id });
    this.usaPassProtectionTime = keeper.team === 'usa' ? USA_PASS_PROTECTION_SECONDS : 0;
    if (receiver.id === VIOLET_ID && !receiver.userCommanded) receiver.trackingId = 'ball';
    this.emit('kick', { kind: 'rollout', team: keeper.team, playerId: keeper.id, receiverId: receiver.id });
  }

  opponentShoot(shooter) {
    if (this.ball.owner !== shooter) return;
    const easyMiss = this.random() < 0.38 + this.helpFactor() * 0.18;
    const keeper = this.findPlayer('usa-gk');
    const openSide = (keeper?.y ?? FIELD.centerY) <= FIELD.centerY ? 1 : -1;
    const targetY = easyMiss
      ? FIELD.centerY + (this.random() < 0.5 ? -1 : 1) * (FIELD.goalWidth * 0.6 + this.random() * 55)
      : FIELD.centerY + openSide * (42 + this.random() * 12) + (this.random() - 0.5) * 10;
    const direction = normalize(FIELD.left - 30 - this.ball.x, targetY - this.ball.y);
    shooter.facing = Math.atan2(direction.y, direction.x);
    shooter.action = 'kick';
    shooter.actionTime = 0;
    const speed = MATCH.opponentShotSpeed * (1.08 + this.random() * 0.1);
    this.ball.kick({ vx: direction.x * speed, vy: direction.y * speed, lift: 58, team: 'opponent' });
    this.usaPassProtectionTime = 0;
    this.opponentShotCooldown = 14.5 + this.helpFactor() * 4;
    this.emit('kick', { kind: 'shot', team: 'opponent', playerId: shooter.id });
  }

  usaTeammatePassToViolet(passer) {
    const receiver = this.findPlayer(VIOLET_ID);
    if (!receiver || this.ball.owner !== passer) return false;
    const leadSeconds = 0.28;
    const targetX = receiver.x + receiver.vx * leadSeconds;
    const targetY = receiver.y + receiver.vy * leadSeconds;
    const direction = normalize(targetX - this.ball.x, targetY - this.ball.y);
    if (direction.length < 1) return false;
    passer.facing = Math.atan2(direction.y, direction.x);
    passer.action = 'kick';
    passer.actionTime = 0;
    this.ball.kick({
      vx: direction.x * MATCH.passSpeed,
      vy: direction.y * MATCH.passSpeed,
      lift: 40,
      team: 'usa',
      receiverId: receiver.id,
    });
    this.usaPassProtectionTime = USA_PASS_PROTECTION_SECONDS;
    if (!receiver.userCommanded) {
      receiver.targetX = targetX;
      receiver.targetY = targetY;
      receiver.trackingId = 'ball';
    }
    this.usaTeammateDecisionTimer = 0;
    this.emit('kick', { kind: 'pass', team: 'usa', playerId: passer.id, receiverId: receiver.id });
    return true;
  }

  opponentPass(passer, selectedReceiver = null) {
    if (this.ball.owner !== passer) return false;
    const receiver = selectedReceiver ?? this.findOpponentPassTarget(passer);
    if (!receiver) return false;
    const targetX = receiver.x + receiver.vx * 0.28;
    const targetY = receiver.y + receiver.vy * 0.28;
    const direction = normalize(targetX - this.ball.x, targetY - this.ball.y);
    if (direction.length < 1) return false;
    passer.facing = Math.atan2(direction.y, direction.x);
    passer.action = 'kick';
    passer.actionTime = 0;
    this.ball.kick({
      vx: direction.x * 430,
      vy: direction.y * 430,
      lift: 38,
      team: 'opponent',
      receiverId: receiver.id,
    });
    this.usaPassProtectionTime = 0;
    receiver.targetX = targetX;
    receiver.targetY = targetY;
    this.aiDecisionTimer = 1.1 + this.random() * 0.6;
    this.opponentPassCooldown = 2.2 + this.random() * 0.5;
    this.emit('kick', { kind: 'pass', team: 'opponent', playerId: passer.id, receiverId: receiver.id });
    return true;
  }

  handleBallBounds() {
    const goalTop = FIELD.centerY - FIELD.goalWidth / 2;
    const goalBottom = FIELD.centerY + FIELD.goalWidth / 2;
    if (!this.ball.owner && this.ball.y > goalTop && this.ball.y < goalBottom) {
      if (this.ball.x > FIELD.right + 18) {
        this.scoreGoal('usa');
        return;
      }
      if (this.ball.x < FIELD.left - 18) {
        this.scoreGoal('opponent');
        return;
      }
    }
    if (this.ball.y < FIELD.top + MATCH.ballRadius) {
      this.ball.y = FIELD.top + MATCH.ballRadius;
      this.ball.vy = Math.abs(this.ball.vy) * 0.72;
      this.emit('boundary', { edge: 'top' });
    } else if (this.ball.y > FIELD.bottom - MATCH.ballRadius) {
      this.ball.y = FIELD.bottom - MATCH.ballRadius;
      this.ball.vy = -Math.abs(this.ball.vy) * 0.72;
      this.emit('boundary', { edge: 'bottom' });
    }
    if (this.ball.x < FIELD.left - FIELD.goalDepth) {
      this.ball.x = FIELD.left - FIELD.goalDepth;
      this.ball.vx = Math.abs(this.ball.vx) * 0.65;
    } else if (this.ball.x > FIELD.right + FIELD.goalDepth) {
      this.ball.x = FIELD.right + FIELD.goalDepth;
      this.ball.vx = -Math.abs(this.ball.vx) * 0.65;
    }

  }

  scoreGoal(team) {
    if (this.state !== 'playing') return;
    const scorer = this.players.find((player) => player.team === team && player.action === 'kick') ?? null;
    this.score[team] += 1;
    this.lastScoringTeam = team;
    this.lastScorer = scorer;
    this.state = 'goal';
    this.celebrationTimer = team === 'usa' ? 4.2 : 2.8;
    this.ball.release();
    this.ball.vx *= 0.12;
    this.ball.vy *= 0.12;
    for (const player of this.players) {
      player.vx = 0;
      player.vy = 0;
      if (player.team === team) {
        player.action = 'celebrate';
        player.actionTime = 0;
      } else {
        player.action = 'idle';
      }
    }
    this.emit('goal', { team, score: { ...this.score }, scorerId: scorer?.id ?? null });
  }

  updateCelebration(dt) {
    if (this.lastScoringTeam !== 'usa') return;
    const focus = this.lastScorer ?? this.activePlayer ?? this.findPlayer('usa-6');
    for (const player of this.usaPlayers.filter((candidate) => candidate.role === 'field' && candidate !== focus)) {
      const direction = normalize(focus.x - player.x, focus.y - player.y);
      const amount = Math.min(direction.length, 115 * dt);
      if (direction.length > 54) {
        player.x += direction.x * amount;
        player.y += direction.y * amount;
        player.facing = Math.atan2(direction.y, direction.x);
      }
    }
  }

  finish() {
    if (this.state === 'finished') return;
    this.state = 'finished';
    this.timeRemaining = 0;
    this.ball.release();
    for (const player of this.players) {
      player.vx = 0;
      player.vy = 0;
      player.action = player.team === 'usa' ? 'celebrate' : 'idle';
    }
    const result = this.score.usa > this.score.opponent ? 'win' : this.score.usa === this.score.opponent ? 'draw' : 'loss';
    this.emit('whistle', { kind: 'final' });
    this.emit('match-finished', { result, score: { ...this.score } });
  }
}
