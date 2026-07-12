import { describe, expect, it } from 'vitest';
import { FIELD } from '../src/game/config.js';
import { Match, VIOLET_ID } from '../src/game/match/Match.js';

const expectVioletControl = (match) => {
  expect(match.activePlayerId).toBe(VIOLET_ID);
  expect(match.activePlayer?.id).toBe(VIOLET_ID);
  expect(match.usaPlayers.filter((player) => player.controlled).map((player) => player.id)).toEqual([VIOLET_ID]);
};

const advance = (match, seconds, step = 1 / 60, afterFrame = null) => {
  const frames = Math.ceil(seconds / step);
  for (let frame = 0; frame < frames; frame += 1) {
    match.update(step);
    afterFrame?.(frame);
  }
};

describe('Match', () => {
  it('starts a five-minute match with USA in possession', () => {
    const match = new Match({ seed: 6 });

    expect(match.state).toBe('ready');
    expect(match.timeRemaining).toBe(300);
    expect(match.ball.owner?.team).toBe('usa');
    expectVioletControl(match);

    match.start();
    match.update(1 / 60);
    expect(match.state).toBe('playing');
    expect(match.timeRemaining).toBeLessThan(300);
    expectVioletControl(match);
  });

  it('protects Violet long enough to complete the opening move-and-pass lesson', () => {
    const match = new Match({ seed: 7 });
    const violet = match.findPlayer(VIOLET_ID);
    const challenger = match.findPlayer('opp-10');
    challenger.x = violet.x + 31;
    challenger.y = violet.y;
    for (const opponent of match.opponentPlayers.filter((player) => player.role === 'field' && player !== challenger)) {
      opponent.x = FIELD.right - 80;
    }
    match.start();

    advance(match, 5.8);

    expect(match.ball.owner).toBe(violet);
    expect(match.events).not.toContainEqual(expect.objectContaining({
      type: 'possession-change',
      team: 'opponent',
      from: 'usa',
    }));

    advance(match, 0.9);
    expect(match.events).toContainEqual(expect.objectContaining({
      type: 'possession-change',
      team: 'opponent',
      from: 'usa',
      playerId: challenger.id,
    }));
    expectVioletControl(match);
  });

  it('lets a teammate receive and return Violet’s pass without moving control', () => {
    const match = new Match({ seed: 10 });
    match.start();
    const receiver = match.findPlayer('usa-11');
    const violet = match.findPlayer(VIOLET_ID);
    const opponents = match.opponentPlayers.filter((player) => player.role === 'field');
    receiver.x = 760;
    receiver.y = 245;
    receiver.targetX = 805;
    receiver.targetY = 245;
    opponents.forEach((player, index) => {
      player.x = FIELD.right - 35;
      player.y = FIELD.top + 45 + index * 255;
      player.targetX = player.x;
      player.targetY = player.y;
    });

    expect(match.passTo(receiver.id)).toBe(true);
    expectVioletControl(match);

    let sawTeammateReceive = false;
    let sawReturnPass = false;
    let sawVioletReceiveReturn = false;
    let inspectedEventCount = 0;
    for (let frame = 0; frame < 4 * 60 && !sawVioletReceiveReturn; frame += 1) {
      match.update(1 / 60);
      expectVioletControl(match);
      if (match.ball.owner === receiver) sawTeammateReceive = true;
      for (const event of match.events.slice(inspectedEventCount)) {
        if (event.type === 'kick' && event.kind === 'pass' && event.playerId === receiver.id && event.receiverId === VIOLET_ID) {
          sawReturnPass = true;
        }
      }
      inspectedEventCount = match.events.length;
      if (sawReturnPass && match.ball.owner === violet) sawVioletReceiveReturn = true;
    }

    expect(sawTeammateReceive).toBe(true);
    expect(sawReturnPass).toBe(true);
    expect(sawVioletReceiveReturn).toBe(true);
    expectVioletControl(match);
  });

  it('keeps Violet selected during an opponent kickoff', () => {
    const match = new Match({ seed: 11 });
    match.start();
    match.prepareKickoff('opponent');

    expect(match.ball.owner?.id).toBe('opp-10');
    expectVioletControl(match);
    advance(match, 2, 1 / 60, () => expectVioletControl(match));
  });

  it('rolls a USA keeper catch specifically to Violet without changing control', () => {
    const match = new Match({ seed: 13 });
    match.start();
    const keeper = match.findPlayer('usa-gk');
    match.ball.release();
    match.ball.x = keeper.x;
    match.ball.y = keeper.y;
    match.ball.vx = 120;
    match.ball.vy = 0;
    match.ball.lastTouchTeam = 'opponent';

    match.makeSave(keeper);

    expect(match.ball.owner).toBe(keeper);
    expect(keeper.distributeToId).toBe(VIOLET_ID);
    expectVioletControl(match);

    let rollout = null;
    for (let frame = 0; frame < 2 * 60 && !rollout; frame += 1) {
      match.update(1 / 60);
      expectVioletControl(match);
      rollout = match.events.find((event) => event.type === 'kick' && event.kind === 'rollout');
    }

    expect(rollout).toMatchObject({ team: 'usa', playerId: 'usa-gk', receiverId: VIOLET_ID });
    expect(match.ball.owner).toBeNull();
    expect(match.ball.intendedReceiverId).toBe(VIOLET_ID);
  });

  it('shoots toward the open side of goal when Violet kicks', () => {
    const match = new Match({ seed: 14 });
    match.start();
    const opponentKeeper = match.findPlayer('opp-gk');
    opponentKeeper.y = FIELD.centerY - 70;

    expect(match.shootAtOpenGoal()).toBe(true);

    expect(match.ball.owner).toBeNull();
    expect(match.ball.vx).toBeGreaterThan(0);
    expect(match.ball.vy).toBeGreaterThan(0);
    expect(match.events).toContainEqual(expect.objectContaining({
      type: 'kick',
      kind: 'shot',
      team: 'usa',
      playerId: VIOLET_ID,
    }));
    expectVioletControl(match);
  });

  it('presses Violet clearly but leaves a forgiving window before winning the ball', () => {
    const match = new Match({ seed: 31 });
    match.start();
    const violet = match.findPlayer(VIOLET_ID);
    const challenger = match.findPlayer('opp-10');
    violet.x = 610;
    violet.y = FIELD.centerY;
    violet.targetX = violet.x;
    violet.targetY = violet.y;
    challenger.x = violet.x + 31;
    challenger.y = violet.y;
    for (const opponent of match.opponentPlayers.filter((player) => player.role === 'field' && player !== challenger)) {
      opponent.x = FIELD.right - 80;
      opponent.y = opponent.id === 'opp-7' ? FIELD.top + 70 : FIELD.bottom - 70;
    }
    match.ball.attach(violet);
    match.possessionGrace = 0;

    match.update(1 / 60);
    expect(match.pressingOpponentId).toBe(challenger.id);
    expect(challenger.targetX).toBeGreaterThanOrEqual(violet.x);

    advance(match, 0.62);
    expect(match.ball.owner).toBe(violet);

    advance(match, 0.58);
    expect(match.events).toContainEqual(expect.objectContaining({
      type: 'possession-change',
      team: 'opponent',
      from: 'usa',
      playerId: challenger.id,
    }));
    expectVioletControl(match);
  });

  it('does not carry tackle progress from one challenger to another', () => {
    const match = new Match({ seed: 36 });
    match.start();
    const violet = match.findPlayer(VIOLET_ID);
    const firstChallenger = match.findPlayer('opp-10');
    const secondChallenger = match.findPlayer('opp-7');
    const thirdOpponent = match.findPlayer('opp-9');
    violet.x = 610;
    violet.y = FIELD.centerY;
    violet.targetX = violet.x;
    violet.targetY = violet.y;
    firstChallenger.x = violet.x + 31;
    firstChallenger.y = violet.y;
    secondChallenger.x = FIELD.right - 80;
    secondChallenger.y = FIELD.top + 70;
    thirdOpponent.x = FIELD.right - 80;
    thirdOpponent.y = FIELD.bottom - 70;
    match.ball.attach(violet);
    match.possessionGrace = 0;

    advance(match, 0.7);
    expect(match.ball.owner).toBe(violet);

    firstChallenger.x = FIELD.right - 80;
    firstChallenger.y = FIELD.centerY;
    secondChallenger.x = violet.x + 31;
    secondChallenger.y = violet.y;
    advance(match, 0.45);

    expect(match.ball.owner).toBe(violet);

    advance(match, 0.72);
    expect(match.events).toContainEqual(expect.objectContaining({
      type: 'possession-change',
      team: 'opponent',
      from: 'usa',
      playerId: secondChallenger.id,
    }));
    expectVioletControl(match);
  });

  it('assigns a loose-ball chaser that reaches and claims the ball', () => {
    const match = new Match({ seed: 32 });
    match.start();
    const chaser = match.findPlayer('opp-10');
    match.ball.release();
    match.ball.x = 720;
    match.ball.y = FIELD.centerY;
    match.ball.vx = 0;
    match.ball.vy = 0;
    match.ball.lastTouchTeam = 'usa';
    chaser.x = 650;
    chaser.y = FIELD.centerY;
    for (const player of match.usaPlayers.filter((candidate) => candidate.role === 'field')) {
      player.x = 280;
      player.y = FIELD.top + 70 + player.number * 3;
    }
    for (const opponent of match.opponentPlayers.filter((player) => player.role === 'field' && player !== chaser)) {
      opponent.x = 980;
    }

    match.update(1 / 60);
    expect(match.opponentBallChaserId).toBe(chaser.id);
    expect(chaser.targetX).toBeCloseTo(match.ball.x, 0);

    advance(match, 0.8);
    expect(match.ball.owner).toBe(chaser);
    expectVioletControl(match);
  });

  it('carries possession toward the USA goal instead of standing still', () => {
    const match = new Match({ seed: 33 });
    match.start();
    const carrier = match.findPlayer('opp-10');
    carrier.x = 770;
    carrier.y = FIELD.centerY;
    for (const player of match.usaPlayers.filter((candidate) => candidate.role === 'field')) {
      player.x = 1040;
      player.y = FIELD.top + 65 + player.number * 8;
    }
    match.ball.attach(carrier);
    match.possessionGrace = 10;
    match.aiDecisionTimer = 10;
    match.opponentShotCooldown = 10;
    const startingX = carrier.x;

    advance(match, 1);

    expect(match.ball.owner).toBe(carrier);
    expect(carrier.action).toBe('dribble');
    expect(carrier.x).toBeLessThan(startingX - 95);
    expectVioletControl(match);
  });

  it('uses a forward teammate when the carrier is under pressure', () => {
    const match = new Match({ seed: 34 });
    match.start();
    const carrier = match.findPlayer('opp-10');
    const forwardReceiver = match.findPlayer('opp-7');
    const violet = match.findPlayer(VIOLET_ID);
    carrier.x = 740;
    carrier.y = FIELD.centerY;
    forwardReceiver.x = 530;
    forwardReceiver.y = FIELD.centerY - 110;
    match.findPlayer('opp-9').x = 870;
    violet.x = carrier.x + 38;
    violet.y = carrier.y;
    match.ball.attach(carrier);
    match.possessionGrace = 1;
    match.aiDecisionTimer = 0;

    match.update(1 / 60);

    expect(match.ball.owner).toBeNull();
    expect(match.ball.intendedReceiverId).toBe(forwardReceiver.id);
    expect(match.ball.vx).toBeLessThan(0);
    expect(match.events).toContainEqual(expect.objectContaining({
      type: 'kick',
      kind: 'pass',
      team: 'opponent',
      playerId: carrier.id,
      receiverId: forwardReceiver.id,
    }));
    expectVioletControl(match);
  });

  it('shoots once an opponent carrier reaches a useful range', () => {
    const match = new Match({ seed: 35 });
    match.start();
    const shooter = match.findPlayer('opp-10');
    shooter.x = FIELD.left + 380;
    shooter.y = FIELD.centerY;
    match.ball.attach(shooter);
    match.opponentShotCooldown = 0;

    match.update(1 / 60);

    expect(match.ball.owner).toBeNull();
    expect(match.ball.intendedReceiverId).toBeNull();
    expect(match.ball.vx).toBeLessThan(0);
    expect(match.events).toContainEqual(expect.objectContaining({
      type: 'kick',
      kind: 'shot',
      team: 'opponent',
      playerId: shooter.id,
    }));
    expectVioletControl(match);
  });

  it('naturally presses, passes, and shoots during seeded play without overwhelming Violet', () => {
    const match = new Match({ duration: 60, seed: 4 });
    const opponentActions = { steals: 0, passes: 0, shots: 0 };
    match.start();

    for (let frame = 0; frame < 60 * 60 && match.state !== 'finished'; frame += 1) {
      if (frame % 30 === 0 && match.isLive) {
        const violet = match.activePlayer;
        if (match.ball.owner === violet) {
          if (violet.x > 830) match.shootAtOpenGoal();
          else match.setMoveTarget(FIELD.right - 150, FIELD.centerY + Math.sin(frame / 95) * 100);
        } else {
          match.setMoveTarget(match.ball.x, match.ball.y, { tracking: 'ball' });
        }
      }
      match.update(1 / 60);
      expectVioletControl(match);
      for (const event of match.drainEvents()) {
        if (event.type === 'possession-change' && event.team === 'opponent' && event.from === 'usa') {
          opponentActions.steals += 1;
        }
        if (event.type === 'kick' && event.team === 'opponent' && event.kind === 'pass') opponentActions.passes += 1;
        if (event.type === 'kick' && event.team === 'opponent' && event.kind === 'shot') opponentActions.shots += 1;
      }
    }

    expect(opponentActions.steals).toBeGreaterThanOrEqual(1);
    expect(opponentActions.steals).toBeLessThanOrEqual(10);
    expect(opponentActions.passes).toBeGreaterThanOrEqual(6);
    expect(opponentActions.shots).toBeGreaterThanOrEqual(2);
  });

  it('does not allow an opponent to steal during USA receipt protection', () => {
    const match = new Match({ seed: 12 });
    match.start();
    const owner = match.ball.owner;
    const challenger = match.findPlayer('opp-10');
    challenger.x = owner.x + 8;
    challenger.y = owner.y;
    challenger.targetX = challenger.x;
    challenger.targetY = challenger.y;
    match.possessionGrace = 0.7;

    advance(match, 0.45);
    expect(match.ball.owner?.team).toBe('usa');
  });

  it('counts one goal, pauses the clock, then gives kickoff to the conceding team', () => {
    const match = new Match({ seed: 15 });
    match.start();
    match.ball.release();
    match.ball.x = FIELD.right + 20;
    match.ball.y = FIELD.centerY;
    match.ball.vx = 300;
    match.ball.lastTouchTeam = 'usa';
    const timeAtGoal = match.timeRemaining;

    match.update(1 / 60);
    expect(match.score.usa).toBe(1);
    expect(match.state).toBe('goal');
    expect(match.timeRemaining).toBeCloseTo(timeAtGoal - 1 / 60, 2);

    advance(match, 4.3);
    expect(match.state).toBe('playing');
    expect(match.score.usa).toBe(1);
    expect(match.ball.owner?.team).toBe('opponent');
    expectVioletControl(match);
  });

  it('finishes honestly when the timer reaches zero', () => {
    const match = new Match({ duration: 15, seed: 18 });
    match.start();
    advance(match, 15.1);

    expect(match.state).toBe('finished');
    expect(match.timeRemaining).toBe(0);
    const events = match.drainEvents();
    expect(events.some((event) => event.type === 'match-finished')).toBe(true);
  });

  it('stays finite and inside the playable world through a long simulation', () => {
    const match = new Match({ duration: 60, seed: 22 });
    match.start();
    for (let frame = 0; frame < 110 * 60 && match.state !== 'finished'; frame += 1) {
      if (frame % 120 === 0 && match.isLive) {
        const active = match.activePlayer;
        if (match.ball.owner === active && active.team === 'usa' && active.x > 720) {
          match.shootAt(FIELD.centerY + Math.sin(frame) * 55, 0.95);
        } else if (match.ball.owner === active && active.team === 'usa') {
          match.setMoveTarget(Math.min(FIELD.right - 150, active.x + 180), FIELD.centerY + Math.sin(frame * 0.1) * 150);
        } else {
          match.setMoveTarget(match.ball.x, match.ball.y, { tracking: 'ball' });
        }
      }
      match.update(1 / 60);
      expectVioletControl(match);
      for (const player of match.players) {
        expect(Number.isFinite(player.x)).toBe(true);
        expect(Number.isFinite(player.y)).toBe(true);
        expect(player.x).toBeGreaterThanOrEqual(FIELD.left - 1);
        expect(player.x).toBeLessThanOrEqual(FIELD.right + 1);
        expect(player.y).toBeGreaterThanOrEqual(FIELD.top - 1);
        expect(player.y).toBeLessThanOrEqual(FIELD.bottom + 1);
      }
      expect(Number.isFinite(match.ball.x)).toBe(true);
      expect(Number.isFinite(match.ball.y)).toBe(true);
    }
    expect(match.state).toBe('finished');
  });
});
